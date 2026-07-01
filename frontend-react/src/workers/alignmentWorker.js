/**
 * Alignment Math Web Worker
 * Arquitectura 4D LOB - Vertex Attribute Baking
 *
 * Recibe vertices 3D y la definicion matematica de un alineamiento civil.
 * Calcula la progresiva (PK) mas cercana sin bloquear el hilo principal.
 */

function computeAABB(segment, tolerance = 10.0) {
    let minX, minY, maxX, maxY;

    if (segment.type === 'line') {
        minX = Math.min(segment.startPoint.x, segment.endPoint.x);
        maxX = Math.max(segment.startPoint.x, segment.endPoint.x);
        minY = Math.min(segment.startPoint.y, segment.endPoint.y);
        maxY = Math.max(segment.startPoint.y, segment.endPoint.y);
    } else if (segment.type === 'arc') {
        if (segment.center && segment.radius) {
            minX = segment.center.x - segment.radius;
            maxX = segment.center.x + segment.radius;
            minY = segment.center.y - segment.radius;
            maxY = segment.center.y + segment.radius;
        } else {
            minX = Math.min(segment.startPoint.x, segment.endPoint.x);
            maxX = Math.max(segment.startPoint.x, segment.endPoint.x);
            minY = Math.min(segment.startPoint.y, segment.endPoint.y);
            maxY = Math.max(segment.startPoint.y, segment.endPoint.y);
        }
    } else {
        minX = Math.min(segment.startPoint.x, segment.endPoint.x);
        maxX = Math.max(segment.startPoint.x, segment.endPoint.x);
        minY = Math.min(segment.startPoint.y, segment.endPoint.y);
        maxY = Math.max(segment.startPoint.y, segment.endPoint.y);
    }

    return {
        minX: minX - tolerance,
        maxX: maxX + tolerance,
        minY: minY - tolerance,
        maxY: maxY + tolerance
    };
}

function projectPointOnLine(px, py, segment) {
    const P0 = segment.startPoint;
    const P1 = segment.endPoint;
    const dx = P1.x - P0.x;
    const dy = P1.y - P0.y;
    const L2 = dx * dx + dy * dy;

    if (L2 === 0) return { t: 0, distance: Math.hypot(px - P0.x, py - P0.y) };

    let t = ((px - P0.x) * dx + (py - P0.y) * dy) / L2;
    t = Math.max(0, Math.min(1, t));

    const projX = P0.x + t * dx;
    const projY = P0.y + t * dy;

    return {
        t,
        distance: Math.hypot(px - projX, py - projY)
    };
}

function normalizeAngle(angle) {
    const full = 2 * Math.PI;
    let result = angle % full;
    if (result < 0) result += full;
    return result;
}

function angleTravel(fromAngle, toAngle, clockwise) {
    const from = normalizeAngle(fromAngle);
    const to = normalizeAngle(toAngle);
    return clockwise ? normalizeAngle(from - to) : normalizeAngle(to - from);
}

function projectPointOnArc(px, py, segment) {
    if (!segment.center || !segment.radius) {
        return projectPointOnLine(px, py, segment);
    }

    const C = segment.center;
    const R = segment.radius;
    const clockwise = segment.clockwise === true;

    const angleToPoint = Math.atan2(py - C.y, px - C.x);
    const startAngle = segment.startAngle || 0;
    const endAngle = segment.endAngle || 0;
    const totalSweep = Math.abs(segment.sweepAngle || angleTravel(startAngle, endAngle, clockwise));
    const pointSweep = angleTravel(startAngle, angleToPoint, clockwise);
    const isInside = pointSweep <= totalSweep;

    let t = 0;
    let projX;
    let projY;

    if (isInside) {
        projX = C.x + R * Math.cos(angleToPoint);
        projY = C.y + R * Math.sin(angleToPoint);
        t = totalSweep > 0 ? pointSweep / totalSweep : 0;
    } else {
        const dStart = Math.hypot(
            px - (C.x + R * Math.cos(startAngle)),
            py - (C.y + R * Math.sin(startAngle))
        );
        const dEnd = Math.hypot(
            px - (C.x + R * Math.cos(endAngle)),
            py - (C.y + R * Math.sin(endAngle))
        );

        if (dStart < dEnd) {
            t = 0;
            projX = C.x + R * Math.cos(startAngle);
            projY = C.y + R * Math.sin(startAngle);
        } else {
            t = 1;
            projX = C.x + R * Math.cos(endAngle);
            projY = C.y + R * Math.sin(endAngle);
        }
    }

    return {
        t,
        distance: Math.hypot(px - projX, py - projY)
    };
}

self.onmessage = function(e) {
    const { vertices, alignmentData, tolerance } = e.data;

    if (!vertices || !alignmentData) {
        self.postMessage({ error: 'Missing vertices or alignment data' });
        return;
    }

    const numVertices = vertices.length / 3;
    const pkOffsets = new Float32Array(numVertices);
    const subEntities = alignmentData.subEntities || [];
    const aabbs = subEntities.map(seg => computeAABB(seg, tolerance || 20.0));

    for (let i = 0; i < numVertices; i++) {
        const vx = vertices[i * 3];
        const vy = vertices[i * 3 + 1];

        let minDistance = Infinity;
        let bestPK = 0;

        for (let j = 0; j < subEntities.length; j++) {
            const seg = subEntities[j];
            const aabb = aabbs[j];

            if (vx < aabb.minX || vx > aabb.maxX || vy < aabb.minY || vy > aabb.maxY) {
                continue;
            }

            let result = null;
            if (seg.type === 'line') {
                result = projectPointOnLine(vx, vy, seg);
            } else if (seg.type === 'arc') {
                result = projectPointOnArc(vx, vy, seg);
            }

            if (result && result.distance < minDistance) {
                minDistance = result.distance;
                bestPK = seg.startStation + (result.t * seg.length);
            }
        }

        pkOffsets[i] = minDistance === Infinity ? 0 : bestPK;
    }

    self.postMessage({ pkOffsets }, [pkOffsets.buffer]);
};
