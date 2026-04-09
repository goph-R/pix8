import { BaseSelector } from './BaseSelector.js';

export class RectSelector extends BaseSelector {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Rect Select';
        this.shortcut = 'M';
        this.icon = 'images/icon-rectselect.svg';
    }

    _applySelection(sel, minX, minY, maxX, maxY) {
        if (this._selectionMode === 'add') {
            sel.addRect(minX, minY, maxX, maxY);
        } else if (this._selectionMode === 'subtract') {
            sel.subtractRect(minX, minY, maxX, maxY);
        } else {
            sel.selectRect(minX, minY, maxX, maxY);
        }
    }
}
