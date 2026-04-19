# 24-bit Mode — Implementation Plan (Deferred)

**Status:** deferred. Pix8 stays 8-bit for now — the name says so. Kept for future reference.

**Key reason for deferral:** a proper 24-bit mode really wants full 8-bit alpha (for anti-aliased edges, soft brushes, translucent layers). Binary alpha would get us 80% there but shortchange the feature. Full alpha touches every tool, every composite path, and every file format — too much to bundle with the mode switch itself.

---

## Scope when/if revisited

1. **File > New dialog**: add "8 bit" vs "24 bit" radio. Document carries a `colorMode` flag.
2. **Palette panel in 24-bit mode**: replaces the 16x16 grid with a color picker (HSV square + hue strip + RGB/hex inputs).
3. **FG/BG color selector**: in 24-bit mode, clicking it opens the color picker (not PaletteEditDialog).
4. **No Palette Edit dialog** in 24-bit mode.

---

## Architectural decisions

### A. Pixel storage — polymorphic, mode lives on the document

- `doc.colorMode: '8bit' | '24bit'` — fixed at New-doc time, no in-place conversion in v1.
- **Do not** store `pixelFormat` per-layer. The mode is a document property; layers inherit it at construction (`new Layer(w, h, colorMode)`) and never diverge. No mixed-mode docs.
- `'8bit'` layers: `Uint16Array` with `TRANSPARENT = 256` sentinel (unchanged).
- `'24bit'` layers: `Uint32Array` of packed `0xAABBGGRR` (native little-endian so it aliases `ImageData.data` for free bulk operations). `alpha = 0` means transparent, `alpha = 255` means opaque.

### B. Transparency — binary alpha only (v1)

Per-pixel alpha is 0 or 255. Matches the existing "no anti-aliasing" pixel-art feel and avoids rewriting tools for partial alpha. **This is the main compromise.** Full alpha would require:

- Renderer: real alpha blending in composite loop (currently the indexed path has no blend beyond layer opacity).
- Every tool: decide stamp-over-transparent semantics.
- Selection lifting: preserve source alpha.
- FreeTransformTool inverse map: interpolate or stay nearest-neighbor.
- Text anti-aliasing: already blends into background; with full alpha it could blend into transparent too.
- File formats: PNG export already supports alpha; `.pix8` format needs alpha bytes serialized (already have them packed).
- UI: alpha slider on color picker, alpha column in PaletteEditDialog(?).

Binary alpha is a safe starting point; upgrading to full alpha later is additive.

### C. FG/BG color — branch on `doc.colorMode`

Keep both pairs on `ImageDocument`:
- `fgColorIndex` / `bgColorIndex` — used in 8-bit mode (existing).
- `fgRGB` / `bgRGB` — arrays `[r,g,b]`, used in 24-bit mode.

Add helpers:
- `doc.getFgPixelValue()` — returns palette index or packed u32 based on mode. Tools call this.
- `doc.getFgRGB()` / `doc.getBgRGB()` — returns RGB triple for display, regardless of mode.

### D. Brush — mode-aware

`Brush.default(colorMode)` returns format-appropriate 1×1 brush. Captured brushes read mode from the source doc. **Brushes cannot cross modes**: on tab switch, if the brush captured from an 8-bit doc is active in a 24-bit doc, reset to default. (Brushes live per-doc, so this is per-tab automatic.)

### E. File formats

| Format | 8-bit doc | 24-bit doc |
|---|---|---|
| `.pix8` open/save | yes | yes (bump version, add `colorMode` to meta) |
| PNG export | yes | yes (already per-pixel RGBA in renderer output — just works) |
| BMP / PCX / ICO export | yes | **disabled** (menu greyed) |
| GIF / SPX export | yes | **disabled** (would need per-frame quantization) |
| PAL load/save | yes | **N/A** (no palette editor entry point) |
| Truecolor PNG/JPG/GIF/WebP open | quantize dialog → 8-bit doc | direct load → 24-bit doc |
| Paste from system clipboard | quantize dialog → indexed layer | direct paste → rgba layer |
| **Import as Layer (BMP/PCX)** | yes | **yes** — auto-promote indices to RGB via source file's palette |
| **Import as Layer (truecolor)** | quantize dialog | direct, no dialog |

