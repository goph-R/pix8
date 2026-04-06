# Changelog

## [1.3.0] - 2026-04-07

### Added
- **Trim to Content** -- Layer menu item that crops the active layer to its non-transparent bounding box
- **Crop to Canvas** -- Layer menu item that clips the active layer to the document viewport bounds
- **Show Border** -- Layer menu toggle that draws a dashed yellow border around the active layer
- **"No content to copy" feedback** -- toast message when Ctrl+C copies only transparent pixels
- **Per-frame layer merge** -- Merge Selected now composites layers independently per frame instead of only the current frame
- **Toast notifications** -- slide-down toast from top center replaces browser alert() dialogs and status bar messages; 1.5s for info, 3s for errors
- **Space shortcut** -- tap Space to toggle Play Tag / Stop; hold Space + move mouse to pan canvas

### Fixed
- Pasting (Ctrl+V) no longer duplicates content across all animation frames; new layers get transparent data on other frames
- Layer operations (add, delete, duplicate, move, merge) now properly sync frame data in animated documents
- System clipboard paste, text layer creation, and Import as Layer also sync frame data correctly
- Merge layers undo no longer appends " copy" to layer names on each undo
- Frame thumbnails now fully refresh after merge undo/redo
- Merge All no longer destroys animation frame data
- Animation panel no longer shifts down when adding layers
- Save project now calls saveCurrentFrame() so per-frame layer dimensions persist correctly
- Frame restore now always updates layer width/height from stored frame data (fixes trim not persisting across frames)

## [1.2.1] - 2026-04-06

### Fixed
- Vertical ruler numbers no longer overlap tick lines
- Text layers now snap edges to grid/guides when moved
- Guide move cursor (ns-resize/ew-resize) now shows with all tools, not just those with hover preview
- Guide drag no longer re-grips when cursor moves near the guide during an active drag
- Animation panel no longer shifts down when adding layers (right panel overflow pushing CSS grid row)

## [1.2.0] - 2026-04-06

### Added
- **Configurable grid** -- user-settable grid size (default 16px) with 8/16/32 presets, toggled via View > Show Grid (Ctrl+')
- **Snap to grid** -- tool coordinates snap to nearest grid line within 6 screen pixels, toggled via View > Snap to Grid (Ctrl+Shift+')
- **Snap to guides** -- coordinates also snap to custom guide lines
- **Rulers** -- horizontal and vertical pixel rulers with adaptive tick marks, toggled via View > Show Rulers (Alt+R)
- **Custom guide lines** -- drag from a ruler to create blue guide lines; Shift+drag to move; drag back to ruler to remove; View > Show Guides (Ctrl+;) and Clear All Guides
- **Edge-based selection boundaries** -- selections snap cleanly to grid cells (exclusive end coordinates, GIMP-style)
- **Layer edge snapping on move** -- Move tool snaps layer content bounding box edges to grid lines and guides
- **Selection edge snapping on move** -- moving a selection mask snaps its edges to grid lines and guides
- **Grid Settings dialog** -- View > Grid Settings with size input and preset buttons

### Fixed
- Right-click brush no longer shows foreground color preview at start position
- Frame thumbnails no longer corrupt when moving layers (missing clearRect)
- 6-bit palette snap overflow producing index 256 at max white
- Selection resize no longer shrinks by 1px per operation
- Grid snap no longer pulls coordinates back inside document when cursor is outside
- Selection preview (blue dashed) now renders above grid and guides

### Changed
- Consolidated grid, guides, and selection canvases into a single shared canvas
- Selection preview overlay draws above grid/guides layer

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
