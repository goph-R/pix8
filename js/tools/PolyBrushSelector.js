import { BaseTool } from './BaseTool.js';

export class PolyBrushSelector extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Poly Select';
        this.shortcut = '';
        this.icon = 'images/icon-polybrushselect.svg';
        this._vertices = [];
        this._currentX = 0;
        this._currentY = 0;
    }

    onHover() {} // no brush preview

    onPointerDown(x, y, e) {
        // Close polygon if clicking near first vertex
        if (this._vertices.length >= 3) {
            const [fx, fy] = this._vertices[0];
            if (Math.abs(x - fx) <= 2 && Math.abs(y - fy) <= 2) {
                this._finalize();
                return;
            }
        }
        this._vertices.push([x, y]);
    }

    onPointerMove(x, y, e) {
        this._currentX = x;
        this._currentY = y;
        this._drawPreview();
    }

    onPointerUp(x, y, e) {
        // nothing — vertices placed on pointerDown
    }

    onDoubleClick() {
        if (this._vertices.length >= 3) {
            this._finalize();
        }
    }

    _drawPreview() {
        this.canvasView.clearOverlay();
        if (this._vertices.length === 0) return;

        const ctx = this.canvasView.overlayCtx;
        const zoom = this.canvasView.zoom;
        const px = this.canvasView.panX;
        const py = this.canvasView.panY;

        ctx.strokeStyle = 'rgba(0, 200, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();

        const [sx, sy] = this._vertices[0];
        ctx.moveTo(px + (sx + 0.5) * zoom, py + (sy + 0.5) * zoom);

        for (let i = 1; i < this._vertices.length; i++) {
            const [vx, vy] = this._vertices[i];
            ctx.moveTo(px + (this._vertices[i - 1][0] + 0.5) * zoom, py + (this._vertices[i - 1][1] + 0.5) * zoom);
            ctx.lineTo(px + (vx + 0.5) * zoom, py + (vy + 0.5) * zoom);
        }

        // Line to current cursor
        const last = this._vertices[this._vertices.length - 1];
        ctx.moveTo(px + (last[0] + 0.5) * zoom, py + (last[1] + 0.5) * zoom);
        ctx.lineTo(px + (this._currentX + 0.5) * zoom, py + (this._currentY + 0.5) * zoom);

        ctx.stroke();
        ctx.setLineDash([]);

        // Draw vertices as dots
        ctx.fillStyle = 'rgba(0, 200, 255, 0.9)';
        for (const [vx, vy] of this._vertices) {
            ctx.fillRect(px + vx * zoom - 1, py + vy * zoom - 1, 3, 3);
        }
    }

    _finalize() {
        this.canvasView.clearOverlay();

        const verts = this._vertices;
        this._vertices = [];

        if (verts.length < 3) return;

        const sel = this.doc.selection;
        if (sel.hasFloating()) {
            sel.commitFloating(this.doc.getActiveLayer());
        }

        sel.selectPolygon(verts);
        this.bus.emit('selection-changed');
    }

    deactivate() {
        this._vertices = [];
        this.canvasView.clearOverlay();
    }
}