### F. No in-place mode conversion

Mode is fixed at File > New. Demoting 24→8 demands a quantize dialog; promoting 8→24 is trivial but loses palette-editability in a way users wouldn't expect. Start a fresh tab instead.

### G. Shared `ColorPicker` component

Extract HSV+hue+RGB-sliders+hex block out of `PaletteEditDialog` into `js/ui/ColorPicker.js`. Consumers:
- New 24-bit PalettePanel
- FG/BG popover in 24-bit
- TextDialog color picker
- Eventually PaletteEditDialog itself (not in this ticket — leave it alone, just share primitives)

**API:**
```js
new ColorPicker({
    initialRGB,          // [r, g, b], required
    mode6bit = false,    // sliders/hex in 0-63 if true
    showHex = true,
    showSliders = true,
    onChange,            // ([r,g,b]) — fires continuously while dragging
    onCommit,            // ([r,g,b]) — fires on pointer-up / blur / Enter (undo boundary)
})
// .element, .setRGB([r,g,b]), .getRGB(), .destroy()
```

Pure exports for PaletteEditDialog to share rendering primitives:
```js
export function rgbToHsv(r, g, b)
export function hsvToRgb(h, s, v)
export function renderSVCanvas(ctx, hue, w, h)
export function renderHueStrip(ctx, w, h)
```

---

## Ordered file-by-file plan

### Phase 1 — Model and core branches

1. **`js/constants.js`** — add `COLOR_MODE_8BIT`, `COLOR_MODE_24BIT`; add `packRGBA(r,g,b,a=255)` / `unpackRGBA(u32)` helpers; boot-time LE endian check.

2. **`js/model/Layer.js`** — constructor takes `colorMode` (stored on the layer, set once at construction from the doc). Branch on it in: allocation, `getPixel`/`setPixel`, `ensureRect`, `_resize`, `clear`, `getContentBounds`, `snapshotData`/`restoreSnapshot`, `clone`. "Is transparent" becomes `(val >>> 24) === 0` for rgba vs `val === TRANSPARENT` for indexed.

3. **`js/model/ImageDocument.js`** — constructor takes `(width, height, colorMode='8bit')`. All layer creation (`addLayer`, `duplicateLayer`, frame `layerData` allocations in `enableAnimation`/`addFrame`) threads `colorMode` into the Layer constructor. Add `fgRGB`/`bgRGB`, `getFgPixelValue`/`getBgPixelValue`/`getFgRGB`/`getBgRGB`. Extend `swapColors` for RGB. Gate `getUsedColorIndices`/`getColorHistogram`/`remapColorIndices` as no-ops in 24-bit. Branch `flattenToLayer` on mode.

4. **`js/model/Brush.js`** — `pixelFormat` field, mode-aware `default()`, capture reads mode from source doc.

5. **`js/model/Selection.js`** — `copyPixels`, `liftPixels`, floating buffer: allocate `Uint16Array` or `Uint32Array` based on doc mode. Floating object gains a `colorMode` field.

6. **`js/render/Renderer.js`** — `composite()` inner loop branches on mode: indexed path unchanged; rgba path decodes packed pixel directly, writes 4 bytes, skips palette lookup. Opacity blending for rgba blends layer RGB with buffer RGB at layer opacity (no palette snap, no `bestIdx` loop — much simpler and faster). Same branch in `_renderOnionFrames`. `_compositeTextLayer` uses `td.colorRGB` in 24-bit mode and skips nearest-palette-match.

