export class ColorSelector {
    constructor(doc, bus) {
        this.doc = doc;
        this.bus = bus;

        this.fgSwatch = document.getElementById('color-fg-swatch');
        this.bgSwatch = document.getElementById('color-bg-swatch');
        this.swapBtn = document.getElementById('color-swap-btn');
        this.label = document.getElementById('color-index-label');

        this.swapBtn.addEventListener('click', () => {
            this.doc.swapColors();
            this.bus.emit('fg-color-changed');
            this.bus.emit('bg-color-changed');
            this.update();
        });

        const swatchArea = document.getElementById('color-selector-swatches');
        swatchArea.addEventListener('click', () => {
            this.bus.emit('open-palette-picker', 'fg');
        });
        swatchArea.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.bus.emit('open-palette-picker', 'bg');
        });

        this.bus.on('fg-color-changed', () => this.update());
        this.bus.on('bg-color-changed', () => this.update());
        this.bus.on('palette-changed', () => this.update());

        this.update();
    }

    update() {
        const { palette, fgColorIndex, bgColorIndex } = this.doc;
        const [fr, fg, fb] = palette.getColor(fgColorIndex);
        const [br, bg, bb] = palette.getColor(bgColorIndex);

        this.fgSwatch.style.backgroundColor = `rgb(${fr},${fg},${fb})`;
        this.bgSwatch.style.backgroundColor = `rgb(${br},${bg},${bb})`;
        this.label.textContent = `FG:${fgColorIndex} BG:${bgColorIndex}`;
    }
}
