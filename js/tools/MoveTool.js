import { BaseTool } from './BaseTool.js';

export class MoveTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Move';
        this.shortcut = 'V';
        this.icon = `<svg viewBox="0 0 20 20"><path d="M10 2l3 3h-2v4h4V7l3 3-3 3v-2h-4v4h2l-3 3-3-3h2v-4H5v2l-3-3 3-3v2h4V5H7l3-3z"/></svg>`;
        this._startX = null;
        this._startY = null;
        this._origOffsetX = 0;
        this._origOffsetY = 0;
    }

    getCursor() {
        return 'grab';
    }

    onPointerDown(x, y, e) {
        const layer = this.doc.getActiveLayer();
        if (layer.locked) return;
        this._startX = x;
        this._startY = y;
        this._origOffsetX = layer.offsetX;
        this._origOffsetY = layer.offsetY;
    }

    onPointerMove(x, y, e) {
        if (this._startX === null) return;
        const layer = this.doc.getActiveLayer();
        layer.offsetX = this._origOffsetX + (x - this._startX);
        layer.offsetY = this._origOffsetY + (y - this._startY);
    }

    onPointerUp(x, y, e) {
        this._startX = null;
        this._startY = null;
    }
}
