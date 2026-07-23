// Reporte PDF ejecutivo estilo acta de reunión semanal de obra.
// Contenido: portada · KPIs EVM · Curva S doble · Look-ahead 2-4 semanas
// · Atrasos críticos · Alertas. Corre en el cliente (jsPDF), listo para email.

const A4W = 297; // mm landscape
const A4H = 210;
const MARGIN = 12;

const fmtMoney = (v) => v == null ? '—' : `S/ ${Math.round(v).toLocaleString('es-PE')}`;
const fmtDate = (t) => t == null ? '—' : new Date(t).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtShort = (t) => t == null ? '—' : new Date(t).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
const fmtNum = (v, d = 2) => v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(d);

const trunc = (s, n) => {
    const str = String(s || '');
    return str.length > n ? `${str.slice(0, n - 1)}…` : str;
};

const drawHeader = (pdf, title, subtitle) => {
    pdf.setFillColor(15, 20, 26);
    pdf.rect(0, 0, A4W, 22, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, MARGIN, 12);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(180, 190, 205);
    pdf.text(subtitle, MARGIN, 18);
    pdf.setTextColor(120, 140, 155);
    pdf.setFontSize(8);
    pdf.text(`Generado: ${new Date().toLocaleString('es-PE')}`, A4W - MARGIN, 18, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
};

const drawFooter = (pdf, page, total) => {
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, A4H - 8, A4W - MARGIN, A4H - 8);
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text('4D LOB · Reporte ejecutivo', MARGIN, A4H - 4);
    pdf.text(`Pág ${page}/${total}`, A4W - MARGIN, A4H - 4, { align: 'right' });
};

const drawKpiCard = (pdf, x, y, w, h, label, value, sub, color) => {
    pdf.setDrawColor(210, 220, 230);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(x, y, w, h, 2, 2, 'FD');
    if (color) {
        pdf.setFillColor(color[0], color[1], color[2]);
        pdf.rect(x, y, 2, h, 'F');
    }
    pdf.setTextColor(110, 120, 130);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(label, x + 5, y + 5);
    pdf.setTextColor(20, 30, 40);
    pdf.setFontSize(15);
    pdf.text(String(value), x + 5, y + 13);
    if (sub) {
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(120, 130, 140);
        pdf.text(String(sub), x + 5, y + h - 3);
    }
};

