# CLAUDE.md

## Project Overview

Pix8 is a 256-color indexed pixel art editor for the browser. It targets VGA-era workflows where all colors come from a shared 256-entry palette. Written in vanilla JS/HTML/CSS with ES modules, no bundler, served via `npx serve .`.

## Architecture

- **Data model** (`js/model/`): `ImageDocument` owns `Layer[]`, `Palette`, `Brush`, FG/BG color indices. Layers store pixel data as `Uint16Array` (0-255 = palette index, 256 = TRANSPARENT sentinel). One palette per document, shared by all layers. Layers have `type` field (`'raster'` or `'text'`). Text layers store `textData: { text, fontFamily, fontSize, bold, italic, underline, antialiased, colorIndex }` instead of pixel data. Helper methods: `getUsedColorIndices()`, `getColorHistogram()`, `remapColorIndices(mapping)` — all handle both raster and text layers. `Layer.createText()` static factory for text layers.
- **Layers are independently sized and positioned**: Each layer has its own `width`, `height`, `offsetX`, `offsetY`. Layers can be different sizes from the document. Drawing outside a layer's bounds auto-extends it (via `setPixelAutoExtend` with 16px growth padding). The document size defines the render/export viewport.
- **Rendering** (`js/render/`): `Renderer.composite()` iterates visible layers bottom-to-top, computing the intersection of each layer's rect with the document rect, resolves palette indices to RGBA `ImageData`. Text layers are rendered via Canvas API in `_compositeTextLayer()` — supports anti-aliased rendering by blending text alpha with background and mapping to nearest palette color. Floating selections are rendered on top, with optional transform support (inverse matrix mapping for Free Transform). Drawn to an offscreen 1:1 canvas, then scaled to the visible canvas with `imageSmoothingEnabled = false`.
- **Tools** (`js/tools/`): All extend `BaseTool` which provides `stampBrush(layer, x, y, colorOverride)`. Tools receive document-space coordinates from `CanvasView`. `stampBrush` calls `layer.ensureRect()` then `layer.setPixelAutoExtend()` to auto-grow layers. `colorOverride` allows tools to pass `bgColorIndex` on right-click. Selection tools (`RectSelector`, `EllipseSelector`) support resize handles, Shift-to-add, Alt-to-subtract. `FreeTransformTool` lifts pixels to a floating selection and applies scale/rotate/translate via inverse matrix mapping with nearest-neighbor sampling (Ctrl snaps rotation to 22.5-degree increments). `MirrorTool` flips the image or selection horizontally/vertically. `LineTool` and `EraserTool` support Ctrl-snap to 22.5-degree angles via `snapEndpoint()` in `js/util/math.js`. `EraserTool` supports Shift for line-erase mode. `FillTool` does flood fill respecting selection boundaries.
- **UI** (`js/ui/`): `CanvasView` handles zoom/pan/pointer dispatch. `Toolbar`, `LayersPanel`, `PalettePanel`, `PaletteEditDialog`, `ColorSelector`, `TabBar` manage their respective DOM sections.
- **Multi-document tabs** (`js/ui/TabBar.js`): Tab bar under the menu. Each tab stores its own `ImageDocument` instance, undo stacks, zoom/pan state. Tab switching calls `_setDocOnComponents(doc)` to update `doc` reference on CanvasView, UndoManager, all tools, and UI panels. Clipboard is global (shared across tabs) with automatic palette color remapping on cross-document paste.
- **Menus** (`app.js`): File (New, Open, Close Tab, Save, Import as Layer, Export), Edit, View, Image (Resize, Rotate Left/Right), Layer (Convert to Bitmap, Merge Selected, Merge All). Dropdown items support `disabled: true` for conditional availability. `TextTool` (`js/tools/TextTool.js`) emits `open-text-dialog` event; `app.js` shows text dialog with font/size/style/color picker. `_convertTextToBitmap()` rasterizes text layers respecting anti-aliasing.
- **Quantization** (`js/util/quantize.js`): Shared module for truecolor-to-indexed conversion. `medianCut()` for palette generation, `quantizeImage()` for full import (RGBA → palette + indices), `mapToPalette()` for mapping to existing palette. Three dither modes: None, Floyd-Steinberg, Ordered (Bayer 4x4). Used by File > Open (truecolor images) and system clipboard paste.
- **Palette editor** (`js/ui/PaletteEditDialog.js`): GrafX2-inspired dialog extracted from `PalettePanel`. Features: range selection (drag on 16x16 grid), vertical RGB sliders (6-bit 0-63 or 8-bit 0-255), toolbar with batch operations (Swap, X-Swap, Copy, Flip, X-Flip, Neg, Gray, Spread, Merge, Sort, Reduce, Zap Unused, Used highlight). Two-step operations (Swap/X-Swap/Copy) use `_pendingOp` state machine. X-operations remap pixel indices via `ImageDocument.remapColorIndices()`. Has internal palette undo history (`_paletteHistory` stack). On open, snapshots palette + all layers; Cancel restores both; OK pushes a `type: 'palette'` entry to `UndoManager`. Load/Save support PAL format (6-bit: raw 768 bytes, 8-bit: JASC-PAL text) plus BMP/PCX palette extraction.
- **Multi-layer selection**: `ImageDocument.selectedLayerIndices` (Set) always contains the active layer index. Ctrl+click in `LayersPanel` toggles additional layers. Used by Layer > Merge Selected.
- **Communication**: `EventBus` (simple pub/sub). Key events: `layer-changed`, `palette-changed`, `fg-color-changed`, `bg-color-changed`, `brush-changed`, `tool-changed`, `zoom-changed`, `document-changed`, `cursor-move`, `switch-tool`.
- **Undo** (`js/history/`): `UndoManager` snapshots the active layer's data AND geometry (width, height, offsetX, offsetY) AND selection state (mask, floating, pureShape) before each tool operation. Undo/redo restores all three via `layer.restoreSnapshot()` and `selection.restoreSnapshot()`. Integrated by wrapping `CanvasView._onPointerDown/Up` in `app.js`. `FreeTransformTool` manages its own undo bracket (begin on activate, end on commit/cancel). Palette editor pushes `type: 'palette'` entries with before/after palette + layers data.
- **File I/O** (`js/util/io.js`): `.pix8` (custom binary with JSON metadata including per-layer dimensions/offsets), 8-bit BMP, 8-bit PCX (RLE), PNG export, PAL palette format (6-bit: raw 768-byte binary, 8-bit: JASC-PAL text; import auto-detects). File > Open also accepts truecolor PNG/JPG/GIF/WebP via quantization dialog. BMP/PCX export maps TRANSPARENT to index 0. "Import as Layer" brings in BMP/PCX as a new layer at native size. Paste always creates a new "Pasted" layer (both internal clipboard and system clipboard).

