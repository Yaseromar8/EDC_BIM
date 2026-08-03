// ChartEditor — configurador de un gráfico del Tablero.
// El selector de campos muestra el % de COMPLETITUD de cada parámetro (cuántos
// elementos lo tienen lleno) — QA de datos integrado: antes de graficar ya ves
// qué tan poblado está el parámetro.
import React, { useMemo, useState } from 'react';
import { distinctValues } from './engine';

const TYPES = [
  { id: 'bar', label: 'Barras' },
  { id: 'line', label: 'Línea' },
  { id: 'area', label: 'Área' },
  { id: 'donut', label: 'Dona' },
  { id: 'scatter', label: 'Dispersión' },
  { id: 'table', label: 'Tabla' },
  { id: 'kpi', label: 'KPI' },
];
const METRICS = [
  { id: 'count', label: 'Contar' },
  { id: 'sum', label: 'Sumar' },
  { id: 'avg', label: 'Promediar' },
];

const inputStyle = {
  width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #d5dae1',
  background: '#ffffff', color: '#1f242c', fontSize: 12.5, outline: 'none',
};
const labelStyle = { fontSize: 11, fontWeight: 700, color: '#7a8494', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 };

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: '#f3f5f7', border: '1px solid #e2e6ea', borderRadius: 8, padding: 3 }}>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          flex: '1 1 22%', minWidth: 76, padding: '6px 4px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: value === o.id ? '#2f5680' : 'transparent',
          color: value === o.id ? '#fff' : '#66707e', fontSize: 12, fontWeight: 600,
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
        value={open ? q : (value || '')}
        placeholder={placeholder || 'Buscar parámetro…'}
        onFocus={() => { setOpen(true); setQ(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onChange={e => setQ(e.target.value)}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
          background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 8,
          maxHeight: 260, overflowY: 'auto', boxShadow: '0 10px 28px rgba(23,28,38,.18)',
        }}>
          {!list.length && <div style={{ padding: 12, fontSize: 12, color: '#98a2b0' }}>Sin coincidencias.</div>}
          {list.map(f => (
            <div key={f.key}
              onMouseDown={() => { onChange(f.key); setOpen(false); }}
              style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #eef1f4' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0f4f8'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                <span style={{ color: '#2a313c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.key}</span>
                <span style={{ color: f.fillPct >= 90 ? '#2f9e66' : f.fillPct >= 50 ? '#c98f2a' : '#c65555', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{f.fillPct}%</span>
              </div>
              {/* Barra de completitud: cuántos elementos tienen este dato lleno */}
              <div style={{ height: 3, background: '#e8ebef', borderRadius: 2, marginTop: 4 }}>
                <div style={{ width: `${f.fillPct}%`, height: '100%', borderRadius: 2, background: f.fillPct >= 90 ? '#3fb27f' : f.fillPct >= 50 ? '#e0a63f' : '#d66a6a' }} />
              </div>
              <div style={{ fontSize: 10, color: '#98a2b0', marginTop: 3 }}>
                {f.isNumeric ? 'numérico' : 'texto'} · {f.distinct >= 60 ? '60+' : f.distinct} valores
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

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(23,28,38,0.38)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
    }}>
      <div style={{
        width: 'min(480px, 94%)', maxHeight: '92%', overflowY: 'auto',
        background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 13,
        padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 15,
        boxShadow: '0 24px 60px rgba(23,28,38,.28)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#171c24' }}>{initial?.id ? 'Editar gráfico' : 'Nuevo gráfico'}</div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#98a2b0', fontSize: 19, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div>
          <div style={labelStyle}>Título</div>
          <input style={inputStyle} value={cfg.title || ''} placeholder="Ej.: Volumen por vaciado"
            onChange={e => set({ title: e.target.value })} />
        </div>

        <div>
          <div style={labelStyle}>Pregunta que responde (opcional)</div>
          <input style={inputStyle} value={cfg.question || ''} placeholder="Ej.: ¿Qué vaciados concentran más volumen?"
            onChange={e => set({ question: e.target.value })} />
        </div>

        <div>
          <div style={labelStyle}>Tipo</div>
          <Segmented options={TYPES} value={cfg.type} onChange={t => set({ type: t })} />
        </div>

        {isScatter ? (
          // Dispersión: cada ELEMENTO es un punto (X e Y numéricos)
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Eje X (numérico)</div>
              <FieldPicker fields={fields} numericOnly value={cfg.xField} onChange={k => set({ xField: k })} placeholder="Ej. DSI_Progresiva" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Eje Y (numérico)</div>
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
          <div style={labelStyle}>Filtro (opcional)</div>
          <FieldPicker fields={fields} value={cfg.filter?.field} onChange={k => set({ filter: { field: k, values: [] } })} placeholder="Campo a filtrar (ej. Revit Category)" />
          {cfg.filter?.field && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, maxHeight: 110, overflowY: 'auto' }}>
                {filterOptions.map(o => {
                  const on = cfg.filter?.values?.includes(o.value);
                  return (
                    <button key={o.value} onClick={() => toggleFilterValue(o.value)} style={{
                      padding: '4px 9px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${on ? '#7aa4d4' : '#d5dae1'}`,
                      background: on ? '#e3edf8' : '#ffffff', color: on ? '#28527e' : '#66707e',
                    }}>{o.value} · {o.count}</button>
                  );
                })}
              </div>
              <button onClick={() => set({ filter: null })} style={{ marginTop: 6, background: 'none', border: 'none', color: '#8a93a1', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>Quitar filtro</button>
            </>
          )}
        </div>

        {!['kpi', 'scatter', 'line', 'area'].includes(cfg.type) && (
          <div>
            <div style={labelStyle}>Máx. grupos: {cfg.topN}</div>
            <input type="range" min="4" max="30" value={cfg.topN} onChange={e => set({ topN: Number(e.target.value) })} style={{ width: '100%' }} />
          </div>
        )}

        {/* Línea de referencia: umbral/meta punteada sobre el gráfico */}
        {['bar', 'line', 'area', 'scatter'].includes(cfg.type) && (
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Línea de referencia (opcional)</div>
              <input style={inputStyle} type="number" value={cfg.refValue ?? ''} placeholder="Valor (ej. 500)"
                onChange={e => set({ refValue: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Etiqueta</div>
              <input style={inputStyle} value={cfg.refLabel || ''} placeholder="Ej. Meta"
                onChange={e => set({ refLabel: e.target.value })} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d5dae1', background: '#ffffff', color: '#4a5260', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={() => valid && onSave(cfg)} disabled={!valid} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: 12.5, fontWeight: 700,
            background: valid ? '#2f5680' : '#e6e9ee', color: valid ? '#fff' : '#98a2b0', cursor: valid ? 'pointer' : 'default',
          }}>{initial?.id ? 'Guardar' : 'Añadir'}</button>
        </div>
      </div>
    </div>
  );
}
