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

console.log(`\n${'='.repeat(60)}`);
console.log(fallos ? `${fallos} de ${total} FALLAN.` : `${total} de ${total} pasan.`);
process.exit(fallos ? 1 : 0);
