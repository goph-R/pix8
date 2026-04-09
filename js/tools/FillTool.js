import { BaseTool } from './BaseTool.js';
import { TRANSPARENT } from '../constants.js';

export class FillTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Fill';
        this.shortcut = 'G';
        this.icon = 'images/icon-fill.svg';
    }

    onHover() {} // no brush preview

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
