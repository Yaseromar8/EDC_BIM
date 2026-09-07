"""Inventory HTTP boundary: one qualified repository, exact scopes and real ACLs.

No schema creation, legacy promotion or global externalId joins happen here.
The share route may provide a server-resolved scope; a query parameter cannot.
"""

import gzip
import hashlib
import json

from flask import Response, current_app, g, jsonify, request

from db import get_db_connection, resolve_project_id
from inventory_identity import (
    IDENTITY_FIELDS, IdentityError, InventoryIdentityRepository, element_key,
    source_identity,
)


IDENTITY_FORMAT = "scope-lineage-external-v1"


def identity_error_response(exc):
    code = exc.code
    status = 400
    if code in {"FORBIDDEN_SCOPE", "UNRESOLVED_SCOPE"}:
        status = 403
    elif code == "AUTH_REQUIRED":
        status = 401
    elif code in {"ELEMENT_NOT_FOUND", "NOT_FOUND", "IDENTITY_NOT_FOUND", "LEGACY_NOT_FOUND"}:
        status = 404
    elif code in {"LEGACY_AMBIGUOUS", "STALE_SNAPSHOT", "SNAPSHOT_CONFLICT",
                  "IDENTITY_CONFLICT", "INVENTORY_REEXTRACTION_REQUIRED",
                  "NO_PROMOTION", "STALE_GENERATION", "STALE_ACTIVE_URN", "SNAPSHOT_CONTENT_CONFLICT"}:
        status = 409
    messages = {
        "LEGACY_AMBIGUOUS": "La identidad es ambigua. Seleccione el elemento con su Source y frente.",
        "INVENTORY_REEXTRACTION_REQUIRED": "El inventario necesita reextracción cualificada antes de consultarse. Los datos anteriores se conservan.",
        "FORBIDDEN_SCOPE": "No tiene acceso a este frente.",
        "UNRESOLVED_SCOPE": "No se pudo verificar la obra de este frente.",
        "AUTH_REQUIRED": "Autenticación requerida.",
        "IDENTITY_CONFLICT": "Las referencias de identidad de la petición no coinciden.",
    }
    # Domain details may contain candidates from other scopes: never serialize them.
    return jsonify({"error": messages.get(code, "No se pudo completar la operación de Inventory."),
                    "code": code}), status


def _unavailable(exc):
    current_app.logger.error("Inventory unavailable (%s)", type(exc).__name__)
    return jsonify({"error": "Inventory no está disponible. No se ha aplicado ningún cambio.",
                    "code": "INVENTORY_UNAVAILABLE"}), 503


def authorize_scope(conn, scope_id, *, forced_scope=None, lock=False):
    """Resolve authority from project references/config, never from element data."""
    if not isinstance(scope_id, str) or not scope_id or scope_id == "global":
        raise IdentityError("INVALID_SCOPE")
    if forced_scope is not None:
        if scope_id != forced_scope:
            raise IdentityError("FORBIDDEN_SCOPE")
        return resolve_project_id(scope_id)
    user = getattr(g, "current_user", None) or {}
    if not user:
        raise IdentityError("AUTH_REQUIRED")
    project_id = resolve_project_id(scope_id)
    if not project_id:
        raise IdentityError("UNRESOLVED_SCOPE")
    if user.get("role") != "admin":
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM project_users WHERE project_id=%s AND user_id=%s"
                + (" FOR SHARE" if lock else ""), (project_id, user.get("id")))
            if not cursor.fetchone():
                raise IdentityError("FORBIDDEN_SCOPE")
    return str(project_id)


