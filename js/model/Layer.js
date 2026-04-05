import { TRANSPARENT } from '../constants.js';

const GROWTH_PADDING = 16;

export class Layer {
    constructor(name, width, height) {
        this.name = name;
        this.width = width;
        this.height = height;
        this.offsetX = 0;
        this.offsetY = 0;
        this.visible = true;
        this.locked = false;
        this.opacity = 1.0;      // 0.0 - 1.0
        this.type = 'raster';    // 'raster' or 'text'
        this.textData = null;    // { text, fontFamily, fontSize, bold, italic, underline, colorIndex }
        // Uint16Array so we can store 0-255 (valid palette) + 256 (transparent)
        this.data = new Uint16Array(width * height);
        this.data.fill(TRANSPARENT);
    }

    // --- Layer-local coordinate access ---

    getPixel(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return TRANSPARENT;
        return this.data[y * this.width + x];
    }

    setPixel(x, y, colorIndex) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        this.data[y * this.width + x] = colorIndex;
    }

    // --- Document-coordinate access ---

    getPixelDoc(docX, docY) {
        return this.getPixel(docX - this.offsetX, docY - this.offsetY);
    }

    setPixelAutoExtend(docX, docY, colorIndex) {
        const lx = docX - this.offsetX;
        const ly = docY - this.offsetY;
        if (lx >= 0 && lx < this.width && ly >= 0 && ly < this.height) {
            // Fast path: inside current bounds
            this.data[ly * this.width + lx] = colorIndex;
            return;
        }
        // Need to grow
        this._grow(docX, docY);
        const lx2 = docX - this.offsetX;
        const ly2 = docY - this.offsetY;
        this.data[ly2 * this.width + lx2] = colorIndex;
    }

    /**
     * Ensure the layer covers the given document-space rectangle.
     * Call before a batch of setPixelAutoExtend calls to avoid multiple reallocations.
     */
    ensureRect(docX0, docY0, docX1, docY1) {
        const curLeft = this.offsetX;
        const curTop = this.offsetY;
        const curRight = this.offsetX + this.width;
        const curBottom = this.offsetY + this.height;

        if (docX0 >= curLeft && docY0 >= curTop && docX1 < curRight && docY1 < curBottom) {
            return; // already covered
        }

        const newLeft = Math.min(curLeft, docX0 - GROWTH_PADDING);
        const newTop = Math.min(curTop, docY0 - GROWTH_PADDING);
        const newRight = Math.max(curRight, docX1 + 1 + GROWTH_PADDING);
        const newBottom = Math.max(curBottom, docY1 + 1 + GROWTH_PADDING);

        this._resize(newLeft, newTop, newRight - newLeft, newBottom - newTop);
    }

    // --- Internal growth ---

    _grow(docX, docY) {
        const curLeft = this.offsetX;
        const curTop = this.offsetY;
        const curRight = this.offsetX + this.width;
        const curBottom = this.offsetY + this.height;

        const newLeft = Math.min(curLeft, docX - GROWTH_PADDING);
        const newTop = Math.min(curTop, docY - GROWTH_PADDING);
        const newRight = Math.max(curRight, docX + 1 + GROWTH_PADDING);
        const newBottom = Math.max(curBottom, docY + 1 + GROWTH_PADDING);

        this._resize(newLeft, newTop, newRight - newLeft, newBottom - newTop);
    }

    _resize(newOffsetX, newOffsetY, newWidth, newHeight) {
        const newData = new Uint16Array(newWidth * newHeight);
        newData.fill(TRANSPARENT);

        // Blit old data into new buffer
        const srcOffX = this.offsetX - newOffsetX;
        const srcOffY = this.offsetY - newOffsetY;
        for (let y = 0; y < this.height; y++) {
            const srcStart = y * this.width;
            const dstStart = (y + srcOffY) * newWidth + srcOffX;
            newData.set(this.data.subarray(srcStart, srcStart + this.width), dstStart);
        }

        this.data = newData;
        this.width = newWidth;
        this.height = newHeight;
        this.offsetX = newOffsetX;
        this.offsetY = newOffsetY;
    }

    // --- Utility ---

    clear() {
        this.data.fill(TRANSPARENT);
    }

    clone() {
        const copy = new Layer(this.name + ' copy', this.width, this.height);
        copy.offsetX = this.offsetX;
        copy.offsetY = this.offsetY;
        copy.visible = this.visible;
        copy.locked = this.locked;
        copy.opacity = this.opacity;
        copy.type = this.type;
        copy.textData = this.textData ? { ...this.textData } : null;
        copy.data.set(this.data);
        return copy;
    }

    snapshotData() {
        return {
            data: this.data.slice(),
            type: this.type,
            textData: this.textData ? { ...this.textData } : null,
        };
    }

    snapshotGeometry() {
        return {
            width: this.width,
            height: this.height,
            offsetX: this.offsetX,
            offsetY: this.offsetY,
        };
    }

    restoreSnapshot(snapshot, geometry) {
        this.width = geometry.width;
        this.height = geometry.height;
        this.offsetX = geometry.offsetX;
        this.offsetY = geometry.offsetY;
        if (snapshot instanceof Uint16Array || ArrayBuffer.isView(snapshot)) {
            // Legacy format: raw data array
            this.data = snapshot.slice();
        } else {
            // New format: { data, type, textData }
            this.data = snapshot.data.slice();
            this.type = snapshot.type || 'raster';
            this.textData = snapshot.textData ? { ...snapshot.textData } : null;
        }
    }

    static createText(name, textData, docWidth, docHeight) {
        const layer = new Layer(name, docWidth, docHeight);
        layer.type = 'text';
        layer.textData = { ...textData };
        return layer;
    }
}
