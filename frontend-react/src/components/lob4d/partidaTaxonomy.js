// Taxonomía de partidas ESPECÍFICA para obra lineal drenaje+canal.
// Reglas ordenadas (primero lo más específico). Cada familia define:
//   - color: paleta TILOS drenaje
//   - pattern: id del patrón SVG (visible en <defs> del LineBalanceView)
//   - priority: número menor = se dibuja arriba (encima)
//   - isAuxiliary: no va a la LOB principal por defecto (indirectos)
//   - isPunctual: se pinta como PUNTO en su progresiva (no trazo lineal)
//   - flow: fase del flujo constructivo (para orden lógico)

// eslint-disable-next-line no-useless-escape
const R = (s) => new RegExp(s, 'i');

const RULES = [
    // ── PUNTUALES / DISCRETOS ────────────────────────────────────────────
    { key: 'BUZON',        pat: R('buzon|manhole|c[aá]mara|caja\\s+de'),                                 color: '#dc2626', pattern: 'buzon',   priority: 1,  flow: 6, isPunctual: true },

    // ── FLUJO PRINCIPAL DRENAJE ──────────────────────────────────────────
    { key: 'EXCAV_TUB',    pat: R('excav.*(tuber[ií]a|zanja|colec|buzon)'),                              color: '#8b5a2b', pattern: 'excavT',  priority: 10, flow: 1 },
    { key: 'REFINE',       pat: R('refin'),                                                              color: '#a08a5b', pattern: 'refine',  priority: 12, flow: 2 },
    { key: 'CAMA_ARENA',   pat: R('cama\\s*(de\\s+)?(arena|apoy)|cama\\s+granular'),                     color: '#f59e0b', pattern: 'cama',    priority: 13, flow: 3 },
    { key: 'TUBERIA',      pat: R('tuber[ií]a|instalac.*tub|conducc|colector'),                          color: '#0891b2', pattern: 'tuberia', priority: 4,  flow: 4 },

    // ── FLUJO PRINCIPAL CANAL ────────────────────────────────────────────
    { key: 'EXCAV_MASA',   pat: R('excav.*(canal|masiv|material\\s+suelt|roca|c[/\\\\]?\\s*maq|con\\s+m[aá]quina|terreno\\s+normal|encauzam)'), color: '#7c3f00', pattern: 'excavM',  priority: 9,  flow: 1 },
    { key: 'EXCAV_ESTR',   pat: R('excav.*(estruct|disipa|aport|cimentaci|fundaci)'),                    color: '#a56236', pattern: 'excavE',  priority: 11, flow: 1 },
    { key: 'RELLENO_ESTR', pat: R('rellen.*(estruct|compact|prest[aá]mo|material\\s+prest|cantera|selecc)'), color: '#65a30d', pattern: 'relleE', priority: 8,  flow: 5 },
    { key: 'RELLENO',      pat: R('rellen'),                                                             color: '#84cc16', pattern: 'relleno', priority: 9,  flow: 5 },
    { key: 'SOLADO',       pat: R('solado'),                                                             color: '#94a3b8', pattern: 'solado',  priority: 7,  flow: 4 },
    { key: 'ACERO',        pat: R('acero|corrugado|refuerz|habilita.*acer'),                             color: '#475569', pattern: 'acero',   priority: 6,  flow: 5 },
    { key: 'ENCOFRADO',    pat: R('encofrado|desencof'),                                                 color: '#a1a1aa', pattern: 'encofr',  priority: 5,  flow: 6 },
    { key: 'CONCRETO',     pat: R('concreto|premezcl|vaciad|fc\\s*='),                                   color: '#334155', pattern: 'concr',   priority: 3,  flow: 7 },
    { key: 'CURADO',       pat: R('curado'),                                                             color: '#0284c7', pattern: 'curado',  priority: 14, flow: 8 },
    { key: 'JUNTA',        pat: R('sellad|junta|dilatac|water\\s*stop'),                                 color: '#7c3aed', pattern: 'junta',   priority: 15, flow: 9 },
    { key: 'TARRAJEO',     pat: R('tarraj|revoq|impermeabiliz'),                                         color: '#0369a1', pattern: 'tarr',    priority: 15, flow: 9 },
    { key: 'GAVION',       pat: R('gavi[oó]n|colch[oó]n|malla\\s+(doble|triple|torsi[oó]n)'),            color: '#a16207', pattern: 'gavion',  priority: 12, flow: 10 },
    { key: 'GEOTEXTIL',    pat: R('geotext|geomembr|geomalla|geosint'),                                  color: '#166534', pattern: 'geot',    priority: 16, flow: 5 },
    { key: 'PERNOS',       pat: R('perno|anclaje|bahe'),                                                 color: '#525252', pattern: 'perno',   priority: 16, flow: 8 },

    // ── AUXILIARES (no van a LOB principal por defecto) ──────────────────
    { key: 'DEMOLIC',      pat: R('demolic|desmontaj|retiro\\s+de'),                                     color: '#991b1b', pattern: 'demo',    priority: 20, flow: 0, isAuxiliary: true },
    { key: 'LIMPIEZA',     pat: R('limpiez|desbroce|desforest|escarif|desraiz'),                         color: '#a3a3a3', pattern: 'limp',    priority: 21, flow: 0, isAuxiliary: true },
    { key: 'TRAZO',        pat: R('trazo|replanteo|topograf'),                                           color: '#a3a3a3', pattern: 'trazo',   priority: 21, flow: 0, isAuxiliary: true },
    { key: 'SEGURIDAD',    pat: R('cerco|cinta|se[nñ]aliz|seguridad\\s+vial|salud'),                     color: '#f97316', pattern: 'seg',     priority: 21, flow: 0, isAuxiliary: true },
    { key: 'ELIMIN',       pat: R('elimin|acarreo|carguio|desmonte'),                                    color: '#ea580c', pattern: 'elim',    priority: 22, flow: 11, isAuxiliary: true },
    { key: 'TRANSPORTE',   pat: R('transp'),                                                             color: '#f97316', pattern: 'transp',  priority: 22, flow: 11, isAuxiliary: true },
    { key: 'SUMINISTRO',   pat: R('suministr'),                                                          color: '#facc15', pattern: 'summ',    priority: 22, flow: 0, isAuxiliary: true },
    { key: 'DIMENSION',    pat: R('dimensiona'),                                                         color: '#facc15', pattern: 'summ',    priority: 22, flow: 0, isAuxiliary: true },
    { key: 'PRUEBA',       pat: R('prueba|ensayo|test|estanq'),                                          color: '#22d3ee', pattern: 'prueba',  priority: 22, flow: 12, isAuxiliary: true },
    { key: 'LODOS',        pat: R('lodo|barro|extracc|desazolv'),                                        color: '#78716c', pattern: 'lodos',   priority: 22, flow: 0, isAuxiliary: true },
];

