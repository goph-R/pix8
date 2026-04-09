import { TRANSPARENT } from './constants.js';
import { Layer } from './model/Layer.js';
import { INPUT_STYLE } from './ui/dialogHelpers.js';
import Dialog from './ui/Dialog.js';

/**
 * Image and layer manipulation operations (rotate, resize, crop, trim, merge, selection ops).
 * Methods are mixed into App.prototype — `this` refers to the App instance.
 */

export function _rotateImage(clockwise) {
    const doc = this.doc;
    const oldW = doc.width;
    const oldH = doc.height;

    // Snapshot all layers before rotation
    const beforeLayers = doc.layers.map(l => ({
        data: l.snapshotData(),
        geometry: l.snapshotGeometry(),
    }));
    const beforeSelection = doc.selection.snapshot();

    for (const layer of doc.layers) {
        const { width: lw, height: lh, data, offsetX, offsetY } = layer;
        const newLW = lh;
        const newLH = lw;
        const newData = new Uint16Array(newLW * newLH);
        newData.fill(TRANSPARENT);

        for (let row = 0; row < lh; row++) {
            for (let col = 0; col < lw; col++) {
                const px = data[row * lw + col];
                let newCol, newRow;
                if (clockwise) {
                    newCol = lh - 1 - row;
                    newRow = col;
                } else {
                    newCol = row;
                    newRow = lw - 1 - col;
                }
                newData[newRow * newLW + newCol] = px;
            }
        }

        let newOffX, newOffY;
        if (clockwise) {
            newOffX = oldH - 1 - (offsetY + lh - 1);
            newOffY = offsetX;
        } else {
            newOffX = offsetY;
            newOffY = oldW - 1 - (offsetX + lw - 1);
        }

        layer.data = newData;
        layer.width = newLW;
        layer.height = newLH;
        layer.offsetX = newOffX;
        layer.offsetY = newOffY;
    }

    doc.width = oldH;
    doc.height = oldW;
    doc.selection.resize(oldH, oldW);

    // Snapshot all layers after rotation
    const afterLayers = doc.layers.map(l => ({
        data: l.snapshotData(),
        geometry: l.snapshotGeometry(),
    }));
    const afterSelection = doc.selection.snapshot();

    this.undoManager.undoStack.push({
        type: 'resize',
        beforeDocSize: { width: oldW, height: oldH },
        afterDocSize: { width: oldH, height: oldW },
        beforeLayers,
        afterLayers,
        beforeSelection,
        afterSelection,
    });
    this.undoManager.redoStack = [];

    document.getElementById('status-size').textContent = `${doc.width} x ${doc.height}`;
    this.bus.emit('selection-changed');
    this.bus.emit('layer-changed');
    this.bus.emit('document-changed');
}

export function _showResizeDialog() {
    const origW = this.doc.width;
    const origH = this.doc.height;
    const aspect = origW / origH;

    const dlg = Dialog.create({
        title: 'Resize Image',
        width: '300px',
        buttons: [
            { label: 'Cancel' },
            { label: 'Resize', primary: true, onClick: () => {
                const newW = Math.max(1, Math.min(4096, parseInt(wInput.value) || origW));
                const newH = Math.max(1, Math.min(4096, parseInt(hInput.value) || origH));
                if (newW === origW && newH === origH) { dlg.close(); return; }
                const contentCheck = dlg.body.querySelector('#resize-content');
                const anchor = dlg.body.querySelector('input[name="resize-anchor"]:checked').value;
                dlg.close();
                this._applyResize(newW, newH, contentCheck.checked, anchor);
            }},
        ],
        enterButton: 1,
    });

    const checkStyle = 'margin-right:8px;accent-color:var(--accent);';

    dlg.body.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:8px 0;';
    dlg.body.innerHTML = `
        <div>
            <label style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-dim);">Width (px)</label>
            <input id="resize-w" type="number" value="${origW}" min="1" max="4096" style="${INPUT_STYLE}">
        </div>
        <div>
            <label style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-dim);">Height (px)</label>
            <input id="resize-h" type="number" value="${origH}" min="1" max="4096" style="${INPUT_STYLE}">
        </div>
        <div>
            <label style="font-size:13px;color:var(--text);cursor:pointer;">
                <input id="resize-aspect" type="checkbox" style="${checkStyle}">Keep aspect ratio
            </label>
        </div>
        <div>
            <label style="font-size:13px;color:var(--text);cursor:pointer;">
                <input id="resize-content" type="checkbox" style="${checkStyle}">Resize content
            </label>
        </div>
        <div id="resize-anchor-group">
            <label style="display:block;font-size:12px;margin-bottom:6px;color:var(--text-dim);">Anchor</label>
            <div style="display:inline-grid;grid-template-columns:repeat(3,24px);gap:2px;">
                ${['nw','n','ne','w','c','e','sw','s','se'].map(id =>
                    `<label style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;
                        background:var(--bg-input);border:1px solid var(--border);border-radius:3px;cursor:pointer;">
                        <input type="radio" name="resize-anchor" value="${id}"${id === 'nw' ? ' checked' : ''}
                            style="margin:0;accent-color:var(--accent);">
                    </label>`
                ).join('')}
            </div>
        </div>
    `;

    const wInput = dlg.body.querySelector('#resize-w');
    const hInput = dlg.body.querySelector('#resize-h');
    const aspectCheck = dlg.body.querySelector('#resize-aspect');
    const contentCheck = dlg.body.querySelector('#resize-content');
    const anchorGroup = dlg.body.querySelector('#resize-anchor-group');

    // Show/hide anchor based on "resize content" toggle
    const updateAnchorVisibility = () => {
        anchorGroup.style.display = contentCheck.checked ? 'none' : '';
    };
    contentCheck.addEventListener('change', updateAnchorVisibility);
    updateAnchorVisibility();

    wInput.addEventListener('input', () => {
        if (aspectCheck.checked) {
            hInput.value = Math.round(parseInt(wInput.value) / aspect) || 1;
        }
    });
    hInput.addEventListener('input', () => {
        if (aspectCheck.checked) {
            wInput.value = Math.round(parseInt(hInput.value) * aspect) || 1;
        }
    });

    dlg.show(wInput);
}

