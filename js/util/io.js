import { ImageDocument } from '../model/ImageDocument.js';
import { Layer } from '../model/Layer.js';
import { Palette } from '../model/Palette.js';
import { TRANSPARENT } from '../constants.js';

// ─── PIX8 Project Format ─────────────────────────────────────────────────

export function savePix8(doc) {
    const meta = {
        version: 1,
        width: doc.width,
        height: doc.height,
        palette: doc.palette.export(),
        layers: doc.layers.map(l => ({
            name: l.name,
            visible: l.visible,
            locked: l.locked,
            width: l.width,
            height: l.height,
            offsetX: l.offsetX,
            offsetY: l.offsetY,
        })),
        activeLayerIndex: doc.activeLayerIndex,
        fgColorIndex: doc.fgColorIndex,
        bgColorIndex: doc.bgColorIndex,
    };

    const metaJson = JSON.stringify(meta);
    const metaBytes = new TextEncoder().encode(metaJson);

    // Total binary: 4 bytes meta length + meta + all layer data (variable size, Uint16 = 2 bytes/pixel)
    let totalLayerBytes = 0;
    for (const layer of doc.layers) {
        totalLayerBytes += layer.width * layer.height * 2;
    }
    const totalSize = 4 + metaBytes.length + totalLayerBytes;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    view.setUint32(0, metaBytes.length, true);
    bytes.set(metaBytes, 4);

    let offset = 4 + metaBytes.length;
    for (const layer of doc.layers) {
        const u8View = new Uint8Array(layer.data.buffer, layer.data.byteOffset, layer.data.byteLength);
        bytes.set(u8View, offset);
        offset += layer.width * layer.height * 2;
    }

    return new Blob([buffer], { type: 'application/octet-stream' });
}

export function loadPix8(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);

    const metaLen = view.getUint32(0, true);
    const metaJson = new TextDecoder().decode(bytes.slice(4, 4 + metaLen));
    const meta = JSON.parse(metaJson);

    const doc = new ImageDocument(meta.width, meta.height);
    doc.palette.import(meta.palette);
    doc.fgColorIndex = meta.fgColorIndex;
    doc.bgColorIndex = meta.bgColorIndex;

    // Remove default layer
    doc.layers = [];

    let offset = 4 + metaLen;
    for (const layerMeta of meta.layers) {
        // Per-layer dimensions (fall back to doc dimensions for old files)
        const lw = layerMeta.width ?? meta.width;
        const lh = layerMeta.height ?? meta.height;
        const layer = new Layer(layerMeta.name, lw, lh);
        layer.visible = layerMeta.visible;
        layer.locked = layerMeta.locked;
        layer.offsetX = layerMeta.offsetX ?? 0;
        layer.offsetY = layerMeta.offsetY ?? 0;
        const layerByteSize = lw * lh * 2;
        const u8View = new Uint8Array(layer.data.buffer, layer.data.byteOffset, layer.data.byteLength);
        u8View.set(bytes.slice(offset, offset + layerByteSize));
        offset += layerByteSize;
        doc.layers.push(layer);
    }

    doc.activeLayerIndex = meta.activeLayerIndex || 0;
    doc.selectedLayerIndices.add(doc.activeLayerIndex);
    return doc;
}

// ─── BMP (8-bit, 256 colors) ────────────────────────────────────────────