const FALLBACK = { key: 'OTROS', color: '#8d98a8', pattern: 'otros', priority: 25, flow: 0, isAuxiliary: true };

// Cache: la descripción normalizada tras `Object` es la misma para muchas
// partidas repetidas → evitamos evaluar regex 1000x. También el árbol EDT
// puede repetir la misma familia por rama.
const _cache = new Map();

export const classifyPartida = (descripcion, codigo) => {
    const key = (descripcion || '') + '|' + (codigo || '');
    if (_cache.has(key)) return _cache.get(key);
    const d = String(descripcion || '');
    let found = null;
    for (const rule of RULES) {
        if (rule.pat.test(d)) { found = rule; break; }
    }
    const meta = found || FALLBACK;
    const result = {
        key: meta.key,
        color: meta.color,
        pattern: meta.pattern,
        priority: meta.priority,
        flow: meta.flow,
        isAuxiliary: !!meta.isAuxiliary,
        isPunctual: !!meta.isPunctual,
    };
    _cache.set(key, result);
    return result;
};

// Etiquetas legibles para leyenda
export const FAMILY_LABEL = {
    BUZON: 'Buzones',
    EXCAV_TUB: 'Excav. tubería',
    REFINE: 'Refine',
    CAMA_ARENA: 'Cama arena',
    TUBERIA: 'Tubería',
    EXCAV_MASA: 'Excav. canal',
    EXCAV_ESTR: 'Excav. estructural',
    RELLENO_ESTR: 'Relleno estructural',
    RELLENO: 'Relleno',
    SOLADO: 'Solado',
    ACERO: 'Acero',
    ENCOFRADO: 'Encofrado',
    CONCRETO: 'Concreto',
    CURADO: 'Curado',
    JUNTA: 'Juntas / sellado',
    TARRAJEO: 'Tarrajeo',
    GAVION: 'Gaviones',
    GEOTEXTIL: 'Geotextil',
    PERNOS: 'Pernos/anclajes',
    DEMOLIC: 'Demolición',
    LIMPIEZA: 'Limpieza',
    TRAZO: 'Trazo/replanteo',
    SEGURIDAD: 'Seguridad',
    ELIMIN: 'Eliminación',
    TRANSPORTE: 'Transporte',
    SUMINISTRO: 'Suministro',
    DIMENSION: 'Dimensionado',
    PRUEBA: 'Pruebas',
    LODOS: 'Lodos',
    OTROS: 'Otros',
};

// Los <defs> de patrones SVG viven en `partidaPatterns.jsx` (contiene JSX).
