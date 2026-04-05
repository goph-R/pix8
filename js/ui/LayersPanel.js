export class LayersPanel {
    constructor(doc, bus) {
        this.doc = doc;
        this.bus = bus;

        this.list = document.getElementById('layers-list');
        this._opacityRow = document.getElementById('layer-opacity-row');
        this._opacitySlider = document.getElementById('layer-opacity-slider');
        this._opacityNum = document.getElementById('layer-opacity-num');

        document.getElementById('layer-add-btn').addEventListener('click', () => this._addLayer());
        document.getElementById('layer-del-btn').addEventListener('click', () => this._deleteLayer());
        document.getElementById('layer-up-btn').addEventListener('click', () => this._moveLayer(-1));
        document.getElementById('layer-down-btn').addEventListener('click', () => this._moveLayer(1));
        document.getElementById('layer-dup-btn').addEventListener('click', () => this._duplicateLayer());

        this._opacitySlider.addEventListener('input', () => {
            const val = parseInt(this._opacitySlider.value);
            this._opacityNum.value = val;
            this.doc.getActiveLayer().opacity = val / 100;
            this.bus.emit('layer-changed');
        });
        this._opacityNum.addEventListener('change', () => {
            const val = Math.max(0, Math.min(100, parseInt(this._opacityNum.value) || 100));
            this._opacitySlider.value = val;
            this._opacityNum.value = val;
            this.doc.getActiveLayer().opacity = val / 100;
            this.bus.emit('layer-changed');
        });

        this.bus.on('layer-changed', () => this.render());
        this.bus.on('document-changed', () => this.render());
        this.bus.on('active-layer-changed', () => this.render());

        this.render();
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
                layer.visible = !layer.visible;
                this.bus.emit('layer-changed');
            });
            vis.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isSolo = this.doc.layers.every(l => l === layer ? l.visible : !l.visible);
                for (const l of this.doc.layers) l.visible = isSolo ? true : (l === layer);
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
                this._startRename(name, layer);
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

    _startRename(nameEl, layer) {
        const result = prompt('Rename layer:', layer.name);
        if (result === null) return;
        const trimmed = result.trim();
        if (!trimmed) return;
        layer.name = trimmed;
        this.render();
    }

    _addLayer() {
        this.doc.addLayer();
        this.bus.emit('layer-changed');
    }

    _deleteLayer() {
        const layer = this.doc.layers[this.doc.activeLayerIndex];
        if (!confirm(`Delete layer "${layer.name}"?`)) return;
        if (this.doc.removeLayer(this.doc.activeLayerIndex)) {
            this.bus.emit('layer-changed');
        }
    }

    _moveLayer(dir) {
        const from = this.doc.activeLayerIndex;
        // dir=-1 means "up" visually = higher index in array
        const to = from - dir;
        if (this.doc.moveLayer(from, to)) {
            this.bus.emit('layer-changed');
        }
    }

    _duplicateLayer() {
        this.doc.duplicateLayer(this.doc.activeLayerIndex);
        this.bus.emit('layer-changed');
    }
}