## Key Conventions

- **TRANSPARENT = 256** (defined in `constants.js`). All 256 palette indices (0-255) are valid colors. Never use index 0 as transparency.
- **Uint16Array** for all pixel data (layer data, brush data) to accommodate the 256 sentinel.
- **Document coords vs layer-local coords**: Tools work in document space. Use `layer.getPixelDoc(docX, docY)` and `layer.setPixelAutoExtend(docX, docY, val)` for document-space access. Use `layer.getPixel(x, y)` / `layer.setPixel(x, y, val)` only for layer-local access (e.g. thumbnails, internal blitting).
- **No frameworks or bundler**. Plain ES modules with `<script type="module">`. Served by any static HTTP server.
- **Dark theme only**, desktop only (min 1200px), fixed layout.
- CSS uses custom properties defined in `css/main.css` (e.g. `--bg-primary`, `--accent`, `--border`).

## Running

```
npm install
npm start    # runs npx serve .
```

## Testing

No automated test suite. Manual testing: open in browser, verify tools, zoom, layers, palette editing, file import/export (especially 8-bit BMP and PCX files).

## Common Tasks

- **Adding a new tool**: Create a class extending `BaseTool` in `js/tools/`, import it in `app.js`, add to the `tools` array, and add the tool name to the appropriate group in `Toolbar.js`. If the tool needs `activate()`/`deactivate()` for key listeners, `app.js` calls them on tool switch. Add a hint entry in `app.js._getToolHint()`.
- **Adding a new file format**: Add import/export functions in `js/util/io.js`, wire them into the File menu in `app.js._showFileMenu()`.
- **Modifying the palette model**: The palette is shared document-wide. Changing a color entry instantly affects all pixels on all layers using that index (no pixel data changes, just the lookup table).