export function exportBMP(doc) {
    const flat = doc.flattenToLayer();
    const w = doc.width;
    const h = doc.height;

    // Row padding: rows must be multiple of 4 bytes
    const rowStride = Math.ceil(w / 4) * 4;
    const pixelDataSize = rowStride * h;
    const paletteSize = 256 * 4; // RGBX per entry
    const headerSize = 14 + 40; // BMP header + DIB header
    const fileSize = headerSize + paletteSize + pixelDataSize;

    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // BMP File Header (14 bytes)
    bytes[0] = 0x42; bytes[1] = 0x4D; // 'BM'
    view.setUint32(2, fileSize, true);
    view.setUint16(6, 0, true); // reserved
    view.setUint16(8, 0, true); // reserved
    view.setUint32(10, headerSize + paletteSize, true); // pixel data offset

    // DIB Header (BITMAPINFOHEADER, 40 bytes)
    view.setUint32(14, 40, true); // header size
    view.setInt32(18, w, true);
    view.setInt32(22, h, true); // positive = bottom-up
    view.setUint16(26, 1, true); // color planes
    view.setUint16(28, 8, true); // bits per pixel
    view.setUint32(30, 0, true); // compression (none)
    view.setUint32(34, pixelDataSize, true);
    view.setInt32(38, 2835, true); // h resolution (72 DPI)
    view.setInt32(42, 2835, true); // v resolution
    view.setUint32(46, 256, true); // colors used
    view.setUint32(50, 256, true); // important colors

    // Color table (256 entries, 4 bytes each: B, G, R, 0)
    let off = 54;
    for (let i = 0; i < 256; i++) {
        const [r, g, b] = doc.palette.getColor(i);
        bytes[off++] = b;
        bytes[off++] = g;
        bytes[off++] = r;
        bytes[off++] = 0;
    }

    // Pixel data (bottom-to-top); TRANSPARENT pixels become index 0
    const pixelOffset = headerSize + paletteSize;
    for (let y = 0; y < h; y++) {
        const srcRow = h - 1 - y; // BMP is bottom-up
        const dstRowStart = pixelOffset + y * rowStride;
        for (let x = 0; x < w; x++) {
            const v = flat.getPixel(x, srcRow);
            bytes[dstRowStart + x] = v === TRANSPARENT ? 0 : v;
        }
        // Padding bytes remain 0
    }

    return new Blob([buffer], { type: 'image/bmp' });
}

export function importBMP(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);

    // Validate BMP signature
    if (bytes[0] !== 0x42 || bytes[1] !== 0x4D) {
        throw new Error('Not a valid BMP file');
    }

    const pixelDataOffset = view.getUint32(10, true);
    const dibHeaderSize = view.getUint32(14, true);
    const w = view.getInt32(18, true);
    const h = Math.abs(view.getInt32(22, true));
    const topDown = view.getInt32(22, true) < 0;
    const bpp = view.getUint16(28, true);

    if (bpp !== 8) {
        throw new Error('Only 8-bit BMP files are supported');
    }

    const doc = new ImageDocument(w, h);

    // Read palette (starts at offset 54 for 40-byte DIB header)
    const paletteOffset = 14 + dibHeaderSize;
    for (let i = 0; i < 256; i++) {
        const off = paletteOffset + i * 4;
        const b = bytes[off];
        const g = bytes[off + 1];
        const r = bytes[off + 2];
        doc.palette.setColor(i, r, g, b);
    }

    // Read pixels
    const rowStride = Math.ceil(w / 4) * 4;
    const layer = doc.getActiveLayer();
    for (let y = 0; y < h; y++) {
        const srcRow = topDown ? y : (h - 1 - y);
        const rowStart = pixelDataOffset + srcRow * rowStride;
        for (let x = 0; x < w; x++) {
            layer.setPixel(x, y, bytes[rowStart + x]);
        }
    }

    return doc;
}

// ─── PCX (8-bit, 256 colors, RLE) ───────────────────────────────────────

