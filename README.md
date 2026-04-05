# Pix8

A browser-based 256-color indexed pixel art editor inspired by VGA-era graphics tools. Built with vanilla JavaScript, HTML, and CSS -- no frameworks, no bundler.

![Pix8 Screenshot](screenshot-v3.png)

## Features

- **256-color indexed palette** -- all 256 entries (0-255) are usable colors, transparency is a separate sentinel value
- **Photoshop-like layout** -- toolbar with flyout groups on the left, canvas in the center, layers and palette on the right
- **Pixel-perfect zoom** -- nearest-neighbor interpolation at all zoom levels (1x-32x), pixel grid overlay at 12x+
- **Independent layers** -- each layer has its own size and position, auto-extends when drawing outside bounds
- **Layer operations** -- add, delete (with confirmation), reorder, duplicate, toggle visibility, solo (right-click eye icon), rename (double-click)
- **Drawing tools** -- Brush, Eraser, Color Picker, Line, Rectangle, Filled Rectangle, Ellipse, Filled Ellipse, Flood Fill
- **Brush right-click** -- draw with background color using right mouse button
- **Pixel-perfect preview** -- all drawing tools show an 80% opacity preview of the exact pixels before committing
- **Move tool** -- reposition layers and floating selections within the document
- **Mirror tool** -- flip image or selection horizontally (click) or vertically (Shift+click)
- **Selection tools** -- Rectangle and Ellipse selection with resizable handles at edges and corners
- **Selection modifiers** -- Shift+drag to add to selection, Alt+drag to subtract from selection
- **Selection operations** -- move selection mask by dragging inside, click to deselect, Select All, Deselect
- **Free Transform** -- move, resize, and rotate selected pixels with interactive handles (T shortcut), Ctrl snaps rotation to 22.5-degree increments, commit with Enter, cancel with Escape
- **Flood Fill** -- fill connected pixels with FG/BG color (G shortcut), respects selection boundaries
- **Line snapping** -- hold Ctrl while drawing lines to snap to nearest 22.5-degree angle (horizontal, vertical, diagonal)
- **Eraser line mode** -- hold Shift to erase in a straight line, Ctrl to snap angle
- **Multi-document tabs** -- open multiple documents in tabs, each with independent layers, palette, undo history, and zoom/pan state
- **Clipboard** -- Cut (Ctrl+X), Copy (Ctrl+C), Copy Merged (Ctrl+Shift+C), Paste (Ctrl+V), Paste in Place (Ctrl+Shift+V); paste creates a new layer with automatic palette color remapping between documents
- **System clipboard paste** -- Ctrl+V reads images from system clipboard, maps to current palette with dithering options (None/Floyd-Steinberg/Ordered), pastes as new layer
- **Truecolor image import** -- File > Open supports PNG/JPG/GIF/WebP with quantization dialog (color count + dithering mode)
- **Text tool** -- create text layers with configurable font, size, bold/italic/underline, and color (W shortcut); click text layer to edit, palette color picker in dialog
- **Anti-aliased text** -- text layers support anti-aliased rendering with automatic palette color mapping (enabled by default)
- **Convert to Bitmap** -- Layer menu option to rasterize text layers to pixel data, respects anti-aliasing
- **Brush capture** -- set brush from selection (Ctrl+B) to capture pixels as a custom brush stamp
- **GrafX2-style palette editor** -- full palette management dialog with toolbar, vertical RGB sliders, range selection (drag to select), color preview strip
- **Palette operations** -- Swap, X-Swap (with pixel remap), Copy, Flip, X-Flip, Neg, Gray, Spread, Merge, Sort (Hue/Lightness/Histogram), Reduce (median-cut), Zap Unused, Used highlight
- **6-bit per channel mode** -- VGA-era 0-63 color range with automatic conversion, checkbox toggle with confirmation
- **Palette Load/Save** -- load from PAL/BMP/PCX, save to PAL (6-bit: raw 768-byte binary with 0-63 values, 8-bit: JASC-PAL text with 0-255 values)
- **Palette undo** -- per-operation undo within the dialog, plus document-level undo on OK (Ctrl+Z reverts entire palette edit session)
- **Color picker** -- samples from the merged visible image, not just the active layer
- **Image rotation** -- Image menu: Rotate Left / Rotate Right (90-degree, affects all layers, swaps dimensions)
- **Layer menu** -- Merge All (flatten), Merge Selected (Ctrl+click layers to multi-select), Convert to Bitmap (text layers)
- **Multi-layer selection** -- Ctrl+click layers in the panel to select multiple, active layer always selected, used for Merge Selected
- **Undo/Redo** -- Ctrl+Z / Ctrl+Shift+Z, 50-step history (includes layer geometry and selection changes)
- **File I/O** -- save/load `.pix8` projects, import/export 8-bit BMP and PCX, export PNG, PAL palette format (raw 6-bit and JASC-PAL 8-bit), open truecolor images (PNG/JPG/GIF/WebP)
- **Import options** -- import as layer, optional index 0 transparency
- **Status bar hints** -- contextual tool hints showing available shortcuts and modifiers
- **Dark theme** -- desktop only, minimum 1200px width

## Getting Started

```bash
npm install
npm start
```

Then open http://localhost:3000 in your browser.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Move tool |
| B | Brush tool |
| E | Eraser tool |
| I | Color Picker tool |
| L | Line tool |
| U | Rectangle tool |
| O | Ellipse tool |
| G | Flood Fill tool |
| M | Rectangle Select tool |
| T | Free Transform tool |
| W | Text tool |
| X | Swap FG/BG colors |
| 1 | Reset brush to default (1px) |
| +/- | Zoom in/out |
| Space + drag | Pan canvas |
| Middle mouse drag | Pan canvas |
| Enter | Commit free transform |
| Escape | Cancel free transform / deselect / commit floating selection |
| Delete | Clear selected pixels |
| Ctrl+A | Select all |
| Ctrl+D | Deselect |
| Ctrl+B | Set brush from selection |
| Ctrl+C | Copy |
| Ctrl+Shift+C | Copy merged (all layers) |
| Ctrl+X | Cut |
| Ctrl+V | Paste (centered) |
| Ctrl+Shift+V | Paste in place |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+S | Save project |
| Ctrl+O | Open file |

Shortcuts follow Photoshop conventions where applicable (V, B, E, I, M).

## Project Structure

```
css/               CSS files (layout, dark theme, panel styles)
js/
  app.js           Application bootstrap and wiring
  EventBus.js      Simple pub/sub event system
  constants.js     VGA palette, zoom levels, TRANSPARENT sentinel
  model/           Data model (ImageDocument, Layer, Palette, Brush, Selection)
  history/         Undo/redo manager
  render/          Compositing renderer and grid overlay
  tools/           All drawing and selection tools
  ui/              UI panels (CanvasView, Toolbar, LayersPanel, PalettePanel, ColorSelector)
  util/            Drawing algorithms (Bresenham, midpoint ellipse) and file I/O
index.html         Single-page entry point
```

## Technical Notes

- All pixel data is stored as `Uint16Array` with values 0-255 for palette indices and 256 for transparent pixels
- Layers are independently sized and positioned -- drawing outside bounds auto-extends with 16px growth padding
- Rendering composites layers bottom-to-top via palette lookup into RGBA `ImageData`, drawn with `imageSmoothingEnabled = false`
- Selection uses a document-sized `Uint8Array` mask with floating selection support for cut/copy/paste
- BMP and PCX formats natively support 8-bit indexed color, so import/export preserves exact palette indices
- No build step -- uses ES modules loaded directly by the browser
