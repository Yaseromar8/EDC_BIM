/**
 * Identidad de Source en el enlace 4D — L2 INTEGRATION.
 *
 *     node frontend-react/pruebas/lob4dIdentidad.prueba.mjs
 *
 * Se ejecuta el `setElementLinks` REAL de `LOB4DExtension`, con la `linajeDeUrn`
 * real. Lo que es doble es el visor: modelos con `getExternalIdMapping`, que es
 * exactamente lo que la extensión pide al LMV.
 *
 * Lo que se mide es UNA cosa: a qué modelo se ata cada enlace. No se tocan
 * fórmulas 4D, avance, metrados, colores ni etiquetas.
 */

// El módulo extiende `window.Autodesk.Viewing.Extension` al definirse.
globalThis.window = globalThis.window || globalThis;
window.Autodesk = {
    Viewing: {
        Extension: class {},
        theExtensionManager: { registerExtension: () => true },
    },
};
window.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(tipo, init) { this.type = tipo; Object.assign(this, init); } };

const { default: LOB4DExtension } = await import('../src/aps/extensions/LOB4DExtension.js');

let fallos = 0, total = 0;
const ok = (n, c, d = '') => { total++; if (c) console.log(`  ok   ${n}`); else { fallos++; console.log(`  FALLA ${n}${d ? '  → ' + d : ''}`); } };
const titulo = (t) => console.log(`\n${t}\n${'-'.repeat(t.length)}`);

// ── Identificadores con la forma real de APS ───────────────────────────────
const b64 = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const urnDe = (doc, v) => b64(`urn:adsk.wipprod:fs.file:vf.${doc}?version=${v}`);

const modelo = (doc, version, mapping) => ({
    getData: () => ({ urn: urnDe(doc, version) }),
    id: `${doc}@v${version}`,
    getExternalIdMapping: (ok) => ok(mapping),
});

/** Instancia la extensión real sin LMV: sólo se sustituye lo que toca al visor. */
function extension(modelos) {
    const ext = Object.create(LOB4DExtension.prototype);
    ext.viewer = { impl: { invalidate: () => {} } };
    ext.clear4DTheming = () => {};
    ext.getThemingModels = () => modelos;
    return ext;
}

/** Devuelve {codigo: [id de modelo, ...]} — a qué Source se ató cada enlace. */
async function atarEnlaces(modelos, enlaces) {
    const ext = extension(modelos);
    await ext.setElementLinks(enlaces);
    const salida = {};
    for (const [clave, destinos] of Object.entries(ext.activityToDbIds || {})) {
        salida[clave] = destinos.map((d) => `${d.model.id}#${d.dbId}`).sort();
    }
    return salida;
}

const A = 'zzDocA', B = 'zzDocB';

// ═══════════════════════════════════════════════════════════════════════════
titulo('1 · CONTROL — externalIds distintos: el resultado no cambia');
// ═══════════════════════════════════════════════════════════════════════════
{
    const modelos = [modelo(A, 1, { extA: 11 }), modelo(B, 1, { extB: 22 })];
    const r = await atarEnlaces(modelos, [
        { source_urn: urnDe(A, 1), external_id: 'extA', codigo: 'P.01' },
        { source_urn: urnDe(B, 1), external_id: 'extB', codigo: 'P.02' },
    ]);
    ok('cada enlace va a su propio modelo',
        JSON.stringify(r) === JSON.stringify({ 'P.01': ['zzDocA@v1#11'], 'P.02': ['zzDocB@v1#22'] }),
        JSON.stringify(r));
}

// ═══════════════════════════════════════════════════════════════════════════
titulo('2 · COLISIÓN — A/ext1 y B/ext1: cada Source conserva lo suyo');
// ═══════════════════════════════════════════════════════════════════════════
{
    const modelos = [modelo(A, 1, { compartido: 11 }), modelo(B, 1, { compartido: 22 })];
    const r = await atarEnlaces(modelos, [
        { source_urn: urnDe(A, 1), external_id: 'compartido', codigo: 'P.A' },
        { source_urn: urnDe(B, 1), external_id: 'compartido', codigo: 'P.B' },
    ]);
    ok('el enlace de A pinta el elemento de A', JSON.stringify(r['P.A']) === JSON.stringify(['zzDocA@v1#11']), JSON.stringify(r['P.A']));
    ok('el enlace de B pinta el elemento de B', JSON.stringify(r['P.B']) === JSON.stringify(['zzDocB@v1#22']), JSON.stringify(r['P.B']));
}

