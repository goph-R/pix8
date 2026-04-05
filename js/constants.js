// VGA Mode 13h default 256-color palette
// First 16: CGA colors, then 216 color cube (6x6x6), then 24 grays
export function generateVGAPalette() {
    const palette = new Array(256);

    // First 16 — standard CGA colors
    const cga = [
        [0, 0, 0],       // 0  black
        [0, 0, 170],     // 1  blue
        [0, 170, 0],     // 2  green
        [0, 170, 170],   // 3  cyan
        [170, 0, 0],     // 4  red
        [170, 0, 170],   // 5  magenta
        [170, 85, 0],    // 6  brown
        [170, 170, 170], // 7  light gray
        [85, 85, 85],    // 8  dark gray
        [85, 85, 255],   // 9  light blue
        [85, 255, 85],   // 10 light green
        [85, 255, 255],  // 11 light cyan
        [255, 85, 85],   // 12 light red
        [255, 85, 255],  // 13 light magenta
        [255, 255, 85],  // 14 yellow
        [255, 255, 255], // 15 white
    ];
    for (let i = 0; i < 16; i++) {
        palette[i] = cga[i];
    }

    // 16-231: 6x6x6 color cube
    const levels = [0, 51, 102, 153, 204, 255];
    let idx = 16;
    for (let r = 0; r < 6; r++) {
        for (let g = 0; g < 6; g++) {
            for (let b = 0; b < 6; b++) {
                palette[idx++] = [levels[r], levels[g], levels[b]];
            }
        }
    }

    // 232-255: grayscale ramp
    for (let i = 0; i < 24; i++) {
        const v = Math.round(8 + i * (247 - 8) / 23);
        palette[idx++] = [v, v, v];
    }

    return palette;
}

export const DEFAULT_DOC_WIDTH = 320;
export const DEFAULT_DOC_HEIGHT = 200;

export const TRANSPARENT = 256; // sentinel value — not a valid palette index
export const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16, 32];
export const GRID_MIN_ZOOM = 12;