7. **`js/tools/BaseTool.js`** — `previewBrush` uses `doc.getFgRGB()`; `stampBrush` uses `doc.getFgPixelValue()` (or `colorOverride` passed as already-resolved stamp value).

8. **`js/tools/` (BrushTool, EraserTool, FillTool, shape tools, MirrorTool, ColorPickerTool)** — replace direct `this.doc.fgColorIndex` reads with `doc.getFgPixelValue()`. EraserTool writes `TRANSPARENT` (8-bit) or `0` (24-bit) via `layer.getTransparentValue()`. ColorPickerTool in 24-bit assigns to `fgRGB`/`bgRGB`. FillTool flood-fill equality test works unchanged (typed-array value compare is value compare).

9. **`js/tools/FreeTransformTool.js`** — rasterizer and floating clone buffer allocations follow doc mode. `fill(TRANSPARENT)` becomes `fill(0)` for rgba.

10. **`js/history/UndoManager.js`** — snapshot objects already wrap `layer.data` as-is; just ensure `colorMode` round-trips via `Layer.snapshotData`/`restoreSnapshot`. The "did it change?" loop works for `Uint32Array` unchanged.

### Phase 2 — File I/O

11. **`js/util/io.js`**
    - `savePix8` / `loadPix8`: bump `version` to 2, add `colorMode` to meta. Per-layer buffer serialization works as byte-blit; just pick byte-count from mode.
    - `exportBMP` / `exportPCX` / `exportICO`: early guard throws in 24-bit (menu gating prevents hitting this, but belt-and-suspenders).
    - `exportPNG`: unchanged — composite already produces RGBA ImageData.
    - New `importTruecolor(imageData, w, h)` helper: creates 24-bit doc with single rgba layer.
    - `importBMPAsLayer` / `importPCXAsLayer`: in 24-bit target doc, resolve each index through source palette at layer-build time, pack into `Uint32Array`. ~15 lines.

12. **`js/util/gif.js` / `spx.js` / `quantize.js`** — no changes. Indexed-only in v1. Menu gating prevents invocation.

13. **`js/FileManager.js`**
    - `_openTruecolorFile` / `_showQuantizeDialog`: add "Open as 24-bit (no quantize)" button that bypasses quantization.
    - `_pasteFromClipboard`: when active doc is 24-bit, skip dither dialog, paste raw RGBA as new rgba layer.
    - Cross-mode tab paste: reject with a toast.
    - Import as Layer file picker: expand accept list to truecolor formats when active doc is 24-bit.

### Phase 3 — UI

14. **`js/ui/ColorPicker.js`** (new) — extract from PaletteEditDialog per API above. Pure primitives exported for PaletteEditDialog reuse.

15. **`js/ui/MenuManager.js`** — add `disabled: doc.colorMode === '24bit'` on BMP/PCX/ICO/GIF/SPX export items. No hiding needed for "Palette Editor" — it's reached via the panel button, not a menu.

