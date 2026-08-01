# Pix8

A browser-based 256-color indexed pixel art editor inspired by VGA-era graphics tools. Built with vanilla JavaScript and webpack.

Try it online: https://pix8.app

![Pix8 Screenshot](screenshot-v1.4.0.png)

## ⬇️ Download

**Windows** — [**Installer** (`Pix8.Setup.1.6.6.exe`)](https://github.com/DynartInteractive/Pix8/releases/download/v1.6.6/Pix8.Setup.1.6.6.exe) · [**Portable** (`Pix8.1.6.6.exe`)](https://github.com/DynartInteractive/Pix8/releases/download/v1.6.6/Pix8.1.6.6.exe)

The installer lets you pick the install directory and adds a desktop shortcut; the portable is a single self-extracting file — run it, no install. Both are **unsigned** for now, so SmartScreen warns on first run (*More info → Run anyway*).

**Linux / macOS** — no prebuilt binaries yet; [build from source](#electron-desktop-app) (`npm run dist:linux` / `dist:mac`).

No download needed to just try it — [pix8.app](https://pix8.app) runs the same editor in the browser. See [all releases](https://github.com/DynartInteractive/Pix8/releases) for other versions.

## Features

- **256-color indexed palette** -- all 256 entries (0-255) are usable colors, transparency is a separate sentinel value.  
- **Photoshop-like layout** -- toolbar with flyout groups on the left, canvas in the center, layers and palette on the right
- **Pixel-perfect zoom** -- nearest-neighbor interpolation at all zoom levels (1x-32x), pixel grid overlay at 12x+
- **Configurable grid** -- user-settable grid size with snap-to-grid support (View > Grid Settings)
- **Rulers and guides** -- pixel rulers along canvas edges; drag from ruler to create custom guide lines with snap support
- **Independent layers** -- each layer has its own size and position, auto-extends when drawing outside bounds
- **Fixed-size layers** -- lock a layer to exact dimensions via Layer > Set Fixed Size, preventing auto-extend; used for ICO export workflow
- **Layer operations** -- add, delete, reorder, duplicate, toggle visibility, solo, rename, opacity (0-100%), trim to content, crop to canvas, set/remove fixed size, show border
- **Unified export dialog** -- single "Export as..." dialog (Ctrl+Shift+E) with format selector (BMP, PCX, PNG, GIF, SPX, ICO) and format-specific options
- **Drawing tools** -- Brush, Eraser, Color Picker, Rectangle, Filled Rectangle, Ellipse, Filled Ellipse, Flood Fill
- **Brush/Eraser line mode** -- hold Shift to draw straight lines, Ctrl to snap angles to 22.5-degree increments
- **Brush right-click** -- draw with background color using right mouse button
- **Pixel-perfect preview** -- all drawing tools show an 80% opacity preview of the exact pixels before committing
- **Move tool** -- reposition layers and floating selections; snaps layer content edges to grid lines and guides
- **Mirror tool** -- flip image or selection horizontally (click) or vertically (Shift+click)
- **Selection tools** -- Rectangle and Ellipse selection with resizable handles, edge-based boundaries that snap to grid/guides
- **Selection modifiers** -- Ctrl+drag to add, Alt+drag to subtract, Shift for proportional (square/circle); Selection menu: Select All, Deselect, Expand, Shrink, Select by Alpha
- **Free Transform** -- move, resize, and rotate selected pixels with interactive handles (T shortcut), Ctrl snaps rotation to 22.5-degree increments
- **Text tool** -- create text layers with configurable font, size, bold/italic/underline, anti-aliased palette-mapped rendering, and palette color picker (W shortcut)
- **Multi-document tabs** -- independent documents with separate layers, palette, undo history, and zoom/pan state
- **Clipboard** -- Cut, Copy, Copy Merged, Paste, Paste in Place; automatic palette color remapping between documents; system clipboard paste with dithering
- **Truecolor image import** -- File > Open supports PNG/JPG/GIF/WebP with median-cut quantization and dithering (None/Floyd-Steinberg/Ordered Bayer)
- **Frame animation** -- sprite-sheet animation with per-frame pixel data; frame timeline with thumbnails, tag groups, play/pause/stop, tag-based playback; GIF and SPX export also available for still (non-animated) images
- **Onion skinning** -- red-tinted previous frames, blue-tinted next frames; configurable opacity; extended mode (+-2 frames)
- **GrafX2-style palette editor** -- range selection, HSV color picker (saturation/value square + hue strip), RGB sliders with hex input, batch operations (Swap, X-Swap, Copy, Flip, X-Flip, Neg, Gray, Spread, Merge, Sort, Reduce, Zap Unused, Used highlight), 6-bit VGA mode, palette Load/Save (PAL/BMP/PCX)

<p align="center"><img src="https://github.com/DynartInteractive/Pix8/raw/main/palette-editor-v1.6.5.png" alt="Palette Editor Screenshot"></p>

- **Toast notifications** -- non-blocking slide-down messages replace browser alert dialogs
- **Desktop-style menus** -- click to open, hover to switch, same for toolbar flyout groups
- **Undo/Redo** -- Ctrl+Z / Ctrl+Shift+Z, 50-step history including palette edits, all layer operations (add, delete, move, duplicate, rename, visibility, opacity), frame operations (add, delete, move, edit), and paste/import
- **SVG icons** -- all toolbar and panel icons are standalone SVG files in `images/` for easy customization

### File Formats

| Format | Import | Export | Notes |
|--------|--------|--------|-------|
| .pix8 | Yes | Yes | Native project format (layers, animation, palette) |
| BMP | Yes | Yes | 8-bit indexed color |
| PCX | Yes | Yes | 8-bit indexed color with RLE compression |
| PNG | Yes | Yes | Truecolor import with quantization, indexed export |
| JPG/GIF/WebP | Yes | -- | Truecolor import with quantization |
| GIF | -- | Yes | GIF89a with LZW compression, transparency, still or animated |
| SPX | -- | Yes | Sprite XML + PCX sprite sheet(s) as ZIP |
| ICO | -- | Yes | Windows icon with multiple sizes from fixed-size layers |
| PAL | Yes | Yes | 6-bit raw binary or 8-bit JASC-PAL text |

### Electron Desktop App

```bash
npm run electron              # Run as desktop app
DEVTOOLS=1 npm run electron   # Run with DevTools (F12 to toggle)
npm run dist:linux            # Build Linux AppImage/deb
npm run dist:win              # Build Windows installer (unsigned)
npm run dist:mac              # Build macOS dmg
```

#### Windows Code Signing (Azure Trusted Signing)

To produce a signed Windows installer, install [AzureSignTool](https://github.com/vcsjones/AzureSignTool) and set the environment variables before building:

```bash
dotnet tool install --global AzureSignTool

AZURE_KEY_VAULT_URI="https://your-vault.vault.azure.net" \
AZURE_CLIENT_ID="..." \
AZURE_TENANT_ID="..." \
AZURE_CLIENT_SECRET="..." \
AZURE_CERT_NAME="..." \
npm run dist:win
```

This requires a custom `sign.js` in the project root (see electron-builder [custom signing](https://www.electron.build/code-signing.html)) and the following in `package.json` under `build.win`:

```json
"sign": "./sign.js",
"signingHashAlgorithms": ["sha256"]
```

Without signing, the installer will show an "Unknown publisher" warning on Windows.

## Getting Started

```bash
npm install
npm run build    # webpack production build
npm start        # serve at http://localhost:3000
```

For development with auto-rebuild, one line (webpack watch backgrounded + server in the foreground):

```bash
npm run dev & npm start
```

`serve` binds to all network interfaces, so it prints a LAN URL (e.g. `http://192.168.0.x:3000`) alongside `localhost` -- handy for testing on another machine on the network. To stop, `Ctrl+C` the server, then `kill %1` (or `fg` then `Ctrl+C`) to end the backgrounded webpack watcher.

Or run the two halves in separate terminals if you prefer isolated output:

```bash
npm run dev      # webpack watch mode (in one terminal)
npm start        # serve at http://localhost:3000 (in another terminal)
```

## Releasing

To force browsers to pick up new CSS/JS/image files on the production site, bump the version in **three** places on every release:

1. `package.json` -- `"version"` field
2. `js/constants.js` -- `ASSET_VERSION` constant (used by the About dialog and appended to tool/panel icon URLs via the `withVersion()` helper)
3. `index.html` -- find/replace every `?v=1.5.0` query string on stylesheet, script, and `<img>` tags

Then `npm run build` and deploy. The new query strings give browsers fresh URLs, bypassing any previously cached response.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Move tool |
| B | Brush tool |
| E | Eraser tool |
| I | Color Picker tool |
| U | Rectangle tool |
| O | Ellipse tool |
| G | Flood Fill tool |
| M | Rectangle Select tool |
| Shift+M | Ellipse Select tool |
| Ctrl+M | Mirror tool |
| T | Free Transform tool |
| W | Text tool |
| X | Swap FG/BG colors |
| 1 | Reset brush to default (1px) |
| +/- | Zoom in/out |
| Space | Play Tag / Stop (animation) |
| Middle mouse drag | Pan canvas |
| Enter | Commit free transform |
| Escape | Cancel / deselect / commit floating selection |
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
| Ctrl+Shift+E | Export as... |
| Ctrl+O | Open file |
| Ctrl+' | Toggle grid |
| Ctrl+Shift+' | Toggle snap to grid |
| Alt+R | Toggle rulers |
| Ctrl+; | Toggle guides |

## Project Structure

```
css/               CSS files (layout, dark theme, panel styles)
dist/              Webpack output (bundle.js)
docs/              Algorithm documentation
images/            SVG icons (editable with Inkscape)
js/
  app.js           Application bootstrap and wiring
  EventBus.js      Simple pub/sub event system
  constants.js     VGA palette, zoom levels, TRANSPARENT sentinel
  model/           Data model (ImageDocument, Layer, Palette, Brush, Selection)
  history/         Undo/redo manager
  render/          Compositing renderer and grid overlay
  tools/           All drawing and selection tools
  ui/              UI panels (CanvasView, Toolbar, LayersPanel, PalettePanel, etc.)
  util/            File I/O, quantization, GIF encoder, SPX exporter
index.html         Single-page entry point
webpack.config.js  Webpack configuration
```

## Technical Notes

- All pixel data is stored as `Uint16Array` with values 0-255 for palette indices and 256 for transparent pixels
- Layers are independently sized and positioned -- drawing outside bounds auto-extends with 16px growth padding (unless the layer is fixed-size)
- Rendering composites layers bottom-to-top via palette lookup into RGBA `ImageData`, drawn with `imageSmoothingEnabled = false`
- GIF export uses a native LZW encoder -- no external encoding libraries
- SPX export uses skyline bin packing to minimize sprite sheet area within 320x200 VGA constraints
- JSZip is the only runtime dependency (for SPX ZIP export)

## Future Improvements

- **Command/action system** -- Replace the current mixin-based module split with a central command registry. Menus and keyboard shortcuts would dispatch named commands (e.g. `'file:open'`, `'edit:copy'`, `'image:rotate-left'`), and a command registry would route them to handler functions. This would decouple menus, shortcuts, and operations cleanly, making it easy to add new commands, rebind shortcuts, and support command palettes without cross-module dependencies.

## Known Issues

- **Subpixel rendering glitches at fractional display scaling** -- grid lines, guides, and selection marching ants may appear misaligned or jittery on displays with scaling other than 100% or 200% (e.g., 125%, 150%). This is caused by CSS pixels not aligning with physical device pixels at fractional `devicePixelRatio` values. Fixing this would require DPR-aware canvas rendering throughout the entire canvas stack -- not yet planned.
- **Electron save dialog broken on KDE Plasma 6 / Wayland** -- `dialog.showSaveDialog` is instantly dismissed by the compositor, so File > Save and Export do nothing in the Electron desktop app. File > Open (which uses `showOpenDialog`) works normally. This is an upstream Electron/Chromium bug with the Wayland file dialog portal. Workaround: use the browser version for saving, or run the Electron app under X11 (`GDK_BACKEND=x11 npm run electron`).