def _known_scopes(conn):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT scope_id FROM inventory_identity_b1.sources
            UNION SELECT app_project_id FROM public.model_config WHERE app_project_id IS NOT NULL
            UNION SELECT model_urn FROM public.inventory_assets WHERE model_urn IS NOT NULL
        """)
        return sorted({row[0] for row in cursor.fetchall() if row[0] and row[0] not in ("global", "__cmp__")})


def _authorized_scopes(conn):
    result = []
    if not getattr(g, "current_user", None):
        raise IdentityError("AUTH_REQUIRED")
    for scope in _known_scopes(conn):
        try:
            authorize_scope(conn, scope)
            result.append(scope)
        except IdentityError as exc:
            if exc.code not in {"FORBIDDEN_SCOPE", "UNRESOLVED_SCOPE"}:
                raise
    return result


def _read_scopes(conn, forced_scope):
    if forced_scope is not None:
        authorize_scope(conn, forced_scope, forced_scope=forced_scope)
        return [forced_scope]
    scope = request.args.get("model_urn")
    requested_project = request.args.get("project_id")
    project_id = None
    if requested_project:
        project_id = authorize_scope(conn, requested_project)
    if scope and scope != "global":
        actual_project = authorize_scope(conn, scope)
        if project_id is not None and actual_project != project_id:
            raise IdentityError("IDENTITY_CONFLICT")
        return [scope]  # Exact equality, no LIKE/case folding/front suffix guessing.
    scopes = _authorized_scopes(conn)
    return [s for s in scopes if project_id is None or str(resolve_project_id(s)) == project_id]


def _ensure_readable(conn, scopes):
    """Never represent unmigrated native inventory as a successful empty result.

    This is a read-readiness check, NOT evidence to promote human legacy rows.
    Operational legacy promotion is disabled in the repository independently.
    """
    with conn.cursor() as cursor:
        for scope in scopes:
            cursor.execute("SELECT source_lineage,active_urn,generation FROM inventory_identity_b1.sources WHERE scope_id=%s", (scope,))
            sources = {row[0]: (row[1], row[2]) for row in cursor.fetchall()}
            cursor.execute("SELECT urn,item_id FROM public.model_config WHERE app_project_id=%s", (scope,))
            configured = cursor.fetchall()
            for urn, item_id in configured:
                try:
                    version, lineage = source_identity(urn, item_id=item_id or None)
                except IdentityError as exc:
                    raise IdentityError("INVENTORY_REEXTRACTION_REQUIRED") from exc
                if sources.get(lineage, (None,))[0] != version:
                    raise IdentityError("INVENTORY_REEXTRACTION_REQUIRED")
            if configured:
                # Current model_config is the declared read scope, not proof of
                # all historical Sources. Orphan legacy rows remain untouched
                # and cannot veto complete, qualified current snapshots or be
                # silently promoted into them. Human promotion stays disabled.
                continue
            cursor.execute("SELECT DISTINCT source_urn FROM public.inventory_assets WHERE model_urn=%s", (scope,))
            for (urn,) in cursor.fetchall():
                try:
                    _, lineage = source_identity(urn)
                except IdentityError as exc:
                    raise IdentityError("INVENTORY_REEXTRACTION_REQUIRED") from exc
                state = sources.get(lineage)
                # A tombstone from explicit removal is known absence, not missing data.
                if state is None or (state[0] is None and state[1] == 0):
                    raise IdentityError("INVENTORY_REEXTRACTION_REQUIRED")


def read_inventory_request(*, forced_scope=None):
    try:
        include_props = request.args.get("include_props", "true").lower() == "true"
        with get_db_connection() as conn:
            scopes = _read_scopes(conn, forced_scope)
            _ensure_readable(conn, scopes)
            repo = InventoryIdentityRepository(conn)
            rows = [row for scope in scopes for row in repo.get_inventory(
                scope, allowed_scopes=scopes, include_props=include_props)]
        body = json.dumps(rows, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")
        response = Response(gzip.compress(body) if "gzip" in request.accept_encodings else body,
                            content_type="application/json; charset=utf-8")
        if "gzip" in request.accept_encodings:
            response.headers["Content-Encoding"] = "gzip"
        response.headers["Vary"] = "Accept-Encoding"
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Inventory-Identity"] = IDENTITY_FORMAT
        return response
    except IdentityError as exc:
        return identity_error_response(exc)
    except Exception as exc:
        return _unavailable(exc)


def inventory_version_request(*, forced_scope=None):
    try:
        with get_db_connection() as conn:
            scopes = _read_scopes(conn, forced_scope)
            _ensure_readable(conn, scopes)
            with conn.cursor() as cursor:
                cursor.execute("""SELECT scope_id,source_lineage,active_urn,generation
                    FROM inventory_identity_b1.sources WHERE scope_id=ANY(%s)
                    ORDER BY scope_id,source_lineage""", (scopes,))
                states = cursor.fetchall()
                cursor.execute("""SELECT count(*),max(o.updated_at) FROM inventory_identity_b1.occurrences o
                    JOIN inventory_identity_b1.sources s USING(scope_id,source_lineage)
                    WHERE o.scope_id=ANY(%s) AND o.source_urn=s.active_urn""", (scopes,))
                count, last_updated = cursor.fetchone()
                cursor.execute("SELECT max(updated_at) FROM inventory_identity_b1.user_data WHERE scope_id=ANY(%s)", (scopes,))
                user_updated = cursor.fetchone()[0]
        revision = hashlib.sha256(json.dumps([IDENTITY_FORMAT, states, str(last_updated), str(user_updated)],
                                             sort_keys=True, default=str).encode()).hexdigest()
        # Existing clients compare these three keys; include pointer/generation in
        # last_updated so same-count version switches cannot keep a stale cache.
        return jsonify({"count": count, "last_updated": revision,
                        "user_updated": str(user_updated) if user_updated else "",
                        "identity_format": IDENTITY_FORMAT, "revision": revision})
    except IdentityError as exc:
        return identity_error_response(exc)
    except Exception as exc:
        return _unavailable(exc)


def _qualified_identity(repo, conn, value, declarations, allowed):
    if not isinstance(value, dict) or any(k not in value for k in IDENTITY_FIELDS):
        raise IdentityError("INCOMPLETE_IDENTITY")
    identity = {k: value[k] for k in IDENTITY_FIELDS}
    project_id = authorize_scope(conn, identity["scope_id"], lock=True)
    allowed.add(identity["scope_id"])
    for declaration in (value, declarations):
        for key in IDENTITY_FIELDS:
            if key in declaration and declaration[key] != identity[key]:
                raise IdentityError("IDENTITY_CONFLICT")
        if "element_key" in declaration and declaration["element_key"] != element_key(**identity):
            raise IdentityError("IDENTITY_CONFLICT")
        for alias in ("scope", "scope_urn", "project"):
            if alias in declaration and declaration[alias] != identity["scope_id"]:
                raise IdentityError("IDENTITY_CONFLICT")
        if "project_id" in declaration and str(declaration["project_id"]) != project_id:
            raise IdentityError("IDENTITY_CONFLICT")
        if "externalId" in declaration and declaration["externalId"] != identity["external_id"]:
            raise IdentityError("IDENTITY_CONFLICT")
        if "model_urn" in declaration and declaration["model_urn"] != identity["scope_id"]:
            # Full rows historically use model_urn=source_urn, lite rows=scope.
            if declaration.get("source_urn") != declaration["model_urn"]:
                raise IdentityError("IDENTITY_CONFLICT")
        if "source_urn" in declaration:
            version, lineage = source_identity(declaration["source_urn"])
            if lineage != identity["source_lineage"]:
                raise IdentityError("IDENTITY_CONFLICT")
            with conn.cursor() as cursor:
                cursor.execute("SELECT active_urn FROM inventory_identity_b1.sources WHERE scope_id=%s AND source_lineage=%s",
                               (identity["scope_id"], lineage))
                row = cursor.fetchone()
            if not row or row[0] != version:
                raise IdentityError("STALE_SNAPSHOT")
    return identity


def patch_inventory_request(*, bulk=False):
    try:
        if not getattr(g, "current_user", None):
            raise IdentityError("AUTH_REQUIRED")
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not isinstance(data.get("fieldName"), str) or "fieldValue" not in data:
            raise IdentityError("INVALID_PATCH")
        with get_db_connection() as conn:
            repo = InventoryIdentityRepository(conn)
            allowed = set()
            qualified_key = "identities" if bulk else "identity"
            legacy_key = "external_ids" if bulk else "external_id"
            if qualified_key in data:
                values = data[qualified_key] if bulk else [data[qualified_key]]
                if not isinstance(values, list) or not values or len(values) > 10000:
                    raise IdentityError("INVALID_IDENTITIES")
                identities = [_qualified_identity(repo, conn, value, data, allowed) for value in values]
                if bulk and legacy_key in data and data[legacy_key] != [i["external_id"] for i in identities]:
                    raise IdentityError("IDENTITY_CONFLICT")
            else:
                if "source_lineage" in data or "element_key" in data or "source_urn" in data:
                    raise IdentityError("INCOMPLETE_IDENTITY")
                external_ids = data.get(legacy_key) if bulk else [data.get(legacy_key)]
                if not isinstance(external_ids, list) or not external_ids or len(external_ids) > 10000:
                    raise IdentityError("INVALID_IDENTITIES")
                # Uniqueness and the eventual write must see the same Source
                # universe. Publications take the shared counterpart; a rival
                # cannot appear between legacy resolution and the atomic bulk.
                with conn.cursor() as cursor:
                    cursor.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                                   ("inventory_identity_b1:legacy-promotion",))
                allowed.update(_authorized_scopes(conn))
                declared_scope = data.get("scope_id")
                if declared_scope is not None:
                    authorize_scope(conn, declared_scope, lock=True)
                identities = [repo.resolve_legacy_identity(ext, allowed_scopes=allowed,
                              scope_id=declared_scope, active_only=False) for ext in external_ids]
                for identity in identities:
                    authorize_scope(conn, identity["scope_id"], lock=True)
            result = repo.bulk_update(identities, data["fieldName"], data["fieldValue"], allowed_scopes=allowed)
            conn.commit()  # No partial success: every identity, ACL and write share this transaction.
        return jsonify({"status": "ok", **result})
    except IdentityError as exc:
        return identity_error_response(exc)
    except Exception as exc:
        return _unavailable(exc)


def inventory_schema_request():
    try:
        with get_db_connection() as conn:
            scopes = _read_scopes(conn, None)
            _ensure_readable(conn, scopes)
            repo = InventoryIdentityRepository(conn)
            keys = set()
            sampled = 0
            for scope in scopes:
                for row in repo.get_inventory(scope, allowed_scopes=scopes):
                    for category, values in row["properties"].items():
                        if isinstance(values, dict):
                            keys.update((category, name) for name in values)
                        else:
                            keys.add(("General", category))
                    sampled += 1
                    if sampled >= 2000:
                        break
                if sampled >= 2000:
                    break
        schema = [{"id": f"{category}::{name}", "name": name, "category": category}
                  for category, name in sorted(keys)]
        defaults = [
            ("Item::Category", "Revit Category (EN)", "System"),
            ("Elemento::Categoría", "Revit Category (ES)", "System"),
            ("Datos de identidad::Categoría", "Revit Category (ID)", "System"),
            ("__category__::__category__", "Revit Category (Native)", "System"),
            ("Standard::Revit Categories", "Revit Categories", "Standard"),
            ("Item::Type", "Revit Type", "System"),
            ("Standard::Sources", "Sources", "Standard"),
            ("System::Tandem Category", "Tandem Category", "System"),
        ]
        present = {item["id"] for item in schema}
        schema.extend({"id": key, "name": name, "category": category}
                      for key, name, category in defaults if key not in present)
        return jsonify({"schema": schema, "identity_format": IDENTITY_FORMAT})
    except IdentityError as exc:
        return identity_error_response(exc)
    except Exception as exc:
        return _unavailable(exc)