export function _applyResize(newW, newH, resizeContent, anchor = 'nw') {
    const doc = this.doc;
    const oldW = doc.width;
    const oldH = doc.height;

    // Snapshot all layers for undo
    const beforeLayers = doc.layers.map(l => ({
        data: l.snapshotData(),
        geometry: l.snapshotGeometry(),
    }));
    const beforeSelection = doc.selection.snapshot();
    const beforeDocSize = { width: oldW, height: oldH };

    // Clear selection
    if (doc.selection.active) {
        if (doc.selection.hasFloating()) {
            doc.selection.commitFloating(doc.getActiveLayer());
        }
        doc.selection.clear();
    }

    // Resize document dimensions
    doc.width = newW;
    doc.height = newH;

    if (resizeContent) {
        // Scale each layer's pixel data
        const sx = newW / oldW;
        const sy = newH / oldH;
        for (const layer of doc.layers) {
            const newLayerW = Math.max(1, Math.round(layer.width * sx));
            const newLayerH = Math.max(1, Math.round(layer.height * sy));
            const newData = new Uint16Array(newLayerW * newLayerH);
            newData.fill(TRANSPARENT);
            for (let y = 0; y < newLayerH; y++) {
                for (let x = 0; x < newLayerW; x++) {
                    const srcX = Math.floor(x / sx);
                    const srcY = Math.floor(y / sy);
                    if (srcX < layer.width && srcY < layer.height) {
                        newData[y * newLayerW + x] = layer.data[srcY * layer.width + srcX];
                    }
                }
            }
            layer.data = newData;
            layer.width = newLayerW;
            layer.height = newLayerH;
            layer.offsetX = Math.round(layer.offsetX * sx);
            layer.offsetY = Math.round(layer.offsetY * sy);
        }
    } else {
        // Shift layers based on anchor point
        const dx = anchor.includes('w') ? 0 : anchor.includes('e') ? newW - oldW : Math.round((newW - oldW) / 2);
        const dy = anchor.includes('n') ? 0 : anchor.includes('s') ? newH - oldH : Math.round((newH - oldH) / 2);
        if (dx !== 0 || dy !== 0) {
            for (const layer of doc.layers) {
                layer.offsetX += dx;
                layer.offsetY += dy;
            }
        }
    }

    // Resize selection mask
    doc.selection.resize(newW, newH);

    // Snapshot after for undo
    const afterLayers = doc.layers.map(l => ({
        data: l.snapshotData(),
        geometry: l.snapshotGeometry(),
    }));
    const afterSelection = doc.selection.snapshot();

    // Push a custom undo entry for the full resize
    this.undoManager.undoStack.push({
        type: 'resize',
        beforeDocSize,
        afterDocSize: { width: newW, height: newH },
        beforeLayers,
        afterLayers,
        beforeSelection,
        afterSelection,
    });
    this.undoManager.redoStack = [];

    // Update status bar and re-render
    document.getElementById('status-size').textContent = `${newW} x ${newH}`;
    this.bus.emit('selection-changed');
    this.bus.emit('layer-changed');
    this.bus.emit('document-changed');
}

