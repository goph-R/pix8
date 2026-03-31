# Pix8

A browser-based 256-color indexed pixel art editor inspired by VGA-era graphics tools. Built with vanilla JavaScript, HTML, and CSS -- no frameworks, no bundler.

![Pix8 Screenshot](screenshot.png)

## Features

- **256-color indexed palette** -- all 256 entries (0-255) are usable colors, transparency is a separate sentinel value
- **Photoshop-like layout** -- toolbar with flyout groups on the left, canvas in the center, layers and palette on the right
- **Pixel-perfect zoom** -- nearest-neighbor interpolation at all zoom levels (1x-32x), pixel grid overlay at 12x+
- **Independent layers** -- each layer has its own size and position, auto-extends when drawing outside bounds
- **Layer operations** -- add, delete (with confirmation), reorder, duplicate, toggle visibility, solo (right-click eye icon), rename (double-click)
- **Drawing tools** -- Brush, Eraser, Color Picker, Line, Rectangle, Filled Rectangle, Ellipse, Filled Ellipse
- **Pixel-perfect preview** -- all drawing tools show an 80% opacity preview of the exact pixels before committing
- **Move tool** -- reposition layers and floating selections within the document
- **Selection tools** -- Rectangle and Ellipse selection with Shift for 1:1 constraint (square/circle)
- **Selection operations** -- move selection mask by dragging inside, click to deselect, Select All, Deselect
- **Clipboard** -- Cut (Ctrl+X), Copy (Ctrl+C), Copy Merged (Ctrl+Shift+C), Paste (Ctrl+V), Paste in Place (Ctrl+Shift+V)
- **Brush capture** -- set brush from selection (Ctrl+B) to capture pixels as a custom brush stamp
- **Palette dialog** -- click pen icon to open palette editor with RGB sliders, click to select FG color, right-click for BG color
- **Color picker** -- samples from the merged visible image, not just the active layer
- **Undo/Redo** -- Ctrl+Z / Ctrl+Shift+Z, 50-step history (includes layer geometry changes)
- **File I/O** -- save/load `.pix8` projects, import/export 8-bit BMP and PCX, export PNG
- **Import options** -- import image, import as layer, import palette only, optional index 0 transparency
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
| M | Rectangle Select tool |
| X | Swap FG/BG colors |
| 1 | Reset brush to default (1px) |
| +/- | Zoom in/out |
| Space + drag | Pan canvas |
| Middle mouse drag | Pan canvas |
| Escape | Deselect / commit floating selection |
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
