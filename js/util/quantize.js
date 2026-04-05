import { TRANSPARENT } from '../constants.js';

// ─── Median Cut ─────────────────────────────────────────────────────────

export function medianCut(colors, n) {
    if (colors.length <= n) return colors;

    let buckets = [colors];

    while (buckets.length < n) {
        let bestBucket = 0, bestRange = -1, bestChannel = 0;
        for (let bi = 0; bi < buckets.length; bi++) {
            const bucket = buckets[bi];
            if (bucket.length < 2) continue;
            for (let ch = 0; ch < 3; ch++) {
                let min = 255, max = 0;
                for (const c of bucket) {
                    if (c.color[ch] < min) min = c.color[ch];
                    if (c.color[ch] > max) max = c.color[ch];
                }
                if (max - min > bestRange) {
                    bestRange = max - min;
                    bestBucket = bi;
                    bestChannel = ch;
                }
            }
        }

        if (bestRange <= 0) break;

        const bucket = buckets[bestBucket];
        bucket.sort((a, b) => a.color[bestChannel] - b.color[bestChannel]);
        const mid = Math.floor(bucket.length / 2);
        buckets.splice(bestBucket, 1, bucket.slice(0, mid), bucket.slice(mid));
    }

    return buckets.map(bucket => {
        let totalW = 0, rSum = 0, gSum = 0, bSum = 0;
        for (const c of bucket) {
            const w = c.count || 1;
            totalW += w;
            rSum += c.color[0] * w;
            gSum += c.color[1] * w;
            bSum += c.color[2] * w;
        }
        return {
            color: [
                Math.round(rSum / totalW),
                Math.round(gSum / totalW),
                Math.round(bSum / totalW)
            ]
        };
    });
}

// ─── Nearest Color ──────────────────────────────────────────────────────

function nearestColorIndex(r, g, b, palette) {
    let bestDist = Infinity, bestI = 0;
    for (let i = 0; i < palette.length; i++) {
        const [pr, pg, pb] = palette[i];
        const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
        if (dist < bestDist) { bestDist = dist; bestI = i; }
    }
    return bestI;
}

// ─── Bayer Matrix (4x4) ────────────────────────────────────────────────

const BAYER4 = [
     0,  8,  2, 10,
    12,  4, 14,  6,
     3, 11,  1,  9,
    15,  7, 13,  5
];

// ─── Quantize RGBA to Indexed ───────────────────────────────────────────

/**
 * Quantize a truecolor image to indexed color.
 * @param {Uint8ClampedArray} rgbaData - RGBA pixel data
 * @param {number} width
 * @param {number} height
 * @param {number} numColors - target palette size (1-256)
 * @param {string} ditherMode - 'none', 'floyd-steinberg', or 'ordered'
 * @returns {{ palette: number[][], indices: Uint16Array }}
 */
export function quantizeImage(rgbaData, width, height, numColors, ditherMode) {
    // Collect unique colors with counts
    const colorMap = new Map();
    const pixelCount = width * height;
    for (let i = 0; i < pixelCount; i++) {
        const off = i * 4;
        if (rgbaData[off + 3] < 128) continue; // skip transparent
        const key = (rgbaData[off] << 16) | (rgbaData[off + 1] << 8) | rgbaData[off + 2];
        colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }

    const colors = [];
    for (const [key, count] of colorMap) {
        colors.push({
            color: [(key >> 16) & 0xFF, (key >> 8) & 0xFF, key & 0xFF],
            count
        });
    }

    const reps = medianCut(colors, numColors);
    const palette = reps.map(r => r.color);

    const indices = mapToPalette(rgbaData, width, height, palette, ditherMode);
    return { palette, indices };
}

/**
 * Map RGBA pixels to an existing palette.
 * @param {Uint8ClampedArray} rgbaData - RGBA pixel data
 * @param {number} width
 * @param {number} height
 * @param {number[][]} palette - array of [r,g,b]
 * @param {string} ditherMode - 'none', 'floyd-steinberg', or 'ordered'
 * @returns {Uint16Array} palette indices (TRANSPARENT for alpha < 128)
 */
export function mapToPalette(rgbaData, width, height, palette, ditherMode) {
    const indices = new Uint16Array(width * height).fill(TRANSPARENT);

    if (ditherMode === 'floyd-steinberg') {
        return _ditherFloydSteinberg(rgbaData, width, height, palette);
    } else if (ditherMode === 'ordered') {
        return _ditherOrdered(rgbaData, width, height, palette);
    }

    // No dithering
    for (let i = 0; i < width * height; i++) {
        const off = i * 4;
        if (rgbaData[off + 3] < 128) { indices[i] = TRANSPARENT; continue; }
        indices[i] = nearestColorIndex(rgbaData[off], rgbaData[off + 1], rgbaData[off + 2], palette);
    }
    return indices;
}

// ─── Floyd-Steinberg Error Diffusion ────────────────────────────────────

function _ditherFloydSteinberg(rgbaData, width, height, palette) {
    const indices = new Uint16Array(width * height).fill(TRANSPARENT);
    // Work with float error buffer
    const errR = new Float32Array(width * height);
    const errG = new Float32Array(width * height);
    const errB = new Float32Array(width * height);

    // Initialize from source
    for (let i = 0; i < width * height; i++) {
        const off = i * 4;
        errR[i] = rgbaData[off];
        errG[i] = rgbaData[off + 1];
        errB[i] = rgbaData[off + 2];
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const off = i * 4;
            if (rgbaData[off + 3] < 128) continue;

            const r = Math.max(0, Math.min(255, Math.round(errR[i])));
            const g = Math.max(0, Math.min(255, Math.round(errG[i])));
            const b = Math.max(0, Math.min(255, Math.round(errB[i])));

            const ci = nearestColorIndex(r, g, b, palette);
            indices[i] = ci;

            const [pr, pg, pb] = palette[ci];
            const er = r - pr, eg = g - pg, eb = b - pb;

            // Distribute error
            if (x + 1 < width) {
                const j = i + 1;
                errR[j] += er * 7 / 16;
                errG[j] += eg * 7 / 16;
                errB[j] += eb * 7 / 16;
            }
            if (y + 1 < height) {
                if (x > 0) {
                    const j = i + width - 1;
                    errR[j] += er * 3 / 16;
                    errG[j] += eg * 3 / 16;
                    errB[j] += eb * 3 / 16;
                }
                {
                    const j = i + width;
                    errR[j] += er * 5 / 16;
                    errG[j] += eg * 5 / 16;
                    errB[j] += eb * 5 / 16;
                }
                if (x + 1 < width) {
                    const j = i + width + 1;
                    errR[j] += er * 1 / 16;
                    errG[j] += eg * 1 / 16;
                    errB[j] += eb * 1 / 16;
                }
            }
        }
    }
    return indices;
}

// ─── Ordered (Bayer) Dithering ──────────────────────────────────────────

function _ditherOrdered(rgbaData, width, height, palette) {
    const indices = new Uint16Array(width * height).fill(TRANSPARENT);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const off = i * 4;
            if (rgbaData[off + 3] < 128) { continue; }

            const threshold = (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 64;
            const r = Math.max(0, Math.min(255, rgbaData[off] + threshold));
            const g = Math.max(0, Math.min(255, rgbaData[off + 1] + threshold));
            const b = Math.max(0, Math.min(255, rgbaData[off + 2] + threshold));

            indices[i] = nearestColorIndex(r, g, b, palette);
        }
    }
    return indices;
}
