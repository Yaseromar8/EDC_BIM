import React, { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch';

/**
 * CompareView — Comparador propio (contractual vs avance), estilo ACC Compare.
 *
 * Arquitectura:
 *  - El DIFF DE DATOS se calcula en PostgreSQL por external_id (/api/compare/diff).
 *  - La VISTA es un split de dos visores LMV con camaras sincronizadas; el visor
 *    solo dibuja y traduce external_id -> dbId para pintar (verde/ambar/rojo).
 *  - Funciona tambien con documentos CAD 2D (DWG): el mismo visor los renderiza.
 *
 * Modo overlay: cubre el lienzo sin desmontar el visor principal. "Salir" vuelve
 * exactamente al estado anterior.
 */

const COLORS = {
    added: [0.22, 0.65, 0.15],     // verde
    removed: [0.89, 0.29, 0.29],   // rojo
    modified: [0.94, 0.62, 0.15],  // ambar
};

const S = {
    overlay: { position: 'fixed', inset: 0, zIndex: 9000, background: '#15191e', display: 'flex', flexDirection: 'column', color: '#d5d9de', fontFamily: 'inherit' },
    header: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #2a3038', flexWrap: 'wrap' },
    select: { background: '#1f242b', color: '#d5d9de', border: '1px solid #39414c', borderRadius: 6, padding: '6px 8px', fontSize: 13, maxWidth: 330 },
    btn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
    btnGhost: { background: 'transparent', color: '#aab2bc', border: '1px solid #39414c', borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer' },
    viewers: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, minHeight: 0, position: 'relative' },
    pane: { position: 'relative', background: '#0e1115', overflow: 'hidden' },
    paneTag: { position: 'absolute', top: 8, left: 10, zIndex: 5, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 5, background: 'rgba(0,0,0,0.55)' },
    bottom: { borderTop: '1px solid #2a3038', padding: '8px 14px', display: 'flex', gap: 14, alignItems: 'flex-start', maxHeight: 220, overflow: 'hidden' },
    chip: (color, active) => ({ cursor: 'pointer', fontSize: 13, padding: '6px 12px', borderRadius: 6, border: `1px solid ${active ? color : '#39414c'}`, color, background: active ? 'rgba(255,255,255,0.06)' : 'transparent', fontWeight: 600 }),
    list: { flex: 1, overflowY: 'auto', maxHeight: 170, fontSize: 12.5 },
    listItem: { padding: '4px 8px', borderBottom: '1px solid #232930', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    detail: { flex: 1.2, overflowY: 'auto', maxHeight: 170, fontSize: 12.5, background: '#1a1f26', borderRadius: 6, padding: '8px 10px' },
};

export default function CompareView({ BACKEND_URL, onExit }) {
    const [models, setModels] = useState([]);
    const [selA, setSelA] = useState('');
    const [selB, setSelB] = useState('');
    const [status, setStatus] = useState('Elige el lado A (contractual / versión base) y el lado B (avance actual), luego pulsa Comparar.');
    const [busy, setBusy] = useState(false);
    const [diff, setDiff] = useState(null);
    const [activeList, setActiveList] = useState(null); // 'added' | 'removed' | 'modified'
    const [detail, setDetail] = useState(null);
    const contA = useRef(null);
    const contB = useRef(null);
    const vs = useRef({ a: null, b: null, maps: { a: null, b: null }, syncing: false });

    // Lista de modelos de TODOS los frentes del proyecto
    useEffect(() => {
        apiFetch(`${BACKEND_URL}/api/config/project`)
            .then(r => r.json())
            .then(cfg => setModels(cfg.models || []))
            .catch(() => setStatus('No se pudo cargar la lista de modelos.'));
    }, [BACKEND_URL]);

    const frentes = [...new Set(models.map(m => m.appProjectId).filter(Boolean))];

    const scopeFor = useCallback((val) => {
        if (!val) return null;
        if (val.startsWith('frente:')) return { type: 'frente', value: val.slice(7) };
        const m = models.find(x => String(x.id) === val);
        return m ? { type: 'source', value: m.urn } : null;
    }, [models]);

    const makeViewer = (container) => {
        const v = new window.Autodesk.Viewing.GuiViewer3D(container, {});
        v.start();
        return v;
    };

    const loadUrn = (viewer, urn) => new Promise((resolve, reject) => {
        window.Autodesk.Viewing.Document.load('urn:' + urn, (doc) => {
            const node = doc.getRoot().getDefaultGeometry();
            viewer.loadDocumentNode(doc, node).then(resolve).catch(reject);
        }, (err) => reject(new Error('No se pudo cargar el modelo (¿traducido?): ' + err)));
    });

    // Sincronizacion de camaras A<->B (con guard anti-bucle)
    const wireSync = useCallback(() => {
        const { a, b } = vs.current;
        if (!a || !b || vs.current.synced) return;
        const sync = (src, dst) => () => {
            if (vs.current.syncing) return;
            vs.current.syncing = true;
            try {
                const nav = src.navigation;
                dst.navigation.setView(nav.getPosition(), nav.getTarget());
                dst.navigation.setCameraUpVector(nav.getCameraUpVector());
            } catch (e) { /* visor aun montando */ }
            vs.current.syncing = false;
        };
        a.addEventListener(window.Autodesk.Viewing.CAMERA_CHANGE_EVENT, sync(a, b));
        b.addEventListener(window.Autodesk.Viewing.CAMERA_CHANGE_EVENT, sync(b, a));
        vs.current.synced = true;
    }, []);

    const themeSide = (viewer, map, list, rgb) => {
        if (!viewer || !viewer.model || !map) return;
        const color = new window.THREE.Vector4(rgb[0], rgb[1], rgb[2], 1);
        list.forEach(it => {
            const dbId = map[it.id];
            if (dbId) viewer.setThemingColor(dbId, color, viewer.model, true);
        });
    };

    const runCompare = async () => {
        const a = scopeFor(selA);
        const b = scopeFor(selB);
        if (!a || !b) return;
        setBusy(true); setDiff(null); setDetail(null); setActiveList(null);
        try {
            // 1) Diff de DATOS en PostgreSQL (siempre, es el cerebro)
            setStatus('Comparando datos en PostgreSQL…');
            const res = await apiFetch(`${BACKEND_URL}/api/compare/diff`, {
                method: 'POST', body: JSON.stringify({ a, b })
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Fallo el diff');
            setDiff(d);

            // 2) Vista 3D cuando ambos lados son modelos individuales
            if (a.type === 'source' && b.type === 'source') {
                setStatus('Cargando los dos modelos…');
                if (!vs.current.a) vs.current.a = makeViewer(contA.current);
                if (!vs.current.b) vs.current.b = makeViewer(contB.current);
                const mA = models.find(x => String(x.id) === selA);
                const mB = models.find(x => String(x.id) === selB);
                await Promise.all([loadUrn(vs.current.a, mA.urn), loadUrn(vs.current.b, mB.urn)]);
                wireSync();

                setStatus('Pintando diferencias…');
                const mapA = await new Promise(r => vs.current.a.model.getExternalIdMapping(r));
                const mapB = await new Promise(r => vs.current.b.model.getExternalIdMapping(r));
                vs.current.maps = { a: mapA, b: mapB };
                themeSide(vs.current.b, mapB, d.added, COLORS.added);
                themeSide(vs.current.b, mapB, d.modified, COLORS.modified);
                themeSide(vs.current.a, mapA, d.removed, COLORS.removed);
                themeSide(vs.current.a, mapA, d.modified, COLORS.modified);
                setStatus('Listo — verde: agregado · rojo: eliminado · ámbar: modificado. Cámaras sincronizadas.');
            } else {
                setStatus('Diff de datos listo. (El 3D lado a lado se activa al comparar dos modelos individuales.)');
            }
        } catch (e) {
            console.error('[Compare]', e);
            setStatus('Error: ' + e.message);
        }
        setBusy(false);
    };

    const isolate = (side, list) => {
        const viewer = vs.current[side];
        const map = vs.current.maps[side];
        if (!viewer || !viewer.model || !map) return;
        const ids = list.map(it => map[it.id]).filter(Boolean);
        if (ids.length) viewer.isolate(ids, viewer.model);
    };

    const showAll = () => {
        ['a', 'b'].forEach(s => {
            const v = vs.current[s];
            if (v && v.model) { v.isolate([], v.model); }
        });
    };

    const openDetail = async (item) => {
        try {
            const res = await apiFetch(`${BACKEND_URL}/api/compare/element`, {
                method: 'POST',
                body: JSON.stringify({ external_id: item.id, a: scopeFor(selA), b: scopeFor(selB) })
            });
            const d = await res.json();
            const flat = (props) => {
                const out = {};
                Object.entries(props || {}).forEach(([g, sub]) => {
                    if (sub && typeof sub === 'object') {
                        Object.entries(sub).forEach(([k, v]) => { out[`${g} · ${k}`] = String(v); });
                    }
                });
                return out;
            };
            const fa = flat(d.a && d.a.properties);
            const fb = flat(d.b && d.b.properties);
            const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])];
            const changes = keys
                .filter(k => fa[k] !== fb[k])
                .map(k => ({ prop: k, a: fa[k] !== undefined ? fa[k] : '—', b: fb[k] !== undefined ? fb[k] : '—' }));
            setDetail({ name: item.name || item.id, changes });
        } catch (e) { console.error('[Compare] detalle:', e); }
    };

    // Limpieza al salir del modo
    useEffect(() => () => {
        ['a', 'b'].forEach(s => { try { vs.current[s] && vs.current[s].finish(); } catch (e) { /* noop */ } });
    }, []);

    const optionLabel = (m) => `${m.appProjectId || '?'} · ${m.name}${m.versionNumber ? ' (v' + m.versionNumber + ')' : ''}`;
    const renderSelect = (val, setVal, tag) => (
        <select style={S.select} value={val} onChange={e => setVal(e.target.value)}>
            <option value="">— {tag} —</option>
            <optgroup label="Frentes completos (solo datos)">
                {frentes.map(f => <option key={'f' + f} value={'frente:' + f}>Frente {f}</option>)}
            </optgroup>
            <optgroup label="Modelos / documentos">
                {models.map(m => <option key={m.id} value={String(m.id)}>{optionLabel(m)}</option>)}
            </optgroup>
        </select>
    );

    const listData = diff && activeList ? diff[activeList] : [];

    return (
        <div style={S.overlay}>
            <div style={S.header}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>⇄ Comparador</span>
                <span style={{ fontSize: 12, color: '#7f8893' }}>A (base/contractual)</span>
                {renderSelect(selA, setSelA, 'lado A')}
                <span style={{ fontSize: 12, color: '#7f8893' }}>B (avance)</span>
                {renderSelect(selB, setSelB, 'lado B')}
                <button style={{ ...S.btn, opacity: (!selA || !selB || busy) ? 0.5 : 1 }} disabled={!selA || !selB || busy} onClick={runCompare}>
                    {busy ? 'Comparando…' : 'Comparar'}
                </button>
                <button style={S.btnGhost} onClick={showAll}>Mostrar todo</button>
                <button style={{ ...S.btnGhost, marginLeft: 'auto' }} onClick={onExit}>✕ Salir</button>
            </div>

            <div style={S.viewers}>
                <div style={S.pane}>
                    <span style={{ ...S.paneTag, color: '#f0a5a5' }}>A · base {diff ? `(${diff.summary.total_a})` : ''}</span>
                    <div ref={contA} style={{ position: 'absolute', inset: 0 }} />
                </div>
                <div style={S.pane}>
                    <span style={{ ...S.paneTag, color: '#a5d6a7' }}>B · avance {diff ? `(${diff.summary.total_b})` : ''}</span>
                    <div ref={contB} style={{ position: 'absolute', inset: 0 }} />
                </div>
            </div>

            <div style={{ padding: '4px 14px', fontSize: 12, color: '#8b95a1', borderTop: '1px solid #2a3038' }}>{status}</div>

            {diff && (
                <div style={S.bottom}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button style={S.chip('#7dd87f', activeList === 'added')} onClick={() => { setActiveList('added'); isolate('b', diff.added); }}>
                            + {diff.summary.added} agregados
                        </button>
                        <button style={S.chip('#f08e8e', activeList === 'removed')} onClick={() => { setActiveList('removed'); isolate('a', diff.removed); }}>
                            − {diff.summary.removed} eliminados
                        </button>
                        <button style={S.chip('#f4c067', activeList === 'modified')} onClick={() => { setActiveList('modified'); isolate('a', diff.modified); isolate('b', diff.modified); }}>
                            ~ {diff.summary.modified} modificados
                        </button>
                        <span style={{ fontSize: 11.5, color: '#7f8893' }}>{diff.summary.unchanged} sin cambio</span>
                    </div>

                    <div style={S.list}>
                        {activeList === null && <div style={{ color: '#7f8893', padding: 8 }}>Haz clic en una categoría para listar y aislar sus elementos.</div>}
                        {listData.slice(0, 500).map(it => (
                            <div key={it.id} style={S.listItem} title={it.id} onClick={() => openDetail(it)}>
                                {it.name || it.id}
                            </div>
                        ))}
                        {listData.length > 500 && <div style={{ color: '#7f8893', padding: 6 }}>… y {listData.length - 500} más</div>}
                    </div>

                    <div style={S.detail}>
                        {!detail && <span style={{ color: '#7f8893' }}>Haz clic en un elemento para ver qué propiedades cambiaron (A vs B).</span>}
                        {detail && (
                            <>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>{detail.name}</div>
                                {detail.changes.length === 0 && <div style={{ color: '#7f8893' }}>Sin cambios de propiedades (puede ser cambio geométrico).</div>}
                                {detail.changes.slice(0, 60).map((c, i) => (
                                    <div key={i} style={{ marginBottom: 4, borderBottom: '1px solid #242a32', paddingBottom: 3 }}>
                                        <div style={{ color: '#aab2bc' }}>{c.prop}</div>
                                        <div><span style={{ color: '#f08e8e' }}>A: {c.a}</span> → <span style={{ color: '#7dd87f' }}>B: {c.b}</span></div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
