import { TRANSPARENT } from '../constants.js';

export class Renderer {
    constructor(doc) {
        this.doc = doc;
        this._imageData = null;
    }

    composite() {
        const { width, height, palette, layers } = this.doc;

        if (!this._imageData || this._imageData.width !== width || this._imageData.height !== height) {
            this._imageData = new ImageData(width, height);
        }

        const buf = this._imageData.data;
        buf.fill(0);

        // Composite layers bottom-to-top, respecting per-layer offset and size
        for (const layer of layers) {
            if (!layer.visible) continue;

            // Text layer: render via canvas API
            if (layer.type === 'text' && layer.textData) {
                this._compositeTextLayer(layer, palette, buf, width, height);
                continue;
            }

            // Intersection of layer rect and document rect
            const lx0 = Math.max(0, layer.offsetX);
            const ly0 = Math.max(0, layer.offsetY);
            const lx1 = Math.min(width, layer.offsetX + layer.width);
            const ly1 = Math.min(height, layer.offsetY + layer.height);

            const layerData = layer.data;
            const layerW = layer.width;
            const layerOx = layer.offsetX;
            const layerOy = layer.offsetY;

            const opacity = layer.opacity !== undefined ? layer.opacity : 1;

            for (let dy = ly0; dy < ly1; dy++) {
                const localY = dy - layerOy;
                const localRowStart = localY * layerW - layerOx;
                const docRowStart = dy * width;
                for (let dx = lx0; dx < lx1; dx++) {
                    const colorIndex = layerData[localRowStart + dx];
                    if (colorIndex === TRANSPARENT) continue;
                    const [r, g, b] = palette.getColor(colorIndex);
                    const off = (docRowStart + dx) * 4;
                    if (opacity >= 1) {
                        buf[off] = r;
                        buf[off + 1] = g;
                        buf[off + 2] = b;
                        buf[off + 3] = 255;
                    } else {
                        // Blend with background using palette
                        const br = buf[off + 3] ? buf[off] : 0;
                        const bg = buf[off + 3] ? buf[off + 1] : 0;
                        const bb = buf[off + 3] ? buf[off + 2] : 0;
                        const mr = Math.round(r * opacity + br * (1 - opacity));
                        const mg = Math.round(g * opacity + bg * (1 - opacity));
                        const mb = Math.round(b * opacity + bb * (1 - opacity));
                        // Find nearest palette color
                        let bestDist = Infinity, bestIdx = 0;
                        const colors = palette.colors;
                        for (let j = 0; j < 256; j++) {
                            const [pr, pg, pb] = colors[j];
                            const dist = (mr - pr) ** 2 + (mg - pg) ** 2 + (mb - pb) ** 2;
                            if (dist < bestDist) { bestDist = dist; bestIdx = j; }
                            if (dist === 0) break;
                        }
                        const [fr, fg, fb] = colors[bestIdx];
                        buf[off] = fr;
                        buf[off + 1] = fg;
                        buf[off + 2] = fb;
                        buf[off + 3] = 255;
                    }
                }
            }
        }

        // Render floating selection on top
        const sel = this.doc.selection;
        if (sel && sel.hasFloating()) {
            const f = sel.floating;
            const t = sel.floatingTransform;

            if (t) {
                // Transform-aware rendering (Free Transform mode)
                const cos = Math.cos(t.rotation);
                const sin = Math.sin(t.rotation);
                const invCos = Math.cos(-t.rotation);
                const invSin = Math.sin(-t.rotation);
                const invSx = 1 / t.sx;
                const invSy = 1 / t.sy;

                // Compute AABB of transformed floating rect
                const corners = [
                    [f.originX, f.originY],
                    [f.originX + f.width, f.originY],
                    [f.originX + f.width, f.originY + f.height],
                    [f.originX, f.originY + f.height],
                ];
                let aMinX = Infinity, aMinY = Infinity, aMaxX = -Infinity, aMaxY = -Infinity;
                for (const [cx, cy] of corners) {
                    const dx = (cx - t.cx) * t.sx;
                    const dy = (cy - t.cy) * t.sy;
                    const rx = t.cx + t.tx + dx * cos - dy * sin;
                    const ry = t.cy + t.ty + dx * sin + dy * cos;
                    if (rx < aMinX) aMinX = rx;
                    if (rx > aMaxX) aMaxX = rx;
                    if (ry < aMinY) aMinY = ry;
                    if (ry > aMaxY) aMaxY = ry;
                }
                const x0 = Math.max(0, Math.floor(aMinX));
                const y0 = Math.max(0, Math.floor(aMinY));
                const x1 = Math.min(width - 1, Math.ceil(aMaxX));
                const y1 = Math.min(height - 1, Math.ceil(aMaxY));

                for (let docY = y0; docY <= y1; docY++) {
                    for (let docX = x0; docX <= x1; docX++) {
                        const rx = docX - t.cx - t.tx;
                        const ry = docY - t.cy - t.ty;
                        const urx = rx * invCos - ry * invSin;
                        const ury = rx * invSin + ry * invCos;
                        const srcX = Math.round(urx * invSx + t.cx) - f.originX;
                        const srcY = Math.round(ury * invSy + t.cy) - f.originY;
                        if (srcX < 0 || srcX >= f.width || srcY < 0 || srcY >= f.height) continue;
                        if (!f.mask[srcY * f.width + srcX]) continue;
                        const colorIndex = f.data[srcY * f.width + srcX];
                        if (colorIndex === TRANSPARENT) continue;
                        const [r, g, b] = palette.getColor(colorIndex);
                        const off = (docY * width + docX) * 4;
                        buf[off] = r;
                        buf[off + 1] = g;
                        buf[off + 2] = b;
                        buf[off + 3] = 255;
                    }
                }
            } else {
                // Fast path: no transform
                for (let fy = 0; fy < f.height; fy++) {
                    for (let fx = 0; fx < f.width; fx++) {
                        if (!f.mask[fy * f.width + fx]) continue;
                        const colorIndex = f.data[fy * f.width + fx];
                        if (colorIndex === TRANSPARENT) continue;
                        const docX = f.originX + fx;
                        const docY = f.originY + fy;
                        if (docX < 0 || docX >= width || docY < 0 || docY >= height) continue;
                        const [r, g, b] = palette.getColor(colorIndex);
                        const off = (docY * width + docX) * 4;
                        buf[off] = r;
                        buf[off + 1] = g;
                        buf[off + 2] = b;
                        buf[off + 3] = 255;
                    }
                }
            }
        }

        return this._imageData;
    }

