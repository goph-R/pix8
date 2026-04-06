export class LayersPanel {
    constructor(doc, bus, undoManager) {
        this.doc = doc;
        this.bus = bus;
        this.undoManager = undoManager;

        this.list = document.getElementById('layers-list');
        this._opacityRow = document.getElementById('layer-opacity-row');
        this._opacitySlider = document.getElementById('layer-opacity-slider');
        this._opacityNum = document.getElementById('layer-opacity-num');
        this._opacityBefore = null;

        document.getElementById('layer-add-btn').addEventListener('click', () => this._addLayer());
        document.getElementById('layer-del-btn').addEventListener('click', () => this._deleteLayer());
        document.getElementById('layer-up-btn').addEventListener('click', () => this._moveLayer(-1));
        document.getElementById('layer-down-btn').addEventListener('click', () => this._moveLayer(1));
        document.getElementById('layer-dup-btn').addEventListener('click', () => this._duplicateLayer());

        this._opacitySlider.addEventListener('pointerdown', () => {
            this._opacityBefore = this.doc.getActiveLayer().opacity;
        });
        this._opacitySlider.addEventListener('input', () => {
            const val = parseInt(this._opacitySlider.value);
            this._opacityNum.value = val;
            this.doc.getActiveLayer().opacity = val / 100;
            this.bus.emit('layer-changed');
        });
        this._opacitySlider.addEventListener('pointerup', () => {
            const layer = this.doc.getActiveLayer();
            if (this._opacityBefore !== null && layer.opacity !== this._opacityBefore) {
                this.undoManager.pushEntry({
                    type: 'layer-opacity',
                    layerIndex: this.doc.activeLayerIndex,
                    beforeOpacity: this._opacityBefore,
                    afterOpacity: layer.opacity,
                });
            }
            this._opacityBefore = null;
        });
        this._opacityNum.addEventListener('focus', () => {
            this._opacityBefore = this.doc.getActiveLayer().opacity;
        });
        this._opacityNum.addEventListener('change', () => {
            const val = Math.max(0, Math.min(100, parseInt(this._opacityNum.value) || 100));
            this._opacitySlider.value = val;
            this._opacityNum.value = val;
            const layer = this.doc.getActiveLayer();
            layer.opacity = val / 100;
            if (this._opacityBefore !== null && layer.opacity !== this._opacityBefore) {
                this.undoManager.pushEntry({
                    type: 'layer-opacity',
                    layerIndex: this.doc.activeLayerIndex,
                    beforeOpacity: this._opacityBefore,
                    afterOpacity: layer.opacity,
                });
            }
            this._opacityBefore = null;
            this.bus.emit('layer-changed');
        });

        this.bus.on('layer-changed', () => this.render());
        this.bus.on('document-changed', () => this.render());
        this.bus.on('active-layer-changed', () => this.render());

        this.render();
    }

    _snapshotMeta() {
        return {
            activeIndex: this.doc.activeLayerIndex,
            selected: new Set(this.doc.selectedLayerIndices),
            frames: this.doc.animationEnabled ? this.doc.frames.map(f => ({
                ...f,
                layerData: f.layerData ? f.layerData.map(ld => ({
                    ...ld,
                    data: ld.data.slice(),
                })) : null,
            })) : null,
        };
    }

    render() {
        // Sync opacity controls
        const activeLayer = this.doc.getActiveLayer();
        const multiSelected = this.doc.selectedLayerIndices.size >= 2;
        if (activeLayer && !multiSelected) {
            const pct = Math.round(activeLayer.opacity * 100);
            this._opacitySlider.value = pct;
            this._opacityNum.value = pct;
            this._opacityRow.classList.remove('disabled');
        } else {
            this._opacityRow.classList.add('disabled');
        }

        this.list.innerHTML = '';

        // Render layers top-to-bottom (reverse of array order, since array[0] = bottom)
        for (let i = this.doc.layers.length - 1; i >= 0; i--) {
            const layer = this.doc.layers[i];
            const item = document.createElement('div');
            const isActive = i === this.doc.activeLayerIndex;
            const isSelected = this.doc.selectedLayerIndices.has(i);
            item.className = 'layer-item' + (isActive ? ' active' : '') + (isSelected ? ' selected' : '');

            // Visibility toggle
            const vis = document.createElement('div');
            vis.className = 'layer-visibility' + (layer.visible ? '' : ' hidden');
            vis.textContent = layer.visible ? '👁' : '○';
            vis.addEventListener('click', (e) => {
                e.stopPropagation();
                const beforeStates = this.doc.layers.map(l => l.visible);
                layer.visible = !layer.visible;
                const afterStates = this.doc.layers.map(l => l.visible);
                this.undoManager.pushEntry({
                    type: 'layer-visibility',
                    beforeStates,
                    afterStates,
                });
                this.bus.emit('layer-changed');
            });
            vis.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const beforeStates = this.doc.layers.map(l => l.visible);
                const isSolo = this.doc.layers.every(l => l === layer ? l.visible : !l.visible);
                for (const l of this.doc.layers) l.visible = isSolo ? true : (l === layer);
                const afterStates = this.doc.layers.map(l => l.visible);
                this.undoManager.pushEntry({
                    type: 'layer-visibility',
                    beforeStates,
                    afterStates,
                });
                this.bus.emit('layer-changed');
            });

            // Thumbnail
            let thumb;
            if (layer.type === 'text') {
                thumb = document.createElement('div');
                thumb.className = 'layer-thumbnail layer-text-icon';
                thumb.textContent = 'T';
            } else {
                thumb = document.createElement('canvas');
                thumb.className = 'layer-thumbnail';
                thumb.width = 32;
                thumb.height = 32;
                this._drawThumbnail(thumb, layer);
            }

            // Name
            const name = document.createElement('span');
            name.className = 'layer-name';
            name.textContent = layer.name;

            name.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this._startRename(name, layer, i);
            });

            item.addEventListener('click', (e) => {
                if (e.ctrlKey) {
                    // Can't deselect the active layer — it's always selected
                    if (i !== this.doc.activeLayerIndex) {
                        const sel = this.doc.selectedLayerIndices;
                        if (sel.has(i)) {
                            sel.delete(i);
                        } else {
                            sel.add(i);
                        }
                    }
                    this.bus.emit('layer-changed');
                } else {
                    this.doc.selectedLayerIndices.clear();
                    this.doc.selectedLayerIndices.add(i);
                    this.doc.activeLayerIndex = i;
                    this.bus.emit('active-layer-changed');
                }
                this.render();
            });

            item.appendChild(vis);
            item.appendChild(thumb);
            item.appendChild(name);
            this.list.appendChild(item);
        }
    }

    _drawThumbnail(canvas, layer) {
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, 32, 32);

        const docW = this.doc.width;
        const docH = this.doc.height;

        // Fit document ratio into 32x32 thumbnail
        const scale = Math.min(32 / docW, 32 / docH);
        const dw = Math.round(docW * scale);
        const dh = Math.round(docH * scale);
        const dx = Math.round((32 - dw) / 2);
        const dy = Math.round((32 - dh) / 2);

        // Visible portion of the layer within document bounds
        const lx0 = Math.max(0, layer.offsetX);
        const ly0 = Math.max(0, layer.offsetY);
        const lx1 = Math.min(docW, layer.offsetX + layer.width);
        const ly1 = Math.min(docH, layer.offsetY + layer.height);
        const vw = lx1 - lx0;
        const vh = ly1 - ly0;
        if (vw <= 0 || vh <= 0) return;

        const imgData = new ImageData(vw, vh);
        const buf = imgData.data;
        for (let y = 0; y < vh; y++) {
            for (let x = 0; x < vw; x++) {
                const lx = (lx0 - layer.offsetX) + x;
                const ly = (ly0 - layer.offsetY) + y;
                const colorIndex = layer.data[ly * layer.width + lx];
                if (colorIndex > 255) continue;
                const [r, g, b] = this.doc.palette.getColor(colorIndex);
                const off = (y * vw + x) * 4;
                buf[off] = r;
                buf[off + 1] = g;
                buf[off + 2] = b;
                buf[off + 3] = 255;
            }
        }

        const tmp = document.createElement('canvas');
        tmp.width = vw;
        tmp.height = vh;
        tmp.getContext('2d').putImageData(imgData, 0, 0);

        // Draw the visible portion at its correct position within the thumbnail
        ctx.drawImage(tmp, 0, 0, vw, vh,
            dx + Math.round(lx0 * scale), dy + Math.round(ly0 * scale),
            Math.round(vw * scale) || 1, Math.round(vh * scale) || 1);
    }

    _startRename(nameEl, layer, layerIndex) {
        const beforeName = layer.name;
        const result = prompt('Rename layer:', layer.name);
        if (result === null) return;
        const trimmed = result.trim();
        if (!trimmed || trimmed === beforeName) return;
        layer.name = trimmed;
        this.undoManager.pushEntry({
            type: 'layer-rename',
            layerIndex,
            beforeName,
            afterName: trimmed,
        });
        this.render();
    }

    _addLayer() {
        const before = this._snapshotMeta();
        const layer = this.doc.addLayer();
        const insertIndex = this.doc.activeLayerIndex;
        const after = this._snapshotMeta();
        this.undoManager.pushEntry({
            type: 'layer-add',
            insertIndex,
            layer,
            beforeActiveIndex: before.activeIndex,
            afterActiveIndex: after.activeIndex,
            beforeSelected: before.selected,
            afterSelected: after.selected,
            beforeFrames: before.frames,
            afterFrames: after.frames,
        });
        this.bus.emit('layer-changed');
    }

    _deleteLayer() {
        const layer = this.doc.layers[this.doc.activeLayerIndex];
        if (!confirm(`Delete layer "${layer.name}"?`)) return;
        const removedIndex = this.doc.activeLayerIndex;
        const before = this._snapshotMeta();
        if (this.doc.removeLayer(removedIndex)) {
            const after = this._snapshotMeta();
            this.undoManager.pushEntry({
                type: 'layer-delete',
                removedIndex,
                layer,
                beforeActiveIndex: before.activeIndex,
                afterActiveIndex: after.activeIndex,
                beforeSelected: before.selected,
                afterSelected: after.selected,
                beforeFrames: before.frames,
                afterFrames: after.frames,
            });
            this.bus.emit('layer-changed');
        }
    }

    _moveLayer(dir) {
        const from = this.doc.activeLayerIndex;
        // dir=-1 means "up" visually = higher index in array
        const to = from - dir;
        const before = this._snapshotMeta();
        if (this.doc.moveLayer(from, to)) {
            const after = this._snapshotMeta();
            this.undoManager.pushEntry({
                type: 'layer-move',
                fromIndex: from,
                toIndex: to,
                beforeActiveIndex: before.activeIndex,
                afterActiveIndex: after.activeIndex,
                beforeSelected: before.selected,
                afterSelected: after.selected,
            });
            this.bus.emit('layer-changed');
        }
    }

    _duplicateLayer() {
        const before = this._snapshotMeta();
        const copy = this.doc.duplicateLayer(this.doc.activeLayerIndex);
        const insertIndex = this.doc.activeLayerIndex;
        const after = this._snapshotMeta();
        this.undoManager.pushEntry({
            type: 'layer-add',
            insertIndex,
            layer: copy,
            beforeActiveIndex: before.activeIndex,
            afterActiveIndex: after.activeIndex,
            beforeSelected: before.selected,
            afterSelected: after.selected,
            beforeFrames: before.frames,
            afterFrames: after.frames,
        });
        this.bus.emit('layer-changed');
    }
}
