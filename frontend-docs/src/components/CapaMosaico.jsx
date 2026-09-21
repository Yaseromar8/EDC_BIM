/**
 * LA CAPA DE MOSAICOS DEL LECTOR (paso 2 de docs/archivos/15).
 *
 * El lector dibuja la lamina con pdf.js, y para eso necesita el PDF ENTERO: en
 * la de paisajismo son 71,9 MB, asi que durante la espera lo unico que se ve es
 * una imagen fija, y al acercar se estira. Medido el 20-sep-2026 en su
 * pantalla: un evento de rueda llevaba la hoja a 0,39 px reales por pixel de
 * pantalla -- eso es el borroso.
 *
 * Esta capa hace lo que hace un mapa: pide al servidor las TESELAS del nivel
 * que toca y las coloca sobre la hoja. Cada nivel esta dibujado a SU
 * resolucion, asi que nunca se estira nada; y solo se baja lo que se ve (9
 * teselas, 233 KB, para la hoja entera de 71,9 MB).
 *
 * NO TOCA EL ZOOM DEL LECTOR. Se cuelga encima del lienzo, ocupa su misma caja
 * y coloca las teselas EN PORCENTAJE de esa caja: cuando el lector cambia de
 * escala o mueve la hoja, las teselas van con ella sin enterarse de nada. Si no
 * hay mosaico para ese documento, no se pinta nada y el lector se comporta como
 * hoy.
 *
 * EL NIVEL SE ELIGE EN PIXELES REALES DE PANTALLA, no en pixeles CSS: el
 * monitor del propietario va a 1,25, y contando en CSS la tesela se ampliaba un
 * 25 % y se veia blanda aunque el nivel fuera el correcto.
 *
 * `fuente` es quien sabe el manifiesto y las URL (utils/mosaicoRemoto.js: el
 * servidor, con la puerta del PDF). Las de los niveles preparados llegan con el
 * manifiesto; las de los profundos se piden al llegar a ellos.
 */
import React, { useEffect, useRef, useState } from 'react';

const MARGEN = 0.25;        // se piden tambien las teselas de alrededor (en anchos de tesela)
const ESPERA_NIVEL = 130;   // ms de quietud antes de pedir un nivel nuevo
// Cuanto se deja estirar una tesela antes de subir de nivel. Con tolerancia 1
// («que no se estire nada») a 7,35 px/mm se pedia el nivel 3 (14,3) para ganar
// un 3 %: 40 teselas en vez de 10. Un 15 % de estirado no se ve --medido: el
// contraste cae menos del 6 %-- y cuesta cuatro veces menos.
const TOLERANCIA = 1.15;

// Las teselas de un nivel que caen en la parte visible (u0..u1, v0..v1 en 0..1).
function rango(man, z, u0, v0, u1, v1) {
  const n = man.niveles[z];
  const anchoTesela = man.tesela / n.ancho;
  const altoTesela = man.tesela / n.alto;
  return {
    n, anchoTesela, altoTesela,
    cx0: Math.max(0, Math.floor(u0 / anchoTesela - MARGEN)),
    cx1: Math.min(n.columnas - 1, Math.floor(u1 / anchoTesela + MARGEN)),
    cy0: Math.max(0, Math.floor(v0 / altoTesela - MARGEN)),
    cy1: Math.min(n.filas - 1, Math.floor(v1 / altoTesela + MARGEN)),
  };
}

function colocar(man, z, x, y, n, src, clave) {
  const anchoPx = Math.min(man.tesela, n.ancho - x * man.tesela);
  const altoPx = Math.min(man.tesela, n.alto - y * man.tesela);
  return {
    doc: clave, id: `${z}|${x}|${y}`, z, x, y, src,
    izq: (x * man.tesela * 100) / n.ancho,
    arriba: (y * man.tesela * 100) / n.alto,
    ancho: (anchoPx * 100) / n.ancho,
    alto: (altoPx * 100) / n.alto,
  };
}

