# Pix8 — 256-Color Indexed Pixel Art Editor

## Context
Greenfield project: a browser-based pixel art editor for 8-bit indexed color images (VGA era, always 256 colors). Photoshop-like layout, vanilla JS/HTML/CSS, no frameworks. Served via `npm serve`. Dark theme only, desktop only (min 1200px).

---

## File Structure

```
Pix8/
├── package.json                # "serve" dependency, "start": "npx serve ."
├── index.html                  # Single-page entry, ES modules
├── css/
│   ├── main.css                # CSS grid layout, dark theme variables
│   ├── toolbar.css             # Left toolbar
│   ├── canvas-area.css         # Center work area
│   ├── layers-panel.css        # Right-top panel
│   └── palette-panel.css       # Right-bottom panel
├── js/
│   ├── app.js                  # Bootstrap, wires modules
│   ├── constants.js            # VGA 256-color default palette, key codes
│   ├── EventBus.js             # Simple pub/sub (~20 lines)
│   ├── model/
│   │   ├── ImageDocument.js    # width, height, layers[], palette, brush, FG/BG indices
│   │   ├── Layer.js            # name, visible, data: Uint8Array(w*h)
│   │   ├── Palette.js          # 256x [r,g,b], getColor/setColor
│   │   └── Brush.js            # width, height, data: Uint8Array, isCaptured flag
│   ├── history/
│   │   └── UndoManager.js      # Undo/redo stack on layer snapshots
│   ├── render/
│   │   ├── Renderer.js         # Composites layers → RGBA ImageData via palette lookup
│   │   └── GridOverlay.js      # Pixel grid at high zoom
│   ├── tools/
│   │   ├── BaseTool.js         # Interface: onPointerDown/Move/Up, getCursor
│   │   ├── BrushTool.js        # Stamp brush, Bresenham interpolation between points
│   │   ├── LineTool.js         # Bresenham line with preview
│   │   ├── RectTool.js         # Outline rectangle
│   │   ├── FilledRectTool.js
│   │   ├── EllipseTool.js      # Midpoint ellipse outline
│   │   ├── FilledEllipseTool.js
│   │   ├── RectBrushSelector.js
│   │   ├── PolyBrushSelector.js
│   │   └── CircleBrushSelector.js
│   ├── ui/
│   │   ├── Toolbar.js          # Left tool buttons, active highlight
│   │   ├── ColorSelector.js    # FG/BG overlapping squares widget
│   │   ├── CanvasView.js       # Zoom/pan, coordinate transform, pointer dispatch
│   │   ├── LayersPanel.js      # Layer list, CRUD, reorder, visibility
│   │   └── PalettePanel.js     # 16x16 swatch grid, inline RGB editor
│   └── util/
│       ├── math.js             # Bresenham, midpoint ellipse, point-in-polygon, clamp
│       └── io.js               # Save/load .pix8, import/export BMP & PCX, export PNG
└── assets/
    └── icons/                  # SVG tool icons (or inline)
```

---

## Core Architecture

### Data Model
- **ImageDocument**: width, height, `layers[]`, `palette` (Palette), `activeLayerIndex`, `activeBrush` (Brush), `fgColorIndex`, `bgColorIndex`
- **Layer**: `name`, `visible`, `locked`, `data: Uint8Array(w*h)` — each byte is a palette index 0-255. Index 0 = transparent on all layers except optionally the bottom one
- **Palette**: `colors: Array(256)` of `[r, g, b]`. Initialized to VGA Mode 13h default. Editing a palette entry instantly recolors all pixels using that index (no pixel data changes)
- **Brush**: `width`, `height`, `originX/Y` (hotspot), `data: Uint8Array`, `isCaptured` flag. Default: 1x1 pixel. Captured brushes stamp with their stored palette indices; simple brushes stamp with FG color

### Rendering Pipeline
1. Each layer stores `Uint8Array` of palette indices (never RGBA)
2. Renderer composites visible layers bottom-to-top: for each pixel, topmost non-zero index wins, looked up in palette to get RGBA
3. `putImageData()` onto an offscreen canvas at 1:1 resolution
4. Visible canvas draws offscreen canvas via `drawImage()` with `imageSmoothingEnabled = false`
5. CSS `image-rendering: pixelated` as second line of defense against blur

### Zoom/Pan
- Discrete zoom levels: 1, 2, 4, 8, 16, 32
- Zoom toward cursor (adjust panX/panY to keep pixel under cursor stable)
- Pan via middle-click drag or Space+left drag
- `screenToDoc(sx, sy)` converts screen coords to document pixel coords accounting for zoom + pan + canvas offset
- Pixel grid overlay drawn at zoom >= 8x

### Event Bus
Simple pub/sub. Key events: `palette-changed`, `layer-changed`, `active-layer-changed`, `brush-changed`, `fg-color-changed`, `bg-color-changed`, `document-changed`, `zoom-changed`, `tool-changed`

### Undo/Redo
- Snapshot active layer's `Uint8Array` before each tool operation
- Push `{ layerIndex, beforeData, afterData }` on pointer up if data changed
- Stack cap: 50 entries. Ctrl+Z / Ctrl+Shift+Z

---

## Implementation Phases

### Phase 1: Skeleton & Layout
- `package.json` with `serve` dep
- `index.html` with CSS grid: `grid-template-columns: 48px 1fr 280px`
- Dark theme CSS variables (`--bg-primary: #1e1e1e`, etc.)
- Verify layout at 1200px min width