export function _trimLayerToContent() {
    const layer = this.doc.getActiveLayer();
    if (!layer || layer.type === 'text') return;
    const bounds = layer.getContentBounds();
    if (!bounds) {
        this._showStatus('Layer is empty');
        return;
    }
    // Convert doc-space bounds to layer-local
    const lx = bounds.left - layer.offsetX;
    const ly = bounds.top - layer.offsetY;
    const lw = bounds.right - bounds.left;
    const lh = bounds.bottom - bounds.top;
    // Skip if already trimmed
    if (lx === 0 && ly === 0 && lw === layer.width && lh === layer.height) {
        this._showStatus('Layer already trimmed');
        return;
    }
    this.undoManager.beginOperation();
    const newData = new Uint16Array(lw * lh);
    for (let y = 0; y < lh; y++) {
        for (let x = 0; x < lw; x++) {
            newData[y * lw + x] = layer.data[(ly + y) * layer.width + (lx + x)];
        }
    }
    layer.data = newData;
    layer.offsetX = bounds.left;
    layer.offsetY = bounds.top;
    layer.width = lw;
    layer.height = lh;
    this.undoManager.endOperation();
    this._showToast('Trimmed');
    this.bus.emit('layer-changed');
    this.bus.emit('document-changed');
}

export function _cropLayerToCanvas() {
    const layer = this.doc.getActiveLayer();
    if (!layer || layer.type === 'text') return;
    const docW = this.doc.width;
    const docH = this.doc.height;
    // Intersection of layer rect with document rect
    const cx0 = Math.max(0, layer.offsetX);
    const cy0 = Math.max(0, layer.offsetY);
    const cx1 = Math.min(docW, layer.offsetX + layer.width);
    const cy1 = Math.min(docH, layer.offsetY + layer.height);
    const cw = cx1 - cx0;
    const ch = cy1 - cy0;
    if (cw <= 0 || ch <= 0) {
        this._showToast('Layer is outside canvas');
        return;
    }
    if (cx0 === layer.offsetX && cy0 === layer.offsetY && cw === layer.width && ch === layer.height) {
        this._showToast('Layer already fits canvas');
        return;
    }
    this.undoManager.beginOperation();
    const newData = new Uint16Array(cw * ch);
    for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
            const lx = (cx0 - layer.offsetX) + x;
            const ly = (cy0 - layer.offsetY) + y;
            newData[y * cw + x] = layer.data[ly * layer.width + lx];
        }
    }
    layer.data = newData;
    layer.offsetX = cx0;
    layer.offsetY = cy0;
    layer.width = cw;
    layer.height = ch;
    this.undoManager.endOperation();
    this._showToast('Cropped to canvas');
    this.bus.emit('layer-changed');
    this.bus.emit('document-changed');
}

