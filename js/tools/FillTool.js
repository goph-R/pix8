import { BaseTool } from './BaseTool.js';
import { TRANSPARENT } from '../constants.js';

export class FillTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Fill';
        this.shortcut = 'G';
        this.icon = `<svg viewBox="0 0 20 20"><path d="M4 8h9v7a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"/><path d="M3 8h11l-1-3H4L3 8z"/><path d="M7 5V3"/><path d="M15 10c1 2 2 3 2 4.5a2 2 0 01-4 0c0-1.5 1-2.5 2-4.5z"/></svg>`;
    }

    getCursor() {
        return 'crosshair';
    }

    onPointerDown(x, y, e) {
        const layer = this.doc.getActiveLayer();
        if (!layer) return;
        const docW = this.doc.width;
        const docH = this.doc.height;
        if (x < 0 || x >= docW || y < 0 || y >= docH) return;

        const sel = this.doc.selection;
        if (sel.active && !sel.isSelected(x, y)) return;

        const fillColor = e.button === 2 ? this.doc.bgColorIndex : this.doc.fgColorIndex;
        const targetColor = layer.getPixelDoc(x, y);
        if (targetColor === fillColor) return;

        // Flood fill using a queue
        const visited = new Uint8Array(docW * docH);
        const queue = [x, y];
        visited[y * docW + x] = 1;

        while (queue.length > 0) {
            const py = queue.pop();
            const px = queue.pop();

            layer.setPixelAutoExtend(px, py, fillColor);

            const neighbors = [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]];
            for (const [nx, ny] of neighbors) {
                if (nx < 0 || nx >= docW || ny < 0 || ny >= docH) continue;
                if (visited[ny * docW + nx]) continue;
                if (sel.active && !sel.isSelected(nx, ny)) continue;
                if (layer.getPixelDoc(nx, ny) !== targetColor) continue;
                visited[ny * docW + nx] = 1;
                queue.push(nx, ny);
            }
        }
    }
}