// Curva S doble (Plan + Real) + barras semanales — rendering vectorial.
const drawCurveS = (pdf, x, y, w, h, histogram, curveSPlan, curveSReal, cutMs, domain) => {
    // caja
    pdf.setDrawColor(220, 226, 234);
    pdf.setFillColor(252, 253, 255);
    pdf.rect(x, y, w, h, 'FD');
    pdf.setTextColor(90, 100, 110);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Curva S — Plan (azul) vs Real (verde) · barras semanales', x + 4, y + 5);

    if (!histogram) {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(140, 150, 160);
        pdf.text('Sin histograma disponible.', x + w / 2, y + h / 2, { align: 'center' });
        return;
    }

    const { bucketMs, startBucket, bins, binsReal, maxBin } = histogram;
    const plotX = x + 4;
    const plotY = y + 10;
    const plotW = w - 8;
    const plotH = h - 16;

    // rango temporal (fusión con dominio del LOB)
    const t0 = domain?.min ?? startBucket;
    const t1 = domain?.max ?? (startBucket + bins.length * bucketMs);
    const span = Math.max(1, t1 - t0);
    const xOf = (t) => plotX + ((t - t0) / span) * plotW;

    // grid horizontal
    pdf.setDrawColor(230, 236, 244);
    pdf.setLineWidth(0.1);
    for (let i = 0; i <= 4; i += 1) {
        const gy = plotY + (i / 4) * plotH;
        pdf.line(plotX, gy, plotX + plotW, gy);
    }

    // barras PV (plan) — azules translúcidas
    for (let i = 0; i < bins.length; i += 1) {
        if (bins[i] <= 0) continue;
        const bStart = startBucket + i * bucketMs;
        const bEnd = bStart + bucketMs;
        if (bEnd <= t0 || bStart >= t1) continue;
        const bx = xOf(Math.max(bStart, t0));
        const bw = Math.max(0.3, xOf(Math.min(bEnd, t1)) - bx - 0.2);
        const bh = (bins[i] / maxBin) * plotH;
        pdf.setFillColor(58, 160, 255);
        pdf.setGState(pdf.GState({ opacity: 0.35 }));
        pdf.rect(bx, plotY + plotH - bh, bw, bh, 'F');
    }
    // barras EV (real) — verdes sólidas
    (binsReal || []).forEach((v, i) => {
        if (v <= 0) return;
        const bStart = startBucket + i * bucketMs;
        const bEnd = bStart + bucketMs;
        if (bEnd <= t0 || bStart >= t1) return;
        const bx = xOf(Math.max(bStart, t0));
        const bw = Math.max(0.3, xOf(Math.min(bEnd, t1)) - bx - 0.2);
        const bh = (v / maxBin) * plotH;
        pdf.setFillColor(34, 197, 94);
        pdf.setGState(pdf.GState({ opacity: 0.75 }));
        pdf.rect(bx + bw * 0.15, plotY + plotH - bh, bw * 0.7, bh, 'F');
    });
    pdf.setGState(pdf.GState({ opacity: 1 }));

    // curvas S
    const drawCurve = (arr, r, g, b, dash) => {
        if (!arr || !arr.length) return;
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(0.6);
        if (dash) pdf.setLineDashPattern([1.4, 1.4], 0);
        let prev = null;
        arr.forEach((v, i) => {
            const t = startBucket + (i + 0.5) * bucketMs;
            if (t < t0 || t > t1) return;
            const px = xOf(t);
            const py = plotY + plotH - v * plotH;
            if (prev) pdf.line(prev.x, prev.y, px, py);
            prev = { x: px, y: py };
        });
        pdf.setLineDashPattern([], 0);
    };
    drawCurve(curveSPlan, 58, 160, 255, false);
    drawCurve(curveSReal, 34, 197, 94, false);

    // cursor de fecha "hoy"
    if (cutMs != null && cutMs >= t0 && cutMs <= t1) {
        pdf.setDrawColor(239, 68, 68);
        pdf.setLineWidth(0.6);
        const cx = xOf(cutMs);
        pdf.line(cx, plotY, cx, plotY + plotH);
    }

    // ejes: fechas
    pdf.setFontSize(6.5);
    pdf.setTextColor(120, 130, 140);
    pdf.setFont('helvetica', 'normal');
    for (let i = 0; i <= 5; i += 1) {
        const t = t0 + (span * i) / 5;
        pdf.text(fmtShort(t), xOf(t), plotY + plotH + 4, { align: 'center' });
    }
};

const drawSection = (pdf, y, title) => {
    pdf.setFillColor(240, 244, 248);
    pdf.rect(MARGIN, y, A4W - 2 * MARGIN, 6, 'F');
    pdf.setTextColor(15, 30, 45);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, MARGIN + 3, y + 4.3);
    pdf.setTextColor(0, 0, 0);
    return y + 8;
};

const drawTable = (pdf, x, y, w, cols, rows, rowH = 5.5) => {
    // encabezado
    pdf.setFillColor(230, 236, 244);
    pdf.rect(x, y, w, rowH, 'F');
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(40, 55, 70);
    let cx = x + 1.5;
    cols.forEach((col) => {
        pdf.text(col.label, col.align === 'right' ? cx + col.w - 2 : cx, y + 3.8, { align: col.align || 'left' });
        cx += col.w;
    });
    let cy = y + rowH;
    pdf.setFont('helvetica', 'normal');
    rows.forEach((row, idx) => {
        if (idx % 2 === 1) {
            pdf.setFillColor(248, 250, 253);
            pdf.rect(x, cy, w, rowH, 'F');
        }
        let px = x + 1.5;
        cols.forEach((col) => {
            const v = col.value(row);
            const color = col.color ? col.color(row) : null;
            if (color) pdf.setTextColor(color[0], color[1], color[2]);
            else pdf.setTextColor(30, 40, 50);
            pdf.text(String(v), col.align === 'right' ? px + col.w - 2 : px, cy + 3.8, { align: col.align || 'left' });
            px += col.w;
        });
        cy += rowH;
    });
    // marco
    pdf.setDrawColor(220, 226, 234);
    pdf.setLineWidth(0.2);
    pdf.rect(x, y, w, cy - y);
    return cy + 2;
};

