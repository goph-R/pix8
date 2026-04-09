import { ImageDocument } from './model/ImageDocument.js';
import { TRANSPARENT } from './constants.js';
import {
    savePix8, loadPix8,
    exportBMP, importBMP,
    exportPCX, importPCX,
    exportPNG, downloadBlob
} from './util/io.js';
import { exportGIF } from './util/gif.js';
import { exportSPXZip } from './util/spx.js';
import { quantizeImage, mapToPalette } from './util/quantize.js';
import { ROW_STYLE, createDitherRow } from './ui/dialogHelpers.js';
import Dialog from './ui/Dialog.js';

/**
 * File I/O, import/export, and quantization dialogs.
 * Methods are mixed into App.prototype — `this` refers to the App instance.
 */

export function _saveProject() {
    if (this.doc.animationEnabled) this.doc.saveCurrentFrame();
    const tab = this._getActiveTab();
    const filename = (tab ? tab.name : 'untitled') + '.pix8';
    const blob = savePix8(this.doc);
    downloadBlob(blob, filename);
}

export function _openFile() {
    if (window.electronAPI) {
        this._openFileElectron();
        return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pix8,.bmp,.pcx,.png,.jpg,.jpeg,.gif,.webp';
    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();

        // Truecolor image formats — decode via canvas, then quantize
        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
            this._openTruecolorFile(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            try {
                let newDoc;
                if (ext === 'pix8') {
                    newDoc = loadPix8(reader.result);
                } else if (ext === 'bmp') {
                    newDoc = importBMP(reader.result);
                } else if (ext === 'pcx') {
                    newDoc = importPCX(reader.result);
                } else {
                    this._showToast('Unsupported file format');
                    return;
                }
                this._openInNewTab(file.name, newDoc);
            } catch (err) {
                this._showToast('Error loading file: ' + err.message, 3000);
            }
        };
        reader.readAsArrayBuffer(file);
    });
    input.click();
}

export async function _openFileElectron() {
    const result = await window.electronAPI.showOpenDialog({
        filters: [
            { name: 'All Supported', extensions: ['pix8', 'bmp', 'pcx', 'png', 'jpg', 'jpeg', 'gif', 'webp'] },
            { name: 'Pix8 Projects', extensions: ['pix8'] },
            { name: 'Images', extensions: ['bmp', 'pcx', 'png', 'jpg', 'jpeg', 'gif', 'webp'] },
        ],
    });
    if (!result) return;
    const ext = result.fileName.split('.').pop().toLowerCase();

    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
        // Truecolor — decode via Image + canvas
        const blob = new Blob([new Uint8Array(result.data)]);
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this._showQuantizeDialog(imageData.data, canvas.width, canvas.height, (newDoc) => {
            this._openInNewTab(result.fileName, newDoc);
        });
        return;
    }

    try {
        let newDoc;
        const arrayBuffer = result.data instanceof ArrayBuffer ? result.data : new Uint8Array(result.data).buffer;
        if (ext === 'pix8') {
            newDoc = loadPix8(arrayBuffer);
        } else if (ext === 'bmp') {
            newDoc = importBMP(arrayBuffer);
        } else if (ext === 'pcx') {
            newDoc = importPCX(arrayBuffer);
        } else {
            this._showToast('Unsupported file format');
            return;
        }
        this._openInNewTab(result.fileName, newDoc);
    } catch (err) {
        this._showToast('Error loading file: ' + err.message, 3000);
    }
}

export function _openInNewTab(filename, newDoc) {
    this._saveTabState();
    this.doc = newDoc;
    this._setDocOnComponents(newDoc);
    this.undoManager.undoStack = [];
    this.undoManager.redoStack = [];
    this._clipboard = null;
    this.canvasView.offscreen.width = newDoc.width;
    this.canvasView.offscreen.height = newDoc.height;
    this.canvasView.renderer = new (this.canvasView.renderer.constructor)(this.doc);
    this.canvasView._centerDocument();
    const name = filename.replace(/\.[^.]+$/, '');
    this._createTab(name);
    if (newDoc.animationEnabled) {
        this.framePanel.show();
    } else {
        this.framePanel.hide();
    }
    this.bus.emit('palette-changed');
    this.bus.emit('fg-color-changed');
    this.bus.emit('bg-color-changed');
    this.bus.emit('layer-changed');
    this.bus.emit('document-changed');
    document.getElementById('status-size').textContent = `${newDoc.width} x ${newDoc.height}`;
}

