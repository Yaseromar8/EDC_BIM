/**
 * GAP 07 · LA PANTALLA DE SINCRONIZACIÓN.
 *
 * LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARÍSIMO
 * -----------------------------------------------
 *
 *     GUARDADO EN ESTE DISPOSITIVO   ≠   CONFIRMADO POR EL SERVIDOR
 *
 * Todo lo demás es secundario. Un inspector que ve su acta «guardada» y cree
 * que la obra ya la tiene se va a casa tranquilo con un acta que nadie ha
 * recibido — y cuando se descubra, será tarde y será su firma la que esté en
 * cuestión.
 *
 * Por eso la pantalla está partida en dos bloques con títulos explícitos, no en
 * una lista con iconitos de colores. La diferencia se lee, no se interpreta.
 *
 * LOS SIETE ESTADOS SON SIETE, NO TRES
 * -------------------------------------
 * Y cada uno dice qué hacer, porque un estado que no dice qué hacer es una
 * pantalla que obliga a llamar a alguien:
 *
 *   PENDIENTE      está aquí, aún no ha subido       → sube sola
 *   REINTENTABLE   no se pudo, y no quedó nada hecho → sube sola
 *   BLOQUEADA      depende de otra que no entró      → se resuelve aquella
 *   CONFLICTO      el objeto cambió mientras tanto   → decides tú
 *   RECHAZADA      el servidor dijo que no           → no insiste
 *   INDETERMINADA  pudo quedar algo fuera            → se comprueba
 *   SINCRONIZADA   confirmado                        → nada
 */
import React, { useCallback, useEffect, useState } from 'react';
import * as local from '../offline/almacenLocal';
import * as sinc from '../offline/sincronizador';
import * as pre from '../offline/precarga';

const API = import.meta.env.VITE_API_URL || '';

/**
 * Qué significa cada estado, en la lengua de quien lo lee.
 *
 * `accion` es lo que la persona tiene que hacer. `sola` marca los que suben sin
 * que nadie haga nada — y por eso no llevan botón: ofrecer «reintentar» en algo
 * que ya se reintenta solo hace creer que hace falta intervenir.
 */
const ESTADOS = {
  [local.PENDIENTE]: {
    etiqueta: 'Guardado aquí', sola: true, tono: 'espera',
    accion: 'Subirá en cuanto haya cobertura.',
  },
  [local.ENVIANDO]: {
    etiqueta: 'Subiendo…', sola: true, tono: 'espera',
    accion: 'En curso.',
  },
  [local.REINTENTABLE]: {
    etiqueta: 'No se pudo subir', sola: true, tono: 'espera',
    accion: 'No quedó nada hecho en el servidor. Se vuelve a intentar solo.',
  },
  [local.BLOQUEADA]: {
    etiqueta: 'Esperando a otra', sola: true, tono: 'espera',
    accion: 'Depende de algo que todavía no ha entrado. Cuando aquello se '
          + 'resuelva, esta vuelve a intentarse.',
  },
  [local.CONFLICTO]: {
    etiqueta: 'Cambió mientras no había cobertura', sola: false, tono: 'decide',
    accion: 'Alguien tocó esto mientras trabajabas sin red. Tu captura se '
          + 'conserva intacta: decide tú qué hacer.',
  },
  [local.RECHAZADA]: {
    etiqueta: 'El servidor no lo aceptó', sola: false, tono: 'no',
    accion: 'No se reintenta: insistir no cambiaría la respuesta.',
  },
  [local.INDETERMINADA]: {
    etiqueta: 'Sin confirmar', sola: false, tono: 'decide',
    accion: 'No se sabe si la evidencia llegó a subirse. No se reintenta sola '
          + 'para no duplicarla; se comprueba contra el almacén.',
  },
  [local.SINCRONIZADA]: {
    etiqueta: 'Confirmado por el servidor', sola: true, tono: 'ok',
    accion: '',
  },
};

const TONOS = {
  espera: { fondo: '#eef2f7', borde: '#c8d4e3', texto: '#33475b' },
  decide: { fondo: '#fff5e6', borde: '#e8c48a', texto: '#8a5a00' },
  no:     { fondo: '#fdeeee', borde: '#e5b4b4', texto: '#8a2020' },
  ok:     { fondo: '#eaf6ee', borde: '#a9d5b8', texto: '#1f6b3a' },
};

