"""Canonical Inventory identity repository. One implementation, six responsibilities.
Caller owns transactions; no connections, DDL or automatic legacy promotion.
A caller-supplied coverage boolean is never operational evidence.
"""

import base64
from contextlib import contextmanager
import hashlib
import json
import re
import uuid

from psycopg2 import sql
from psycopg2.extras import Json, RealDictCursor, execute_values

try:
    from backend.vistas_v2 import es_linaje
except ModuleNotFoundError as exc:
    if exc.name not in ("backend", "backend.vistas_v2"):
        raise
    from vistas_v2 import es_linaje


SCHEMA = "inventory_identity_b1"
DATABASE_PREFIX = "ecd_ensayo_"
IDENTITY_FIELDS = ("scope_id", "source_lineage", "external_id")
_VERSION = re.compile(r"^urn:(adsk\.[a-z0-9]+):fs\.file:vf\.([A-Za-z0-9_-]+)(\?[^\s]+)?$")
_BASE_FIELDS = {
    "Material": "material", "material": "material",
    "Status": "status", "status": "status", "installation_status": "status",
    "Vaciado_Nro": "vaciado_nro", "vaciado_nro": "vaciado_nro",
    "Classification": "classification", "classification": "classification",
}
_NATIVE_TEXT = ("name", "material", "installation_status", "vaciado_nro",
                "classification", "project_id", "last_updated")
_RESERVED = set(IDENTITY_FIELDS) | {
    "source_urn", "model_urn", "element_key", "dbId", "db_id", "externalId",
    "properties", "project_id", "last_updated", "native_metadata", "original_payload",
}


class IdentityError(ValueError):
    """Fail-closed domain error. code/details are suitable for structured tests."""

    def __init__(self, code, message=None, **details):
        self.code = code
        self.details = details
        super().__init__(message or code)


def _json_value(value):
    try:
        return json.loads(json.dumps(value, ensure_ascii=False, allow_nan=False))
    except (TypeError, ValueError, OverflowError) as exc:
        raise IdentityError("INVALID_JSON", "Expected finite JSON-compatible data") from exc


def _object(value, label):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError) as exc:
            raise IdentityError("INVALID_JSON", field=label) from exc
    if not isinstance(value, dict):
        raise IdentityError("INVALID_OBJECT", field=label)
    return _json_value(value)


def _text(value, label):
    if not isinstance(value, str) or not value or not value.strip() or "\x00" in value:
        raise IdentityError("INVALID_IDENTIFIER", field=label)
    return value  # Never trim, lowercase or substitute the real externalId.


def source_identity(source_urn, item_id=None):
    """Return (normalized runtime URN, stable lineage), aligned with linajeDeUrn.

    URL-safe/standard base64 and a clear APS file-version URN are accepted.
    Non-APS/OSS and guessed GUID/document relationships are deliberately rejected.
    """
    if not isinstance(source_urn, str) or not source_urn or source_urn != source_urn.strip():
        raise IdentityError("INVALID_SOURCE_URN")
    clear = source_urn
    if not clear.startswith("urn:"):
        try:
            clear = base64.b64decode(
                source_urn + "=" * (-len(source_urn) % 4), altchars=b"-_", validate=True
            ).decode("utf-8")
        except (ValueError, UnicodeError) as exc:
            raise IdentityError("INVALID_SOURCE_URN") from exc
    match = _VERSION.fullmatch(clear)
    if not match:
        raise IdentityError("INVALID_SOURCE_URN")
    lineage = f"urn:{match.group(1)}:dm.lineage:{match.group(2)}"
    if not es_linaje(lineage):
        raise IdentityError("INVALID_SOURCE_URN")
    if item_id is not None:
        if not es_linaje(item_id) or item_id != item_id.strip():
            raise IdentityError("INVALID_ITEM_ID")
        if item_id != lineage:
            raise IdentityError("ITEM_LINEAGE_CONFLICT", derived=lineage, item_id=item_id)
    normalized = base64.urlsafe_b64encode(clear.encode("utf-8")).decode("ascii").rstrip("=")
    return normalized, lineage


def element_key(scope_id, source_lineage, external_id):
    return json.dumps([scope_id, source_lineage, external_id], ensure_ascii=False,
                      separators=(",", ":"))


def _identity(value):
    if not isinstance(value, dict) or any(key not in value for key in IDENTITY_FIELDS):
        raise IdentityError("INCOMPLETE_IDENTITY")
    result = {key: _text(value[key], key) for key in IDENTITY_FIELDS}
    if not es_linaje(result["source_lineage"]) or result["source_lineage"] != result["source_lineage"].strip():
        raise IdentityError("INVALID_SOURCE_LINEAGE")
    return result


