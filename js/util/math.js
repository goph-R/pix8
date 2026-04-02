/**
 * Snap an endpoint to the nearest 22.5-degree angle from a start point.
 */
export function snapEndpoint(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return { x: x1, y: y1 };
    const snap = 22.5 * Math.PI / 180;
    const angle = Math.round(Math.atan2(dy, dx) / snap) * snap;
    return {
        x: Math.round(x0 + dist * Math.cos(angle)),
        y: Math.round(y0 + dist * Math.sin(angle)),
    };
}

export function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
}

/**
 * Bresenham's line algorithm. Calls callback(x, y) for each pixel.
 */
export function bresenhamLine(x0, y0, x1, y1, callback) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
        callback(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
}

/**
 * Midpoint ellipse algorithm. Calls callback(x, y) for each pixel on the outline.
 */
export function ellipseOutline(cx, cy, rx, ry, callback) {
    if (rx <= 0 || ry <= 0) {
        callback(cx, cy);
        return;
    }

    const rxSq = rx * rx;
    const rySq = ry * ry;
    const twoRxSq = 2 * rxSq;
    const twoRySq = 2 * rySq;

    let x = 0;
    let y = ry;
    let px = 0;
    let py = twoRxSq * y;

    // Plot four symmetric points
    function plot4(x, y) {
        callback(cx + x, cy + y);
        callback(cx - x, cy + y);
        callback(cx + x, cy - y);
        callback(cx - x, cy - y);
    }

    // Region 1
    let p = Math.round(rySq - rxSq * ry + 0.25 * rxSq);
    while (px < py) {
        plot4(x, y);
        x++;
        px += twoRySq;
        if (p < 0) {
            p += rySq + px;
        } else {
            y--;
            py -= twoRxSq;
            p += rySq + px - py;
        }
    }

    // Region 2
    p = Math.round(rySq * (x + 0.5) * (x + 0.5) + rxSq * (y - 1) * (y - 1) - rxSq * rySq);
    while (y >= 0) {
        plot4(x, y);
        y--;
        py -= twoRxSq;
        if (p > 0) {
            p += rxSq - py;
        } else {
            x++;
            px += twoRySq;
            p += rxSq - py + px;
        }
    }
}

/**
 * Filled ellipse: calls callback(x, y) for every pixel inside.
 */
export function ellipseFilled(cx, cy, rx, ry, callback) {
    if (rx <= 0 || ry <= 0) {
        callback(cx, cy);
        return;
    }

    for (let y = -ry; y <= ry; y++) {
        // Calculate x extent for this scanline
        const xExtent = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
        for (let x = -xExtent; x <= xExtent; x++) {
            callback(cx + x, cy + y);
        }
    }
}

/**
 * Rectangle outline: calls callback(x, y) for border pixels.
 */
export function rectOutline(x0, y0, x1, y1, callback) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    for (let x = minX; x <= maxX; x++) {
        callback(x, minY);
        callback(x, maxY);
    }
    for (let y = minY + 1; y < maxY; y++) {
        callback(minX, y);
        callback(maxX, y);
    }
}

/**
 * Filled rectangle: calls callback(x, y) for every pixel inside.
 */
export function rectFilled(x0, y0, x1, y1, callback) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            callback(x, y);
        }
    }
}

/**
 * Point-in-polygon test (ray casting).
 */
export function pointInPolygon(x, y, vertices) {
    let inside = false;
    const n = vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = vertices[i][0], yi = vertices[i][1];
        const xj = vertices[j][0], yj = vertices[j][1];

        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}