function comoSeLlama(op) {
  const p = op.payload || {};
  if (op.object_type === 'PROTOCOLO') {
    return p.titulo || p.protocolo_nombre || 'Acta de protocolo';
  }
  return p.titulo || 'Observación';
}

function queEs(op) {
  const acto = {
    CREATE: op.object_type === 'PROTOCOLO' ? 'acta levantada' : 'observación levantada',
    MARK_CORRECTED: 'dada por corregida',
    ADD_EVIDENCE: 'evidencia adjuntada',
    SET_ITEMS: 'puntos marcados',
  }[op.action];
  return acto || op.action;
}

function cuando(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleString('es-PE', { day: '2-digit', month: 'short',
                                     hour: '2-digit', minute: '2-digit' });
}

function Fila({ op, onDescartar, onVerConflicto }) {
  const info = ESTADOS[op.estado] || ESTADOS[local.PENDIENTE];
  const tono = TONOS[info.tono];
  return (
    <div style={{ border: `1px solid ${tono.borde}`, background: tono.fondo,
                  borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#16202b', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {comoSeLlama(op)}
          </div>
          <div style={{ fontSize: 12, color: '#5a6b7d', marginTop: 2 }}>
            {queEs(op)}
            {op.capturado_en && (
              <>
                {' · '}
                {/* DECLARADO por el dispositivo. No es un reloj autoritativo, y
                    la pantalla no puede insinuar que lo sea. */}
                <span title="Hora que declaró este dispositivo cuando lo capturaste. No es un reloj verificado por el servidor.">
                  el móvil marcó {cuando(op.capturado_en)}
                </span>
              </>
            )}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: tono.texto,
                       whiteSpace: 'nowrap', letterSpacing: .3 }}>
          {info.etiqueta.toUpperCase()}
        </span>
      </div>

      {info.accion && (
        <div style={{ fontSize: 12, color: tono.texto, marginTop: 6 }}>
          {info.accion}
        </div>
      )}

      {op.ultimo_error && op.estado !== local.SINCRONIZADA && (
        <div style={{ fontSize: 12, color: '#5a6b7d', marginTop: 4,
                      fontStyle: 'italic' }}>
          {op.ultimo_error}
        </div>
      )}

      {op.estado === local.CONFLICTO && op.conflict_state && (
        <button onClick={() => onVerConflicto(op)}
                style={{ marginTop: 8, fontSize: 12, padding: '4px 10px',
                         border: '1px solid #e8c48a', background: '#fff',
                         borderRadius: 6, cursor: 'pointer' }}>
          Ver qué cambió
        </button>
      )}

      {/* Descartar SOLO donde reintentar no tiene sentido. Ofrecerlo en una
          pendiente invitaría a tirar trabajo que iba a subir solo. */}
      {(op.estado === local.RECHAZADA || op.estado === local.CONFLICTO) && (
        <button onClick={() => onDescartar(op)}
                style={{ marginTop: 8, marginLeft: 8, fontSize: 12,
                         padding: '4px 10px', border: '1px solid #d5dde6',
                         background: '#fff', borderRadius: 6, cursor: 'pointer' }}>
          Descartar de mi dispositivo
        </button>
      )}
    </div>
  );
}

