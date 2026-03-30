# Pix8

A browser-based 256-color indexed pixel art editor inspired by VGA-era graphics tools. Built with vanilla JavaScript, HTML, and CSS -- no frameworks, no bundler.

## Features

- **256-color indexed palette** -- all 256 entries (0-255) are usable colors, transparency is a separate sentinel value
- **Photoshop-like layout** -- toolbar on the left, canvas in the center, layers and palette on the right
- **Pixel-perfect zoom** -- nearest-neighbor interpolation at all zoom levels (1x-32x), pixel grid overlay at 8x+
- **Layers** -- add, delete, reorder, duplicate, toggle visibility, rename
- **Drawing tools** -- Brush, Eraser, Color Picker, Line, Rectangle, Filled Rectangle, Ellipse, Filled Ellipse
- **Brush capture** -- select a rectangular, circular, or polygon region from the canvas to use as a custom brush stamp
- **Palette editor** -- click to select FG/BG color, double-click to edit RGB values, full 16x16 swatch grid
- **Undo/Redo** -- Ctrl+Z / Ctrl+Shift+Z, 50-step history
- **File I/O** -- save/load `.pix8` projects, import/export 8-bit BMP and PCX, export PNG
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
| X | Swap FG/BG colors |
| 1 | Reset brush to default (1px) |
| +/- | Zoom in/out |
| Space + drag | Pan canvas |
| Middle mouse drag | Pan canvas |
| Delete | Clear active layer |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+S | Save project |
| Ctrl+O | Open file |

## Project Structure

```
css/               CSS files (layout, dark theme, panel styles)
js/
  app.js           Application bootstrap and wiring
  EventBus.js      Simple pub/sub event system
  constants.js     VGA palette, zoom levels, TRANSPARENT sentinel
  model/           Data model (ImageDocument, Layer, Palette, Brush)
  history/         Undo/redo manager
  render/          Compositing renderer and grid overlay
  tools/           All drawing and selection tools
  ui/              UI panels (CanvasView, Toolbar, LayersPanel, PalettePanel, ColorSelector)
  util/            Drawing algorithms (Bresenham, midpoint ellipse, point-in-polygon) and file I/O
index.html         Single-page entry point
```

## Technical Notes

- All pixel data is stored as `Uint16Array` with values 0-255 for palette indices and 256 for transparent pixels
- Rendering composites layers bottom-to-top via palette lookup into RGBA `ImageData`, drawn with `imageSmoothingEnabled = false`
- BMP and PCX formats natively support 8-bit indexed color, so import/export preserves exact palette indices
- No build step -- uses ES modules loaded directly by the browser