// ═══════════════════════════════════════════════════════════════════════════
titulo('3 · ORDEN — A,B contra B,A: resultado idéntico');
// ═══════════════════════════════════════════════════════════════════════════
{
    const mA = () => modelo(A, 1, { compartido: 11 });
    const mB = () => modelo(B, 1, { compartido: 22 });
    const enlaces = [
        { source_urn: urnDe(A, 1), external_id: 'compartido', codigo: 'P.A' },
        { source_urn: urnDe(B, 1), external_id: 'compartido', codigo: 'P.B' },
    ];
    // El orden de las CLAVES de un objeto sigue al orden de inserción, y eso no
    // es el resultado: se compara el mapa, no cómo quedó serializado.
    const canonico = (r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]));
    const ab = await atarEnlaces([mA(), mB()], enlaces);
    const ba = await atarEnlaces([mB(), mA()], enlaces);
    const inv = await atarEnlaces([mA(), mB()], [...enlaces].reverse());
    ok('cambiar el orden de carga de los modelos no cambia nada', canonico(ab) === canonico(ba), canonico(ba));
    ok('cambiar el orden de los enlaces no cambia nada', canonico(ab) === canonico(inv), canonico(inv));
}

// ═══════════════════════════════════════════════════════════════════════════
titulo('4 · SIN HERENCIA — un enlace de A no cae sobre B');
// ═══════════════════════════════════════════════════════════════════════════
{
    // El documento A NO está cargado. Antes, el enlace caía al primer modelo que
    // tuviera ese externalId: B. Ahora no hay documento que lo reciba.
    const modelos = [modelo(B, 1, { compartido: 22 })];
    const r = await atarEnlaces(modelos, [
        { source_urn: urnDe(A, 1), external_id: 'compartido', codigo: 'P.SOLO-A' },
    ]);
    ok('B no hereda el 4D de A', r['P.SOLO-A'] === undefined, JSON.stringify(r));

    const conB = await atarEnlaces(modelos, [
        { source_urn: urnDe(B, 1), external_id: 'compartido', codigo: 'P.DE-B' },
    ]);
    ok('y el enlace legítimo de B sí llega', JSON.stringify(conB['P.DE-B']) === JSON.stringify(['zzDocB@v1#22']), JSON.stringify(conB));
}

// ═══════════════════════════════════════════════════════════════════════════
titulo('5 · VERSIÓN — el enlace guardado con v1 encuentra el v2 del MISMO documento');
// ═══════════════════════════════════════════════════════════════════════════
{
    // Es el caso que hacía útil el atajo viejo: al versionar, el URN cambia. El
    // linaje no. Se resuelve por documento, no por «el primero que lo tenga».
    const modelos = [modelo(A, 2, { compartido: 33 }), modelo(B, 1, { compartido: 22 })];
    const r = await atarEnlaces(modelos, [
        { source_urn: urnDe(A, 1), external_id: 'compartido', codigo: 'P.A' },
    ]);
    ok('sigue al mismo documento en su versión nueva', JSON.stringify(r['P.A']) === JSON.stringify(['zzDocA@v2#33']), JSON.stringify(r));
}

// ═══════════════════════════════════════════════════════════════════════════
titulo('6 · AMBIGÜEDAD — dos versiones del mismo documento cargadas a la vez');
// ═══════════════════════════════════════════════════════════════════════════
{
    const modelos = [modelo(A, 1, { compartido: 11 }), modelo(A, 2, { compartido: 33 })];
    const exacto = await atarEnlaces(modelos, [
        { source_urn: urnDe(A, 2), external_id: 'compartido', codigo: 'P.EXACTO' },
    ]);
    ok('con URN exacto se resuelve sin dudar', JSON.stringify(exacto['P.EXACTO']) === JSON.stringify(['zzDocA@v2#33']), JSON.stringify(exacto));

    const viejo = await atarEnlaces(modelos, [
        { source_urn: urnDe(A, 5), external_id: 'compartido', codigo: 'P.AMBIGUO' },
    ]);
    ok('sin URN exacto y con dos versiones vivas no se elige ninguna', viejo['P.AMBIGUO'] === undefined, JSON.stringify(viejo));
}