### Phase 2: Data Model
- `Palette.js` — 256 entries, VGA default, getColor/setColor
- `Layer.js` — Uint8Array storage, getPixel/setPixel/clone/clear
- `Brush.js` — stamp data, origin, isCaptured
- `ImageDocument.js` — layer CRUD, FG/BG, active brush

### Phase 3: Renderer & Canvas View
- `Renderer.js` — composite layers to RGBA ImageData via palette lookup
- `CanvasView.js` — offscreen + visible canvas, zoom/pan, `imageSmoothingEnabled = false`, coordinate transforms, pointer event dispatch to active tool
- Grid overlay at high zoom

### Phase 4: Brush Tool & Toolbar
- `BaseTool.js` interface
- `BrushTool.js` — stamp current brush, Bresenham interpolation between pointer events
- `Toolbar.js` — vertical buttons, tool switching, active highlight
- Wire pointer events through CanvasView to active tool

### Phase 5: Color Selector & Palette Panel
- `ColorSelector.js` — FG/BG overlapping squares (bottom-left), click to swap, X key
- `PalettePanel.js` — 16x16 swatch grid, left-click = FG, right-click = BG, double-click = inline RGB editor

### Phase 6: Layers Panel
- `LayersPanel.js` — layer list with visibility toggle, name editing, thumbnail previews
- Add/delete/move up/move down/duplicate buttons
- Active layer selection

### Phase 7: Shape Tools
- `LineTool.js` — Bresenham, rubber-band preview on overlay canvas
- `RectTool.js` / `FilledRectTool.js`
- `EllipseTool.js` / `FilledEllipseTool.js` — midpoint algorithm
- All show preview during drag, commit on pointer up

### Phase 8: Brush Selector Tools
- `RectBrushSelector.js` — drag rect, extract region from active layer as Brush (index 0 = transparent), auto-switch to BrushTool
- `CircleBrushSelector.js` — click center + drag radius, extract circle region
- `PolyBrushSelector.js` — click vertices, close polygon, extract via point-in-polygon test

### Phase 9: Undo/Redo
- `UndoManager.js` — snapshot before, push diff after, 50-entry cap
- Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y

### Phase 10: File I/O (BMP, PCX, PNG, .pix8)
- **BMP import/export (8-bit)**: Read/write Windows BMP v3 with 256-color palette. Structure: 14-byte file header + 40-byte DIB header + 1024-byte color table (256 x 4 bytes RGBX) + pixel data (1 byte/pixel, rows padded to 4-byte boundary, bottom-to-top). On import: extract palette + pixel data into ImageDocument (single layer). On export: flatten layers, write BMP.
- **PCX import/export (8-bit)**: Read/write ZSoft PCX version 5 with 256-color palette. Structure: 128-byte header (manufacturer, version, encoding=RLE, BPP=8, dimensions) + RLE-compressed pixel data + 0x0C marker byte + 768-byte palette (256 x 3 bytes RGB) at end of file. RLE encoding: if high 2 bits of byte are set, lower 6 bits = run count, next byte = value; otherwise byte is literal pixel. On import: decode RLE, read trailing palette. On export: RLE-encode pixel data, append palette.
- **PNG export**: Composite via Renderer, `canvas.toBlob('image/png')`, download. (Full RGB, lossy re: indexed nature.)
- **.pix8 project format**: JSON metadata + concatenated layer Uint8Arrays as binary blob. Preserves layers, palette, document settings. Save/load via Blob + FileReader.
- File menu or keyboard shortcuts for open/save/export

### Phase 11: Polish
- Keyboard shortcuts: B (brush), L (line), R (rect), E (ellipse), X (swap FG/BG), +/- zoom, Space+drag pan, Ctrl+Z/Y undo/redo
- Status bar: cursor position, zoom level, document size, active tool
- New document dialog with dimension presets (64x64, 128x128, 256x256)
- Checkerboard pattern behind composite to indicate transparency

---

## Key Design Decisions

1. **Index 0 = transparent** in all layers (standard indexed-color convention). Bottom layer can optionally render index 0 as its actual palette color.
2. **One palette per document**, shared by all layers. Palette edits instantly recolor all pixels globally.
3. **Captured brushes stamp with stored palette indices**; simple brushes stamp with FG color index. Distinguished by `brush.isCaptured` flag.
4. **BMP and PCX are native 8-bit formats** — import preserves the exact palette and pixel indices. No color conversion needed. These are the primary interchange formats.
5. **No RGBA anywhere in the model** — only palette indices. RGBA only exists transiently during rendering.

---

## Verification
1. Layout renders correctly at 1200px+, dark theme, all panels visible
2. Paint with brush at various zoom levels — pixels stay crisp, no blur
3. Edit palette entry — all pixels with that index recolor instantly
4. Capture rectangular/circular/polygon brush — stamps correctly, index 0 = transparent
5. Shape tools preview during drag, commit clean pixels
6. Layers: add/delete/reorder/toggle — compositing correct
7. Undo/redo restores pixel data accurately
8. Save .pix8, reload — all data intact
9. Export BMP, open in external viewer — correct palette and pixels
10. Import a known 8-bit BMP/PCX — palette and pixels match original
11. Export PCX with RLE, reimport — round-trip fidelity