export function exportPCX(doc) {
    const flat = doc.flattenToLayer();
    const w = doc.width;
    const h = doc.height;

    // RLE encode pixel data
    const rleData = [];
    const bytesPerLine = w % 2 === 0 ? w : w + 1; // must be even

    for (let y = 0; y < h; y++) {
        let x = 0;
        while (x < bytesPerLine) {
            const rawVal = x < w ? flat.getPixel(x, y) : 0;
            const val = rawVal === TRANSPARENT ? 0 : rawVal;
            let count = 1;
            while (count < 63 && (x + count) < bytesPerLine) {
                const nextRaw = (x + count) < w ? flat.getPixel(x + count, y) : 0;
                const nextVal = nextRaw === TRANSPARENT ? 0 : nextRaw;
                if (nextVal !== val) break;
                count++;
            }

            if (count > 1 || (val & 0xC0) === 0xC0) {
                rleData.push(0xC0 | count);
                rleData.push(val);
            } else {
                rleData.push(val);
            }
            x += count;
        }
    }

    // Total size: 128 header + RLE data + 1 marker + 768 palette
    const totalSize = 128 + rleData.length + 1 + 768;
    const buffer = new ArrayBuffer(totalSize);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    // PCX Header (128 bytes)
    bytes[0] = 0x0A;  // manufacturer
    bytes[1] = 5;     // version 5 (with 256-color palette)
    bytes[2] = 1;     // RLE encoding
    bytes[3] = 8;     // bits per pixel per plane

    // Window: xMin, yMin, xMax, yMax
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, w - 1, true);
    view.setUint16(10, h - 1, true);

    // DPI
    view.setUint16(12, 72, true);
    view.setUint16(14, 72, true);

    // 16-color palette (48 bytes at offset 16) — unused for 256-color
    // Reserved byte
    bytes[64] = 0;
    // Num planes
    bytes[65] = 1;
    // Bytes per line
    view.setUint16(66, bytesPerLine, true);
    // Palette type (1 = color)
    view.setUint16(68, 1, true);

    // RLE data
    let off = 128;
    for (const b of rleData) {
        bytes[off++] = b;
    }

    // 256-color palette marker
    bytes[off++] = 0x0C;

    // 256-color palette (768 bytes: R, G, B)
    for (let i = 0; i < 256; i++) {
        const [r, g, b] = doc.palette.getColor(i);
        bytes[off++] = r;
        bytes[off++] = g;
        bytes[off++] = b;
    }

    return new Blob([buffer], { type: 'application/octet-stream' });
}

export function importPCX(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    if (bytes[0] !== 0x0A) {
        throw new Error('Not a valid PCX file');
    }

    const bpp = bytes[3];
    const numPlanes = bytes[65];
    if (bpp !== 8 || numPlanes !== 1) {
        throw new Error('Only 8-bit single-plane PCX files are supported');
    }

    const xMin = view.getUint16(4, true);
    const yMin = view.getUint16(6, true);
    const xMax = view.getUint16(8, true);
    const yMax = view.getUint16(10, true);
    const w = xMax - xMin + 1;
    const h = yMax - yMin + 1;
    const bytesPerLine = view.getUint16(66, true);

    const doc = new ImageDocument(w, h);

    // Read 256-color palette from end of file
    const palOffset = arrayBuffer.byteLength - 768;
    if (bytes[palOffset - 1] === 0x0C) {
        for (let i = 0; i < 256; i++) {
            const off = palOffset + i * 3;
            doc.palette.setColor(i, bytes[off], bytes[off + 1], bytes[off + 2]);
        }
    }

    // Decode RLE pixel data
    const layer = doc.getActiveLayer();
    let srcOff = 128;
    for (let y = 0; y < h; y++) {
        let x = 0;
        while (x < bytesPerLine) {
            let byte = bytes[srcOff++];
            let count = 1;
            let value = byte;

            if ((byte & 0xC0) === 0xC0) {
                count = byte & 0x3F;
                value = bytes[srcOff++];
            }

            for (let c = 0; c < count; c++) {
                if (x < w) {
                    layer.setPixel(x, y, value);
                }
                x++;
            }
        }
    }

    return doc;
}

// ─── PNG Export ──────────────────────────────────────────────────────────

export function exportPNG(doc, renderer) {
    const imageData = renderer.composite();
    const canvas = document.createElement('canvas');
    canvas.width = doc.width;
    canvas.height = doc.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob), 'image/png');
    });
}

// ─── File download helper ───────────────────────────────────────────────

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