// ═══════════════════════════════════════════════════════════════════════════
titulo('7 · URN NO APS — no se inventa documento');
// ═══════════════════════════════════════════════════════════════════════════
{
    const modelos = [modelo(B, 1, { compartido: 22 })];
    const r = await atarEnlaces(modelos, [
        { source_urn: 'urn:adsk.objects:os.object:cubo/fichero.rvt', external_id: 'compartido', codigo: 'P.OSS' },
        { source_urn: '', external_id: 'compartido', codigo: 'P.VACIO' },
    ]);
    ok('un URN OSS no se ata a nada', r['P.OSS'] === undefined, JSON.stringify(r));
    ok('un enlace sin URN tampoco', r['P.VACIO'] === undefined, JSON.stringify(r));
}


// ═══════════════════════════════════════════════════════════════════════════
// buildParamPhaseIndex · buildSubZoneLabels · buildZoneHoverIndex
//
// Los tres leen `window.postgresInventory` y resuelven cada fila contra los
// modelos cargados. Se ejecutan los metodos REALES sobre una instancia real:
// lo unico que se dobla es el visor (modelos, rosetta y una THREE minima).
// ═══════════════════════════════════════════════════════════════════════════

const fila = (doc, version, ext, extra) => ({
    dbId: ext, external_id: ext, source_urn: urnDe(doc, version), ...extra,
});

/** Modelo con su mapa externalId→dbId, para rosetta y getExternalIdMapping. */
const modeloCon = (doc, version, mapping) => ({
    getData: () => ({ urn: urnDe(doc, version) }),
    id: `${doc}@v${version}`,
    getExternalIdMapping: (ok) => ok(mapping),
    _mapping: mapping,
});

function instancia(modelos) {
    const ext = Object.create(LOB4DExtension.prototype);
    ext.viewer = {
        impl: { invalidate: () => {}, modelQueue: () => ({ getModels: () => modelos }) },
        model: modelos[0],
    };
    ext.getThemingModels = () => modelos;
    ext.clear4DTheming = () => {};
    window.rosettaToDbId = Object.fromEntries(modelos.map((m) => [m.getData().urn, m._mapping]));
    return ext;
}

// ── 8 · buildParamPhaseIndex ───────────────────────────────────────────────
async function faseDe(modelos, inventario) {
    window.postgresInventory = inventario;
    const ext = instancia(modelos);
    const idx = await ext.buildParamPhaseIndex('DSI_Fase');
    const salida = {};
    if (idx) {
        for (const [faseValor, destinos] of idx.byPhase) {
            salida[faseValor] = destinos.map((d) => `${d.model.id}#${d.dbId}`).sort();
        }
    }
    return salida;
}