export function _openTruecolorFile(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        URL.revokeObjectURL(url);
        this._showQuantizeDialog(imageData.data, img.width, img.height, (doc) => {
            this._openInNewTab(file.name, doc);
        });
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        this._showToast('Error loading image file', 3000);
    };
    img.src = url;
}

export function _showQuantizeDialog(rgbaData, width, height, callback) {
    const dlg = Dialog.create({
        title: 'Import Image',
        buttons: [
            { label: 'Cancel' },
            { label: 'OK', primary: true, onClick: () => {
                const okBtn = dlg.getButton(1);
                const cancelBtn = dlg.getButton(0);
                okBtn.disabled = true;
                cancelBtn.disabled = true;
                info.textContent = 'Converting, please wait...';
                setTimeout(() => {
                    const numColors = Math.max(1, Math.min(256, parseInt(colorsInput.value) || 256));
                    const ditherMode = ditherSelect.value;
                    const result = quantizeImage(rgbaData, width, height, numColors, ditherMode);

                    const doc = new ImageDocument(width, height);
                    for (let i = 0; i < 256; i++) {
                        if (i < result.palette.length) {
                            doc.palette.setColor(i, ...result.palette[i]);
                        } else {
                            doc.palette.setColor(i, 0, 0, 0);
                        }
                    }
                    const layer = doc.getActiveLayer();
                    layer.data.set(result.indices);
                    dlg.close();
                    callback(doc);
                }, 16);
            }},
        ],
    });

    const body = dlg.body;

    const info = document.createElement('div');
    info.style.cssText = 'font-size:12px;color:var(--text-dim);margin-bottom:8px;';
    info.textContent = `Image: ${width} \u00D7 ${height} pixels`;
    body.appendChild(info);

    const colorsRow = document.createElement('div');
    colorsRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;';
    const colorsLabel = document.createElement('label');
    colorsLabel.textContent = 'Colors:';
    const colorsInput = document.createElement('input');
    colorsInput.type = 'number';
    colorsInput.min = 1;
    colorsInput.max = 256;
    colorsInput.value = 256;
    colorsInput.style.cssText = 'width:50px;background:var(--bg-input);border:1px solid var(--border);border-radius:2px;color:var(--text);padding:2px 4px;text-align:center;font-size:12px;';
    colorsRow.appendChild(colorsLabel);
    colorsRow.appendChild(colorsInput);
    body.appendChild(colorsRow);

    const { row: ditherRow, select: ditherSelect } = createDitherRow();
    body.appendChild(ditherRow);

    dlg.show();
}

export function _showPasteDitherDialog(rgbaData, width, height, callback) {
    const dlg = Dialog.create({
        title: 'Paste Image',
        buttons: [
            { label: 'Cancel' },
            { label: 'OK', primary: true, onClick: () => {
                const okBtn = dlg.getButton(1);
                const cancelBtn = dlg.getButton(0);
                okBtn.disabled = true;
                cancelBtn.disabled = true;
                info.textContent = 'Converting, please wait...';
                setTimeout(() => {
                    const palette = this.doc.palette.export();
                    const indices = mapToPalette(rgbaData, width, height, palette, ditherSelect.value);
                    dlg.close();
                    callback(indices, width, height);
                }, 16);
            }},
        ],
    });

    const body = dlg.body;

    const info = document.createElement('div');
    info.style.cssText = 'font-size:12px;color:var(--text-dim);margin-bottom:8px;';
    info.textContent = `Image: ${width} \u00D7 ${height} pixels \u2014 mapping to current palette`;
    body.appendChild(info);

    const { row: ditherRow, select: ditherSelect } = createDitherRow();
    body.appendChild(ditherRow);

    dlg.show();
}

