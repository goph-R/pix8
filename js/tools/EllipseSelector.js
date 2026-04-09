import { BaseSelector } from './BaseSelector.js';

export class EllipseSelector extends BaseSelector {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Ellipse Select';
        this.shortcut = 'Shift+M';
        this.icon = 'images/icon-ellipseselect.svg';
    }

    _drawResizePreview(x0, y0, x1, y1) {
        if (this.doc.selection._pureShape === 'ellipse') {
            this._drawEllipse(x0, y0, x1, y1);
        } else {
            this.canvasView.drawOverlayRect(x0, y0, x1, y1, this._overlayColor());
        }
    }

    _drawDragPreview(startX, startY, x, y) {
        const minX = Math.min(startX, x);
        const minY = Math.min(startY, y);
        const maxX = Math.max(startX, x);
        const maxY = Math.max(startY, y);
        this._drawEllipse(minX, minY, maxX, maxY);
    }

    _drawEllipse(x0, y0, x1, y1) {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const rx = (x1 - x0) / 2;
        const ry = (y1 - y0) / 2;
        if (rx > 0 && ry > 0) {
            this.canvasView.drawOverlayEllipse(cx, cy, rx, ry, this._overlayColor());
        }
    }

    _finishSelection(x0, y0, x, y) {
        // Edge-based: convert exclusive end to inclusive for Selection model
        const minX = Math.min(x0, x);
        const minY = Math.min(y0, y);
        const maxX = Math.max(x0, x) - 1;
        const maxY = Math.max(y0, y) - 1;
        if (maxX < minX || maxY < minY) return;

        const sel = this.doc.selection;
        this._applySelection(sel, minX, minY, maxX, maxY);
        this.canvasView.invalidateSelectionEdges();
        this.bus.emit('selection-changed');
    }

    _applySelection(sel, minX, minY, maxX, maxY) {
        if (this._selectionMode === 'add') {
            sel.addEllipse(minX, minY, maxX, maxY);
        } else if (this._selectionMode === 'subtract') {
            sel.subtractEllipse(minX, minY, maxX, maxY);
        } else {
            sel.selectEllipse(minX, minY, maxX, maxY);
        }
    }
}