titulo('8 · buildParamPhaseIndex — la fase no salta de una Source a otra');
{
    const A = 'zzDocA', B = 'zzDocB';

    // 8.1 CONTROL: externalIds distintos
    let r = await faseDe(
        [modeloCon(A, 1, { extA: 11 }), modeloCon(B, 1, { extB: 22 })],
        [fila(A, 1, 'extA', { DSI_Fase: 'FASE A' }), fila(B, 1, 'extB', { DSI_Fase: 'FASE B' })]);
    ok('control: cada fase en su modelo',
        JSON.stringify(r) === JSON.stringify({ 'FASE A': ['zzDocA@v1#11'], 'FASE B': ['zzDocB@v1#22'] }),
        JSON.stringify(r));

    // 8.2 COLISION: mismo externalId en dos Sources
    const modelos = () => [modeloCon(A, 1, { compartido: 11 }), modeloCon(B, 1, { compartido: 22 })];
    const inv = [fila(A, 1, 'compartido', { DSI_Fase: 'FASE A' }),
                 fila(B, 1, 'compartido', { DSI_Fase: 'FASE B' })];
    r = await faseDe(modelos(), inv);
    ok('colision: A recibe FASE A', JSON.stringify(r['FASE A']) === JSON.stringify(['zzDocA@v1#11']), JSON.stringify(r));
    ok('colision: B recibe FASE B', JSON.stringify(r['FASE B']) === JSON.stringify(['zzDocB@v1#22']), JSON.stringify(r));

    // 8.3 ORDEN
    const canon = (x) => JSON.stringify(Object.keys(x).sort().map((k) => [k, x[k]]));
    const invertido = await faseDe(modelos().reverse(), [...inv].reverse());
    ok('orden: invertir modelos y filas no cambia el resultado', canon(r) === canon(invertido), canon(invertido));

    // 8.4 SIN HERENCIA: el documento de la fila no esta cargado
    r = await faseDe([modeloCon(B, 1, { compartido: 22 })],
                     [fila(A, 1, 'compartido', { DSI_Fase: 'SOLO DE A' })]);
    ok('sin herencia: B no recibe la fase de A', r['SOLO DE A'] === undefined, JSON.stringify(r));

    // 8.5 VERSION: la fila trae el URN viejo del MISMO documento
    r = await faseDe([modeloCon(A, 2, { compartido: 33 })],
                     [fila(A, 1, 'compartido', { DSI_Fase: 'FASE A' })]);
    ok('version: se rebindea al mismo documento en su version nueva',
        JSON.stringify(r['FASE A']) === JSON.stringify(['zzDocA@v2#33']), JSON.stringify(r));
}

// ── 9 · buildSubZoneLabels ─────────────────────────────────────────────────
function threeMinima() {
    class V3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        add(o) { this.x += o.x; this.y += o.y; this.z += o.z; return this; }
        clone() { return new V3(this.x, this.y, this.z); }
        multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
        distanceToSquared(o) { const a = this.x - o.x, b = this.y - o.y, c = this.z - o.z; return a * a + b * b + c * c; }
    }
    class B3 {
        constructor() { this.min = new V3(); this.max = new V3(); this.vacia = true; }
        isEmpty() { return this.vacia; }
        union(o) { if (!o.vacia) { this.min = o.min.clone(); this.max = o.max.clone(); this.vacia = false; } return this; }
        getCenter(t) { t.x = this.max.x; t.y = 0; t.z = this.max.z; return t; }
    }
    return { Vector3: V3, Box3: B3 };
}

function zonasDe(modelos, inventario) {
    window.THREE = threeMinima();
    window.postgresInventory = inventario;
    const ext = instancia(modelos);
    ext.clearZoneLabels = () => {};
    ext.ensureZoneGroup = () => {};
    ext.createZoneLabel = () => {};
    ext.updateZoneLabels = () => {};
    ext.aplicarAvanceExterno = () => {};
    ext.reportZoneResult = (n) => n;
    for (const m of modelos) {
        m.getInstanceTree = () => ({ enumNodeFragments: (dbId, cb) => cb(dbId) });
        m.getFragmentList = () => ({
            getWorldBounds: (fragId, caja) => {
                caja.vacia = false;
                caja.min = new window.THREE.Vector3(fragId, 0, 0);
                caja.max = new window.THREE.Vector3(fragId, 0, fragId);
            },
        });
    }
    ext.buildSubZoneLabels('subzona');
    const salida = {};
    (ext._zoneMembers || new Map()).forEach(({ byModel }, zona) => {
        salida[zona] = [];
        byModel.forEach((ids, model) => ids.forEach((d) => salida[zona].push(`${model.id}#${d}`)));
        salida[zona].sort();
    });
    return salida;
}

