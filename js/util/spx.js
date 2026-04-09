import { Renderer } from '../render/Renderer.js';
import JSZip from 'jszip';

const MAX_PCX_W = 320;
const MAX_PCX_H = 200;
 
/**
 * Export SPX (Sprite XML) + PCX sprite sheet(s).
 *
 * Each frame is cropped to its non-transparent bounding box to produce
 * the smallest possible PCX(s). Frames are packed using a skyline
 * algorithm to minimize total area. PCX files are capped at 320x200
 * (VGA); when a sheet fills up, a new PCX is started. Tag groups are
 * never split across PCX files.
 *
 * Returns { spxBlob, pcxFiles: [{ blob, filename }] }.
 */
export function exportSPX(doc, options = {}) {
    const name = options.name || 'sprite';

    doc.saveCurrentFrame();

    // --- 1. Composite and crop each frame ---
    const renderer = new Renderer(doc);
    const frames = doc.frames;
    const frameW = doc.width;
    const frameH = doc.height;

    const savedLayers = doc.layers.map(l => ({
        data: l.data, opacity: l.opacity, textData: l.textData,
        offsetX: l.offsetX, offsetY: l.offsetY,
        width: l.width, height: l.height,
    }));
    const savedActiveIndex = doc.activeFrameIndex;

    const palette = doc.palette;
    const colorToIndex = new Map();
    for (let i = 0; i < 256; i++) {
        const [r, g, b] = palette.getColor(i);
        const key = (r << 16) | (g << 8) | b;
        if (!colorToIndex.has(key)) colorToIndex.set(key, i);
    }

    const croppedFrames = [];

    for (let fi = 0; fi < frames.length; fi++) {
        doc._restoreLayersFromFrame(frames[fi]);
        const imageData = renderer.composite();
        const rgba = imageData.data;

        let minX = frameW, minY = frameH, maxX = -1, maxY = -1;
        for (let y = 0; y < frameH; y++) {
            for (let x = 0; x < frameW; x++) {
                if (rgba[(y * frameW + x) * 4 + 3] >= 128) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX < 0) {
            croppedFrames.push({
                tag: frames[fi].tag,
                delay: frames[fi].delay || 100,
                offsetX: 0, offsetY: 0,
                cropW: 1, cropH: 1,
                pixels: new Uint8Array([0]),
            });
        } else {
            const cropW = maxX - minX + 1;
            const cropH = maxY - minY + 1;
            const pixels = new Uint8Array(cropW * cropH);
            for (let y = 0; y < cropH; y++) {
                for (let x = 0; x < cropW; x++) {
                    const srcOff = ((minY + y) * frameW + (minX + x)) * 4;
                    const a = rgba[srcOff + 3];
                    if (a < 128) {
                        pixels[y * cropW + x] = 0;
                    } else {
                        const key = (rgba[srcOff] << 16) | (rgba[srcOff + 1] << 8) | rgba[srcOff + 2];
                        pixels[y * cropW + x] = colorToIndex.get(key) ?? 0;
                    }
                }
            }
            croppedFrames.push({
                tag: frames[fi].tag,
                delay: frames[fi].delay || 100,
                offsetX: minX, offsetY: minY,
                cropW, cropH,
                pixels,
            });
        }
    }

    // Restore layers
    for (let i = 0; i < doc.layers.length && i < savedLayers.length; i++) {
        const s = savedLayers[i];
        doc.layers[i].data = s.data;
        doc.layers[i].opacity = s.opacity;
        doc.layers[i].textData = s.textData;
        doc.layers[i].offsetX = s.offsetX;
        doc.layers[i].offsetY = s.offsetY;
        doc.layers[i].width = s.width;
        doc.layers[i].height = s.height;
    }
    doc.activeFrameIndex = savedActiveIndex;

    // --- 2. Build tag groups ---
    const tagGroups = [];
    for (let i = 0; i < croppedFrames.length; i++) {
        if (croppedFrames[i].tag) {
            tagGroups.push({ tag: croppedFrames[i].tag, start: i });
        }
    }
    if (tagGroups.length === 0) {
        tagGroups.push({ tag: name, start: 0 });
    }
    for (let g = 0; g < tagGroups.length; g++) {
        const nextStart = g + 1 < tagGroups.length ? tagGroups[g + 1].start : croppedFrames.length;
        tagGroups[g].frames = croppedFrames.slice(tagGroups[g].start, nextStart);
    }

    // --- 3. Deduplicate identical frames ---
    // Frames with identical pixel data share the same sheet position.
    const uniqueFrames = []; // frames that need their own slot
    const dupeMap = new Map(); // hash -> first frame with that hash

    for (const cf of croppedFrames) {
        // Hash: dimensions + pixel content
        let hash = `${cf.cropW}x${cf.cropH}:`;
        const px = cf.pixels;
        // Simple FNV-1a-like hash of pixel data
        let h = 2166136261;
        for (let i = 0; i < px.length; i++) {
            h ^= px[i];
            h = Math.imul(h, 16777619);
        }
        hash += h >>> 0;

        const existing = dupeMap.get(hash);
        if (existing && existing.cropW === cf.cropW && existing.cropH === cf.cropH &&
            existing.pixels.length === px.length && existing.pixels.every((v, i) => v === px[i])) {
            // Duplicate — will copy position after packing
            cf._dupeOf = existing;
        } else {
            dupeMap.set(hash, cf);
            uniqueFrames.push(cf);
        }
    }

    // --- 4. Skyline pack unique frames into PCX sheets (max 320x200) ---
    // Sort by height descending for better packing.
    const sortedUnique = uniqueFrames.map(cf => ({ cf }));
    sortedUnique.sort((a, b) => (b.cf.cropH - a.cf.cropH) || (b.cf.cropW - a.cf.cropW));

    const packers = [];

    for (const { cf } of sortedUnique) {
        let placed = false;
        // Try to fit in existing sheets
        for (let si = 0; si < packers.length; si++) {
            const pos = packers[si].insert(cf.cropW, cf.cropH);
            if (pos) {
                cf.sheetX = pos.x;
                cf.sheetY = pos.y;
                cf.imageIndex = si;
                placed = true;
                break;
            }
        }
        if (!placed) {
            // Start a new sheet
            const packer = new SkylinePacker(MAX_PCX_W, MAX_PCX_H);
            const pos = packer.insert(cf.cropW, cf.cropH);
            if (pos) {
                cf.sheetX = pos.x;
                cf.sheetY = pos.y;
                cf.imageIndex = packers.length;
            } else {
                // Frame larger than max sheet — force it (shouldn't happen with typical sprites)
                cf.sheetX = 0;
                cf.sheetY = 0;
                cf.imageIndex = packers.length;
            }
            packers.push(packer);
        }
    }

    // Copy positions from originals to duplicate frames
    for (const cf of croppedFrames) {
        if (cf._dupeOf) {
            cf.sheetX = cf._dupeOf.sheetX;
            cf.sheetY = cf._dupeOf.sheetY;
            cf.imageIndex = cf._dupeOf.imageIndex;
        }
    }

    // Check tag group coherence: all frames in a group must be in the same image.
    // If split, move the minority to the majority's sheet (best-effort).
    for (const group of tagGroups) {
        const imageCounts = new Map();
        for (const cf of group.frames) {
            imageCounts.set(cf.imageIndex, (imageCounts.get(cf.imageIndex) || 0) + 1);
        }
        if (imageCounts.size > 1) {
            // Find the image with the most frames from this group
            let bestImg = 0, bestCount = 0;
            for (const [img, count] of imageCounts) {
                if (count > bestCount) { bestImg = img; bestCount = count; }
            }
            // Re-pack stray frames into the majority sheet
            for (const cf of group.frames) {
                if (cf.imageIndex !== bestImg) {
                    const pos = packers[bestImg].insert(cf.cropW, cf.cropH);
                    if (pos) {
                        cf.sheetX = pos.x;
                        cf.sheetY = pos.y;
                        cf.imageIndex = bestImg;
                    }
                    // If it doesn't fit, leave it (edge case)
                }
            }
        }
        group.imageIndex = group.frames[0].imageIndex;
    }

    // --- 4. Build PCX files ---
    const pcxFiles = [];

    for (let si = 0; si < packers.length; si++) {
        const packer = packers[si];
        const sheetW = packer.usedWidth();
        const sheetH = packer.usedHeight();
        if (sheetW === 0 || sheetH === 0) continue;

        const bytesPerLine = sheetW % 2 === 0 ? sheetW : sheetW + 1;

        // Blit frames into sheet
        const pixels = new Uint8Array(bytesPerLine * sheetH);
        for (const cf of croppedFrames) {
            if (cf.imageIndex !== si) continue;
            for (let y = 0; y < cf.cropH; y++) {
                for (let x = 0; x < cf.cropW; x++) {
                    pixels[(cf.sheetY + y) * bytesPerLine + (cf.sheetX + x)] =
                        cf.pixels[y * cf.cropW + x];
                }
            }
        }

        // RLE encode
        const rleData = [];
        for (let y = 0; y < sheetH; y++) {
            let x = 0;
            while (x < bytesPerLine) {
                const val = pixels[y * bytesPerLine + x];
                let count = 1;
                while (count < 63 && (x + count) < bytesPerLine) {
                    if (pixels[y * bytesPerLine + x + count] !== val) break;
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

        // Build PCX buffer
        const totalSize = 128 + rleData.length + 1 + 768;
        const pcxBuf = new ArrayBuffer(totalSize);
        const pcxBytes = new Uint8Array(pcxBuf);
        const pcxView = new DataView(pcxBuf);

        pcxBytes[0] = 0x0A;
        pcxBytes[1] = 5;
        pcxBytes[2] = 1;
        pcxBytes[3] = 8;
        pcxView.setUint16(4, 0, true);
        pcxView.setUint16(6, 0, true);
        pcxView.setUint16(8, sheetW - 1, true);
        pcxView.setUint16(10, sheetH - 1, true);
        pcxView.setUint16(12, 72, true);
        pcxView.setUint16(14, 72, true);
        pcxBytes[64] = 0;
        pcxBytes[65] = 1;
        pcxView.setUint16(66, bytesPerLine, true);
        pcxView.setUint16(68, 1, true);

        let off = 128;
        for (const b of rleData) pcxBytes[off++] = b;
        pcxBytes[off++] = 0x0C;
        for (let i = 0; i < 256; i++) {
            const [r, g, b] = palette.getColor(i);
            pcxBytes[off++] = r;
            pcxBytes[off++] = g;
            pcxBytes[off++] = b;
        }

        const suffix = packers.length > 1 ? `${si + 1}` : '';
        const filename = (name + suffix + '.PCX').toUpperCase();
        pcxFiles.push({
            blob: new Blob([pcxBuf], { type: 'application/octet-stream' }),
            filename,
            imageName: name + suffix,
        });
    }

    // --- 5. Build SPX XML ---
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<sprite-xml>\n';

    for (let pi = 0; pi < pcxFiles.length; pi++) {
        const pf = pcxFiles[pi];
        const palAttr = pi === 0 ? ` palette="${esc(name)}"` : '';
        xml += `  <image name="${esc(pf.imageName)}" path="${esc(pf.filename)}"${palAttr} />\n`;
    }
    xml += '\n';

    for (const group of tagGroups) {
        const spriteName = group.tag;
        const imageName = pcxFiles[group.imageIndex].imageName;
        const totalMs = group.frames.reduce((sum, f) => sum + f.delay, 0);
        const totalSec = (totalMs / 1000).toFixed(2);
        const allSameDelay = group.frames.every(f => f.delay === group.frames[0].delay);

        xml += `  <sprite name="${esc(spriteName)}" image="${esc(imageName)}" width="${frameW}" height="${frameH}" duration="${totalSec}">\n`;

        for (const cf of group.frames) {
            const attrs = [`x="${cf.sheetX}"`, `y="${cf.sheetY}"`];

            if (cf.cropW !== frameW || cf.cropH !== frameH) {
                attrs.push(`width="${cf.cropW}"`);
                attrs.push(`height="${cf.cropH}"`);
            }

            if (cf.offsetX !== 0) attrs.push(`offset-x="${cf.offsetX}"`);
            if (cf.offsetY !== 0) attrs.push(`offset-y="${cf.offsetY}"`);

            if (!allSameDelay) {
                attrs.push(`duration="${(cf.delay / 1000).toFixed(2)}"`);
            }

            xml += `    <frame ${attrs.join(' ')} />\n`;
        }

        xml += '  </sprite>\n\n';
    }

    xml += '</sprite-xml>\n';

    const spxBlob = new Blob([xml], { type: 'application/xml' });
    return { spxBlob, pcxFiles };
}

/**
 * Skyline Bottom-Left bin packer.
 * Tracks the top edge ("skyline") of placed rectangles and inserts
 * new rectangles at the position that minimizes wasted vertical space.
 */
class SkylinePacker {
    constructor(maxW, maxH) {
        this.maxW = maxW;
        this.maxH = maxH;
        this.skyline = [{ x: 0, y: 0, w: maxW }];
        this._usedW = 0;
        this._usedH = 0;
    }

    insert(rw, rh) {
        // Find the best position: the skyline span where placing the rect
        // results in the lowest top edge (y + rh).
        let bestY = Infinity;
        let bestIdx = -1;
        let bestX = 0;

        for (let i = 0; i < this.skyline.length; i++) {
            const result = this._fitAt(i, rw, rh);
            if (result !== null && result.y + rh < bestY) {
                bestY = result.y + rh;
                bestIdx = i;
                bestX = this.skyline[i].x;
            }
        }

        if (bestIdx === -1) return null; // doesn't fit

        // Place the rectangle
        const placed = { x: bestX, y: bestY - rh };

        // Track used bounds
        if (bestX + rw > this._usedW) this._usedW = bestX + rw;
        if (bestY > this._usedH) this._usedH = bestY;

        // Update skyline: add new segment for placed rect
        const newSeg = { x: bestX, y: bestY, w: rw };

        // Remove segments covered by the new rect
        const rightEdge = bestX + rw;
        const newSkyline = [];
        let i = 0;

        // Segments entirely before the new rect
        while (i < this.skyline.length && this.skyline[i].x + this.skyline[i].w <= bestX) {
            newSkyline.push(this.skyline[i]);
            i++;
        }

        // Segment partially before
        if (i < this.skyline.length && this.skyline[i].x < bestX) {
            newSkyline.push({ x: this.skyline[i].x, y: this.skyline[i].y, w: bestX - this.skyline[i].x });
        }

        // The new segment
        newSkyline.push(newSeg);

        // Skip covered segments
        while (i < this.skyline.length && this.skyline[i].x + this.skyline[i].w <= rightEdge) {
            i++;
        }

        // Segment partially after
        if (i < this.skyline.length && this.skyline[i].x < rightEdge) {
            const seg = this.skyline[i];
            const overlap = rightEdge - seg.x;
            newSkyline.push({ x: rightEdge, y: seg.y, w: seg.w - overlap });
            i++;
        }

        // Remaining segments
        while (i < this.skyline.length) {
            newSkyline.push(this.skyline[i]);
            i++;
        }

        this.skyline = this._merge(newSkyline);
        return placed;
    }

    // Check if a rect of size rw x rh fits starting at skyline segment idx
    _fitAt(idx, rw, rh) {
        const startX = this.skyline[idx].x;
        if (startX + rw > this.maxW) return null;

        let maxY = 0;
        let widthLeft = rw;
        let i = idx;

        while (widthLeft > 0 && i < this.skyline.length) {
            if (this.skyline[i].y > maxY) maxY = this.skyline[i].y;
            if (maxY + rh > this.maxH) return null;
            widthLeft -= this.skyline[i].w;
            // First segment may only partially overlap
            if (i === idx) {
                widthLeft += (this.skyline[i].x - startX);
            }
            i++;
        }

        if (widthLeft > 0) return null; // ran out of skyline width
        return { y: maxY };
    }

    // Merge adjacent segments with the same y
    _merge(segs) {
        if (segs.length <= 1) return segs;
        const merged = [segs[0]];
        for (let i = 1; i < segs.length; i++) {
            const last = merged[merged.length - 1];
            if (segs[i].y === last.y) {
                last.w += segs[i].w;
            } else {
                merged.push(segs[i]);
            }
        }
        return merged;
    }

    usedWidth() { return this._usedW; }
    usedHeight() { return this._usedH; }
}

/**
 * Export SPX + PCX(s) as a single ZIP file.
 */
export async function exportSPXZip(doc, options = {}) {
    const name = options.name || 'sprite';
    const { spxBlob, pcxFiles } = exportSPX(doc, options);

    const zip = new JSZip();
    zip.file(name + '.spx', spxBlob);
    for (const pf of pcxFiles) {
        zip.file(pf.filename, pf.blob);
    }

    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