export function _replaceDocument(newDoc) {
    this.doc.width = newDoc.width;
    this.doc.height = newDoc.height;
    this.doc.layers = newDoc.layers;
    this.doc.activeLayerIndex = newDoc.activeLayerIndex;
    this.doc.palette = newDoc.palette;
    this.doc.fgColorIndex = newDoc.fgColorIndex;
    this.doc.bgColorIndex = newDoc.bgColorIndex;

    // Reset selection and layer selection for new document dimensions
    this.doc.selectedLayerIndices.clear();
    this.doc.selectedLayerIndices.add(this.doc.activeLayerIndex);
    this.doc.selection.resize(newDoc.width, newDoc.height);
    this.canvasView.stopMarchingAnts();

    // Recreate offscreen canvas
    this.canvasView.offscreen.width = newDoc.width;
    this.canvasView.offscreen.height = newDoc.height;
    this.canvasView.renderer = new (this.canvasView.renderer.constructor)(this.doc);
    this.canvasView._centerDocument();

    document.getElementById('status-size').textContent = `${newDoc.width} x ${newDoc.height}`;

    this.undoManager.undoStack = [];
    this.undoManager.redoStack = [];

    this.bus.emit('palette-changed');
    this.bus.emit('fg-color-changed');
    this.bus.emit('bg-color-changed');
    this.bus.emit('layer-changed');
    this.bus.emit('document-changed');
}

export function _parseImageFile(file, callback, { askTransparency = true } = {}) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'bmp' && ext !== 'pcx') {
        this._showToast('Unsupported format. Use BMP or PCX files.');
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const doc = ext === 'bmp' ? importBMP(reader.result) : importPCX(reader.result);
            if (askTransparency) {
                this._showTransparencyDialog((zeroIsTransparent) => {
                    if (zeroIsTransparent) {
                        this._convertZeroToTransparent(doc);
                    }
                    callback(doc, file);
                });
            } else {
                callback(doc, file);
            }
        } catch (err) {
            this._showToast('Error importing file: ' + err.message, 3000);
        }
    };
    reader.readAsArrayBuffer(file);
}

export function _convertZeroToTransparent(doc) {
    for (const layer of doc.layers) {
        for (let i = 0; i < layer.data.length; i++) {
            if (layer.data[i] === 0) layer.data[i] = TRANSPARENT;
        }
    }
}

export function _showTransparencyDialog(callback) {
    const lastChoice = localStorage.getItem('pix8-zero-transparent') ?? 'no';
    let result = lastChoice === 'yes';

    const dlg = Dialog.create({
        title: 'Treat index 0 as transparent?',
        width: '300px',
        buttons: [
            { label: 'Yes', primary: lastChoice === 'yes', onClick: () => { result = true; dlg.close(); } },
            { label: 'No', primary: lastChoice === 'no', onClick: () => { result = false; dlg.close(); } },
        ],
        enterButton: lastChoice === 'yes' ? 0 : 1,
        onClose: () => {
            localStorage.setItem('pix8-zero-transparent', result ? 'yes' : 'no');
            callback(result);
        },
    });

    dlg.body.innerHTML = `
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">
            If yes, all pixels with palette index 0 will become transparent.
        </div>
    `;

    dlg.show(dlg.getButton(lastChoice === 'yes' ? 0 : 1));
}

export function _importFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bmp,.pcx';
    input.addEventListener('change', () => {
        if (!input.files[0]) return;
        this._parseImageFile(input.files[0], (newDoc) => {
            this._replaceDocument(newDoc);
        });
    });
    input.click();
}

export function _importAsLayer() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bmp,.pcx';
    input.addEventListener('change', () => {
        if (!input.files[0]) return;
        this._parseImageFile(input.files[0], (tempDoc, file) => {
            if (this.doc.animationEnabled) this.doc.saveCurrentFrame();
            const importedLayer = tempDoc.getActiveLayer();
            const layerName = file.name.replace(/\.[^.]+$/, '');
            const newLayer = this.doc.addLayer(layerName);
            newLayer.data = importedLayer.data;
            newLayer.width = importedLayer.width;
            newLayer.height = importedLayer.height;
            newLayer.offsetX = importedLayer.offsetX;
            newLayer.offsetY = importedLayer.offsetY;
            if (this.doc.animationEnabled) this.doc.saveCurrentFrame();
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
        });
    });
    input.click();
}

