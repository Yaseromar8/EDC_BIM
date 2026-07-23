// geoAnchor.js — Convierte GPS (WGS84) a coordenadas del visor para anclar el
// modelo en campo por posición real. Es el "cerebro" del AR geoespacial.
//
// CADENA DE GEORREFERENCIA (confirmada con el cadista):
//   El modelo Civil 3D está en WGS84/SIRGAS UTM 17S (EPSG:32717). El GPS del
//   celular también entrega WGS84, así que NO hace falta transformación de datum.
//
//   1. GPS (lat/lon) ──► UTM 17S (E, N en metros)   [proyección de abajo]
//   2. UTM metros    ──► unidades del visor:
//         viewer = E / metersPerUnit  −  globalOffset
//      (APS localiza las coords grandes restando globalOffset; para un modelo en
//       mm, metersPerUnit = 0.001, así que viewer_mm = E·1000 − globalOffset).
//
// La matemática vive AQUÍ, no en el visor (misma regla que el resto del proyecto).

// ─── Elipsoide WGS84 ────────────────────────────────────────────────────────
const A = 6378137.0;                 // semieje mayor (m)
const F = 1 / 298.257223563;         // achatamiento
const K0 = 0.9996;                   // factor de escala UTM
const E2 = F * (2 - F);              // excentricidad²
const EP2 = E2 / (1 - E2);           // segunda excentricidad²

// ─── Perillas de RUMBO (se calibran en la PRIMERA prueba de campo) ───────────
// El rumbo por brújula es el eslabón débil del AR. Si en campo el modelo sale
// girado o al revés, se ajustan estas dos constantes (o se usa el dial/alinear).
//   HEADING_BASE : offset base en grados (el modelo-norte parte mirando −Z de
//                  ARCore = 180° en el marco del puente).
//   HEADING_SIGN : ±1 según el sentido de giro observado.
export const HEADING_BASE = 180;
export const HEADING_SIGN = 1;

const norm360 = (deg) => ((deg % 360) + 360) % 360;

/**
 * Proyección directa WGS84 → UTM (Snyder, precisión sub-métrica; sobra para ±3-5 m).
 * @param {number} latDeg  Latitud en grados (negativa al sur).
 * @param {number} lonDeg  Longitud en grados (negativa al oeste).
 * @param {number} zone    Zona UTM (Talara = 17).
 * @param {boolean} south  Hemisferio sur (añade 10 000 000 al norte).
 * @returns {{easting:number, northing:number}} en METROS.
 */
export function latLonToUtm(latDeg, lonDeg, zone = 17, south = true) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const lon0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180; // meridiano central

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);

  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = EP2 * cosLat * cosLat;
  const Ac = cosLat * (lon - lon0);

  const M = A * (
    (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256) * lat
    - ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 * E2 * E2) / 1024) * Math.sin(2 * lat)
    + ((15 * E2 * E2) / 256 + (45 * E2 * E2 * E2) / 1024) * Math.sin(4 * lat)
    - ((35 * E2 * E2 * E2) / 3072) * Math.sin(6 * lat)
  );

  const easting = K0 * N * (
    Ac
    + ((1 - T + C) * Ac * Ac * Ac) / 6
    + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * Ac * Ac * Ac * Ac * Ac) / 120
  ) + 500000;

  let northing = K0 * (
    M + N * tanLat * (
      (Ac * Ac) / 2
      + ((5 - T + 9 * C + 4 * C * C) * Ac * Ac * Ac * Ac) / 24
      + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * Ac * Ac * Ac * Ac * Ac * Ac) / 720
    )
  );
  if (south) northing += 10000000;

  return { easting, northing };
}

/**
 * Lat/lon (WGS84) → punto en coordenadas del visor, usando la georreferencia
 * del modelo cargado.
 * @param {number} lat
 * @param {number} lon
 * @param {Object} geo
 * @param {{x:number,y:number,z:number}} geo.globalOffset  del modelo (unidades del visor)
 * @param {number} geo.metersPerUnit  getUnitScale() del modelo (m por unidad; mm → 0.001)
 * @param {number} [geo.zone=17]
 * @param {boolean} [geo.south=true]
 * @returns {{x:number, y:number}} en unidades del visor (X=este, Y=norte).
 */
export function geoToViewer(lat, lon, { globalOffset, metersPerUnit, zone = 17, south = true }) {
  const { easting, northing } = latLonToUtm(lat, lon, zone, south);
  const upu = 1 / metersPerUnit; // unidades del visor por metro (mm → 1000)
  return {
    x: easting * upu - (globalOffset?.x || 0),
    y: northing * upu - (globalOffset?.y || 0),
  };
}

/**
 * Siembra el giro (yaw) del modelo para que su NORTE apunte al norte real,
 * a partir del rumbo verdadero (brújula) y el rumbo en el mundo ARCore.
 * Es un ESTIMADO: la brújula tiene error, por eso el operario afina con el dial.
 * @param {number} headingTrue  rumbo verdadero de la cámara (grados desde el norte)
 * @param {number} headingAr     rumbo de la cámara en el mundo ARCore (del puente)
 * @returns {number} yaw en grados [0,360)
 */
export function seedYawFromHeading(headingTrue, headingAr) {
  return norm360(HEADING_BASE + HEADING_SIGN * (headingTrue - headingAr));
}
