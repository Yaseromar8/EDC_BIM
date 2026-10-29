// ChartEditor — configurador de un gráfico del Tablero.
// El selector de campos muestra el % de COMPLETITUD de cada parámetro (cuántos
// elementos lo tienen lleno) — QA de datos integrado: antes de graficar ya ves
// qué tan poblado está el parámetro. Colores y letra de tema.js (paleta oficial).
import React, { useMemo, useState } from 'react';
import { distinctValues } from './engine';
import { C, FUENTE, RADIO, nombreCampo, nombreValor } from './tema';

const TYPES = [
  { id: 'bar', label: 'Barras' },
  { id: 'line', label: 'Línea' },
  { id: 'area', label: 'Área' },
  { id: 'donut', label: 'Dona' },
  { id: 'scatter', label: 'Dispersión' },
  { id: 'table', label: 'Tabla' },
  { id: 'kpi', label: 'Cifra' },
];
const METRICS = [
  { id: 'count', label: 'Contar' },
  { id: 'sum', label: 'Sumar' },
  { id: 'avg', label: 'Promediar' },
];
// Tamaños fijos de tarjeta (tema.js): todo encaja en la cuadrícula.
const SIZES = [
  { id: 's', label: 'Pequeño' },
  { id: 'm', label: 'Mediano' },
  { id: 'l', label: 'Grande' },
];

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.gris300}`,
  background: C.blanco, color: C.dark, fontSize: 12.5, outline: 'none', fontFamily: FUENTE,
};
const labelStyle = { fontSize: 12, fontWeight: 600, color: C.dark, marginBottom: 6 };
const ayudaStyle = { fontSize: 11, color: C.gris600, marginTop: 5, lineHeight: 1.45 };
const colorCompletitud = (pct) => (pct >= 90 ? C.green : pct >= 50 ? C.orange : C.error);

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: C.light50, border: `1px solid ${C.lightGray}`, borderRadius: RADIO, padding: 3 }}>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          flex: '1 1 22%', minWidth: 76, padding: '6px 4px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: FUENTE,
          background: value === o.id ? C.dark : 'transparent',
          color: value === o.id ? C.light : C.texto2, fontSize: 12, fontWeight: value === o.id ? 600 : 500,
        }}>{o.label}</button>
      ))}
    </div>
  );
}

// Selector de campo con búsqueda + barra de completitud (fillPct).
function FieldPicker({ fields, value, onChange, numericOnly, placeholder }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    let f = numericOnly ? fields.filter(x => x.isNumeric) : fields;
    if (q.trim()) f = f.filter(x => x.key.toLowerCase().includes(q.toLowerCase()));
    return f.slice(0, 80);
  }, [fields, q, numericOnly]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={inputStyle}
        value={open ? q : nombreCampo(value || '')}
        placeholder={placeholder || 'Buscar parámetro…'}
        onFocus={() => { setOpen(true); setQ(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onChange={e => setQ(e.target.value)}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
          background: C.blanco, border: `1px solid ${C.lightGray}`, borderRadius: RADIO,
          maxHeight: 260, overflowY: 'auto',
        }}>
          {!list.length && <div style={{ padding: 12, fontSize: 12, color: C.gris600 }}>Sin coincidencias.</div>}
          {list.map(f => (
            <div key={f.key}
              onMouseDown={() => { onChange(f.key); setOpen(false); }}
              style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: `1px solid ${C.light50}` }}
              onMouseEnter={e => { e.currentTarget.style.background = C.light50; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                <span style={{ color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreCampo(f.key)}</span>
                <span style={{ color: colorCompletitud(f.fillPct), flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{f.fillPct} %</span>
              </div>
              {/* Barra de completitud: cuántos elementos tienen este dato lleno */}
              <div style={{ height: 3, background: C.light50, borderRadius: 2, marginTop: 4 }}>
                <div style={{ width: `${f.fillPct}%`, height: '100%', borderRadius: 2, background: colorCompletitud(f.fillPct) }} />
              </div>
              <div style={{ fontSize: 10.5, color: C.gris600, marginTop: 3 }}>
                {f.isNumeric ? 'número' : 'texto'} · {f.distinct >= 60 ? '60+' : f.distinct} valores
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChartEditor({ initial, fields, rows, onSave, onCancel }) {
  const [cfg, setCfg] = useState(() => ({
    type: 'bar', metric: 'count', topN: 12, size: 'm', filter: null, ...initial,
  }));
  const set = (patch) => setCfg(c => ({ ...c, ...patch }));

  const filterOptions = useMemo(
    () => (cfg.filter?.field ? distinctValues(rows, cfg.filter.field, 30) : []),
    [rows, cfg.filter?.field]
  );

  const isScatter = cfg.type === 'scatter';
  const valid = isScatter
    ? (!!cfg.xField && !!cfg.yField)
    : cfg.type === 'kpi'
      ? (cfg.metric === 'count' || !!cfg.valueField)
      : (!!cfg.groupBy && (cfg.metric === 'count' || !!cfg.valueField));

  const toggleFilterValue = (v) => {
    const cur = new Set(cfg.filter?.values || []);
    if (cur.has(v)) cur.delete(v); else cur.add(v);
    set({ filter: { ...cfg.filter, values: [...cur] } });
  };

  const boton = (principal, activo = true) => ({
    padding: '7px 16px', borderRadius: 6, fontSize: 12.5, fontWeight: principal ? 600 : 500, fontFamily: FUENTE,
    border: `1px solid ${principal && activo ? C.dark : C.gris300}`,
    background: !activo ? C.light50 : principal ? C.dark : C.blanco,
    color: !activo ? C.midGray : principal ? C.light : C.dark,
    cursor: activo ? 'pointer' : 'default',
  });

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(20, 20, 19, 0.32)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, fontFamily: FUENTE,
    }}>
      <div style={{
        width: 'min(480px, 94%)', maxHeight: '92%', overflowY: 'auto', boxSizing: 'border-box',
        background: C.blanco, border: `1px solid ${C.lightGray}`, borderRadius: RADIO,
        padding: '16px 20px 18px', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.dark }}>{initial?.id ? 'Editar gráfico' : 'Nuevo gráfico'}</div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: C.gris600, fontSize: 19, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div>
          <div style={labelStyle}>Título</div>
          <input style={inputStyle} value={cfg.title || ''} placeholder="Ej.: Volumen por vaciado"
            onChange={e => set({ title: e.target.value })} />
        </div>

        <div>
          <div style={labelStyle}>Pregunta que responde <span style={{ fontWeight: 400, color: C.gris600 }}>(opcional)</span></div>
          <input style={inputStyle} value={cfg.question || ''} placeholder="Ej.: ¿Qué vaciados concentran más volumen?"
            onChange={e => set({ question: e.target.value })} />
        </div>

        <div>
          <div style={labelStyle}>Tipo</div>
          <Segmented options={TYPES} value={cfg.type} onChange={t => set({ type: t })} />
          {cfg.type === 'donut' && <div style={ayudaStyle}>La dona se lee con pocas partes: muestra las tres mayores y el resto en «Otros». Para más grupos, usa barras.</div>}
        </div>

        {cfg.type !== 'kpi' && (
          <div>
            <div style={labelStyle}>Tamaño</div>
            <Segmented options={SIZES} value={cfg.size || 'm'} onChange={z => set({ size: z })} />
          </div>
        )}

        {isScatter ? (
          // Dispersión: cada ELEMENTO es un punto (X e Y numéricos)
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Eje X (número)</div>
              <FieldPicker fields={fields} numericOnly value={cfg.xField} onChange={k => set({ xField: k })} placeholder="Ej. DSI_Progresiva" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Eje Y (número)</div>
              <FieldPicker fields={fields} numericOnly value={cfg.yField} onChange={k => set({ yField: k })} placeholder="Ej. Volumen" />
            </div>
          </div>
        ) : (
          <>
            {cfg.type !== 'kpi' && (
              <div>
                <div style={labelStyle}>{(cfg.type === 'line' || cfg.type === 'area') ? 'Eje X (agrupar por)' : 'Agrupar por'}</div>
                <FieldPicker fields={fields} value={cfg.groupBy} onChange={k => set({ groupBy: k })} placeholder={(cfg.type === 'line' || cfg.type === 'area') ? 'Progresión (ej. Vaciado_Nro, mes)' : 'Parámetro para agrupar (ej. Vaciado_Nro)'} />
              </div>
            )}

            <div>
              <div style={labelStyle}>Métrica</div>
              <Segmented options={METRICS} value={cfg.metric} onChange={m => set({ metric: m, ...(m === 'count' ? { valueField: null } : {}) })} />
              {cfg.metric !== 'count' && (
                <div style={{ marginTop: 8 }}>
                  <FieldPicker fields={fields} numericOnly value={cfg.valueField} onChange={k => set({ valueField: k })} placeholder="Campo numérico (ej. Volumen)" />
                </div>
              )}
            </div>
          </>
        )}

        {/* Filtro opcional: acota el universo del gráfico (ej. solo una categoría) */}
        <div>
          <div style={labelStyle}>Filtro <span style={{ fontWeight: 400, color: C.gris600 }}>(opcional)</span></div>
          <FieldPicker fields={fields} value={cfg.filter?.field} onChange={k => set({ filter: { field: k, values: [] } })} placeholder="Campo a filtrar (ej. Revit Category)" />
          {cfg.filter?.field && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, maxHeight: 110, overflowY: 'auto' }}>
                {filterOptions.map(o => {
                  const on = cfg.filter?.values?.includes(o.value);
                  return (
                    <button key={o.value} onClick={() => toggleFilterValue(o.value)} style={{
                      padding: '3px 9px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: FUENTE,
                      border: `1px solid ${on ? C.blue : C.gris300}`,
                      background: on ? C.blueTinte : C.blanco, color: on ? C.blue30D : C.texto2,
                    }}>{nombreValor(o.value)} · {o.count}</button>
                  );
                })}
              </div>
              <button onClick={() => set({ filter: null })} style={{ marginTop: 6, background: 'none', border: 'none', color: C.blue30D, fontSize: 11.5, cursor: 'pointer', padding: 0, fontFamily: FUENTE }}>Quitar filtro</button>
            </>
          )}
        </div>

        {!['kpi', 'scatter', 'line', 'area', 'donut'].includes(cfg.type) && (
          <div>
            <div style={labelStyle}>Máximo de grupos: {cfg.topN}</div>
            <input type="range" min="4" max="30" value={cfg.topN} onChange={e => set({ topN: Number(e.target.value) })} style={{ width: '100%', accentColor: C.dark }} />
            <div style={ayudaStyle}>El resto se suma en «Otros», al final.</div>
          </div>
        )}

        {/* Línea de referencia: umbral/meta punteada sobre el gráfico; en la cifra, su barra de avance */}
        {['bar', 'line', 'area', 'scatter', 'kpi'].includes(cfg.type) && (
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>{cfg.type === 'kpi' ? 'Meta' : 'Línea de referencia'} <span style={{ fontWeight: 400, color: C.gris600 }}>(opcional)</span></div>
              <input style={inputStyle} type="number" value={cfg.refValue ?? ''} placeholder="Valor (ej. 500)"
                onChange={e => set({ refValue: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Etiqueta</div>
              <input style={inputStyle} value={cfg.refLabel || ''} placeholder="Ej. Expediente"
                onChange={e => set({ refLabel: e.target.value })} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
          <button onClick={onCancel} style={boton(false)}>Cancelar</button>
          <button onClick={() => valid && onSave(cfg)} disabled={!valid} style={boton(true, valid)}>{initial?.id ? 'Guardar' : 'Añadir'}</button>
        </div>
      </div>
    </div>
  );
}
