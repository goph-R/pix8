import { TRANSPARENT } from '../constants.js';

export class Selection {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.mask = new Uint8Array(width * height);
        this.active = false;
        this.floating = null; // { data, mask, width, height, originX, originY }
        this.floatingTransform = null; // set by FreeTransformTool
        this._resizeSource = null; // { mask, minX, minY, w, h }
        this._pureShape = null; // 'rect' or 'ellipse' if unmodified
    }

    clear() {
        this.active = false;
        this.mask.fill(0);
        this.floating = null;
        this.floatingTransform = null;
        this._resizeSource = null;
        this._pureShape = null;
    }

    isSelected(docX, docY) {
        if (docX < 0 || docX >= this.width || docY < 0 || docY >= this.height) return false;
        return this.mask[docY * this.width + docX] === 1;
    }

    _clampBounds(x0, y0, x1, y1) {
        return {
            minX: Math.max(0, Math.min(x0, x1)),
            minY: Math.max(0, Math.min(y0, y1)),
            maxX: Math.min(this.width - 1, Math.max(x0, x1)),
            maxY: Math.min(this.height - 1, Math.max(y0, y1)),
        };
    }

    _forEachEllipsePixel(minX, minY, maxX, maxY, callback) {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const rx = (maxX - minX) / 2;
        const ry = (maxY - minY) / 2;
        if (rx <= 0 || ry <= 0) return;
        // +0.5 ensures edge pixels at the exact boundary are included
        const erx = rx + 0.5;
        const ery = ry + 0.5;
        // Clamp iteration to document bounds (ellipse may extend off-canvas)
        const iterMinX = Math.max(0, minX);
        const iterMinY = Math.max(0, minY);
        const iterMaxX = Math.min(this.width - 1, maxX);
        const iterMaxY = Math.min(this.height - 1, maxY);
        for (let y = iterMinY; y <= iterMaxY; y++) {
            for (let x = iterMinX; x <= iterMaxX; x++) {
                const dx = (x - cx) / erx;
                const dy = (y - cy) / ery;
                if (dx * dx + dy * dy <= 1) {
                    callback(x, y);
                }
            }
        }
    }

    _setMaskRect(minX, minY, maxX, maxY, value) {
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                this.mask[y * this.width + x] = value;
            }
        }
    }

    selectRect(x0, y0, x1, y1) {
        this._resizeSource = null;
        this._pureShape = 'rect';
        this.mask.fill(0);
        const { minX, minY, maxX, maxY } = this._clampBounds(x0, y0, x1, y1);
        this._setMaskRect(minX, minY, maxX, maxY, 1);
        this.active = true;
    }

    selectEllipse(x0, y0, x1, y1) {
        this._resizeSource = null;
        this._pureShape = 'ellipse';
        this.mask.fill(0);
        const minX = Math.min(x0, x1), minY = Math.min(y0, y1);
        const maxX = Math.max(x0, x1), maxY = Math.max(y0, y1);
        this._forEachEllipsePixel(minX, minY, maxX, maxY, (x, y) => {
            this.mask[y * this.width + x] = 1;
        });
        this.active = true;
    }

    addRect(x0, y0, x1, y1) {
        this._resizeSource = null;
        this._pureShape = null;
        const { minX, minY, maxX, maxY } = this._clampBounds(x0, y0, x1, y1);
        this._setMaskRect(minX, minY, maxX, maxY, 1);
        this.active = true;
    }

    subtractRect(x0, y0, x1, y1) {
        this._resizeSource = null;
        this._pureShape = null;
        const { minX, minY, maxX, maxY } = this._clampBounds(x0, y0, x1, y1);
        this._setMaskRect(minX, minY, maxX, maxY, 0);
        if (!this.mask.includes(1)) {
            this.active = false;
        }
    }

    addEllipse(x0, y0, x1, y1) {
        this._resizeSource = null;
        this._pureShape = null;
        const minX = Math.min(x0, x1), minY = Math.min(y0, y1);
        const maxX = Math.max(x0, x1), maxY = Math.max(y0, y1);
        this._forEachEllipsePixel(minX, minY, maxX, maxY, (x, y) => {
            this.mask[y * this.width + x] = 1;
        });
        this.active = true;
    }

    subtractEllipse(x0, y0, x1, y1) {
        this._resizeSource = null;
        this._pureShape = null;
        const minX = Math.min(x0, x1), minY = Math.min(y0, y1);
        const maxX = Math.max(x0, x1), maxY = Math.max(y0, y1);
        this._forEachEllipsePixel(minX, minY, maxX, maxY, (x, y) => {
            this.mask[y * this.width + x] = 0;
        });
        if (!this.mask.includes(1)) {
            this.active = false;
        }
    }

    selectAll() {
        this._resizeSource = null;
        this._pureShape = null;
        this.mask.fill(1);
        this.active = true;
    }

    getBounds() {
        let minX = this.width, minY = this.height, maxX = -1, maxY = -1;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.mask[y * this.width + x]) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return null;
        return { minX, minY, maxX, maxY };
    }

    hasFloating() {
        return this.floating !== null;
    }

    liftPixels(layer) {
        if (this.floating) return; // already lifted
        const bounds = this.getBounds();
        if (!bounds) return;

        const { minX, minY, maxX, maxY } = bounds;
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        const data = new Uint16Array(w * h);
        const fMask = new Uint8Array(w * h);
        data.fill(TRANSPARENT);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const docX = minX + x;
                const docY = minY + y;
                if (!this.mask[docY * this.width + docX]) continue;
                data[y * w + x] = layer.getPixelDoc(docX, docY);
                fMask[y * w + x] = 1;
                // Cut from layer
                const lx = docX - layer.offsetX;
                const ly = docY - layer.offsetY;
                if (lx >= 0 && lx < layer.width && ly >= 0 && ly < layer.height) {
                    layer.setPixel(lx, ly, TRANSPARENT);
                }
            }
        }

        this.floating = {
            data, mask: fMask, width: w, height: h,
            originX: minX, originY: minY
        };
    }

    copyPixels(layer) {
        const source = this.hasFloating() ? this.floating : null;
        if (source) {
            return {
                data: new Uint16Array(source.data),
                mask: new Uint8Array(source.mask),
                width: source.width,
                height: source.height,
                originX: source.originX,
                originY: source.originY
            };
        }
        const bounds = this.getBounds();
        if (!bounds) return null;

        const { minX, minY, maxX, maxY } = bounds;
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        const data = new Uint16Array(w * h);
        const fMask = new Uint8Array(w * h);
        data.fill(TRANSPARENT);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const docX = minX + x;
                const docY = minY + y;
                if (!this.mask[docY * this.width + docX]) continue;
                data[y * w + x] = layer.getPixelDoc(docX, docY);
                fMask[y * w + x] = 1;
            }
        }
        return { data, mask: fMask, width: w, height: h, originX: minX, originY: minY };
    }

    copyPixelsMerged(layers) {
        const bounds = this.hasFloating() ? this._floatingBounds() : this.getBounds();
        if (!bounds) return null;

        const { minX, minY, maxX, maxY } = bounds;
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        const data = new Uint16Array(w * h);
        const fMask = new Uint8Array(w * h);
        data.fill(TRANSPARENT);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const docX = minX + x;
                const docY = minY + y;
                const inSelection = this.hasFloating()
                    ? this._floatingHit(x, y)
                    : this.mask[docY * this.width + docX];
                if (!inSelection) continue;
                // Composite visible layers bottom-to-top
                let color = TRANSPARENT;
                for (const layer of layers) {
                    if (!layer.visible) continue;
                    const px = layer.getPixelDoc(docX, docY);
                    if (px !== TRANSPARENT) color = px;
                }
                data[y * w + x] = color;
                fMask[y * w + x] = 1;
            }
        }
        return { data, mask: fMask, width: w, height: h, originX: minX, originY: minY };
    }

    _floatingBounds() {
        if (!this.floating) return null;
        const f = this.floating;
        return { minX: f.originX, minY: f.originY, maxX: f.originX + f.width - 1, maxY: f.originY + f.height - 1 };
    }

    _floatingHit(localX, localY) {
        const f = this.floating;
        return f && localX >= 0 && localX < f.width && localY >= 0 && localY < f.height && f.mask[localY * f.width + localX];
    }

    saveResizeSource() {
        if (this._resizeSource) return; // keep original across multiple resizes
        const bounds = this.getBounds();
        if (!bounds) { this._resizeSource = null; return; }
        const { minX, minY, maxX, maxY } = bounds;
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        const mask = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                mask[y * w + x] = this.mask[(minY + y) * this.width + (minX + x)];
            }
        }
        this._resizeSource = { mask, minX, minY, w, h };
    }

    applyResize(newMinX, newMinY, newMaxX, newMaxY) {
        if (this._pureShape === 'rect') {
            this.mask.fill(0);
            this._pureShape = 'rect'; // preserve through the fill(0)
            const { minX, minY, maxX, maxY } = this._clampBounds(newMinX, newMinY, newMaxX, newMaxY);
            this._setMaskRect(minX, minY, maxX, maxY, 1);
            this.active = maxX >= minX && maxY >= minY;
            return;
        }

        if (this._pureShape === 'ellipse') {
            this.mask.fill(0);
            this._pureShape = 'ellipse';
            // Pass unclamped bounds — _forEachEllipsePixel clamps iteration internally
            this._forEachEllipsePixel(newMinX, newMinY, newMaxX, newMaxY, (x, y) => {
                this.mask[y * this.width + x] = 1;
            });
            this.active = true;
            return;
        }

        // Complex shape: scale source mask via nearest-neighbor
        const src = this._resizeSource;
        if (!src) return;
        const nw = newMaxX - newMinX + 1;
        const nh = newMaxY - newMinY + 1;
        if (nw <= 0 || nh <= 0) return;

        this.mask.fill(0);
        for (let y = 0; y < nh; y++) {
            for (let x = 0; x < nw; x++) {
                const docX = newMinX + x;
                const docY = newMinY + y;
                if (docX < 0 || docX >= this.width || docY < 0 || docY >= this.height) continue;
                const sx = Math.floor(x * src.w / nw);
                const sy = Math.floor(y * src.h / nh);
                if (src.mask[sy * src.w + sx]) {
                    this.mask[docY * this.width + docX] = 1;
                }
            }
        }
        this.active = this.mask.includes(1);
    }

    moveMask(dx, dy) {
        this._resizeSource = null;
        this._pureShape = null;
        if (dx === 0 && dy === 0) return;
        const { width, height, mask } = this;
        const newMask = new Uint8Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!mask[y * width + x]) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    newMask[ny * width + nx] = 1;
                }
            }
        }
        this.mask = newMask;
    }

    moveFloating(newOriginX, newOriginY) {
        if (!this.floating) return;
        this.floating.originX = newOriginX;
        this.floating.originY = newOriginY;
    }

    commitFloating(layer) {
        if (!this.floating) return;
        const f = this.floating;
        const docW = this.width;
        const docH = this.height;

        for (let y = 0; y < f.height; y++) {
            for (let x = 0; x < f.width; x++) {
                if (!f.mask[y * f.width + x]) continue;
                const colorIndex = f.data[y * f.width + x];
                if (colorIndex === TRANSPARENT) continue;
                const docX = f.originX + x;
                const docY = f.originY + y;
                if (docX < 0 || docX >= docW || docY < 0 || docY >= docH) continue;
                layer.setPixelAutoExtend(docX, docY, colorIndex);
            }
        }

        // Update mask to reflect new position
        this.mask.fill(0);
        for (let y = 0; y < f.height; y++) {
            for (let x = 0; x < f.width; x++) {
                if (!f.mask[y * f.width + x]) continue;
                const docX = f.originX + x;
                const docY = f.originY + y;
                if (docX >= 0 && docX < docW && docY >= 0 && docY < docH) {
                    this.mask[docY * docW + docX] = 1;
                }
            }
        }

        this.floating = null;
        this._resizeSource = null;
        this._pureShape = null;
    }

    snapshot() {
        const snap = {
            mask: new Uint8Array(this.mask),
            active: this.active,
            pureShape: this._pureShape,
            floating: null,
        };
        if (this.floating) {
            const f = this.floating;
            snap.floating = {
                data: new Uint16Array(f.data),
                mask: new Uint8Array(f.mask),
                width: f.width, height: f.height,
                originX: f.originX, originY: f.originY,
            };
        }
        return snap;
    }

    restoreSnapshot(snap) {
        this.mask = new Uint8Array(snap.mask);
        this.active = snap.active;
        this._pureShape = snap.pureShape;
        this._resizeSource = null;
        if (snap.floating) {
            const f = snap.floating;
            this.floating = {
                data: new Uint16Array(f.data),
                mask: new Uint8Array(f.mask),
                width: f.width, height: f.height,
                originX: f.originX, originY: f.originY,
            };
        } else {
            this.floating = null;
        }
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        this.mask = new Uint8Array(width * height);
        this.active = false;
        this.floating = null;
    }
}