export function _importPalette() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bmp,.pcx';
    input.addEventListener('change', () => {
        if (!input.files[0]) return;
        this._parseImageFile(input.files[0], (tempDoc) => {
            this.doc.palette.import(tempDoc.palette.export());
            this.bus.emit('palette-changed');
            this.bus.emit('fg-color-changed');
            this.bus.emit('bg-color-changed');
            this.bus.emit('document-changed');
        }, { askTransparency: false });
    });
    input.click();
}

export function _showExportDialog() {
    const dlg = Dialog.create({
        title: 'Export as...',
        width: '320px',
        buttons: [
            { label: 'Cancel' },
            { label: 'Export', primary: true, onClick: async () => {
                const format = formatSelect.value;
                dlg.close();
                switch (format) {
                    case 'bmp': {
                        const blob = exportBMP(this.doc);
                        downloadBlob(blob, 'export.bmp');
                        break;
                    }
                    case 'pcx': {
                        const blob = exportPCX(this.doc);
                        downloadBlob(blob, 'export.pcx');
                        break;
                    }
                    case 'png': {
                        const blob = await exportPNG(this.doc, this.canvasView.renderer);
                        downloadBlob(blob, 'export.png');
                        break;
                    }
                    case 'gif': {
                        this.doc.saveCurrentFrame();
                        const scale = parseInt(scaleSelect.value) || 1;
                        const loopCount = parseInt(loopSelect.value) || 0;
                        const sel = framesSelect.value;
                        const frameIndices = sel === 'all' ? null : tagGroups.find(g => g.tag === sel)?.indices;
                        const filename = sel === 'all' ? 'export.gif' : `${sel}.gif`;
                        const blob = exportGIF(this.doc, { scale, loopCount, frameIndices });
                        downloadBlob(blob, filename);
                        break;
                    }
                    case 'spx': {
                        this.doc.saveCurrentFrame();
                        const spriteName = nameInput.value.trim() || defaultName;
                        const zipBlob = await exportSPXZip(this.doc, { name: spriteName });
                        downloadBlob(zipBlob, spriteName + '.zip');
                        break;
                    }
                }
            }},
        ],
        enterButton: 1,
    });

    const body = dlg.body;
    body.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:8px 0;';

    const labelStyle = 'font-size:13px;color:var(--text);width:60px;';
    const selectStyle = 'flex:1;padding:3px 6px;background:var(--bg-input);border:1px solid var(--border);color:var(--text);border-radius:3px;font-size:13px;';

    // Format selector
    const formatRow = document.createElement('div');
    formatRow.style.cssText = ROW_STYLE;
    const formatLabel = document.createElement('label');
    formatLabel.textContent = 'Format:';
    formatLabel.style.cssText = labelStyle;
    const formatSelect = document.createElement('select');
    formatSelect.style.cssText = selectStyle;
    const formats = [
        { value: 'png', label: 'PNG' },
        { value: 'bmp', label: 'BMP (8-bit indexed)' },
        { value: 'pcx', label: 'PCX (8-bit indexed)' },
    ];
    if (this.doc.animationEnabled && this.doc.frames.length > 0) {
        formats.push({ value: 'gif', label: 'GIF (animated)' });
        formats.push({ value: 'spx', label: 'SPX (sprite sheet)' });
    }
    for (const f of formats) {
        const opt = document.createElement('option');
        opt.value = f.value;
        opt.textContent = f.label;
        formatSelect.appendChild(opt);
    }
    formatRow.appendChild(formatLabel);
    formatRow.appendChild(formatSelect);
    body.appendChild(formatRow);

    // ── GIF options ──────────────────────────────────────────────
    const gifOptions = document.createElement('div');
    gifOptions.style.cssText = 'display:none;flex-direction:column;gap:8px;';

    // Collect tag groups
    const frames = this.doc.frames || [];
    const tagGroups = [];
    for (let i = 0; i < frames.length; i++) {
        if (frames[i].tag) tagGroups.push({ tag: frames[i].tag, start: i });
    }
    for (let g = 0; g < tagGroups.length; g++) {
        const nextStart = g + 1 < tagGroups.length ? tagGroups[g + 1].start : frames.length;
        const indices = [];
        for (let i = tagGroups[g].start; i < nextStart; i++) indices.push(i);
        tagGroups[g].indices = indices;
    }

    // Frames selector
    const framesRow = document.createElement('div');
    framesRow.style.cssText = ROW_STYLE;
    const framesLabel = document.createElement('label');
    framesLabel.textContent = 'Frames:';
    framesLabel.style.cssText = labelStyle;
    const framesSelect = document.createElement('select');
    framesSelect.style.cssText = selectStyle;
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = `All frames (${frames.length})`;
    framesSelect.appendChild(allOpt);
    for (const g of tagGroups) {
        const opt = document.createElement('option');
        opt.value = g.tag;
        opt.textContent = `${g.tag} (${g.indices.length} frames)`;
        framesSelect.appendChild(opt);
    }
    framesRow.appendChild(framesLabel);
    framesRow.appendChild(framesSelect);
    gifOptions.appendChild(framesRow);

    // Scale
    const scaleRow = document.createElement('div');
    scaleRow.style.cssText = ROW_STYLE;
    const scaleLabel = document.createElement('label');
    scaleLabel.textContent = 'Scale:';
    scaleLabel.style.cssText = labelStyle;
    const scaleSelect = document.createElement('select');
    scaleSelect.style.cssText = selectStyle;
    for (const s of [1, 2, 3, 4, 5, 8, 10]) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `${s}x (${this.doc.width * s} \u00D7 ${this.doc.height * s})`;
        scaleSelect.appendChild(opt);
    }
    scaleRow.appendChild(scaleLabel);
    scaleRow.appendChild(scaleSelect);
    gifOptions.appendChild(scaleRow);

    // Loop
    const loopRow = document.createElement('div');
    loopRow.style.cssText = ROW_STYLE;
    const loopLabel = document.createElement('label');
    loopLabel.textContent = 'Loop:';
    loopLabel.style.cssText = labelStyle;
    const loopSelect = document.createElement('select');
    loopSelect.style.cssText = selectStyle;
    for (const [val, label] of [[0, 'Infinite'], [1, 'Once'], [2, '2 times'], [3, '3 times'], [5, '5 times']]) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        loopSelect.appendChild(opt);
    }
    loopRow.appendChild(loopLabel);
    loopRow.appendChild(loopSelect);
    gifOptions.appendChild(loopRow);

    // GIF info
    const gifInfo = document.createElement('div');
    gifInfo.style.cssText = 'font-size:11px;color:var(--text-dim);';
    const updateGifInfo = () => {
        const sel = framesSelect.value;
        const count = sel === 'all' ? frames.length : tagGroups.find(g => g.tag === sel)?.indices.length || 0;
        gifInfo.textContent = `${count} frame${count !== 1 ? 's' : ''} will be exported`;
    };
    updateGifInfo();
    framesSelect.addEventListener('change', updateGifInfo);
    gifOptions.appendChild(gifInfo);

    body.appendChild(gifOptions);

    // ── SPX options ──────────────────────────────────────────────
    const spxOptions = document.createElement('div');
    spxOptions.style.cssText = 'display:none;flex-direction:column;gap:8px;';

    const tab = this._tabs.find(t => t.id === this._activeTabId);
    const defaultName = tab ? tab.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() : 'sprite';

    const nameRow = document.createElement('div');
    nameRow.style.cssText = ROW_STYLE;
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name:';
    nameLabel.style.cssText = labelStyle;
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = defaultName;
    nameInput.style.cssText = selectStyle;
    nameRow.appendChild(nameLabel);
    nameRow.appendChild(nameInput);
    spxOptions.appendChild(nameRow);

    const spxInfo = document.createElement('div');
    spxInfo.style.cssText = 'font-size:11px;color:var(--text-dim);';
    const groups = new Set();
    for (const f of frames) { if (f.tag) groups.add(f.tag); }
    spxInfo.textContent = `${frames.length} frames, ${groups.size || 1} sprite${groups.size > 1 ? 's' : ''} \u2022 ${this.doc.width}\u00D7${this.doc.height}px`;
    spxOptions.appendChild(spxInfo);

    body.appendChild(spxOptions);

    // Format change handler
    formatSelect.addEventListener('change', () => {
        gifOptions.style.display = formatSelect.value === 'gif' ? 'flex' : 'none';
        spxOptions.style.display = formatSelect.value === 'spx' ? 'flex' : 'none';
    });

    dlg.show();
}
