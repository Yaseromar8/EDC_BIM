// lobEdtExplorer — 2a EXPLORADOR EDT dinámico (inyectado en el workspace del 4D LOB).
//
// Reemplaza el contenido estático del tab #2a por un explorador REAL construido
// desde /api/lob/timeline: árbol EDT jerárquico (por segmentos del código de
// partida, con nombres de los TÍTULOS de CONTROL_OBRA), KPIs, y panel de detalle
// con el cruce completo: Metrados (metrado/PU/valorizado) ⨯ Valorizaciones
// (avance por periodo) ⨯ Cronograma P6 (fechas reales por Activity ID).
// Vanilla DOM (va dentro del iframe del standalone) con delegación de eventos.

const money = (v) => (v == null ? '—' : 'S/ ' + Math.round(v).toLocaleString('es-PE'));
const num = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString('es-PE', { maximumFractionDigits: d }));
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fecha = (iso) => {
    if (!iso) return null;
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
};

const MONO = "'IBM Plex Mono', Consolas, monospace";
const GREEN = '#22c55e', AMBER = '#f59e0b', BLUE = '#3aa0ff', MUTED = '#8a919c', FAINT = '#5d6672';

function buildTree(lobData, activeFrente) {
    const codBases = activeFrente ? (lobData.frentes?.[activeFrente] || []) : null;
    const inFrente = (c) => !codBases || codBases.some((cb) => String(c).startsWith(cb) || String(cb).startsWith(c));
    const byCode = lobData.avance || {};
    const nodes = new Map(); // codigo -> node

    const ensure = (codigo) => {
        if (!nodes.has(codigo)) {
            nodes.set(codigo, {
                codigo, nombre: null, unidad: null, metrado: null, pu: null,
                activity_id: null, duracion: null, es_partida: false,
                contractual: 0, valorizado: 0, conAct: 0, totPart: 0,
                hijos: [], nivel: codigo.split('.').length,
            });
        }
        return nodes.get(codigo);
    };

    (lobData.partidas || []).forEach((p) => {
        if (!inFrente(p.codigo)) return;
        const n = ensure(p.codigo);
        n.nombre = p.descripcion || n.nombre;
        if ((p.tipo || 'partida') === 'partida') {
            n.es_partida = true;
            n.unidad = p.unidad; n.metrado = p.metrado; n.pu = p.pu;
            n.activity_id = p.activity_id; n.duracion = p.duracion;
            const met = p.metrado || 0; const pu = p.pu || 0;
            const ejec = Object.values(byCode[p.codigo] || {}).reduce((a, b) => a + b, 0);
            n.contractual = met * pu;
            n.valorizado = Math.min(met, ejec) * pu;
            n.ejec = ejec;
            n.conAct = p.activity_id ? 1 : 0;
            n.totPart = 1;
        }
    });

    // enlazar padres (creándolos si no existen) y agregar sumas hacia arriba
    const roots = [];
    [...nodes.keys()].sort().forEach((codigo) => {
        const node = nodes.get(codigo);
        const parts = codigo.split('.');
        if (parts.length === 1) { roots.push(node); return; }
        const parentCode = parts.slice(0, -1).join('.');
        const parent = ensure(parentCode);
        if (!parent.hijos.includes(node)) parent.hijos.push(node);
        if (parent.nivel === 1 && !roots.includes(parent)) roots.push(parent);
    });
    // los ensure() de padres pueden haber creado raíces nuevas después del sort
    nodes.forEach((n) => { if (n.nivel === 1 && !roots.includes(n)) roots.push(n); });
    roots.sort((a, b) => a.codigo.localeCompare(b.codigo));

    const aggregate = (n) => {
        n.hijos.sort((a, b) => a.codigo.localeCompare(b.codigo));
        n.hijos.forEach((h) => {
            aggregate(h);
            n.contractual += h.contractual;
            n.valorizado += h.valorizado;
            n.conAct += h.conAct;
            n.totPart += h.totPart;
        });
        n.pct = n.contractual > 0 ? (n.valorizado / n.contractual) * 100 : null;
    };
    roots.forEach(aggregate);
    return { roots, nodes };
}