titulo('9 · buildSubZoneLabels — la subzona no rotula elementos de otra Source');
{
    const A = 'zzDocA', B = 'zzDocB';
    const modelos = () => [modeloCon(A, 1, { compartido: 11 }), modeloCon(B, 1, { compartido: 22 })];

    let r = zonasDe([modeloCon(A, 1, { extA: 11 }), modeloCon(B, 1, { extB: 22 })],
                    [fila(A, 1, 'extA', { SubZona: 'ZONA A' }), fila(B, 1, 'extB', { SubZona: 'ZONA B' })]);
    ok('control: cada zona con su modelo',
        JSON.stringify(r) === JSON.stringify({ 'ZONA A': ['zzDocA@v1#11'], 'ZONA B': ['zzDocB@v1#22'] }),
        JSON.stringify(r));

    const inv = [fila(A, 1, 'compartido', { SubZona: 'ZONA A' }),
                 fila(B, 1, 'compartido', { SubZona: 'ZONA B' })];
    r = zonasDe(modelos(), inv);
    ok('colision: ZONA A solo agrupa el elemento de A',
        JSON.stringify(r['ZONA A']) === JSON.stringify(['zzDocA@v1#11']), JSON.stringify(r));
    ok('colision: ZONA B solo agrupa el elemento de B',
        JSON.stringify(r['ZONA B']) === JSON.stringify(['zzDocB@v1#22']), JSON.stringify(r));

    const canon = (x) => JSON.stringify(Object.keys(x).sort().map((k) => [k, x[k]]));
    ok('orden: invertir modelos y filas no cambia el resultado',
        canon(r) === canon(zonasDe(modelos().reverse(), [...inv].reverse())), canon(r));

    r = zonasDe([modeloCon(B, 1, { compartido: 22 })],
                [fila(A, 1, 'compartido', { SubZona: 'SOLO DE A' })]);
    ok('sin herencia: B no se rotula con la zona de A', r['SOLO DE A'] === undefined, JSON.stringify(r));
}

// ── 10 · buildZoneHoverIndex ───────────────────────────────────────────────
function miembrosDe(modelos, inventario) {
    window.postgresInventory = inventario;
    const ext = instancia(modelos);
    const idx = ext.buildZoneHoverIndex();
    const salida = {};
    if (idx) {
        idx.membersByZone.forEach((miembros, zona) => {
            salida[zona] = miembros.map((m) => `${m.model.id}#${m.dbId}`).sort();
        });
    }
    return salida;
}

titulo('10 · buildZoneHoverIndex — sin caída al primer modelo que tenga el ext');
{
    const A = 'zzDocA', B = 'zzDocB';
    const L = '01_02_DSI_Localizador';

    let r = miembrosDe([modeloCon(A, 1, { extA: 11 }), modeloCon(B, 1, { extB: 22 })],
                       [fila(A, 1, 'extA', { [L]: 'BP-10' }), fila(B, 1, 'extB', { [L]: 'BP-20' })]);
    ok('control: cada localizador con su modelo',
        JSON.stringify(r) === JSON.stringify({ 'BP-10': ['zzDocA@v1#11'], 'BP-20': ['zzDocB@v1#22'] }),
        JSON.stringify(r));

    // El documento de la fila NO esta cargado: antes caia al primer modelo que
    // tuviera ese externalId y el grupo se llevaba un elemento ajeno.
    r = miembrosDe([modeloCon(B, 1, { compartido: 22 })],
                   [fila(A, 1, 'compartido', { [L]: 'BP-30' })]);
    ok('sin herencia: el grupo de A no se lleva el elemento de B',
        JSON.stringify(r['BP-30']) === JSON.stringify([]), JSON.stringify(r));

    // Version nueva del MISMO documento: sigue resolviendo.
    r = miembrosDe([modeloCon(A, 2, { compartido: 33 })],
                   [fila(A, 1, 'compartido', { [L]: 'BP-40' })]);
    ok('version: se rebindea al mismo documento',
        JSON.stringify(r['BP-40']) === JSON.stringify(['zzDocA@v2#33']), JSON.stringify(r));
}

console.log(`\n${'='.repeat(60)}`);
console.log(fallos ? `${fallos} de ${total} FALLAN.` : `${total} de ${total} pasan.`);
process.exit(fallos ? 1 : 0);
