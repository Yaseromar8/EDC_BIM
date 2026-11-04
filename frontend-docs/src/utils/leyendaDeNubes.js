/**
 * Quién aparece en la leyenda de las nubes del plano: una fila por persona o empresa con nubes asignadas, con
 * cuántas tiene y cuántas le faltan por entregar (`nube.por_entregar`, del servidor). Ordenadas por su color.
 */
export function genteDeLasNubes(marcas) {
  const gente = new Map();
  for (const m of marcas || []) {
    const n = m.nube;
    if (!n || !n.destino_nombre) continue;
    const k = `${n.color}|${n.destino_nombre}`;
    const g = gente.get(k) || { nombre: n.destino_nombre, empresa: n.destino_es_empresa, color: n.color, nubes: 0, deben: 0 };
    g.nubes += 1;
    if (n.por_entregar) g.deben += 1;
    gente.set(k, g);
  }
  return [...gente.values()].sort((a, b) => (a.color ?? 99) - (b.color ?? 99));
}