def _allowlist(allowed_scopes):
    if not isinstance(allowed_scopes, (list, tuple, set, frozenset)):
        raise IdentityError("INVALID_SCOPE_ALLOWLIST")
    return {_text(scope, "allowed_scopes") for scope in allowed_scopes}


def _authorize(scope_id, allowed_scopes):
    if scope_id not in allowed_scopes:
        raise IdentityError("FORBIDDEN_SCOPE", scope_id=scope_id)


def _params(identity):
    return tuple(identity[key] for key in IDENTITY_FIELDS)


def _fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     allow_nan=False, separators=(",", ":")).encode("utf-8")).hexdigest()


class InventoryIdentityRepository:
    def __init__(self, conn):
        if conn.autocommit:
            raise IdentityError("TRANSACTION_REQUIRED", "Caller must disable autocommit")
        self.conn = conn


    @contextmanager
    def _atomic(self):
        if self.conn.autocommit:
            raise IdentityError("TRANSACTION_REQUIRED")
        name = sql.Identifier("b1_" + uuid.uuid4().hex)
        with self.conn.cursor() as cursor:
            cursor.execute(sql.SQL("SAVEPOINT {}").format(name))
            try:
                yield cursor
            except BaseException:
                cursor.execute(sql.SQL("ROLLBACK TO SAVEPOINT {}").format(name))
                cursor.execute(sql.SQL("RELEASE SAVEPOINT {}").format(name))
                raise
            else:
                cursor.execute(sql.SQL("RELEASE SAVEPOINT {}").format(name))

    @staticmethod
    def _lock_scopes(cursor, scopes):
        # Serialize candidate publication/edit/promotion in a front, including
        # insertion of a previously unknown Source while testing legacy uniqueness.
        # All callers of this candidate use this order; no production lock is taken.
        # Publications may coexist across fronts. Migrator promotion takes the
        # exclusive counterpart before checking global legacy ambiguity.
        cursor.execute("SELECT pg_advisory_xact_lock_shared(hashtextextended(%s, 0))",
                       (SCHEMA + ":legacy-promotion",))
        for scope_id in sorted(set(scopes)):
            cursor.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                           (SCHEMA + ":scope:" + scope_id,))

    def active_snapshot(self, scope_id, source_urn, *, allowed_scopes):
        scope_id = _text(scope_id, "scope_id")
        _authorize(scope_id, _allowlist(allowed_scopes))
        _, lineage = source_identity(source_urn)
        # Register before APS work so cleanup can invalidate first publications.
        # Caller commits this reservation before any network/extraction work.
        with self._atomic() as cursor:
            self._lock_scopes(cursor, [scope_id])
            cursor.execute("INSERT INTO inventory_identity_b1.sources(scope_id,source_lineage) "
                           "VALUES(%s,%s) ON CONFLICT DO NOTHING", (scope_id, lineage))
            cursor.execute("SELECT active_urn,generation FROM inventory_identity_b1.sources "
                           "WHERE scope_id=%s AND source_lineage=%s", (scope_id, lineage))
            row = cursor.fetchone()
        return {"active_urn": row[0] if row else None, "generation": row[1] if row else 0}

    def deactivate_sources(self, scope_id, source_urns, *, allowed_scopes):
        """Retire exact Sources; tombstones invalidate even first publication in flight."""
        scope_id = _text(scope_id, "scope_id")
        _authorize(scope_id, _allowlist(allowed_scopes))
        if not isinstance(source_urns, (list, tuple)) or not source_urns:
            raise IdentityError("INVALID_SOURCES")
        lineages = sorted({source_identity(urn)[1] for urn in source_urns})
        with self._atomic() as cursor:
            self._lock_scopes(cursor, [scope_id])
            for lineage in lineages:
                cursor.execute("""INSERT INTO inventory_identity_b1.sources
                    (scope_id,source_lineage,active_urn,generation) VALUES (%s,%s,NULL,1)
                    ON CONFLICT(scope_id,source_lineage) DO UPDATE
                    SET active_urn=NULL,generation=inventory_identity_b1.sources.generation+1,updated_at=now()""",
                    (scope_id, lineage))
        return {"deactivated": len(lineages), "source_lineages": lineages}

    def clear_temporary_snapshots(self, scope_id="__cmp__"):
        """Hide only temporary comparison snapshots; retain identity and provenance.

        No deletion permission over canonical snapshots/user data is required.
        Publication of the same snapshot may make it visible again after a new CAS.
        """
        if scope_id != "__cmp__":
            raise IdentityError("NOT_TEMPORARY_SCOPE")
        with self._atomic() as cursor:
            self._lock_scopes(cursor, [scope_id])
            cursor.execute("""SELECT COUNT(*) FROM inventory_identity_b1.occurrences o
                JOIN inventory_identity_b1.snapshots x USING(scope_id,source_lineage,source_urn)
                WHERE o.scope_id=%s AND x.read_visible""", (scope_id,))
            deleted = cursor.fetchone()[0]
            cursor.execute("UPDATE inventory_identity_b1.snapshots SET read_visible=false WHERE scope_id=%s", (scope_id,))
            cursor.execute("""UPDATE inventory_identity_b1.sources SET active_urn=NULL,
                generation=generation+1,updated_at=now() WHERE scope_id=%s""", (scope_id,))
        return {"deleted": deleted, "retained_history": True}

    def publish_snapshot(self, scope_id, source_urn, rows, *, expected_active_urn,
                         expected_generation, allowed_scopes, item_id=None, activate=True, complete=True):
        """Publish full native snapshot atomically; caller commits.

        Retrying an identical already-active snapshot is a no-op even if its
        original CAS expectation is old. Any DIFFERENT active target needs an
        exact CAS. activate=False stores history only and never moves the pointer.
        Reusing a version with different extracted content is an explicit error.
        """
        scope_id = _text(scope_id, "scope_id")
        _authorize(scope_id, _allowlist(allowed_scopes))
        source_urn, lineage = source_identity(source_urn, item_id)
        if type(expected_generation) is not int or expected_generation < 0:
            raise IdentityError("INVALID_GENERATION")
        if complete is not True:
            raise IdentityError("INCOMPLETE_SNAPSHOT")
        if not isinstance(activate, bool):
            raise IdentityError("INVALID_ACTIVATE")
        if expected_active_urn is not None:
            expected_active_urn, expected_lineage = source_identity(expected_active_urn)
            if expected_lineage != lineage:
                raise IdentityError("EXPECTED_SOURCE_CONFLICT")
        if not isinstance(rows, (list, tuple)):
            raise IdentityError("INVALID_ROWS", "Supply an eager complete list, not a partial iterator")
        prepared, seen = [], set()
        for raw in rows:
            if not isinstance(raw, dict):
                raise IdentityError("INVALID_ROW")
            ext = _text(raw.get("external_id"), "external_id")
            if ext in seen:
                raise IdentityError("DUPLICATE_EXTERNAL_ID", external_id=ext)
            seen.add(ext)
            for key, expected in (("scope_id", scope_id), ("source_lineage", lineage),
                                  ("model_urn", scope_id)):
                if key in raw and raw[key] != expected:
                    raise IdentityError("ROW_IDENTITY_CONFLICT", field=key, external_id=ext)
            if "source_urn" in raw and source_identity(raw["source_urn"])[0] != source_urn:
                raise IdentityError("ROW_IDENTITY_CONFLICT", field="source_urn", external_id=ext)
            row = {"external_id": ext, "properties": _object(raw.get("properties", {}), "properties")}
            for key in _NATIVE_TEXT:
                value = raw.get(key)
                if value is not None and not isinstance(value, str):
                    raise IdentityError("INVALID_NATIVE_FIELD", field=key)
                row[key] = value
            known = set(row) | set(IDENTITY_FIELDS) | {"source_urn", "model_urn", "element_key", "native_metadata"}
            metadata = _object(raw.get("native_metadata", {}), "native_metadata")
            metadata.update({key: _json_value(value) for key, value in raw.items() if key not in known})
            row["native_metadata"] = metadata
            prepared.append(row)
        prepared.sort(key=lambda row: row["external_id"])
        content_hash = _fingerprint(prepared)
        with self._atomic() as cursor:
            self._lock_scopes(cursor, [scope_id])
            cursor.execute("""INSERT INTO inventory_identity_b1.sources (scope_id, source_lineage)
                              VALUES (%s, %s) ON CONFLICT DO NOTHING""", (scope_id, lineage))
            cursor.execute("""SELECT active_urn,generation FROM inventory_identity_b1.sources
                              WHERE scope_id=%s AND source_lineage=%s FOR UPDATE""", (scope_id, lineage))
            active_urn, generation = cursor.fetchone()
            if generation != expected_generation:
                raise IdentityError("STALE_GENERATION", expected=expected_generation, actual=generation)
            cursor.execute("""SELECT content_hash, row_count,read_visible FROM inventory_identity_b1.snapshots
                              WHERE scope_id=%s AND source_lineage=%s AND source_urn=%s""",
                           (scope_id, lineage, source_urn))
            existing = cursor.fetchone()
            if existing and (existing[0] != content_hash or existing[1] != len(prepared)):
                raise IdentityError("SNAPSHOT_CONTENT_CONFLICT")
            retry_active = bool(existing and active_urn == source_urn)
            if activate and active_urn != expected_active_urn and not retry_active:
                raise IdentityError("STALE_ACTIVE_URN", expected=expected_active_urn, actual=active_urn)
            created = not bool(existing)
            if created:
                cursor.execute("""INSERT INTO inventory_identity_b1.snapshots
                                  (scope_id, source_lineage, source_urn, row_count, content_hash)
                                  VALUES (%s, %s, %s, %s, %s)""",
                               (scope_id, lineage, source_urn, len(prepared), content_hash))
                if prepared:
                    execute_values(cursor, """INSERT INTO inventory_identity_b1.elements
                        (scope_id, source_lineage, external_id) VALUES %s ON CONFLICT DO NOTHING""",
                        [(scope_id, lineage, row["external_id"]) for row in prepared])
                    execute_values(cursor, """INSERT INTO inventory_identity_b1.occurrences
                        (scope_id, source_lineage, source_urn, external_id, name, properties,
                         material, installation_status, vaciado_nro, classification,
                         project_id, last_updated, native_metadata) VALUES %s""",
                        [(scope_id, lineage, source_urn, row["external_id"], row["name"],
                          Json(row["properties"]), row["material"], row["installation_status"],
                          row["vaciado_nro"], row["classification"], row["project_id"],
                          row["last_updated"], Json(row["native_metadata"])) for row in prepared])
            activated = bool(activate and active_urn != source_urn)
            restored = bool(existing and not existing[2])
            if restored:
                cursor.execute("""UPDATE inventory_identity_b1.snapshots SET read_visible=true
                    WHERE scope_id=%s AND source_lineage=%s AND source_urn=%s""", (scope_id, lineage, source_urn))
            if activated or created or restored:
                active_urn = source_urn if activate else active_urn
                cursor.execute("""UPDATE inventory_identity_b1.sources SET active_urn=%s,
                    generation=generation+1,updated_at=now() WHERE scope_id=%s AND source_lineage=%s""",
                    (active_urn, scope_id, lineage))
                generation += 1
        return {"created": created, "activated": activated, "row_count": len(prepared),
                "scope_id": scope_id, "source_lineage": lineage, "source_urn": source_urn,
                "active_urn": active_urn, "generation": generation}

    def get_inventory(self, scope_id, *, allowed_scopes, include_props=True, source_urn=None):
        """Read active Sources or one explicit version; preserve legacy model_urn shape."""
        scope_id = _text(scope_id, "scope_id")
        _authorize(scope_id, _allowlist(allowed_scopes))
        if not isinstance(include_props, bool):
            raise IdentityError("INVALID_INCLUDE_PROPS")
        params = [scope_id]
        predicate = "(o.scope_id='__cmp__' OR o.source_urn=s.active_urn)"
        if source_urn is not None:
            source_urn, lineage = source_identity(source_urn)
            predicate = "o.source_urn=%s AND o.source_lineage=%s"
            params.extend((source_urn, lineage))
        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""SELECT o.scope_id, o.source_lineage, o.source_urn, o.external_id,
                o.name, o.properties, o.project_id, o.last_updated, o.native_metadata,
                COALESCE(u.material,o.material) AS material,
                COALESCE(u.status,o.installation_status) AS installation_status,
                COALESCE(u.vaciado_nro,o.vaciado_nro) AS vaciado_nro,
                COALESCE(u.classification,o.classification) AS classification,
                COALESCE(u.extras,'{}'::jsonb) AS extras
                FROM inventory_identity_b1.occurrences o
                JOIN inventory_identity_b1.sources s USING (scope_id,source_lineage)
                JOIN inventory_identity_b1.snapshots x USING (scope_id,source_lineage,source_urn)
                LEFT JOIN inventory_identity_b1.user_data u
                  USING (scope_id,source_lineage,external_id)
                WHERE o.scope_id=%s AND (o.scope_id<>'__cmp__' OR x.read_visible) AND """ + predicate + " ORDER BY o.source_lineage,o.source_urn,o.external_id", params)
            result = []
            for record in cursor.fetchall():
                row = dict(record)
                extras = row.pop("extras")
                row["element_key"] = element_key(row["scope_id"], row["source_lineage"], row["external_id"])
                row["model_urn"] = row["source_urn"] if include_props else row["scope_id"]
                if include_props:
                    if extras:
                        live = row["properties"].get("Live Edit", {})
                        if not isinstance(live, dict):
                            raise IdentityError("INVALID_LIVE_EDIT_GROUP", "Cannot merge extras without losing native data")
                        row["properties"]["Live Edit"] = {**live, **extras}
                else:
                    row.pop("properties")
                result.append(row)
        return result

    def update_element(self, identity, field_name, value, *, allowed_scopes):
        return self.bulk_update([identity], field_name, value, allowed_scopes=allowed_scopes)

    def bulk_update(self, identities, field_name, value, *, allowed_scopes):
        """Validate and lock every active identity before writing any; atomic bulk."""
        if not isinstance(identities, (list, tuple)) or not identities:
            raise IdentityError("INVALID_IDENTITIES")
        allowed = _allowlist(allowed_scopes)
        qualified = [_identity(identity) for identity in identities]
        for identity in qualified:
            _authorize(identity["scope_id"], allowed)
        if len({_params(identity) for identity in qualified}) != len(qualified):
            raise IdentityError("DUPLICATE_IDENTITY")
        if not isinstance(field_name, str) or not field_name or field_name in _RESERVED:
            raise IdentityError("INVALID_FIELD")
        is_name = field_name in ("Name", "name")
        column = _BASE_FIELDS.get(field_name)
        value = _json_value(value)
        if (is_name or column) and value is not None and not isinstance(value, str):
            raise IdentityError("INVALID_FIELD_VALUE", field=field_name)
        qualified.sort(key=_params)
        with self._atomic() as cursor:
            self._lock_scopes(cursor, [identity["scope_id"] for identity in qualified])
            active = []
            for identity in qualified:
                cursor.execute("""SELECT o.source_urn FROM inventory_identity_b1.occurrences o
                    JOIN inventory_identity_b1.sources s USING (scope_id,source_lineage)
                    WHERE o.scope_id=%s AND o.source_lineage=%s AND o.external_id=%s
                      AND o.source_urn=s.active_urn FOR UPDATE OF s,o""", _params(identity))
                found = cursor.fetchone()
                if not found:
                    raise IdentityError("IDENTITY_NOT_FOUND", identity=identity)
                active.append((identity, found[0]))
            for identity, version in active:
                if is_name:
                    cursor.execute("""UPDATE inventory_identity_b1.occurrences SET name=%s,updated_at=now()
                        WHERE scope_id=%s AND source_lineage=%s AND external_id=%s AND source_urn=%s""",
                        (value, *_params(identity), version))
                elif column:
                    cursor.execute(sql.SQL("""INSERT INTO inventory_identity_b1.user_data
                        (scope_id,source_lineage,external_id,{column}) VALUES (%s,%s,%s,%s)
                        ON CONFLICT (scope_id,source_lineage,external_id) DO UPDATE
                        SET {column}=EXCLUDED.{column},updated_at=now()""").format(column=sql.Identifier(column)),
                        (*_params(identity), value))
                else:
                    cursor.execute("""INSERT INTO inventory_identity_b1.user_data
                        (scope_id,source_lineage,external_id,extras) VALUES (%s,%s,%s,%s)
                        ON CONFLICT (scope_id,source_lineage,external_id) DO UPDATE
                        SET extras=inventory_identity_b1.user_data.extras || EXCLUDED.extras,updated_at=now()""",
                        (*_params(identity), Json({field_name: value})))
        return {"updated": len(qualified), "identities": qualified}

    def _legacy_candidates(self, cursor, external_id, allowed, scope_id=None, lineage=None, *, active_only):
        conditions = ["e.external_id=%s"]
        params = [external_id]
        if allowed is not None:
            conditions.append("e.scope_id=ANY(%s)")
            params.append(sorted(allowed))
        if scope_id is not None:
            conditions.append("e.scope_id=%s")
            params.append(scope_id)
        if lineage is not None:
            conditions.append("e.source_lineage=%s")
            params.append(lineage)
        if active_only:
            conditions.append("""EXISTS (SELECT 1 FROM inventory_identity_b1.occurrences o
                JOIN inventory_identity_b1.sources s USING (scope_id,source_lineage)
                WHERE o.scope_id=e.scope_id AND o.source_lineage=e.source_lineage
                  AND o.external_id=e.external_id AND o.source_urn=s.active_urn)""")
        cursor.execute("""SELECT e.scope_id,e.source_lineage,e.external_id
            FROM inventory_identity_b1.elements e WHERE """ + " AND ".join(conditions) +
            " ORDER BY e.scope_id,e.source_lineage,e.external_id", params)
        return [dict(zip(IDENTITY_FIELDS, row)) for row in cursor.fetchall()]

    def resolve_legacy_identity(self, external_id, *, allowed_scopes, scope_id=None, active_only=False):
        """Compatibility resolver only; ambiguity is never a successful write.

        Ambiguity is decided exactly as migrate_legacy_user decides it: a rival
        identity that survives only in historical snapshots still counts. A
        consumer that deliberately wants the narrower "currently active" answer
        must ask for active_only=True; it never happens through a default.
        """
        external_id = _text(external_id, "external_id")
        allowed = _allowlist(allowed_scopes)
        if not isinstance(active_only, bool):
            raise IdentityError("INVALID_ACTIVE_ONLY")
        if scope_id is not None:
            scope_id = _text(scope_id, "scope_id")
            _authorize(scope_id, allowed)
        with self.conn.cursor() as cursor:
            candidates = self._legacy_candidates(cursor, external_id, None, scope_id,
                                                 active_only=active_only)
        if len(candidates) != 1:
            # Permission is not provenance. Detect ambiguity globally, but do
            # not expose unauthorized identities in application error details.
            visible = [candidate for candidate in candidates if candidate["scope_id"] in allowed]
            raise IdentityError("LEGACY_AMBIGUOUS" if candidates else "LEGACY_NOT_FOUND", candidates=visible)
        _authorize(candidates[0]["scope_id"], allowed)
        return candidates[0]

    def _quarantine(self, cursor, payload, reason, candidates, coverage_complete):
        fingerprint = _fingerprint([payload, reason, candidates, coverage_complete])
        cursor.execute("""INSERT INTO inventory_identity_b1.legacy_user_quarantine
            (external_id,payload,reason,candidates,coverage_complete,fingerprint)
            VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (fingerprint) DO NOTHING RETURNING id""",
            (payload.get("external_id"), Json(payload), reason, Json(candidates), coverage_complete, fingerprint))
        row = cursor.fetchone()
        if row is None:
            cursor.execute("SELECT id FROM inventory_identity_b1.legacy_user_quarantine WHERE fingerprint=%s", (fingerprint,))
            row = cursor.fetchone()
        return {"status": "quarantined", "reason": reason, "quarantine_id": row[0], "candidates": candidates}

    def migrate_legacy_user(self, payload, *, coverage_complete, allowed_scopes):
        raise IdentityError("NO_PROMOTION", "Verified coverage evidence is required before operational promotion")

    def _migrate_legacy_user_for_fixture(self, payload, *, coverage_complete, allowed_scopes):
        """Explicit migrator-only promotion, never an automatic legacy-table scan.

        Payload optional hints: scope_id and source_lineage; project_id is NOT
        treated as scope. Uniqueness includes retained historical identities.
        Existing qualified edits win: a retry never overwrites them, and a
        distinct incoming payload is quarantined rather than merged silently.
        """
        with self.conn.cursor() as guard:
            guard.execute("SELECT current_database()")
            if not guard.fetchone()[0].startswith(DATABASE_PREFIX):
                raise IdentityError("UNSAFE_DATABASE", "Fixture promotion requires a disposable database")
        payload = _object(payload, "payload")
        external_id = _text(payload.get("external_id"), "external_id")
        allowed = _allowlist(allowed_scopes)
        if not isinstance(coverage_complete, bool):
            raise IdentityError("INVALID_COVERAGE_FLAG")
        scope_id, lineage = payload.get("scope_id"), payload.get("source_lineage")
        if scope_id is not None:
            scope_id = _text(scope_id, "scope_id")
            _authorize(scope_id, allowed)
        if lineage is not None and (not es_linaje(lineage) or lineage != lineage.strip()):
            raise IdentityError("INVALID_SOURCE_LINEAGE")
        with self._atomic() as cursor:
            cursor.execute("SELECT current_user")
            actor = cursor.fetchone()[0]
            if actor != "ecd_migrator":
                raise IdentityError("MIGRATOR_REQUIRED")
            cursor.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                           (SCHEMA + ":legacy-promotion",))
            self._lock_scopes(cursor, allowed)
            # No unproven scope is inferred from a caller's permission set.
            # Migrator alone sees all candidates; quarantine is migrator-only.
            candidates = self._legacy_candidates(cursor, external_id, None, scope_id, lineage, active_only=False)
            if not coverage_complete:
                return self._quarantine(cursor, payload, "COVERAGE_INCOMPLETE", candidates, coverage_complete)
            if len(candidates) != 1:
                return self._quarantine(cursor, payload, "LEGACY_AMBIGUOUS" if candidates else "LEGACY_NOT_FOUND",
                                        candidates, coverage_complete)
            identity = candidates[0]
            if identity["scope_id"] not in allowed:
                return self._quarantine(cursor, payload, "FORBIDDEN_SCOPE", candidates, coverage_complete)
            # Same source lock as normal edits/publication serializes legacy work.
            cursor.execute("""SELECT 1 FROM inventory_identity_b1.sources
                WHERE scope_id=%s AND source_lineage=%s FOR UPDATE""", _params(identity)[:2])
            cursor.execute("""SELECT original_payload FROM inventory_identity_b1.user_data
                WHERE scope_id=%s AND source_lineage=%s AND external_id=%s FOR UPDATE""", _params(identity))
            existing = cursor.fetchone()
            if existing:
                if existing[0] == payload:
                    return {"status": "promoted", "identity": identity, "created": False}
                return self._quarantine(cursor, payload, "QUALIFIED_DATA_EXISTS", candidates, coverage_complete)
            raw_extras = payload.get("extras", {})
            if not isinstance(raw_extras, dict):
                return self._quarantine(cursor, payload, "INVALID_USER_DATA", candidates, coverage_complete)
            extras = _json_value(raw_extras)
            values = [payload.get("material"), payload.get("status", payload.get("installation_status")),
                      payload.get("vaciado_nro"), payload.get("classification")]
            if any(value is not None and not isinstance(value, str) for value in values):
                return self._quarantine(cursor, payload, "INVALID_USER_DATA", candidates, coverage_complete)
            # Provenance of the promotion, written in the same transaction that
            # promotes: the coverage assertion it was made under, every candidate
            # weighed, and the database actor. Not a human identity and not an
            # audit trail -- just enough to reconstruct why this was called safe.
            cursor.execute("""INSERT INTO inventory_identity_b1.user_data
                (scope_id,source_lineage,external_id,material,status,vaciado_nro,classification,extras,original_payload,
                 promotion_coverage_complete,promotion_candidates,promoted_by)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (*_params(identity), *values, Json(extras), Json(payload),
                 coverage_complete, Json(candidates), actor))
        return {"status": "promoted", "identity": identity, "created": True}