16. **`js/ui/PalettePanel.js`** — branch in constructor / add `rebuild()`:
    - `'8bit'`: existing 16×16 grid + edit button. Unchanged.
    - `'24bit'`: `ColorPicker` instance + small FG / BG radio tabs above it (picker-ergonomics don't naturally express right-click-for-BG, so we use explicit tabs). No edit button.
    - Tab switching: `_setDocOnComponents` must call `panel.rebuild()` when new doc's mode differs.

17. **`js/ui/ColorSelector.js`** — swatch fill from `doc.getFgRGB()`/`getBgRGB()`. Status label shows `FG:#FFFFFF BG:#000000` in 24-bit, `FG:15 BG:0` in 8-bit. Click emits `open-color-picker` event with `'fg'|'bg'`; `app.js` routes to PaletteEditDialog (8-bit) or ColorPicker popover (24-bit).

18. **`js/app.js`** — New-doc dialog adds 8-bit/24-bit radio. `'open-color-picker'` event handler routes based on mode.

19. **`js/ui/FramePanel.js`** — no changes. Thumbnails via Renderer handle both modes.

20. **`js/ui/CanvasView.js`** — brush preview already routed through `BaseTool.previewBrush` (step 7).

### Phase 4 — Text layers in 24-bit

21. **`js/tools/TextTool.js` / `app._showTextDialog` / `_convertTextToBitmap`** — `textData` gets `colorRGB: [r,g,b]` alongside `colorIndex`; renderer picks the right one. Color-picker popup in `_showTextDialog` becomes a `ColorPicker` instance in 24-bit docs. `_convertTextToBitmap` in 24-bit writes packed RGBA directly, skipping nearest-palette-match.

---

## Explicit branch points (grep-ability)

All branches key off `doc.colorMode === '24bit'` (or the layer's stored-at-construction `colorMode`). Concrete sites:

- `Layer.js`: allocation, "is transparent", `getContentBounds`, `_resize`, `clear`
- `ImageDocument.js`: `addLayer`, `duplicateLayer`, frame allocations, `flattenToLayer`, swapColors
- `Renderer.composite`, `_renderOnionFrames`, `_compositeTextLayer`
- `BaseTool.stampBrush`, `previewBrush`
- `EraserTool` transparent write value
- `ColorPickerTool.onPointerDown`
- `FreeTransformTool._rasterize`, `activate`, `cancel`
- `Selection.copyPixels`, `liftPixels`, floating buffer
- `io.savePix8`, `loadPix8`, `importBMPAsLayer`, `importPCXAsLayer`, `exportBMP`/`PCX`/`ICO` (guard)
- `FileManager._openTruecolorFile`, `_showQuantizeDialog`, `_pasteFromClipboard`, Import-as-Layer accept list
- `PalettePanel` constructor + `rebuild`
- `ColorSelector.update`
- `app._newDocument`, `app._showNewDocDialog`, `'open-color-picker'` handler
- `TextTool`, `_showTextDialog`, `_convertTextToBitmap`
- `MenuManager` disabled states

---

## Out of scope for v1

- **Full alpha** (the big one — see deferral reason at top). V1 is binary alpha.
- In-place mode conversion (no Image > Change Mode).
- BMP / PCX / ICO export from 24-bit docs.
- GIF / SPX export from 24-bit docs.
- PAL load/save in 24-bit (no entry point).
- Mixed-mode documents.
- Cross-mode clipboard paste.
- PaletteEditDialog refactor to use `ColorPicker` internally (just share the primitives).

---

## Highest-risk areas

1. **Every `Uint16Array` allocation site** (18+) must branch on mode. Missing one = silent corruption. Mitigation: centralize allocation via a `Layer.newBuffer(n)` / `newTransparentBuffer(n)` factory that honors the layer's stored mode. Add a dev assertion in `setPixel` that written value matches mode (index ≤ TRANSPARENT, or packed u32).

2. **Endian assumption.** Packed `0xAABBGGRR` aliases `ImageData.data` only on little-endian. Browsers on BE are vanishingly rare, but add a boot-time `new Uint32Array(new Uint8Array([1,0,0,0]).buffer)[0] === 1` check and fall back to byte writes if not LE.

3. **Undo / frame snapshot round-trips.** Every `new Uint16Array(` after conversion is a potential bug if a stale path reinstantiates the wrong type. Grep them all.

4. **FG/BG stamp-value abstraction.** Any tool that writes `this.doc.fgColorIndex` *directly* instead of via `getFgPixelValue()` will paint pixels colored `0x0000000F` (index 15 as packed RGBA = near-transparent black). Audit `js/tools/` comprehensively.

5. **Tab switching and PalettePanel rebuild.** Current `_setDocOnComponents` just reassigns `this.doc`; it does not reconstruct DOM. 24-bit ⇄ 8-bit flips need an explicit `rebuild()` on the affected panels (PalettePanel at minimum, possibly ColorSelector).