export const generateExecutiveReport = ({
    projectName = 'Proyecto',
    frenteLabel = 'Todos los frentes',
    dataset = null,
    simulationState = null,
    lobSeries = null,
}) => {
    // eslint-disable-next-line new-cap
    const pdf = new window.__jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const totalPages = 2;

    // ── PÁGINA 1: KPIs + Curva S + Alertas ─────────────────────────────
    drawHeader(pdf, `${projectName} · Reporte ejecutivo 4D LOB`, `Frente: ${frenteLabel}  ·  Fecha simulada: ${simulationState?.dateLabel || fmtDate(simulationState?.date?.getTime())}  ·  Dataset: ${dataset ? `v${dataset.version} — ${dataset.name || ''}` : 'sin dataset'}`);

    let y = 28;
    y = drawSection(pdf, y, 'KPIs — Earned Value Management (EVM)');
    const evm = lobSeries?.evm || {};
    const spiColor = evm.spi == null ? [200, 200, 200] : evm.spi >= 1 ? [34, 197, 94] : evm.spi >= 0.9 ? [245, 158, 11] : [239, 68, 68];
    const cpiColor = evm.cpi == null ? [200, 200, 200] : evm.cpi >= 1 ? [34, 197, 94] : evm.cpi >= 0.9 ? [245, 158, 11] : [239, 68, 68];
    const svColor = evm.sv == null ? [200, 200, 200] : evm.sv >= 0 ? [34, 197, 94] : [239, 68, 68];
    const cw = (A4W - 2 * MARGIN - 20) / 6;
    let cx = MARGIN;
    drawKpiCard(pdf, cx, y, cw, 22, 'SPI (RITMO)', fmtNum(evm.spi), evm.spi > 1 ? 'adelantado' : evm.spi < 0.9 ? 'atrasado' : 'en ritmo', spiColor); cx += cw + 4;
    drawKpiCard(pdf, cx, y, cw, 22, 'CPI (RENTAB.)', fmtNum(evm.cpi), '', cpiColor); cx += cw + 4;
    drawKpiCard(pdf, cx, y, cw, 22, 'PV PLAN', fmtMoney(evm.pv), 'costo planeado', [58, 160, 255]); cx += cw + 4;
    drawKpiCard(pdf, cx, y, cw, 22, 'EV GANADO', fmtMoney(evm.ev), 'costo ejecutado', [34, 197, 94]); cx += cw + 4;
    drawKpiCard(pdf, cx, y, cw, 22, 'SV (BRECHA)', `${evm.sv >= 0 ? '+' : ''}${fmtMoney(evm.sv)}`, evm.sv >= 0 ? 'a favor' : 'en contra', svColor); cx += cw + 4;
    drawKpiCard(pdf, cx, y, cw, 22, 'EAC PROYECTADO', fmtMoney(evm.eac), `BAC ${fmtMoney(evm.bac)}`, [110, 130, 150]);
    y += 26;

    y = drawSection(pdf, y, 'Curva S · avance físico ponderado por costo');
    drawCurveS(pdf, MARGIN, y, A4W - 2 * MARGIN, 60,
        lobSeries?.histogram, lobSeries?.curveSPlan, lobSeries?.curveSReal,
        simulationState?.date?.getTime(), lobSeries?.domain);
    y += 64;

    y = drawSection(pdf, y, `Alertas (${(lobSeries?.alerts || []).length})`);
    const alerts = (lobSeries?.alerts || []).slice(0, 8);
    if (alerts.length === 0) {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(120, 130, 140);
        pdf.text('Sin alertas activas.', MARGIN + 3, y + 4);
    } else {
        drawTable(pdf, MARGIN, y, A4W - 2 * MARGIN, [
            { label: 'Sev', w: 16, value: (r) => r.severity.toUpperCase(), color: (r) => r.severity === 'critical' ? [239, 68, 68] : r.severity === 'high' ? [249, 115, 22] : [234, 179, 8] },
            { label: 'Tipo', w: 22, value: (r) => r.kind.toUpperCase() },
            { label: 'Alerta', w: 145, value: (r) => trunc(r.title, 90) },
            { label: 'Detalle', w: 90, value: (r) => trunc(r.hint || '', 55) },
        ], alerts);
    }

    drawFooter(pdf, 1, totalPages);

    // ── PÁGINA 2: Look-ahead ejecutivo ─────────────────────────────────
    pdf.addPage();
    drawHeader(pdf, `${projectName} · Look-ahead ejecutivo`, `Ventana: 2 semanas · Datos al ${simulationState?.dateLabel || fmtDate(simulationState?.date?.getTime())}`);

    y = 28;
    const la = lobSeries?.lookahead;
    const colW = (A4W - 2 * MARGIN - 8) / 3;

    // columna 1: Atrasos críticos
    y = drawSection(pdf, y, `🔴 Atrasos críticos (${la?.criticalLate?.length || 0}) — ordenados por impacto`);
    if (la?.criticalLate?.length) {
        drawTable(pdf, MARGIN, y, A4W - 2 * MARGIN, [
            { label: 'Código', w: 30, value: (r) => r.codigo },
            { label: 'Descripción', w: 90, value: (r) => trunc(r.descripcion, 55) },
            { label: 'Zona', w: 22, value: (r) => r.zone || '—' },
            { label: 'Fin plan', w: 24, value: (r) => fmtShort(r.finish) },
            { label: '%real', w: 18, value: (r) => `${r.realPct.toFixed(0)}%`, align: 'right' },
            { label: 'Atraso', w: 22, value: (r) => `${r.deltaDays ?? '?'}d`, align: 'right', color: () => [239, 68, 68] },
            { label: 'S/ impacto', w: 34, value: (r) => fmtMoney(r.impact), align: 'right' },
            { label: 'S/ contrat.', w: 34, value: (r) => fmtMoney(r.cost), align: 'right' },
        ], la.criticalLate);
        y += la.criticalLate.length * 5.5 + 10;
    } else {
        pdf.setFontSize(9); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(120, 130, 140);
        pdf.text('Sin atrasos críticos.', MARGIN + 3, y + 4); y += 8;
    }

    // Próximos arranques
    y = drawSection(pdf, y, `🔵 Próximos arranques ≤ 14 días (${la?.upcoming2w?.length || 0})`);
    if (la?.upcoming2w?.length) {
        drawTable(pdf, MARGIN, y, colW * 1.5 + 4, [
            { label: 'Código', w: 26, value: (r) => r.codigo },
            { label: 'Descripción', w: 95, value: (r) => trunc(r.descripcion, 60) },
            { label: 'Inicio', w: 24, value: (r) => fmtShort(r.start) },
            { label: 'S/', w: 24, value: (r) => fmtMoney(r.cost), align: 'right' },
        ], la.upcoming2w);
    }
    // Cierres próximos (columna derecha)
    const xR = MARGIN + colW * 1.5 + 8;
    let yR = y;
    pdf.setFillColor(240, 244, 248);
    pdf.rect(xR, yR - 8, (A4W - MARGIN) - xR, 6, 'F');
    pdf.setTextColor(15, 30, 45); pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
    pdf.text(`🟢 Cierres próximos ≤ 14 días (${la?.closing2w?.length || 0})`, xR + 3, yR - 3.7);
    if (la?.closing2w?.length) {
        drawTable(pdf, xR, yR, (A4W - MARGIN) - xR, [
            { label: 'Código', w: 26, value: (r) => r.codigo },
            { label: 'Descripción', w: 78, value: (r) => trunc(r.descripcion, 50) },
            { label: 'Fin', w: 22, value: (r) => fmtShort(r.finish) },
            { label: '%real', w: 18, value: (r) => `${r.realPct.toFixed(0)}%`, align: 'right' },
            { label: 'S/', w: 22, value: (r) => fmtMoney(r.cost), align: 'right' },
        ], la.closing2w);
    }

    drawFooter(pdf, 2, totalPages);

    return pdf;
};
