import { TRANSPARENT } from '../constants.js';

export class BaseTool {
    constructor(doc, bus, canvasView) {
        this.doc = doc;
        this.bus = bus;
        this.canvasView = canvasView;
        this.name = 'base';
        this.icon = '';
        this.shortcut = '';
    }

    onPointerDown(x, y, e) {}
    onPointerMove(x, y, e) {}
    onPointerUp(x, y, e) {}

    getCursor() {
        return 'crosshair';
    }

    previewBrush(x, y) {
        const brush = this.doc.activeBrush;
        const ox = brush.originX;
        const oy = brush.originY;
        const docW = this.doc.width;
        const docH = this.doc.height;
        const { zoom, panX, panY } = this.canvasView;
        const ctx = this.canvasView.overlayCtx;

        for (let by = 0; by < brush.height; by++) {
            for (let bx = 0; bx < brush.width; bx++) {
                const idx = brush.data[by * brush.width + bx];
                if (idx === TRANSPARENT) continue;
                const docX = x + bx - ox;
                const docY = y + by - oy;
                if (docX < 0 || docX >= docW || docY < 0 || docY >= docH) continue;
                if (this.doc.selection.active && !this.doc.selection.isSelected(docX, docY)) continue;
                const colorIndex = brush.isCaptured ? idx : this.doc.fgColorIndex;
                const [r, g, b] = this.doc.palette.getColor(colorIndex);
                ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
                ctx.fillRect(panX + docX * zoom, panY + docY * zoom, zoom, zoom);
            }
        }
    }

    stampBrush(layer, x, y, colorOverride) {
        const brush = this.doc.activeBrush;
        const ox = brush.originX;
        const oy = brush.originY;
        const docW = this.doc.width;
        const docH = this.doc.height;

        // Clamp brush footprint to document bounds
        const startBx = Math.max(0, -x + ox);
        const startBy = Math.max(0, -y + oy);
        const endBx = Math.min(brush.width, docW - x + ox);
        const endBy = Math.min(brush.height, docH - y + oy);

        if (startBx >= endBx || startBy >= endBy) return;

        // Pre-extend layer to cover the clamped brush footprint
        layer.ensureRect(
            x - ox + startBx, y - oy + startBy,
            x - ox + endBx - 1, y - oy + endBy - 1
        );

        for (let by = startBy; by < endBy; by++) {
            for (let bx = startBx; bx < endBx; bx++) {
                const idx = brush.data[by * brush.width + bx];
                if (idx === TRANSPARENT) continue;
                const docX = x + bx - ox;
                const docY = y + by - oy;
                if (this.doc.selection.active && !this.doc.selection.isSelected(docX, docY)) continue;
                const colorIndex = brush.isCaptured ? idx : (colorOverride !== undefined ? colorOverride : this.doc.fgColorIndex);
                layer.setPixelAutoExtend(docX, docY, colorIndex);
            }
        }
    }
}