def verify_inventory_schema(cursor):
    """Read-only startup gate for canonical columns, keys, projection and grants."""
    required = {
        "sources": {"scope_id", "source_lineage", "active_urn", "generation"},
        "elements": {"scope_id", "source_lineage", "external_id"},
        "snapshots": {"scope_id", "source_lineage", "source_urn", "row_count", "content_hash", "is_complete", "read_visible"},
        "occurrences": {"scope_id", "source_lineage", "source_urn", "external_id", "name", "properties", "material", "installation_status", "vaciado_nro", "classification", "project_id", "last_updated", "native_metadata"},
        "user_data": {"scope_id", "source_lineage", "external_id", "material", "status", "vaciado_nro", "classification", "extras", "original_payload", "promotion_coverage_complete", "promotion_candidates", "promoted_by"},
        "legacy_user_quarantine": {"id", "external_id", "payload", "reason", "candidates", "coverage_complete", "fingerprint"},
        "inventory_assets": {"external_id", "model_urn", "source_urn", "scope_id", "source_lineage", "element_key", "properties", "name", "material", "installation_status", "vaciado_nro"},
    }
    cursor.execute("""SELECT c.relname,c.relkind,a.attname FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
        WHERE n.nspname=%s""", (SCHEMA,))
    found, kinds = {}, {}
    for table, kind, column in cursor.fetchall():
        found.setdefault(table, set()).add(column)
        kinds[table] = kind
    missing = [f"inventory {table}.{column}" for table, columns in required.items()
               for column in sorted(columns - found.get(table, set()))]
    if kinds.get("inventory_assets") != "v":
        missing.append("inventory canonical projection must be a view")
    for table in set(required) - {"inventory_assets"}:
        if kinds.get(table) != "r":
            missing.append("inventory table " + table)
    cursor.execute("""SELECT c.relname,k.contype,pg_get_constraintdef(k.oid)
        FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s""", (SCHEMA,))
    keys = {(table, kind, definition) for table, kind, definition in cursor.fetchall()}
    for table, columns in {
        "sources": "scope_id, source_lineage", "elements": "scope_id, source_lineage, external_id",
        "snapshots": "scope_id, source_lineage, source_urn",
        "occurrences": "scope_id, source_lineage, source_urn, external_id",
        "user_data": "scope_id, source_lineage, external_id", "legacy_user_quarantine": "id",
    }.items():
        if (table, "p", "PRIMARY KEY (" + columns + ")") not in keys:
            missing.append("inventory primary key " + table)
    if not any(table == "user_data" and kind == "c" and "num_nonnulls(promotion_coverage_complete, promotion_candidates, promoted_by)" in definition
               for table, kind, definition in keys):
        missing.append("inventory complete promotion provenance constraint")
    foreign_keys = {(table, re.sub(r'\s+', '', definition.replace(SCHEMA+'.', '')))
                    for table, kind, definition in keys if kind == 'f'}
    for table, declaration in [
        ('sources', 'FOREIGN KEY (scope_id,source_lineage,active_urn) REFERENCES snapshots(scope_id,source_lineage,source_urn)'),
        ('elements', 'FOREIGN KEY (scope_id,source_lineage) REFERENCES sources(scope_id,source_lineage)'),
        ('snapshots', 'FOREIGN KEY (scope_id,source_lineage) REFERENCES sources(scope_id,source_lineage)'),
        ('occurrences', 'FOREIGN KEY (scope_id,source_lineage,source_urn) REFERENCES snapshots(scope_id,source_lineage,source_urn)'),
        ('occurrences', 'FOREIGN KEY (scope_id,source_lineage,external_id) REFERENCES elements(scope_id,source_lineage,external_id)'),
        ('user_data', 'FOREIGN KEY (scope_id,source_lineage,external_id) REFERENCES elements(scope_id,source_lineage,external_id)'),
    ]:
        expected = re.sub(r'\s+', '', declaration)
        if not any(t == table and actual.startswith(expected) for t, actual in foreign_keys):
            missing.append('inventory qualified foreign key ' + table + ' ' + declaration)
    cursor.execute("SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname='ecd_app'")
    role = cursor.fetchone()
    if role != (False, False, False, False):
        missing.append("inventory runtime role privileges")
    if missing:
        return missing
    cursor.execute("""SELECT has_schema_privilege('ecd_app',%s,'CREATE'),
        has_table_privilege('ecd_app',%s,'SELECT'),has_table_privilege('ecd_app',%s,'SELECT'),
        has_table_privilege('ecd_app',%s,'DELETE'),has_table_privilege('ecd_app',%s,'DELETE')""",
        (SCHEMA, SCHEMA+'.inventory_assets', SCHEMA+'.legacy_user_quarantine', SCHEMA+'.elements', SCHEMA+'.user_data'))
    if cursor.fetchone() != (False, True, False, False, False):
        missing.append("inventory runtime table/schema grants")
    cursor.execute("SELECT has_schema_privilege('ecd_app','public','CREATE'),"
                   "has_database_privilege('ecd_app',current_database(),'CREATE')")
    if cursor.fetchone() != (False, False):
        missing.append('inventory runtime public/database DDL privileges')
    for table in ('public.inventory_assets', 'public.asset_user_data'):
        cursor.execute('SELECT to_regclass(%s)', (table,))
        if cursor.fetchone()[0] is not None:
            cursor.execute("SELECT has_table_privilege('ecd_app',%s,'INSERT'),has_table_privilege('ecd_app',%s,'UPDATE'),"
                           "has_table_privilege('ecd_app',%s,'DELETE'),has_table_privilege('ecd_app',%s,'TRUNCATE')", (table,)*4)
            if cursor.fetchone() != (False, False, False, False):
                missing.append('inventory legacy write grants ' + table)
    for column in ("original_payload", "promotion_coverage_complete", "promotion_candidates", "promoted_by"):
        cursor.execute("SELECT has_column_privilege('ecd_app',%s,%s,'INSERT'),has_column_privilege('ecd_app',%s,%s,'UPDATE')",
                       (SCHEMA+'.user_data', column, SCHEMA+'.user_data', column))
        if cursor.fetchone() != (False, False):
            missing.append("inventory protected provenance grant " + column)
    return missing
