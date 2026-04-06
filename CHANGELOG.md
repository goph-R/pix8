# Changelog

## [1.1.0] - 2026-04-06

### Added
- **Undoable layer operations** -- add, delete, duplicate, move, rename, visibility toggle, and opacity changes are now part of the undo/redo history (Ctrl+Z / Ctrl+Shift+Z)
- **Unified export dialog** -- single "Export as..." menu item (Ctrl+Shift+E) replaces five separate export entries; format selector with inline GIF/SPX options

### Removed
- Individual Export BMP/PCX/PNG/GIF/SPX menu items (replaced by unified dialog)

## [1.0.0] - 2026-04-06

### Added
- **HSV color picker** -- Photoshop-style saturation/value square with vertical hue strip in the palette editor, replacing the vertical RGB sliders
- **RGB sliders** -- horizontal R, G, B sliders with number inputs below the color picker
- **Hex color input** -- `#RRGGBB` text input with auto-strip `#` on paste
- **Brush line mode** -- hold Shift to draw straight lines with the Brush tool (same as Eraser), Ctrl to snap to 22.5-degree angles

### Removed
- **Line tool** -- merged into Brush tool as Shift+drag line mode

### Fixed
- 6-bit palette snap overflow producing index 256 instead of 255 at max white

## [0.9.0] - 2026-04-06

### Added
- **Webpack bundler** -- `npm run build` produces `dist/bundle.js`, `npm run dev` for watch mode
- **GIF animation export** -- native GIF89a encoder with LZW compression; export dialog with scale (1x-10x), loop count, and tag-based frame selection
- **SPX sprite export** -- exports SPX XML + PCX sprite sheet(s) as a single ZIP; skyline bin packing for smallest possible PCX (max 320x200 VGA); frames cropped to bounding box with offset metadata
- **Onion skinning** -- red tint for previous frames, blue tint for next frames; configurable opacity; extended mode (+-2 frames) with progressive fade
- **Frame properties dialog** -- proper modal dialog for tag and delay editing (replaces browser prompt)
- **Tag-based playback** -- Play Tag button loops only frames within the current tag group
- **Playback controls** -- Play All, Play Tag, Pause (stay on frame), Stop (return to start)
- **Tag labels** -- horizontal labels above frame thumbnails with z-index for active tag
- **SVG icon system** -- all tool and panel icons extracted to `images/icon-*.svg` for Inkscape editing; CSS filter-based dark theme coloring
- **JSZip dependency** -- for SPX ZIP export with DEFLATE compression
- **Documentation** -- `docs/gif89a.md` (GIF format and LZW), `docs/skyline-algorithm.md` (bin packing)

### Fixed
- Frame panel stays open when creating new document or opening non-animated file
- Tag group detection: tag marks start of group, untagged frames belong to previous tag

### Changed
- Animation panel height increased to 100px
- Frame panel buttons use SVG icons instead of Unicode characters
- Layer panel buttons use SVG icons instead of HTML entities
- `index.html` loads bundled `dist/bundle.js` instead of ES module

## [0.8.0] - 2026-04-05

### Added
- **Frame animation system** -- per-frame layer pixel data, opacity, and text data; frame timeline panel with thumbnails
- **Electron desktop app** -- native file dialogs, window chrome, `npm run electron`
- **Selection menu** -- Expand, Shrink (iterative 4-connected neighbor), Select by Alpha
- **Desktop-style menus** -- click to toggle, hover to switch between open menus
- **Mouse wheel on number inputs** -- global scroll handler for all number inputs

## [0.7.0] - 2026-04-04

### Added
- **Text tool** -- configurable font, size, bold/italic/underline, palette color picker (W shortcut)
- **Anti-aliased text** -- palette-mapped blending with nearest-color lookup
- **Layer opacity** -- per-layer 0-100% with palette-mapped blending
- **Convert to Bitmap** -- rasterize text layers respecting anti-aliasing

## [0.6.0] - 2026-04-03

### Added
- **Multi-document tabs** -- independent documents with separate layers, palette, undo, zoom/pan
- **Cross-document paste** -- automatic palette color remapping between documents
- **Truecolor image import** -- PNG/JPG/GIF/WebP via median-cut quantization with dithering (None/Floyd-Steinberg/Ordered Bayer)
- **System clipboard paste** -- reads images from system clipboard with palette mapping

## [0.5.0] - 2026-04-02

### Added
- **GrafX2-style palette editor** -- range selection, vertical RGB sliders, batch operations (Swap, X-Swap, Copy, Flip, X-Flip, Neg, Gray, Spread, Merge, Sort, Reduce, Zap Unused)
- **6-bit per channel mode** -- VGA-era 0-63 range with toggle
- **Palette Load/Save** -- 6-bit raw binary PAL, 8-bit JASC-PAL text, BMP/PCX extraction
- **Palette undo** -- internal history plus document-level undo on OK

## [0.1.0] - 2026-04-01

### Initial release
- 256-color indexed palette with TRANSPARENT sentinel (index 256)
- Independent layers with auto-extend
- Drawing tools: Brush, Eraser, Color Picker, Line, Rectangle, Filled Rect, Ellipse, Filled Ellipse, Flood Fill
- Selection tools: Rectangle, Ellipse with resize handles
- Free Transform with rotate/scale/translate
- Mirror tool (horizontal/vertical)
- Move tool with multi-layer support
- Undo/redo (50 steps)
- File I/O: .pix8 projects, 8-bit BMP, 8-bit PCX (RLE), PNG export
- Pixel grid overlay at high zoom
- Dark theme, keyboard shortcuts
