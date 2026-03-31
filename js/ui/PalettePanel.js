export class PalettePanel {
    constructor(doc, bus) {
        this.doc = doc;
        this.bus = bus;

        this.grid = document.getElementById('palette-grid');
        this._swatches = [];
        this._dialog = null;

        this._buildGrid();

        document.getElementById('palette-edit-btn').addEventListener('click', () => this._openDialog());

        this.bus.on('fg-color-changed', () => this._updateSelection());
        this.bus.on('bg-color-changed', () => this._updateSelection());
        this.bus.on('palette-changed', () => this._updateAllSwatches());
    }

    _buildGrid() {
        this.grid.innerHTML = '';
        for (let i = 0; i < 256; i++) {
            const swatch = document.createElement('div');
            swatch.className = 'palette-swatch';
            swatch.dataset.index = i;

            const [r, g, b] = this.doc.palette.getColor(i);
            swatch.style.backgroundColor = `rgb(${r},${g},${b})`;

            swatch.addEventListener('click', () => {
                this.doc.fgColorIndex = i;
                this.bus.emit('fg-color-changed');
            });

            swatch.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.doc.bgColorIndex = i;
                this.bus.emit('bg-color-changed');
            });

            this.grid.appendChild(swatch);
            this._swatches.push(swatch);
        }
        this._updateSelection();
    }

    _updateSelection() {
        for (let i = 0; i < 256; i++) {
            const sw = this._swatches[i];
            sw.classList.toggle('fg-selected', i === this.doc.fgColorIndex);
            sw.classList.toggle('bg-selected', i === this.doc.bgColorIndex);
        }
    }

    _updateAllSwatches() {
        for (let i = 0; i < 256; i++) {
            const [r, g, b] = this.doc.palette.getColor(i);
            this._swatches[i].style.backgroundColor = `rgb(${r},${g},${b})`;
        }
        // Also update dialog swatches if open
        if (this._dialog) {
            this._dialog.updateSwatches();
        }
    }

    _openDialog() {
        if (this._dialog) {
            this._dialog.overlay.remove();
            this._dialog = null;
        }

        const overlay = document.createElement('div');
        overlay.className = 'palette-dialog-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'palette-dialog';

        // Header
        const header = document.createElement('div');
        header.className = 'palette-dialog-header';
        header.innerHTML = '<span>Edit Palette</span>';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'palette-dialog-close';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => this._closeDialog());
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        // Palette grid
        const grid = document.createElement('div');
        grid.className = 'palette-dialog-grid';
        const dlgSwatches = [];
        let selectedIndex = this.doc.fgColorIndex;

        const updateDlgSelection = () => {
            for (let i = 0; i < 256; i++) {
                dlgSwatches[i].classList.toggle('selected', i === selectedIndex);
            }
        };

        const syncSliders = () => {
            const [r, g, b] = this.doc.palette.getColor(selectedIndex);
            indexLabel.textContent = `Index: ${selectedIndex}`;
            preview.style.backgroundColor = `rgb(${r},${g},${b})`;
            rSlider.value = r; rNum.value = r;
            gSlider.value = g; gNum.value = g;
            bSlider.value = b; bNum.value = b;
        };

        for (let i = 0; i < 256; i++) {
            const sw = document.createElement('div');
            sw.className = 'palette-dialog-swatch';
            const [r, g, b] = this.doc.palette.getColor(i);
            sw.style.backgroundColor = `rgb(${r},${g},${b})`;
            sw.addEventListener('click', () => {
                selectedIndex = i;
                updateDlgSelection();
                syncSliders();
            });
            grid.appendChild(sw);
            dlgSwatches.push(sw);
        }
        dialog.appendChild(grid);

        // Editor area
        const editor = document.createElement('div');
        editor.className = 'palette-dialog-editor';

        const indexLabel = document.createElement('div');
        indexLabel.className = 'palette-dialog-index';

        const preview = document.createElement('div');
        preview.className = 'palette-dialog-preview';

        editor.appendChild(indexLabel);
        editor.appendChild(preview);

        const makeRow = (label, id) => {
            const row = document.createElement('div');
            row.className = 'palette-dialog-row';
            const lbl = document.createElement('label');
            lbl.textContent = label;
            const slider = document.createElement('input');
            slider.type = 'range'; slider.min = 0; slider.max = 255; slider.value = 0;
            const num = document.createElement('input');
            num.type = 'number'; num.min = 0; num.max = 255; num.value = 0;
            row.appendChild(lbl);
            row.appendChild(slider);
            row.appendChild(num);
            editor.appendChild(row);
            return { slider, num };
        };

        const { slider: rSlider, num: rNum } = makeRow('R');
        const { slider: gSlider, num: gNum } = makeRow('G');
        const { slider: bSlider, num: bNum } = makeRow('B');

        const applyColor = () => {
            const r = parseInt(rSlider.value);
            const g = parseInt(gSlider.value);
            const b = parseInt(bSlider.value);
            rNum.value = r; gNum.value = g; bNum.value = b;
            this.doc.palette.setColor(selectedIndex, r, g, b);
            const css = `rgb(${r},${g},${b})`;
            preview.style.backgroundColor = css;
            dlgSwatches[selectedIndex].style.backgroundColor = css;
            this._swatches[selectedIndex].style.backgroundColor = css;
            this.bus.emit('palette-changed');
        };

        const applyFromNum = () => {
            const r = Math.min(255, Math.max(0, parseInt(rNum.value) || 0));
            const g = Math.min(255, Math.max(0, parseInt(gNum.value) || 0));
            const b = Math.min(255, Math.max(0, parseInt(bNum.value) || 0));
            rSlider.value = r; gSlider.value = g; bSlider.value = b;
            this.doc.palette.setColor(selectedIndex, r, g, b);
            const css = `rgb(${r},${g},${b})`;
            preview.style.backgroundColor = css;
            dlgSwatches[selectedIndex].style.backgroundColor = css;
            this._swatches[selectedIndex].style.backgroundColor = css;
            this.bus.emit('palette-changed');
        };

        for (const s of [rSlider, gSlider, bSlider]) s.addEventListener('input', applyColor);
        for (const n of [rNum, gNum, bNum]) n.addEventListener('change', applyFromNum);

        dialog.appendChild(editor);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Close on overlay click (not dialog)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this._closeDialog();
        });

        // Close on Escape
        const onKey = (e) => {
            if (e.key === 'Escape') this._closeDialog();
        };
        document.addEventListener('keydown', onKey);

        this._dialog = {
            overlay,
            onKey,
            updateSwatches: () => {
                for (let i = 0; i < 256; i++) {
                    const [r, g, b] = this.doc.palette.getColor(i);
                    dlgSwatches[i].style.backgroundColor = `rgb(${r},${g},${b})`;
                }
                syncSliders();
            }
        };

        updateDlgSelection();
        syncSliders();
    }

    _closeDialog() {
        if (!this._dialog) return;
        document.removeEventListener('keydown', this._dialog.onKey);
        this._dialog.overlay.remove();
        this._dialog = null;
    }
}
