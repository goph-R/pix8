import { PaletteEditDialog } from './PaletteEditDialog.js';

export class PalettePanel {
    constructor(doc, bus, undoManager) {
        this.doc = doc;
        this.bus = bus;
        this.undoManager = undoManager;

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
            this._dialog._destroy();
            this._dialog = null;
        }

        const dlg = new PaletteEditDialog(this.doc, this.bus, this.undoManager);
        dlg.onClose = () => { this._dialog = null; };
        dlg.open();
        this._dialog = dlg;
    }
}
