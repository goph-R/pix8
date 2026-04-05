export class PaletteEditDialog {
    constructor(doc, bus) {
        this.doc = doc;
        this.bus = bus;
        this.onClose = null;

        this._overlay = null;
        this._onKey = null;
        this._dlgSwatches = [];
        this._rangeStart = doc.fgColorIndex;
        this._rangeEnd = doc.fgColorIndex;
        this._dragging = false;
        this._6bit = true;
        this._pendingOp = null;
        this._originalPalette = null;
        this._originalLayers = null;
        this._statusEl = null;
        this._usedHighlight = false;

        this._rSlider = null; this._gSlider = null; this._bSlider = null;
        this._rNum = null; this._gNum = null; this._bNum = null;
        this._indexLabel = null;
        this._rangePreview = null;
        this._grid = null;
    }

    open() {
        this._originalPalette = this.doc.palette.export();
        this._originalLayers = this.doc.layers.map(l => l.clone());
        this._buildDOM();
        document.body.appendChild(this._overlay);
    }

    // ── DOM Construction ──────────────────────────────────────────────

    _buildDOM() {
        const overlay = document.createElement('div');
        overlay.className = 'palette-dialog-overlay';
        this._overlay = overlay;

        const dialog = document.createElement('div');
        dialog.className = 'palette-dialog';

        // Header
        const header = document.createElement('div');
        header.className = 'palette-dialog-header';
        header.innerHTML = '<span>Edit Palette</span>';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'palette-dialog-close';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => this._cancel());
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        // Toolbar (full width)
        dialog.appendChild(this._buildToolbar());

        // Status message (for two-step ops)
        const status = document.createElement('div');
        status.className = 'palette-dialog-status';
        status.style.display = 'none';
        this._statusEl = status;
        dialog.appendChild(status);

        // Index label
        const indexLabel = document.createElement('div');
        indexLabel.className = 'palette-dialog-index';
        this._indexLabel = indexLabel;
        dialog.appendChild(indexLabel);

        // Grid row: grid (left) + sliders (right)
        const gridRow = document.createElement('div');
        gridRow.className = 'ped-grid-row';

        const grid = document.createElement('div');
        grid.className = 'palette-dialog-grid';
        this._grid = grid;
        this._dlgSwatches = [];

        for (let i = 0; i < 256; i++) {
            const sw = document.createElement('div');
            sw.className = 'palette-dialog-swatch';
            sw.dataset.index = i;
            const [r, g, b] = this.doc.palette.getColor(i);
            sw.style.backgroundColor = `rgb(${r},${g},${b})`;
            grid.appendChild(sw);
            this._dlgSwatches.push(sw);
        }

        grid.addEventListener('pointerdown', (e) => this._onGridPointerDown(e));
        grid.addEventListener('pointermove', (e) => this._onGridPointerMove(e));
        grid.addEventListener('pointerup', (e) => this._onGridPointerUp(e));

        // Grid column: grid + range preview stacked
        const gridCol = document.createElement('div');
        gridCol.className = 'ped-grid-col';
        gridCol.appendChild(grid);

        const rangePreview = document.createElement('div');
        rangePreview.className = 'palette-dialog-range-preview';
        this._rangePreview = rangePreview;
        gridCol.appendChild(rangePreview);

        gridRow.appendChild(gridCol);
        gridRow.appendChild(this._buildSliders());
        dialog.appendChild(gridRow);

        // Footer: 6-bit checkbox on left, OK/Cancel on right
        const footer = document.createElement('div');
        footer.className = 'palette-dialog-footer';

        const checkRow = document.createElement('div');
        checkRow.className = 'palette-dialog-6bit';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'palette-6bit-check';
        checkbox.checked = this._6bit;
        checkbox.addEventListener('change', () => this._on6bitToggle(checkbox));
        const checkLabel = document.createElement('label');
        checkLabel.htmlFor = 'palette-6bit-check';
        checkLabel.textContent = '6 bit/channel';
        checkRow.appendChild(checkbox);
        checkRow.appendChild(checkLabel);
        footer.appendChild(checkRow);

        const btnGroup = document.createElement('div');
        btnGroup.className = 'palette-dialog-footer-btns';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => this._cancel());
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.className = 'primary';
        okBtn.addEventListener('click', () => this._ok());
        btnGroup.appendChild(cancelBtn);
        btnGroup.appendChild(okBtn);
        footer.appendChild(btnGroup);
        dialog.appendChild(footer);

        overlay.appendChild(dialog);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this._cancel();
        });

        this._onKey = (e) => {
            if (e.key === 'Escape') {
                if (this._pendingOp) {
                    this._cancelPendingOp();
                } else {
                    this._cancel();
                }
            }
        };
        document.addEventListener('keydown', this._onKey);

        this._updateRangeHighlight();
        this._updateRangePreview();
        this._syncSliders();
    }

    _buildToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'palette-dialog-toolbar';

        const btn = (label, action) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.addEventListener('click', action);
            toolbar.appendChild(b);
            return b;
        };

        this._swapBtn = btn('Swap', () => this._startPendingOp('swap'));
        this._xswapBtn = btn('X-Swap', () => this._startPendingOp('xswap'));
        this._copyBtn = btn('Copy', () => this._startPendingOp('copy'));
        this._flipBtn = btn('Flip', () => this._actionFlip());
        this._xflipBtn = btn('X-Flip', () => this._actionXFlip());

        // Sort select
        const sortSel = document.createElement('select');
        sortSel.className = 'palette-dialog-toolbar-select';
        this._sortSel = sortSel;
        for (const [val, label] of [['', 'Sort...'], ['hue', 'Hue/Light'], ['light', 'Lightness'], ['hist', 'Histogram']]) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = label;
            sortSel.appendChild(opt);
        }
        sortSel.addEventListener('change', () => {
            if (sortSel.value) {
                this._actionSort(sortSel.value);
                sortSel.value = '';
            }
        });
        toolbar.appendChild(sortSel);

        btn('Used', () => this._actionUsed());
        this._negBtn = btn('Neg', () => this._actionNeg());
        this._grayBtn = btn('Gray', () => this._actionGray());
        this._spreadBtn = btn('Spread', () => this._actionSpread());
        this._mergeBtn = btn('Merge', () => this._actionMerge());
        btn('Zap', () => this._actionZapUnused());

        // Separator
        const sep = document.createElement('div');
        sep.className = 'ped-toolbar-sep';
        toolbar.appendChild(sep);

        // Reduce row
        const reduceRow = document.createElement('div');
        reduceRow.className = 'ped-reduce-row';
        const reduceBtn = document.createElement('button');
        reduceBtn.textContent = 'Reduce to';
        const reduceNum = document.createElement('input');
        reduceNum.type = 'number';
        reduceNum.min = 1;
        reduceNum.max = 256;
        reduceNum.value = 16;
        reduceNum.className = 'palette-dialog-toolbar-num';
        reduceBtn.addEventListener('click', () => this._actionReduce(parseInt(reduceNum.value) || 16));
        reduceRow.appendChild(reduceBtn);
        reduceRow.appendChild(reduceNum);
        toolbar.appendChild(reduceRow);

        return toolbar;
    }

    _buildSliders() {
        const container = document.createElement('div');
        container.className = 'ped-sliders';

        const makeSlider = (label) => {
            const col = document.createElement('div');
            col.className = 'ped-slider-col';

            const lbl = document.createElement('div');
            lbl.className = 'ped-slider-label';
            lbl.textContent = label;
            col.appendChild(lbl);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = 0;
            slider.max = this._6bit ? 63 : 255;
            slider.value = 0;
            slider.orient = 'vertical';
            slider.className = 'ped-vslider';
            col.appendChild(slider);

            const num = document.createElement('input');
            num.type = 'number';
            num.min = 0;
            num.max = this._6bit ? 63 : 255;
            num.value = 0;
            num.className = 'ped-slider-num';
            col.appendChild(num);

            container.appendChild(col);
            return { slider, num };
        };

        const r = makeSlider('R');
        const g = makeSlider('G');
        const b = makeSlider('B');

        this._rSlider = r.slider; this._rNum = r.num;
        this._gSlider = g.slider; this._gNum = g.num;
        this._bSlider = b.slider; this._bNum = b.num;

        const applyColor = () => {
            const rv = parseInt(this._rSlider.value);
            const gv = parseInt(this._gSlider.value);
            const bv = parseInt(this._bSlider.value);
            this._rNum.value = rv;
            this._gNum.value = gv;
            this._bNum.value = bv;
            this._applySliderColor(rv, gv, bv);
        };

        const applyFromNum = () => {
            const max = this._6bit ? 63 : 255;
            const rv = Math.min(max, Math.max(0, parseInt(this._rNum.value) || 0));
            const gv = Math.min(max, Math.max(0, parseInt(this._gNum.value) || 0));
            const bv = Math.min(max, Math.max(0, parseInt(this._bNum.value) || 0));
            this._rSlider.value = rv;
            this._gSlider.value = gv;
            this._bSlider.value = bv;
            this._applySliderColor(rv, gv, bv);
        };

        for (const s of [this._rSlider, this._gSlider, this._bSlider]) {
            s.addEventListener('input', applyColor);
        }
        for (const n of [this._rNum, this._gNum, this._bNum]) {
            n.addEventListener('change', applyFromNum);
        }

        return container;
    }

    _applySliderColor(rv, gv, bv) {
        const r = this._6bit ? rv * 4 : rv;
        const g = this._6bit ? gv * 4 : gv;
        const b = this._6bit ? bv * 4 : bv;
        const idx = this._rangeStart;
        this.doc.palette.setColor(idx, r, g, b);
        const css = `rgb(${r},${g},${b})`;
        this._dlgSwatches[idx].style.backgroundColor = css;

        this._updateRangePreview();
        this.bus.emit('palette-changed');
    }

    // ── Grid Pointer Events (Range Selection) ─────────────────────────

    _hitTestGrid(e) {
        const rect = this._grid.getBoundingClientRect();
        const col = Math.floor((e.clientX - rect.left) / (rect.width / 16));
        const row = Math.floor((e.clientY - rect.top) / (rect.height / 16));
        return Math.max(0, Math.min(255, row * 16 + Math.max(0, Math.min(15, col))));
    }

    _onGridPointerDown(e) {
        if (e.button !== 0) return;
        const idx = this._hitTestGrid(e);

        if (this._pendingOp) {
            this._executePendingOp(idx);
            return;
        }

        this._dragging = true;
        this._rangeStart = idx;
        this._rangeEnd = idx;
        this._grid.setPointerCapture(e.pointerId);
        this._updateRangeHighlight();
        this._updateRangePreview();
        this._syncSliders();
    }

    _onGridPointerMove(e) {
        if (!this._dragging) return;
        const idx = this._hitTestGrid(e);
        this._rangeEnd = idx;
        this._updateRangeHighlight();
        this._updateRangePreview();
    }

    _onGridPointerUp(e) {
        if (!this._dragging) return;
        this._dragging = false;
        this._grid.releasePointerCapture(e.pointerId);
        if (this._rangeStart > this._rangeEnd) {
            const tmp = this._rangeStart;
            this._rangeStart = this._rangeEnd;
            this._rangeEnd = tmp;
        }
        this._updateRangeHighlight();
        this._updateRangePreview();
        this._syncSliders();
    }

    _sortedRange() {
        const lo = Math.min(this._rangeStart, this._rangeEnd);
        const hi = Math.max(this._rangeStart, this._rangeEnd);
        return [lo, hi];
    }

    _updateRangeHighlight() {
        const [lo, hi] = this._sortedRange();
        for (let i = 0; i < 256; i++) {
            const sw = this._dlgSwatches[i];
            sw.classList.toggle('in-range', i >= lo && i <= hi);
            sw.classList.toggle('range-end', i === lo || i === hi);
        }
        this._updateRangeButtons();
    }

    _updateRangeButtons() {
        const [lo, hi] = this._sortedRange();
        const hasRange = hi > lo;
        for (const b of [this._swapBtn, this._xswapBtn, this._copyBtn,
            this._flipBtn, this._xflipBtn, this._negBtn, this._grayBtn,
            this._spreadBtn, this._mergeBtn]) {
            if (b) b.disabled = !hasRange;
        }
        if (this._sortSel) this._sortSel.disabled = !hasRange;
    }

    _updateRangePreview() {
        const [lo, hi] = this._sortedRange();
        this._rangePreview.innerHTML = '';
        for (let i = lo; i <= hi; i++) {
            const strip = document.createElement('div');
            strip.className = 'range-color';
            const [r, g, b] = this.doc.palette.getColor(i);
            strip.style.backgroundColor = `rgb(${r},${g},${b})`;
            this._rangePreview.appendChild(strip);
        }
    }

    _syncSliders() {
        const [lo, hi] = this._sortedRange();
        const [r, g, b] = this.doc.palette.getColor(this._rangeStart);
        if (lo === hi) {
            this._indexLabel.textContent = `Index: ${lo}`;
        } else {
            this._indexLabel.textContent = `Index: ${lo}\u2013${hi} (${hi - lo + 1} colors)`;
        }
        if (this._6bit) {
            this._rSlider.value = Math.round(r / 4);
            this._gSlider.value = Math.round(g / 4);
            this._bSlider.value = Math.round(b / 4);
            this._rNum.value = Math.round(r / 4);
            this._gNum.value = Math.round(g / 4);
            this._bNum.value = Math.round(b / 4);
        } else {
            this._rSlider.value = r;
            this._gSlider.value = g;
            this._bSlider.value = b;
            this._rNum.value = r;
            this._gNum.value = g;
            this._bNum.value = b;
        }
    }

    updateSwatches() {
        for (let i = 0; i < 256; i++) {
            const [r, g, b] = this.doc.palette.getColor(i);
            this._dlgSwatches[i].style.backgroundColor = `rgb(${r},${g},${b})`;
        }
        this._updateRangePreview();
        this._syncSliders();
    }

    // ── 6-Bit Toggle ──────────────────────────────────────────────────

    _on6bitToggle(checkbox) {
        if (checkbox.checked) {
            if (!confirm('Convert current colors to 6-bit?')) {
                checkbox.checked = false;
                return;
            }
            for (let i = 0; i < 256; i++) {
                const [r, g, b] = this.doc.palette.getColor(i);
                this.doc.palette.setColor(i,
                    Math.round(r / 4) * 4,
                    Math.round(g / 4) * 4,
                    Math.round(b / 4) * 4
                );
            }
            this._6bit = true;
            this._updateSliderRange(63);
            this.updateSwatches();
            this.bus.emit('palette-changed');
        } else {
            if (!confirm('Convert current colors to 8-bit?')) {
                checkbox.checked = true;
                return;
            }
            this._6bit = false;
            this._updateSliderRange(255);
            this._syncSliders();
        }
    }

    _updateSliderRange(max) {
        for (const s of [this._rSlider, this._gSlider, this._bSlider]) {
            s.max = max;
        }
        for (const n of [this._rNum, this._gNum, this._bNum]) {
            n.max = max;
        }
    }

    _snapIf6bit(r, g, b) {
        if (!this._6bit) return [r, g, b];
        return [
            Math.round(r / 4) * 4,
            Math.round(g / 4) * 4,
            Math.round(b / 4) * 4
        ];
    }

    // ── Simple Operations ─────────────────────────────────────────────

    _actionFlip() {
        const [lo, hi] = this._sortedRange();
        if (lo === hi) return;
        const pal = this.doc.palette;
        for (let i = 0; i < Math.floor((hi - lo + 1) / 2); i++) {
            const a = [...pal.getColor(lo + i)];
            const b = [...pal.getColor(hi - i)];
            pal.setColor(lo + i, ...b);
            pal.setColor(hi - i, ...a);
        }
        this.updateSwatches();
        this.bus.emit('palette-changed');
    }

    _actionXFlip() {
        const [lo, hi] = this._sortedRange();
        if (lo === hi) return;
        const mapping = new Array(256);
        for (let i = 0; i < 256; i++) mapping[i] = i;
        for (let i = 0; i <= hi - lo; i++) {
            mapping[lo + i] = hi - i;
        }
        this._actionFlip();
        this.doc.remapColorIndices(mapping);
        this.bus.emit('document-changed');
    }

    _actionNeg() {
        const [lo, hi] = this._sortedRange();
        const pal = this.doc.palette;
        for (let i = lo; i <= hi; i++) {
            const [r, g, b] = pal.getColor(i);
            pal.setColor(i, ...this._snapIf6bit(255 - r, 255 - g, 255 - b));
        }
        this.updateSwatches();
        this.bus.emit('palette-changed');
    }

    _actionGray() {
        const [lo, hi] = this._sortedRange();
        const pal = this.doc.palette;
        for (let i = lo; i <= hi; i++) {
            const [r, g, b] = pal.getColor(i);
            const avg = Math.round((r + g + b) / 3);
            const [sr, sg, sb] = this._snapIf6bit(avg, avg, avg);
            pal.setColor(i, sr, sg, sb);
        }
        this.updateSwatches();
        this.bus.emit('palette-changed');
    }

    _actionSpread() {
        const [lo, hi] = this._sortedRange();
        if (hi - lo < 2) return;
        const pal = this.doc.palette;
        const [r0, g0, b0] = pal.getColor(lo);
        const [r1, g1, b1] = pal.getColor(hi);
        const n = hi - lo;
        for (let i = 1; i < n; i++) {
            const t = i / n;
            const r = Math.round(r0 + (r1 - r0) * t);
            const g = Math.round(g0 + (g1 - g0) * t);
            const b = Math.round(b0 + (b1 - b0) * t);
            pal.setColor(lo + i, ...this._snapIf6bit(r, g, b));
        }
        this.updateSwatches();
        this.bus.emit('palette-changed');
    }

    _actionMerge() {
        const [lo, hi] = this._sortedRange();
        if (lo === hi) return;
        const pal = this.doc.palette;
        const [r, g, b] = pal.getColor(lo);
        for (let i = lo + 1; i <= hi; i++) {
            pal.setColor(i, r, g, b);
        }
        this.updateSwatches();
        this.bus.emit('palette-changed');
    }

    // ── Two-Step Operations ───────────────────────────────────────────

    _startPendingOp(type) {
        if (this._pendingOp && this._pendingOp.type === type) {
            this._cancelPendingOp();
            return;
        }
        this._cancelPendingOp();
        const [lo, hi] = this._sortedRange();
        const rangeLen = hi - lo + 1;
        this._pendingOp = { type, srcStart: lo, srcEnd: hi, rangeLen };
        this._grid.classList.add('pending-op');

        const labels = { swap: 'Swap', xswap: 'X-Swap', copy: 'Copy' };
        this._statusEl.textContent = `Click destination for ${labels[type]} (${rangeLen} colors)`;
        this._statusEl.style.display = '';

        this._swapBtn.classList.toggle('active', type === 'swap');
        this._xswapBtn.classList.toggle('active', type === 'xswap');
        this._copyBtn.classList.toggle('active', type === 'copy');
    }

    _cancelPendingOp() {
        this._pendingOp = null;
        this._grid.classList.remove('pending-op');
        this._statusEl.style.display = 'none';
        this._swapBtn.classList.remove('active');
        this._xswapBtn.classList.remove('active');
        this._copyBtn.classList.remove('active');
    }

    _executePendingOp(destStart) {
        const op = this._pendingOp;
        if (!op) return;

        const destEnd = destStart + op.rangeLen - 1;
        if (destEnd > 255) {
            this._cancelPendingOp();
            return;
        }

        if (op.type !== 'copy') {
            const srcLo = op.srcStart, srcHi = op.srcEnd;
            if (!(destEnd < srcLo || destStart > srcHi)) {
                return;
            }
        }

        const pal = this.doc.palette;
        const len = op.rangeLen;

        if (op.type === 'swap' || op.type === 'xswap') {
            for (let i = 0; i < len; i++) {
                const a = [...pal.getColor(op.srcStart + i)];
                const b = [...pal.getColor(destStart + i)];
                pal.setColor(op.srcStart + i, ...b);
                pal.setColor(destStart + i, ...a);
            }
            if (op.type === 'xswap') {
                const mapping = new Array(256);
                for (let i = 0; i < 256; i++) mapping[i] = i;
                for (let i = 0; i < len; i++) {
                    mapping[op.srcStart + i] = destStart + i;
                    mapping[destStart + i] = op.srcStart + i;
                }
                this.doc.remapColorIndices(mapping);
                this.bus.emit('document-changed');
            }
        } else if (op.type === 'copy') {
            for (let i = 0; i < len; i++) {
                const [r, g, b] = pal.getColor(op.srcStart + i);
                pal.setColor(destStart + i, r, g, b);
            }
        }

        this._cancelPendingOp();
        this._rangeStart = destStart;
        this._rangeEnd = destEnd;
        this.updateSwatches();
        this._updateRangeHighlight();
        this.bus.emit('palette-changed');
    }

    // ── Used / Zap Unused ─────────────────────────────────────────────

    _actionUsed() {
        this._usedHighlight = !this._usedHighlight;
        if (this._usedHighlight) {
            const used = this.doc.getUsedColorIndices();
            for (let i = 0; i < 256; i++) {
                this._dlgSwatches[i].classList.toggle('color-used', used.has(i));
            }
        } else {
            for (let i = 0; i < 256; i++) {
                this._dlgSwatches[i].classList.remove('color-used');
            }
        }
    }

    _actionZapUnused() {
        const used = this.doc.getUsedColorIndices();
        const usedCount = used.size;
        if (!confirm(`Reduce the colors to ${usedCount}?`)) return;

        const usedArr = [...used].sort((a, b) => a - b);
        const mapping = new Array(256).fill(0);
        const newColors = [];

        for (let i = 0; i < usedArr.length; i++) {
            mapping[usedArr[i]] = i;
            newColors.push([...this.doc.palette.getColor(usedArr[i])]);
        }

        while (newColors.length < 256) {
            newColors.push([0, 0, 0]);
        }

        for (let i = 0; i < 256; i++) {
            this.doc.palette.setColor(i, ...newColors[i]);
        }
        this.doc.remapColorIndices(mapping);
        this._rangeStart = 0;
        this._rangeEnd = Math.max(0, usedCount - 1);
        this.updateSwatches();
        this._updateRangeHighlight();
        this.bus.emit('palette-changed');
        this.bus.emit('document-changed');
    }

    // ── Sort ──────────────────────────────────────────────────────────

    _actionSort(mode) {
        const [lo, hi] = this._sortedRange();
        if (lo === hi) return;
        const pal = this.doc.palette;

        const entries = [];
        for (let i = lo; i <= hi; i++) {
            entries.push({ index: i, color: [...pal.getColor(i)] });
        }

        if (mode === 'hue') {
            entries.sort((a, b) => {
                const ha = this._rgbToHsl(a.color);
                const hb = this._rgbToHsl(b.color);
                return ha[0] - hb[0] || ha[2] - hb[2];
            });
        } else if (mode === 'light') {
            entries.sort((a, b) => {
                return (a.color[0] + a.color[1] + a.color[2]) -
                       (b.color[0] + b.color[1] + b.color[2]);
            });
        } else if (mode === 'hist') {
            const hist = this.doc.getColorHistogram();
            entries.sort((a, b) => hist[b.index] - hist[a.index]);
        }

        for (let i = 0; i < entries.length; i++) {
            pal.setColor(lo + i, ...entries[i].color);
        }

        this.updateSwatches();
        this.bus.emit('palette-changed');
    }

    _rgbToHsl([r, g, b]) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return [0, 0, l];
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
        return [h, s, l];
    }

    // ── Reduce ────────────────────────────────────────────────────────

    _actionReduce(n) {
        if (n < 1 || n > 256) return;
        const pal = this.doc.palette;
        const hist = this.doc.getColorHistogram();
        const used = this.doc.getUsedColorIndices();

        // Collect all distinct non-black palette entries (or used ones)
        const colorSet = new Set();
        const colors = [];
        for (let i = 0; i < 256; i++) {
            const [r, g, b] = pal.getColor(i);
            const key = (r << 16) | (g << 8) | b;
            if (!colorSet.has(key) || used.has(i)) {
                colors.push({ index: i, color: [r, g, b], count: hist[i] || 0 });
                colorSet.add(key);
            }
        }

        if (colors.length <= n) return;

        const representatives = this._medianCut(colors, n);

        const newColors = representatives.map(rep => rep.color);

        // Map every palette index to nearest representative
        const mapping = new Array(256);
        for (let i = 0; i < 256; i++) {
            const [r, g, b] = pal.getColor(i);
            let bestDist = Infinity, bestI = 0;
            for (let j = 0; j < newColors.length; j++) {
                const [cr, cg, cb] = newColors[j];
                const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
                if (dist < bestDist) { bestDist = dist; bestI = j; }
            }
            mapping[i] = bestI;
        }

        // Write new palette: N colors at front, rest black
        for (let i = 0; i < 256; i++) {
            if (i < newColors.length) {
                pal.setColor(i, ...this._snapIf6bit(...newColors[i]));
            } else {
                pal.setColor(i, 0, 0, 0);
            }
        }

        this.doc.remapColorIndices(mapping);
        this._rangeStart = 0;
        this._rangeEnd = Math.max(0, newColors.length - 1);
        this.updateSwatches();
        this._updateRangeHighlight();
        this.bus.emit('palette-changed');
        this.bus.emit('document-changed');
    }

    _medianCut(colors, n) {
        if (colors.length <= n) return colors;

        let buckets = [colors];

        while (buckets.length < n) {
            let bestBucket = 0, bestRange = -1, bestChannel = 0;
            for (let bi = 0; bi < buckets.length; bi++) {
                const bucket = buckets[bi];
                if (bucket.length < 2) continue;
                for (let ch = 0; ch < 3; ch++) {
                    let min = 255, max = 0;
                    for (const c of bucket) {
                        if (c.color[ch] < min) min = c.color[ch];
                        if (c.color[ch] > max) max = c.color[ch];
                    }
                    if (max - min > bestRange) {
                        bestRange = max - min;
                        bestBucket = bi;
                        bestChannel = ch;
                    }
                }
            }

            if (bestRange <= 0) break;

            const bucket = buckets[bestBucket];
            bucket.sort((a, b) => a.color[bestChannel] - b.color[bestChannel]);
            const mid = Math.floor(bucket.length / 2);
            buckets.splice(bestBucket, 1, bucket.slice(0, mid), bucket.slice(mid));
        }

        return buckets.map(bucket => {
            let totalW = 0, rSum = 0, gSum = 0, bSum = 0;
            for (const c of bucket) {
                const w = c.count || 1;
                totalW += w;
                rSum += c.color[0] * w;
                gSum += c.color[1] * w;
                bSum += c.color[2] * w;
            }
            return {
                color: [
                    Math.round(rSum / totalW),
                    Math.round(gSum / totalW),
                    Math.round(bSum / totalW)
                ]
            };
        });
    }

    // ── OK / Cancel ───────────────────────────────────────────────────

    _ok() {
        this._destroy();
    }

    _cancel() {
        this.doc.palette.import(this._originalPalette);
        this.doc.layers = this._originalLayers;
        this.bus.emit('palette-changed');
        this.bus.emit('document-changed');
        this._destroy();
    }

    _destroy() {
        document.removeEventListener('keydown', this._onKey);
        this._overlay.remove();
        this.onClose?.();
    }
}