function kpiHtml(label, valueHtml) {
    return `<div style="flex:1;min-width:200px;padding:14px 20px;border-right:1px solid #1c1f25;">
        <div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:6px;">${label}</div>
        <div style="font-family:${MONO};font-size:24px;font-weight:800;color:#e6e8ec;">${valueHtml}</div>
    </div>`;
}

function rowHtml(n, expanded, selected, maxLevel) {
    const indent = 10 + (n.nivel - 1) * 16;
    const hasKids = n.hijos.length > 0;
    const isOpen = expanded.has(n.codigo);
    const pctColor = n.pct == null ? FAINT : n.pct >= 99.5 ? GREEN : n.pct > 0 ? AMBER : FAINT;
    const barW = Math.min(100, n.pct || 0);
    const isSel = selected === n.codigo;
    return `<div class="edt-row" data-code="${n.codigo}" style="display:flex;align-items:center;min-height:30px;padding:2px 10px 2px ${indent}px;cursor:pointer;border-bottom:1px solid #14171c;background:${isSel ? 'rgba(58,160,255,0.10)' : 'transparent'};">
        <span class="edt-tog" data-code="${n.codigo}" style="width:16px;flex:0 0 16px;color:${MUTED};font-size:10px;">${hasKids ? (isOpen ? '▾' : '▸') : '·'}</span>
        <span style="font-family:${MONO};font-size:10.5px;color:${n.es_partida ? '#8ecbff' : MUTED};width:86px;flex:0 0 86px;">${n.codigo}</span>
        <span style="flex:1;min-width:0;font-size:${n.es_partida ? '12px' : '12.5px'};font-weight:${n.es_partida ? 400 : 700};color:#d7dbe2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(n.nombre)}">${esc(n.nombre) || '—'}</span>
        <span style="width:86px;flex:0 0 86px;font-family:${MONO};font-size:10px;color:${MUTED};">${n.es_partida && n.activity_id ? esc(n.activity_id) : ''}</span>
        <span style="width:40px;flex:0 0 40px;font-size:10.5px;color:${MUTED};">${n.es_partida ? esc(n.unidad || '') : ''}</span>
        <span style="width:80px;flex:0 0 80px;text-align:right;font-family:${MONO};font-size:11px;color:#c8cdd6;">${n.es_partida ? num(n.metrado) : ''}</span>
        <span style="width:120px;flex:0 0 120px;display:flex;align-items:center;gap:6px;padding:0 8px;">
            <span style="flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,0.06);overflow:hidden;"><span style="display:block;height:100%;width:${barW}%;background:${pctColor};"></span></span>
            <span style="font-family:${MONO};font-size:10px;color:${pctColor};width:26px;text-align:right;">${n.pct == null ? '—' : Math.round(n.pct)}</span>
        </span>
        <span style="width:110px;flex:0 0 110px;text-align:right;font-family:${MONO};font-size:11px;color:#c8cdd6;">${n.contractual ? Math.round(n.contractual).toLocaleString('es-PE') : '—'}</span>
        <span style="width:110px;flex:0 0 110px;text-align:right;font-family:${MONO};font-size:11px;color:${MUTED};">${n.valorizado ? Math.round(n.valorizado).toLocaleString('es-PE') : '—'}</span>
    </div>`;
}