export function _mergeSelectedLayers() {
    const doc = this.doc;
    const sel = doc.selectedLayerIndices;
    if (sel.size < 2) return;

    // Snapshot before state for undo
    if (doc.animationEnabled) doc.saveCurrentFrame();
    const beforeLayers = doc.layers.map(l => l.clone(true));
    const beforeActiveIndex = doc.activeLayerIndex;
    const beforeSelected = new Set(sel);
    const beforeFrames = doc.animationEnabled ? doc.frames.map(f => ({
        ...f,
        layerData: f.layerData ? f.layerData.map(ld => ({ ...ld, data: ld.data.slice() })) : null,
    })) : null;

    const indices = [...sel].sort((a, b) => a - b);

    // Helper: composite layer data entries into a single pixel buffer
    const compositeLayers = (layerEntries) => {
        const data = new Uint16Array(doc.width * doc.height).fill(TRANSPARENT);
        for (const ld of layerEntries) {
            if (!ld) continue;
            const lx0 = Math.max(0, ld.offsetX);
            const ly0 = Math.max(0, ld.offsetY);
            const lx1 = Math.min(doc.width, ld.offsetX + ld.width);
            const ly1 = Math.min(doc.height, ld.offsetY + ld.height);
            for (let dy = ly0; dy < ly1; dy++) {
                for (let dx = lx0; dx < lx1; dx++) {
                    const val = ld.data[(dy - ld.offsetY) * ld.width + (dx - ld.offsetX)];
                    if (val !== TRANSPARENT) {
                        data[dy * doc.width + dx] = val;
                    }
                }
            }
        }
        return data;
    };

    // Composite current (live) layers for the merged result
    const merged = new Layer('Merged', doc.width, doc.height);
    const liveEntries = indices.filter(i => doc.layers[i].visible).map(i => doc.layers[i]);
    merged.data = compositeLayers(liveEntries);

    // For animation: composite per-frame before removing layers
    let perFrameMerged = null;
    if (doc.animationEnabled) {
        perFrameMerged = doc.frames.map(frame => {
            if (!frame.layerData) return null;
            const entries = indices.filter(i => doc.layers[i].visible).map(i => frame.layerData[i]);
            return compositeLayers(entries);
        });
    }

    // Remove selected layers (from highest index first) and insert merged
    const lowestIdx = indices[0];
    for (let i = indices.length - 1; i >= 0; i--) {
        doc.layers.splice(indices[i], 1);
        if (doc.animationEnabled) {
            for (const frame of doc.frames) {
                if (frame.layerData) frame.layerData.splice(indices[i], 1);
            }
        }
    }
    doc.layers.splice(lowestIdx, 0, merged);
    if (doc.animationEnabled) {
        for (let fi = 0; fi < doc.frames.length; fi++) {
            const frame = doc.frames[fi];
            if (frame.layerData) {
                frame.layerData.splice(lowestIdx, 0, {
                    data: perFrameMerged[fi] || new Uint16Array(doc.width * doc.height).fill(TRANSPARENT),
                    opacity: 1.0,
                    textData: null,
                    offsetX: 0,
                    offsetY: 0,
                    width: doc.width,
                    height: doc.height,
                });
            }
        }
        doc.saveCurrentFrame();
    }
    doc.activeLayerIndex = lowestIdx;
    sel.clear();
    sel.add(lowestIdx);

    // Snapshot after state and push undo entry
    const afterLayers = doc.layers.map(l => l.clone(true));
    const afterFrames = doc.animationEnabled ? doc.frames.map(f => ({
        ...f,
        layerData: f.layerData ? f.layerData.map(ld => ({ ...ld, data: ld.data.slice() })) : null,
    })) : null;

    this.undoManager.pushEntry({
        type: 'merge-layers',
        beforeLayers,
        afterLayers,
        beforeActiveIndex,
        afterActiveIndex: lowestIdx,
        beforeSelected,
        afterSelected: new Set([lowestIdx]),
        beforeFrames,
        afterFrames,
    });

    this.bus.emit('layer-changed');
    this.bus.emit('document-changed');
}

export function _expandShrinkSelection(direction) {
    const label = direction > 0 ? 'Expand' : 'Shrink';
    const dlg = Dialog.create({
        title: `${label} Selection`,
        width: '250px',
        buttons: [
            { label: 'Cancel' },
            { label: 'OK', primary: true, onClick: () => {
                const amount = Math.max(1, parseInt(pxInput.value) || 1);
                dlg.close();
                this._applyExpandShrink(direction, amount);
            }},
        ],
        enterButton: 1,
    });
    dlg.body.style.cssText = 'padding:8px 0;';
    dlg.body.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <label>${label} by (px):</label>
            <input type="number" value="1" min="1" max="256" style="width:60px;padding:3px 6px;background:var(--bg-input);border:1px solid var(--border);color:var(--text);border-radius:3px;font-size:13px;text-align:center;">
        </div>
    `;
    const pxInput = dlg.body.querySelector('input');
    dlg.show(pxInput);
}

export function _applyExpandShrink(direction, amount) {
    const sel = this.doc.selection;
    const { width, height, mask } = sel;
    const newMask = new Uint8Array(mask);

    for (let iter = 0; iter < amount; iter++) {
        const src = new Uint8Array(newMask);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * width + x;
                if (direction > 0) {
                    // Expand: if any neighbor is selected, select this pixel
                    if (src[i]) continue;
                    if ((x > 0 && src[i - 1]) || (x < width - 1 && src[i + 1]) ||
                        (y > 0 && src[i - width]) || (y < height - 1 && src[i + width])) {
                        newMask[i] = 1;
                    }
                } else {
                    // Shrink: if any neighbor is not selected, deselect this pixel
                    if (!src[i]) continue;
                    if (x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
                        !src[i - 1] || !src[i + 1] || !src[i - width] || !src[i + width]) {
                        newMask[i] = 0;
                    }
                }
            }
        }
    }

    mask.set(newMask);
    sel._pureShape = null;
    this.bus.emit('selection-changed');
}

export function _selectByAlpha() {
    const layer = this.doc.getActiveLayer();
    const sel = this.doc.selection;
    if (sel.hasFloating()) sel.commitFloating(layer);
    sel.mask.fill(0);
    const { width, height } = sel;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const px = layer.getPixelDoc(x, y);
            if (px !== TRANSPARENT) {
                sel.mask[y * width + x] = 1;
            }
        }
    }
    sel.active = true;
    sel._pureShape = null;
    this.bus.emit('selection-changed');
}
