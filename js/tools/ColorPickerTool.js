import { BaseTool } from './BaseTool.js';
import { TRANSPARENT } from '../constants.js';

export class ColorPickerTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Color Picker';
        this.shortcut = 'I';
        this.icon = 'images/icon-colorpicker.svg';
    }

    onHover() {} // no brush preview

    onPointerDown(x, y, e) {
        this._pick(x, y, e);
    }

    onPointerMove(x, y, e) {
        // Allow drag-picking
        if (e.buttons > 0) {
            this._pick(x, y, e);
        }
    }

    onPointerUp(x, y, e) {}

    _pick(x, y, e) {
        if (x < 0 || x >= this.doc.width || y < 0 || y >= this.doc.height) return;

        // Sample from merged visible layers, top-to-bottom
        let index = TRANSPARENT;
        for (let i = this.doc.layers.length - 1; i >= 0; i--) {
            const layer = this.doc.layers[i];
            if (!layer.visible) continue;
            const px = layer.getPixelDoc(x, y);
            if (px !== TRANSPARENT) { index = px; break; }
        }
        if (index === TRANSPARENT) return;

        if (e.button === 2 || e.buttons === 2) {
            this.doc.bgColorIndex = index;
            this.bus.emit('bg-color-changed');
        } else {
            this.doc.fgColorIndex = index;
            this.bus.emit('fg-color-changed');
        }
    }
}
