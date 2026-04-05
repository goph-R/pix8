import { Layer } from './Layer.js';
import { Palette } from './Palette.js';
import { Brush } from './Brush.js';
import { Selection } from './Selection.js';
import { TRANSPARENT } from '../constants.js';

export class ImageDocument {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.palette = new Palette();
        this.layers = [];
        this.activeLayerIndex = 0;
        this.fgColorIndex = 15; // white in VGA palette
        this.bgColorIndex = 0;  // black
        this.activeBrush = Brush.default();
        this.selection = new Selection(width, height);
        this.selectedLayerIndices = new Set([0]);

        // Animation
        this.animationEnabled = false;
        this.frames = [];
        this.activeFrameIndex = 0;

        // Start with one empty layer
        this.addLayer('Background');
    }

    getActiveLayer() {
        return this.layers[this.activeLayerIndex];
    }

    addLayer(name) {
        if (!name) {
            name = `Layer ${this.layers.length + 1}`;
        }
        const layer = new Layer(name, this.width, this.height);
        // Insert above active layer (or at 0 if empty)
        const insertIdx = this.layers.length === 0 ? 0 : this.activeLayerIndex + 1;
        this.layers.splice(insertIdx, 0, layer);
        this.activeLayerIndex = insertIdx;
        this.selectedLayerIndices.clear();
        this.selectedLayerIndices.add(insertIdx);
        return layer;
    }

    removeLayer(index) {
        if (this.layers.length <= 1) return false;
        this.layers.splice(index, 1);
        this.selectedLayerIndices.delete(index);
        // Shift down indices above the removed one
        const shifted = new Set();
        for (const idx of this.selectedLayerIndices) {
            shifted.add(idx > index ? idx - 1 : idx);
        }
        if (this.activeLayerIndex >= this.layers.length) {
            this.activeLayerIndex = this.layers.length - 1;
        }
        shifted.add(this.activeLayerIndex);
        this.selectedLayerIndices = shifted;
        return true;
    }

    moveLayer(from, to) {
        if (to < 0 || to >= this.layers.length) return false;
        const [layer] = this.layers.splice(from, 1);
        this.layers.splice(to, 0, layer);
        this.activeLayerIndex = to;
        this.selectedLayerIndices.clear();
        this.selectedLayerIndices.add(to);
        return true;
    }

    duplicateLayer(index) {
        const original = this.layers[index];
        const copy = original.clone();
        this.layers.splice(index + 1, 0, copy);
        this.activeLayerIndex = index + 1;
        this.selectedLayerIndices.clear();
        this.selectedLayerIndices.add(index + 1);
        return copy;
    }

    swapColors() {
        const tmp = this.fgColorIndex;
        this.fgColorIndex = this.bgColorIndex;
        this.bgColorIndex = tmp;
    }

    flattenToLayer() {
        const flat = new Layer('Flattened', this.width, this.height);
        // Bottom-to-top: topmost non-transparent wins, respecting layer offsets
        for (const layer of this.layers) {
            if (!layer.visible) continue;
            const lx0 = Math.max(0, layer.offsetX);
            const ly0 = Math.max(0, layer.offsetY);
            const lx1 = Math.min(this.width, layer.offsetX + layer.width);
            const ly1 = Math.min(this.height, layer.offsetY + layer.height);
            for (let dy = ly0; dy < ly1; dy++) {
                for (let dx = lx0; dx < lx1; dx++) {
                    const val = layer.data[(dy - layer.offsetY) * layer.width + (dx - layer.offsetX)];
                    if (val !== TRANSPARENT) {
                        flat.data[dy * this.width + dx] = val;
                    }
                }
            }
        }
        return flat;
    }

    getUsedColorIndices() {
        const used = new Set();
        for (const layer of this.layers) {
            if (layer.type === 'text' && layer.textData) {
                used.add(layer.textData.colorIndex);
                continue;
            }
            const data = layer.data;
            for (let i = 0; i < data.length; i++) {
                const v = data[i];
                if (v !== TRANSPARENT) used.add(v);
            }
        }
        return used;
    }

    getColorHistogram() {
        const counts = new Uint32Array(256);
        for (const layer of this.layers) {
            if (layer.type === 'text' && layer.textData) {
                counts[layer.textData.colorIndex]++;
                continue;
            }
            const data = layer.data;
            for (let i = 0; i < data.length; i++) {
                const v = data[i];
                if (v !== TRANSPARENT) counts[v]++;
            }
        }
        return counts;
    }

    remapColorIndices(mapping) {
        for (const layer of this.layers) {
            if (layer.type === 'text' && layer.textData) {
                const v = layer.textData.colorIndex;
                if (mapping[v] !== undefined) {
                    layer.textData.colorIndex = mapping[v];
                }
                continue;
            }
            const data = layer.data;
            for (let i = 0; i < data.length; i++) {
                const v = data[i];
                if (v !== TRANSPARENT && mapping[v] !== undefined) {
                    data[i] = mapping[v];
                }
            }
        }
    }

    // ── Frame Animation ──────────────────────────────────────────────

    _snapshotLayers() {
        return this.layers.map(l => ({
            data: l.data.slice(),
            opacity: l.opacity,
            textData: l.textData ? { ...l.textData } : null,
            offsetX: l.offsetX,
            offsetY: l.offsetY,
        }));
    }

    _restoreLayersFromFrame(frame) {
        for (let i = 0; i < this.layers.length && i < frame.layerData.length; i++) {
            const ld = frame.layerData[i];
            const layer = this.layers[i];
            layer.data = ld.data.slice();
            layer.opacity = ld.opacity;
            layer.textData = ld.textData ? { ...ld.textData } : null;
            layer.offsetX = ld.offsetX;
            layer.offsetY = ld.offsetY;
            // Restore dimensions from data length
            if (layer.type !== 'text') {
                const expectedSize = layer.width * layer.height;
                if (ld.data.length !== expectedSize) {
                    // Dimensions may have changed; recalculate
                    layer.width = ld.width || layer.width;
                    layer.height = ld.height || layer.height;
                }
            }
        }
    }

    saveCurrentFrame() {
        if (!this.animationEnabled || this.frames.length === 0) return;
        const frame = this.frames[this.activeFrameIndex];
        frame.layerData = this.layers.map(l => ({
            data: l.data.slice(),
            opacity: l.opacity,
            textData: l.textData ? { ...l.textData } : null,
            offsetX: l.offsetX,
            offsetY: l.offsetY,
            width: l.width,
            height: l.height,
        }));
    }

    loadFrame(index) {
        if (index < 0 || index >= this.frames.length) return;
        this.activeFrameIndex = index;
        this._restoreLayersFromFrame(this.frames[index]);
    }

    addFrame() {
        this.saveCurrentFrame();
        const frame = {
            tag: '',
            delay: 100,
            layerData: this._snapshotLayers().map((ld, i) => ({
                ...ld,
                width: this.layers[i].width,
                height: this.layers[i].height,
            })),
        };
        this.frames.splice(this.activeFrameIndex + 1, 0, frame);
        this.activeFrameIndex++;
    }

    deleteFrame(index) {
        if (this.frames.length <= 1) return false;
        this.frames.splice(index, 1);
        if (this.activeFrameIndex >= this.frames.length) {
            this.activeFrameIndex = this.frames.length - 1;
        }
        this.loadFrame(this.activeFrameIndex);
        return true;
    }

    moveFrame(from, dir) {
        const to = from + dir;
        if (to < 0 || to >= this.frames.length) return false;
        const [frame] = this.frames.splice(from, 1);
        this.frames.splice(to, 0, frame);
        this.activeFrameIndex = to;
        return true;
    }

    enableAnimation() {
        if (this.animationEnabled) return;
        this.animationEnabled = true;
        this.frames = [{
            tag: '',
            delay: 100,
            layerData: this.layers.map(l => ({
                data: l.data.slice(),
                opacity: l.opacity,
                textData: l.textData ? { ...l.textData } : null,
                offsetX: l.offsetX,
                offsetY: l.offsetY,
                width: l.width,
                height: l.height,
            })),
        }];
        this.activeFrameIndex = 0;
    }

    disableAnimation() {
        if (!this.animationEnabled) return;
        // Keep frame 0's data
        if (this.frames.length > 0) {
            this.loadFrame(0);
        }
        this.animationEnabled = false;
        this.frames = [];
        this.activeFrameIndex = 0;
    }
}