export default function CapaMosaico({ fuente, lienzoRef, contenedorRef, pagina = 1, cedeAlPdf = false, alEstado = null }) {
  // El manifiesto y las teselas llevan DENTRO el documento al que pertenecen:
  // al cambiar de documento no hay que vaciar nada (y no se toca el estado
  // dentro del efecto, que es lo que dispara renders en cascada); lo del
  // documento anterior simplemente deja de valer.
  const [datos, setDatos] = useState(null);         // { doc, man }
  const [nivel, setNivel] = useState(0);
  const [puestas, setPuestas] = useState([]);       // [{ doc, id, z, x, y, src, izq, arriba, ancho, alto }]
  // La vista pide mas detalle que el ultimo nivel. Si pdf.js ya tiene la hoja,
  // la capa se aparta: su «detalle» dibuja lo visible a la resolucion de la
  // pantalla, y una tesela estirada lo taparia. Sin PDF, mejor estirada que nada.
  const [masAlla, setMasAlla] = useState(false);
  const pendienteRef = useRef(false);
  const relojRef = useRef(null);                    // espera antes de cambiar de nivel
  const nivelRef = useRef(0);                       // el nivel que se esta enseñando
  const recalcularRef = useRef(null);               // para que una tesela que falla se vuelva a pedir
  // EL AVISO DE ESTADO, EN UNA REFERENCIA. Si entra en las dependencias del
  // efecto, cada render lo cambia de identidad, el efecto se vuelve a montar y
  // con el el observador de tamaño: medido el 20-sep-2026, doce muescas de
  // rueda pasaban de 510 ms a 11.450 ms -- el zoom se atascaba y por eso «al
  // acercarme rapido demora 5 segundos en ponerse nitido».
  const alEstadoRef = useRef(alEstado);
  useEffect(() => { alEstadoRef.current = alEstado; }, [alEstado]);
  const doc = fuente ? fuente.clave : null;
  const man = datos && datos.doc === doc ? datos.man : null;

  // El manifiesto del documento (una vez por version).
  useEffect(() => {
    if (!fuente) return undefined;
    let vivo = true;
    fuente.manifiesto(() => vivo).then((m) => {
      if (!vivo || !m || !m.niveles || !m.niveles.length) return;
      setDatos({ doc: fuente.clave, man: m });
      // EL TAMAÑO DE LA HOJA, EN CUANTO SE SABE. En la apertura en frio no hay
      // PDF ni imagen de espera, asi que el lienzo no tiene tamaño; si la capa
      // esperase a tenerlo para avisar, y el lector esperase el aviso para
      // darselo, no se veria nunca nada (medido el 20-sep-2026 con `?frio=1`:
      // manifiesto leido y cero teselas).
      if (alEstadoRef.current && m.hoja_mm) {
        alEstadoRef.current({
          hojaPt: { width: (m.hoja_mm[0] / 25.4) * 72, height: (m.hoja_mm[1] / 25.4) * 72 },
          nivel: 0, niveles: m.niveles.length, pxPorMm: 0,
          tope: +(m.niveles[m.niveles.length - 1].ancho / m.hoja_mm[0]).toFixed(2), teselas: 0, faltan: 0,
        });
      }
    });
    return () => { vivo = false; };
  }, [fuente]);

  // Que se ve y con que nivel: se recalcula cuando el lector cambia de tamaño
  // (zoom), se mueve la barra (paneo) o llegan URL de teselas que faltaban.
  useEffect(() => {
    if (!man || !fuente) return undefined;
    const lienzo = lienzoRef && lienzoRef.current;
    const contenedor = contenedorRef && contenedorRef.current;
    if (!lienzo) return undefined;
    let vivo = true;

    const calcular = (forzado = false) => {
      pendienteRef.current = false;
      if (!vivo) return;
      const caja = lienzo.getBoundingClientRect();
      if (!caja.width || !caja.height) return;
      const dpr = window.devicePixelRatio || 1;
      const anchoReal = caja.width * dpr;
      const ultimo = man.niveles.length - 1;

      // El primer nivel cuyo ancho natural llega a lo que se esta enseñando.
      let z = 0;
      while (z < ultimo && man.niveles[z].ancho < anchoReal / TOLERANCIA) z += 1;
      setMasAlla(anchoReal > man.niveles[ultimo].ancho * TOLERANCIA);

      // MIENTRAS EL ZOOM SE MUEVE NO SE PIDE OTRO NIVEL (20-sep-2026, el
      // propietario: «al acercarme rapido demora 5 segundos en ponerse
      // nitido»). Acercando de golpe se pasa por z1 y z2 camino de z3, y cada
      // escalon pedia SUS teselas: las del nivel bueno quedaban las ultimas de
      // la cola --seis conexiones por servidor-- y tardaban segundos. Ahora, si
      // el nivel cambia, se espera a que el gesto pare (ESPERA_NIVEL) y solo se
      // piden las del nivel final; el nivel anterior sigue a la vista, estirado,
      // mientras tanto.
      if (z !== nivelRef.current && !forzado) {
        if (relojRef.current) clearTimeout(relojRef.current);
        relojRef.current = setTimeout(() => { relojRef.current = null; calcular(true); }, ESPERA_NIVEL);
        return;
      }
      nivelRef.current = z;

      // La parte de la hoja que se ve, en 0..1.
      const vista = contenedor ? contenedor.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const u0 = Math.max(0, (vista.left - caja.left) / caja.width);
      const v0 = Math.max(0, (vista.top - caja.top) / caja.height);
      const u1 = Math.min(1, (vista.right - caja.left) / caja.width);
      const v1 = Math.min(1, (vista.bottom - caja.top) / caja.height);
      if (u1 <= u0 || v1 <= v0) return;

      // Las del nivel que toca que ya tienen URL; las demas se piden, del
      // centro de la vista hacia fuera.
      const r = rango(man, z, u0, v0, u1, v1);
      const nuevas = [], faltan = [];
      for (let y = r.cy0; y <= r.cy1; y += 1) {
        for (let x = r.cx0; x <= r.cx1; x += 1) {
          const src = fuente.url(z, x, y);
          if (src) nuevas.push(colocar(man, z, x, y, r.n, src, doc));
          else faltan.push([x, y]);
        }
      }
      if (faltan.length) {
        const cx = (u0 + u1) / 2 / r.anchoTesela, cy = (v0 + v1) / 2 / r.altoTesela;
        const lejos = ([x, y]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
        faltan.sort((a, b) => lejos(a) - lejos(b));
        fuente.pedir(z, faltan, () => { if (vivo) pedir(); });
      }

      // DE FONDO, EL MEJOR NIVEL DE ABAJO QUE ESTE COMPLETO en esta vista (como
      // en un mapa): mientras llegan las nuevas --o el servidor dibuja las de un
      // nivel profundo por primera vez-- se ve ese, estirado, y nunca un hueco.
      // Los niveles preparados tienen siempre sus URL, asi que siempre hay uno.
      let fondo = [];
      for (let zf = z - 1; zf >= 0; zf -= 1) {
        const rf = rango(man, zf, u0, v0, u1, v1);
        const lista = [];
        let completa = true;
        for (let y = rf.cy0; y <= rf.cy1 && completa; y += 1) {
          for (let x = rf.cx0; x <= rf.cx1; x += 1) {
            const src = fuente.url(zf, x, y);
            if (!src) { completa = false; break; }
            lista.push(colocar(man, zf, x, y, rf.n, src, doc));
          }
        }
        if (completa) { fondo = lista; break; }
      }

      setNivel((v) => (v === z ? v : z));
      const lista = [...fondo, ...nuevas];
      setPuestas((antes) => (
        // Si son exactamente las mismas, no se toca el estado: un render por
        // cada muesca de rueda es lo que convierte un gesto en una espera.
        lista.length === antes.length && lista.every((t, k) => antes[k].id === t.id && antes[k].src === t.src && antes[k].doc === t.doc)
          ? antes : lista));
      if (alEstadoRef.current) {
        alEstadoRef.current({
          // El tamaño de la hoja en PUNTOS (72 por pulgada), que es la unidad
          // en la que el lector guarda su «base» para el zoom: con esto puede
          // acercar aunque el PDF no haya llegado.
          hojaPt: { width: (man.hoja_mm[0] / 25.4) * 72, height: (man.hoja_mm[1] / 25.4) * 72 },
          nivel: z, niveles: man.niveles.length,
          pxPorMm: +(anchoReal / man.hoja_mm[0]).toFixed(2),
          tope: +(man.niveles[ultimo].ancho / man.hoja_mm[0]).toFixed(2),
          teselas: nuevas.length, faltan: faltan.length,
        });
      }
    };

    const pedir = () => {
      if (pendienteRef.current) return;
      pendienteRef.current = true;
      requestAnimationFrame(() => calcular());
    };

    recalcularRef.current = pedir;
    pedir();
    const observador = new ResizeObserver(pedir);
    observador.observe(lienzo);
    if (contenedor) contenedor.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir);
    return () => {
      vivo = false;
      pendienteRef.current = false;
      if (recalcularRef.current === pedir) recalcularRef.current = null;
      if (relojRef.current) { clearTimeout(relojRef.current); relojRef.current = null; }
      fuente.cerrar();
      observador.disconnect();
      if (contenedor) contenedor.removeEventListener('scroll', pedir);
      window.removeEventListener('resize', pedir);
    };
  }, [man, fuente, doc, lienzoRef, contenedorRef, pagina]);

  const aLaVista = man ? puestas.filter((t) => t.doc === doc) : [];
  if (!aLaVista.length) return null;
  return (
    <div className="pdf-mosaico" aria-hidden="true"
         style={masAlla && cedeAlPdf ? { visibility: 'hidden' } : undefined}>
      {aLaVista.map((t) => (
        <img key={t.id} src={t.src} alt="" draggable={false} decoding="async"
             onError={() => {
               // Se olvida y se vuelve a pedir (una vez): se ve el nivel de abajo.
               if (fuente) fuente.fallo(t.z, t.x, t.y);
               if (recalcularRef.current) recalcularRef.current();
             }}
             style={{
               position: 'absolute',
               left: `${t.izq}%`, top: `${t.arriba}%`,
               width: `${t.ancho}%`, height: `${t.alto}%`,
               zIndex: t.z === nivel ? 2 : 1,
             }} />
      ))}
    </div>
  );
}