function detailHtml(n, lobData) {
    if (!n) {
        return `<div style="padding:24px;color:${FAINT};font-size:12px;">Selecciona una partida del árbol para ver su cruce completo (metrados ⨯ valorizaciones ⨯ cronograma P6).</div>`;
    }
    const act = n.activity_id ? (lobData.activities || {})[n.activity_id] : null;
    const ejecPct = n.metrado > 0 ? Math.min(100, ((n.ejec || 0) / n.metrado) * 100) : null;
    const dias = act?.start && act?.finish
        ? Math.round((new Date(act.finish) - new Date(act.start)) / 86400000) + 1 : null;
    const periodos = (lobData.avance || {})[n.codigo] || {};
    const perHtml = Object.keys(periodos).sort((a, b) => a - b).map((per) =>
        `<div style="display:flex;justify-content:space-between;padding:3px 0;border-top:1px solid #1c1f25;font-size:11px;">
            <span style="color:${MUTED};">VAL N°${String(per).padStart(2, '0')}</span>
            <span style="font-family:${MONO};color:#c8cdd6;">${num(periodos[per])} ${esc(n.unidad || '')}</span>
        </div>`).join('');

    return `
    <div style="padding:16px 18px;">
        <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;font-weight:700;">Partida seleccionada · ${n.codigo}</div>
        <div style="font-size:15px;font-weight:700;color:#e6e8ec;margin-top:6px;line-height:1.3;">${esc(n.nombre)}</div>
        ${n.activity_id ? `<div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
            <span style="font-size:11px;color:${MUTED};">Clave única BIM</span>
            <span style="font-family:${MONO};font-size:12px;font-weight:700;color:#8ecbff;background:#12151a;border:1px solid #23262d;border-radius:6px;padding:3px 10px;">${esc(n.activity_id)}</span>
        </div>` : `<div style="margin-top:10px;font-size:11px;color:${FAINT};">Sin Activity ID (no vinculable al modelo por clave BIM).</div>`}

        <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;font-weight:700;margin-top:20px;margin-bottom:8px;">Cómo se cruza la información</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div style="background:#0e1014;border:1px solid #23262d;border-radius:8px;padding:10px 12px;">
                <div style="font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:${BLUE};font-weight:700;">Cronograma · P6</div>
                ${act && act.start ? `
                    <div style="font-family:${MONO};font-size:12px;color:#e6e8ec;margin-top:6px;">${fecha(act.start)} → ${fecha(act.finish)}</div>
                    <div style="font-size:10.5px;color:${MUTED};margin-top:3px;">${dias != null ? dias + ' días' : ''}${act.status ? ' · ' + esc(act.status) : ''}${act.percent ? ' · ' + num(act.percent, 0) + '%' : ''}</div>`
                    : `<div style="font-size:11px;color:${FAINT};margin-top:6px;">Sin fechas en el XML P6.</div>`}
            </div>
            <div style="background:#0e1014;border:1px solid #23262d;border-radius:8px;padding:10px 12px;">
                <div style="font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:${AMBER};font-weight:700;">Presupuesto · V03</div>
                <div style="font-family:${MONO};font-size:12px;color:#e6e8ec;margin-top:6px;">Ítem ${n.codigo}</div>
                <div style="font-size:10.5px;color:${MUTED};margin-top:3px;">${money(n.contractual)} contractual</div>
            </div>
        </div>

        <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;font-weight:700;margin-top:20px;margin-bottom:8px;">Metrado y valorización</div>
        <div style="display:flex;gap:18px;">
            <div><div style="font-size:9.5px;color:${MUTED};text-transform:uppercase;">Metrado</div>
                <div style="font-family:${MONO};font-size:14px;font-weight:700;color:#e6e8ec;">${num(n.metrado)} <span style="font-size:10px;color:${MUTED};">${esc(n.unidad || '')}</span></div></div>
            <div><div style="font-size:9.5px;color:${MUTED};text-transform:uppercase;">P. unitario</div>
                <div style="font-family:${MONO};font-size:14px;font-weight:700;color:#e6e8ec;">${num(n.pu)}</div></div>
            <div><div style="font-size:9.5px;color:${MUTED};text-transform:uppercase;">Valorizado</div>
                <div style="font-family:${MONO};font-size:14px;font-weight:700;color:${ejecPct == null ? FAINT : ejecPct >= 99.5 ? GREEN : AMBER};">${ejecPct == null ? '—' : Math.round(ejecPct) + '%'}</div></div>
        </div>

        ${perHtml ? `<div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;font-weight:700;margin-top:18px;margin-bottom:4px;">Ejecución por valorización</div>${perHtml}` : ''}

        <div style="display:flex;gap:24px;margin-top:18px;border-top:1px solid #1c1f25;padding-top:12px;">
            <div><div style="font-size:10px;color:${MUTED};">Avance físico <span style="color:${FAINT};">(ejecutado)</span></div>
                <div style="font-size:19px;font-weight:800;color:#e6e8ec;">${ejecPct == null ? '—' : Math.round(ejecPct) + '%'}</div></div>
            <div><div style="font-size:10px;color:${MUTED};">Avance económico <span style="color:${FAINT};">(valoriz.)</span></div>
                <div style="font-size:19px;font-weight:800;color:#e6e8ec;">${n.contractual > 0 ? Math.round((n.valorizado / n.contractual) * 100) + '%' : '—'}</div></div>
        </div>
    </div>`;
}

// Busca el contenedor VISIBLE de la vista "Explorador EDT" del workspace (la
// maqueta lo dibuja dentro de #3a, no en la sección oculta #2a): se ancla al
// texto "PRESUPUESTO CONTRACTUAL" y sube hasta el bloque grande de la vista.
export function findVisibleEdtHost(doc) {
    if (!doc?.body) return null;
    const walker = doc.createTreeWalker(doc.body, doc.defaultView?.NodeFilter?.SHOW_TEXT || 4);
    let node = walker.nextNode();
    let label = null;
    while (node) {
        if (String(node.nodeValue || '').includes('PRESUPUESTO CONTRACTUAL')) { label = node.parentElement; break; }
        node = walker.nextNode();
    }
    if (!label) return null;
    let el = label;
    for (let i = 0; i < 14 && el; i += 1) {
        const r = el.getBoundingClientRect();
        if (r.height > 380 && r.width > 700) return el;
        el = el.parentElement;
    }
    return null;
}

export function renderEdtExplorer(doc, lobData, activeFrente, hostOverride = null) {
    const edtTab = hostOverride || doc.getElementById('2a');
    if (!edtTab || !lobData) return;

    // estado vivo entre re-renders (guardado en el propio doc del iframe)
    const st = (doc.__edtState = doc.__edtState || { expanded: new Set(), selected: null, maxLevel: 2, inited: false });
    if (!st.inited) {
        st.inited = true;
        // abrir los 2 primeros niveles por defecto
        (lobData.partidas || []).forEach((p) => {
            const segs = String(p.codigo).split('.');
            if (segs.length === 1) st.expanded.add(p.codigo);
        });
    }

    const { roots, nodes } = buildTree(lobData, activeFrente);

    // KPIs globales (del frente activo)
    let contractual = 0; let valorizado = 0; let conAct = 0; let totPart = 0;
    roots.forEach((r) => { contractual += r.contractual; valorizado += r.valorizado; conAct += r.conAct; totPart += r.totPart; });
    const pctEco = contractual > 0 ? (valorizado / contractual) * 100 : 0;

    // filas visibles según expansión y nivel máximo
    const rows = [];
    const walk = (n) => {
        rows.push(n);
        if (st.expanded.has(n.codigo) && n.nivel < 12) n.hijos.forEach(walk);
    };
    roots.forEach(walk);

    // lookup DENTRO del contenedor destino (no doc-wide: la sección #2a oculta
    // puede tener su propia copia y bloquearía la inyección en la vista visible)
    let host = edtTab.querySelector(':scope #lob-edt-live') || (edtTab.id === 'lob-edt-live' ? edtTab : null);
    if (!host) {
        host = doc.createElement('div');
        host.id = 'lob-edt-live';
        // reemplaza TODO el contenido de la vista por el explorador dinámico
        const inner = hostOverride ? edtTab : (edtTab.querySelector('div[style*="height"]') || edtTab);
        inner.innerHTML = '';
        inner.appendChild(host);
    }

    host.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:520px;background:#0a0b0d;color:#d7dbe2;font-family:Inter,system-ui,sans-serif;border:1px solid #1c1f25;border-radius:10px;overflow:hidden;';
    host.innerHTML = `
        <div style="display:flex;border-bottom:1px solid #1c1f25;background:#0e1014;">
            ${kpiHtml('Presupuesto contractual', money(contractual))}
            ${kpiHtml('Valorizado acumulado', `${money(valorizado)} <span style="font-size:12px;color:${MUTED};">${num(pctEco, 1)}%</span>`)}
            ${kpiHtml('Avance económico', `${num(pctEco, 1)} <span style="font-size:13px;color:${MUTED};">%</span>`)}
            ${kpiHtml('Partidas con Activity ID', `${conAct.toLocaleString('es-PE')} <span style="font-size:12px;color:${MUTED};">/ ${totPart.toLocaleString('es-PE')}</span>`)}
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #1c1f25;font-size:11px;color:${MUTED};">
            <span>${activeFrente ? 'Frente: <b style="color:#8ecbff;">' + esc(activeFrente) + '</b>' : 'Todos los frentes'}</span>
            <span style="margin-left:auto;">Nivel de detalle</span>
            ${[1, 2, 4].map((l) => `<button class="edt-lvl" data-lvl="${l}" style="width:22px;height:22px;border-radius:5px;border:1px solid ${st.maxLevel === l ? '#3aa0ff' : '#23262d'};background:${st.maxLevel === l ? 'rgba(58,160,255,0.16)' : 'transparent'};color:${st.maxLevel === l ? '#8ecbff' : MUTED};font-size:11px;cursor:pointer;">${l}</button>`).join('')}
        </div>
        <div style="display:flex;flex:1;min-height:0;">
            <div style="flex:1;min-width:0;overflow:auto;" id="edt-tree">
                <div style="display:flex;align-items:center;padding:6px 10px 6px 10px;position:sticky;top:0;background:#101317;border-bottom:1px solid #1c1f25;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;font-weight:700;z-index:2;">
                    <span style="width:16px;flex:0 0 16px;"></span><span style="width:86px;flex:0 0 86px;">Partida / EDT</span>
                    <span style="flex:1;">Descripción</span><span style="width:86px;flex:0 0 86px;">Activity ID</span>
                    <span style="width:40px;flex:0 0 40px;">Und</span><span style="width:80px;flex:0 0 80px;text-align:right;">Metrado</span>
                    <span style="width:120px;flex:0 0 120px;text-align:center;">Avance</span>
                    <span style="width:110px;flex:0 0 110px;text-align:right;">Contractual S/</span>
                    <span style="width:110px;flex:0 0 110px;text-align:right;">Valorizado S/</span>
                </div>
                ${rows.map((n) => rowHtml(n, st.expanded, st.selected, st.maxLevel)).join('')}
            </div>
            <div style="width:340px;flex:0 0 340px;border-left:1px solid #1c1f25;background:#0e1014;overflow:auto;" id="edt-detail">
                ${detailHtml(st.selected ? nodes.get(st.selected) : null, lobData)}
            </div>
        </div>`;

    // interacción (delegación, un solo listener por render)
    host.onclick = (ev) => {
        const lvlBtn = ev.target.closest('.edt-lvl');
        if (lvlBtn) {
            st.maxLevel = Number(lvlBtn.dataset.lvl);
            st.expanded = new Set([...nodes.keys()].filter((c) => c.split('.').length < st.maxLevel));
            renderEdtExplorer(doc, lobData, activeFrente, hostOverride || edtTab);
            return;
        }
        const row = ev.target.closest('.edt-row');
        if (!row) return;
        const code = row.dataset.code;
        const node = nodes.get(code);
        const isToggle = ev.target.closest('.edt-tog');
        if (isToggle && node?.hijos?.length) {
            if (st.expanded.has(code)) st.expanded.delete(code); else st.expanded.add(code);
        } else {
            st.selected = code;
            if (node?.hijos?.length && !st.expanded.has(code)) st.expanded.add(code);
        }
        renderEdtExplorer(doc, lobData, activeFrente, hostOverride || edtTab);
    };
}