export default function SincronizacionModule({ project, usuario }) {
  const [cola, setCola] = useState([]);
  const [enRed, setEnRed] = useState(navigator.onLine);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [precargado, setPrecargado] = useState(null);
  const [ajeno, setAjeno] = useState(0);
  const [espacio, setEspacio] = useState(null);

  // LA IDENTIDAD CANÓNICA, no el email. Un correo se cambia; la cola no puede
  // cambiar de dueño porque alguien edite su perfil.
  const ctx = React.useMemo(() => {
    if (!usuario || !usuario.id || !project) return null;
    return { canonical_user_id: String(usuario.id),
             project_id: String(project.scope_escritura || project.id) };
  }, [usuario, project]);

  const refrescar = useCallback(async () => {
    if (!ctx) return;
    try {
      const ops = await local.operacionesDe(ctx);
      setCola(ops.sort((a, b) => b.creado_en - a.creado_en));
      setAjeno(await local.pendienteDeOtros(ctx));
      setEspacio(await local.espacioDisponible());
      setPrecargado(await pre.listaParaCampo(ctx));
    } catch (e) {
      setAviso({ mal: true, texto: 'no se pudo leer lo guardado en este dispositivo' });
    }
  }, [ctx]);

  useEffect(() => { refrescar(); }, [refrescar]);

  useEffect(() => {
    const arriba = () => setEnRed(true);
    const abajo = () => setEnRed(false);
    window.addEventListener('online', arriba);
    window.addEventListener('offline', abajo);
    // Se pide la persistencia UNA vez, al entrar aquí. Si la niegan, no pasa
    // nada visible: la cola sigue funcionando, solo que sin blindaje.
    local.pedirPersistencia().catch(() => {});
    const soltar = sinc.alCambiar(() => refrescar());
    return () => {
      window.removeEventListener('online', arriba);
      window.removeEventListener('offline', abajo);
      soltar();
    };
  }, [refrescar]);

  const sincronizarAhora = async () => {
    if (!ctx) return;
    setSincronizando(true);
    setAviso(null);
    try {
      const r = await sinc.sincronizar(API, ctx, { motivo: 'boton' });
      if (r.sinRed) setAviso({ mal: true, texto: 'no hay conexión ahora mismo' });
      else if (r.sinRespuesta) setAviso({ mal: true,
        texto: 'no se pudo contactar con el servidor. Nada se ha perdido.' });
      else if (!r.enviadas) setAviso({ texto: 'no hay nada pendiente de subir' });
      else setAviso({ texto: `${r.aplicadas} de ${r.enviadas} confirmadas por el servidor` });
    } finally {
      setSincronizando(false);
      refrescar();
    }
  };

  const precargarAhora = async () => {
    if (!ctx) return;
    setSincronizando(true);
    try {
      const r = await pre.precargar(API, ctx);
      setAviso(r.fallidas.length
        ? { mal: true, texto: `no se pudo traer: ${r.fallidas.map(f => f.etiqueta).join(', ')}` }
        : { texto: 'la obra está en tu dispositivo; ya puedes quedarte sin cobertura' });
    } finally {
      setSincronizando(false);
      refrescar();
    }
  };

  const descartar = async (op) => {
    if (!window.confirm('Esto borra tu captura de este dispositivo y no se puede '
                        + 'deshacer. El servidor no la tiene. ¿Descartar?')) return;
    await local.olvidar(op.operation_id);
    refrescar();
  };

  const verConflicto = (op) => {
    setAviso({ texto: 'En el servidor: ' + JSON.stringify(op.conflict_state) });
  };

  if (!ctx) {
    return <div style={{ padding: 20, color: '#5a6b7d' }}>
      Entra a una obra para ver su trabajo de campo.
    </div>;
  }

  //   ARRIBA lo que el servidor TIENE.   ABAJO lo que solo está aquí.
  // Este corte es la pantalla entera: quien mira tiene que poder decir, sin
  // leer nada más, qué parte de su jornada está a salvo.
  const confirmadas = cola.filter(o => o.estado === local.SINCRONIZADA);
  const soloAqui = cola.filter(o => o.estado !== local.SINCRONIZADA);
  const piden = soloAqui.filter(o => !(ESTADOS[o.estado] || {}).sola);

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Trabajo de campo</h2>
          <div style={{ fontSize: 12, color: enRed ? '#1f6b3a' : '#8a5a00',
                        marginTop: 2, fontWeight: 600 }}>
            {enRed ? 'Con conexión' : 'Sin conexión — puedes seguir capturando'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={precargarAhora} disabled={!enRed || sincronizando}
                  style={{ padding: '8px 14px', borderRadius: 8,
                           border: '1px solid #c8d4e3', background: '#fff',
                           cursor: enRed ? 'pointer' : 'not-allowed' }}>
            Llevarme la obra
          </button>
          <button onClick={sincronizarAhora} disabled={!enRed || sincronizando}
                  style={{ padding: '8px 14px', borderRadius: 8, border: 'none',
                           background: enRed ? '#16202b' : '#9aa7b4',
                           color: '#fff', fontWeight: 600,
                           cursor: enRed ? 'pointer' : 'not-allowed' }}>
            {sincronizando ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {precargado && !precargado.lista && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8,
                      background: '#fff5e6', border: '1px solid #e8c48a',
                      fontSize: 13, color: '#8a5a00' }}>
          Todavía no te has llevado {precargado.falta.join(' ni ')}. Sin eso no
          podrás levantar actas cuando pierdas la cobertura.
        </div>
      )}
      {precargado && precargado.lista && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#5a6b7d' }}>
          Obra descargada {pre.antiguedad(precargado.descargado_en)}. Lo que ves
          sin conexión es de ese momento, no de ahora.
        </div>
      )}

      {aviso && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8,
                      fontSize: 13,
                      background: aviso.mal ? '#fdeeee' : '#eef2f7',
                      border: `1px solid ${aviso.mal ? '#e5b4b4' : '#c8d4e3'}`,
                      color: aviso.mal ? '#8a2020' : '#33475b' }}>
          {aviso.texto}
        </div>
      )}

      {piden.length > 0 && (
        <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8,
                      background: '#fff5e6', border: '1px solid #e8c48a',
                      fontSize: 13, color: '#8a5a00', fontWeight: 600 }}>
          {piden.length === 1 ? 'Una captura necesita' : `${piden.length} capturas necesitan`}
          {' '}que decidas algo. No suben solas.
        </div>
      )}

      <section style={{ marginTop: 22 }}>
        <h3 style={{ fontSize: 14, margin: '0 0 4px', color: '#8a5a00' }}>
          GUARDADO EN ESTE DISPOSITIVO
        </h3>
        <p style={{ fontSize: 12, color: '#5a6b7d', margin: '0 0 10px' }}>
          El servidor todavía NO tiene esto. Si borras los datos del navegador o
          desinstalas la app, se pierde.
        </p>
        {soloAqui.length === 0
          ? <div style={{ fontSize: 13, color: '#5a6b7d', padding: '8px 0' }}>
              Nada pendiente. Todo lo que capturaste está en el servidor.
            </div>
          : soloAqui.map(op => (
              <Fila key={op.operation_id} op={op} onDescartar={descartar}
                    onVerConflicto={verConflicto} />
            ))}
      </section>

      <section style={{ marginTop: 26 }}>
        <h3 style={{ fontSize: 14, margin: '0 0 4px', color: '#1f6b3a' }}>
          CONFIRMADO POR EL SERVIDOR
        </h3>
        <p style={{ fontSize: 12, color: '#5a6b7d', margin: '0 0 10px' }}>
          Esto ya es parte de la obra y lo ve el resto del equipo.
        </p>
        {confirmadas.length === 0
          ? <div style={{ fontSize: 13, color: '#5a6b7d', padding: '8px 0' }}>
              Todavía nada.
            </div>
          : confirmadas.slice(0, 20).map(op => (
              <Fila key={op.operation_id} op={op} onDescartar={descartar}
                    onVerConflicto={verConflicto} />
            ))}
      </section>

      {ajeno > 0 && (
        <div style={{ marginTop: 24, padding: '10px 12px', borderRadius: 8,
                      background: '#eef2f7', border: '1px solid #c8d4e3',
                      fontSize: 12, color: '#33475b' }}>
          Este dispositivo guarda {ajeno} captura{ajeno === 1 ? '' : 's'} de otra
          cuenta. No puedes verlas ni subirlas, y no se han borrado: volverán
          cuando entre esa persona.
        </div>
      )}

      {espacio && espacio.cuota > 0 && espacio.libre < 50 * 1024 * 1024 && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8,
                      background: '#fdeeee', border: '1px solid #e5b4b4',
                      fontSize: 12, color: '#8a2020' }}>
          Queda poco espacio en este dispositivo ({Math.round(espacio.libre / 1048576)} MB).
          Sincroniza antes de seguir capturando fotos.
        </div>
      )}
    </div>
  );
}