    _compositeTextLayer(layer, palette, buf, docW, docH) {
        const td = layer.textData;
        const [r, g, b] = palette.getColor(td.colorIndex);

        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = docW;
        tmpCanvas.height = docH;
        const ctx = tmpCanvas.getContext('2d');

        const style = (td.italic ? 'italic ' : '') + (td.bold ? 'bold ' : '');
        ctx.font = `${style}${td.fontSize}px ${td.fontFamily}`;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.textBaseline = 'top';

        const lines = td.text.split('\n');
        const lineHeight = Math.round(td.fontSize * 1.2);
        for (let li = 0; li < lines.length; li++) {
            const ty = layer.offsetY + li * lineHeight;
            ctx.fillText(lines[li], layer.offsetX, ty);
            if (td.underline) {
                const metrics = ctx.measureText(lines[li]);
                ctx.fillRect(layer.offsetX, ty + td.fontSize, metrics.width, 1);
            }
        }

        const tmpData = ctx.getImageData(0, 0, docW, docH).data;
        const layerOpacity = layer.opacity !== undefined ? layer.opacity : 1;
        if (td.antialiased) {
            // Map anti-aliased pixels to nearest palette color
            const colors = palette.colors;
            for (let i = 0; i < docW * docH; i++) {
                const off = i * 4;
                const a = tmpData[off + 3];
                if (a < 8) continue;
                // Blend text color with existing background, factoring in layer opacity
                const alpha = (a / 255) * layerOpacity;
                const br = buf[off + 3] ? buf[off] : 0;
                const bg = buf[off + 3] ? buf[off + 1] : 0;
                const bb = buf[off + 3] ? buf[off + 2] : 0;
                const mr = Math.round(r * alpha + br * (1 - alpha));
                const mg = Math.round(g * alpha + bg * (1 - alpha));
                const mb = Math.round(b * alpha + bb * (1 - alpha));
                // Find nearest palette color
                let bestDist = Infinity, bestIdx = 0;
                for (let j = 0; j < 256; j++) {
                    const [pr, pg, pb] = colors[j];
                    const dist = (mr - pr) ** 2 + (mg - pg) ** 2 + (mb - pb) ** 2;
                    if (dist < bestDist) { bestDist = dist; bestIdx = j; }
                    if (dist === 0) break;
                }
                const [fr, fg, fb] = colors[bestIdx];
                buf[off] = fr;
                buf[off + 1] = fg;
                buf[off + 2] = fb;
                buf[off + 3] = 255;
            }
        } else {
            const colors = palette.colors;
            for (let i = 0; i < docW * docH; i++) {
                const off = i * 4;
                if (tmpData[off + 3] < 128) continue;
                if (layerOpacity >= 1) {
                    buf[off] = r;
                    buf[off + 1] = g;
                    buf[off + 2] = b;
                    buf[off + 3] = 255;
                } else {
                    const br = buf[off + 3] ? buf[off] : 0;
                    const bg = buf[off + 3] ? buf[off + 1] : 0;
                    const bb = buf[off + 3] ? buf[off + 2] : 0;
                    const mr = Math.round(r * layerOpacity + br * (1 - layerOpacity));
                    const mg = Math.round(g * layerOpacity + bg * (1 - layerOpacity));
                    const mb = Math.round(b * layerOpacity + bb * (1 - layerOpacity));
                    let bestDist = Infinity, bestIdx = 0;
                    for (let j = 0; j < 256; j++) {
                        const [pr, pg, pb] = colors[j];
                        const dist = (mr - pr) ** 2 + (mg - pg) ** 2 + (mb - pb) ** 2;
                        if (dist < bestDist) { bestDist = dist; bestIdx = j; }
                        if (dist === 0) break;
                    }
                    const [fr, fg, fb] = colors[bestIdx];
                    buf[off] = fr;
                    buf[off + 1] = fg;
                    buf[off + 2] = fb;
                    buf[off + 3] = 255;
                }
            }
        }
    }
}
