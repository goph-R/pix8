# Plan: Auto-Sizing Layers, Move Tool, Import as Layer

## Context
Currently all layers are fixed at document dimensions with no position offset. This prevents moving layers, importing images as layers at their native size, and drawing beyond the original canvas bounds. The goal is Photoshop-like behavior: layers are independently sized and positioned, auto-extend when drawn on outside their bounds, and the user never has to think about layer dimensions.

---

## Layer Model Changes (`js/model/Layer.js`)

Add `offsetX` and `offsetY` (default 0) — the layer's top-left corner in document space.

New methods:
- **`getPixelDoc(docX, docY)`** — translates doc coords to layer-local, returns pixel value (TRANSPARENT if outside)
- **`setPixelAutoExtend(docX, docY, colorIndex)`** — if (docX, docY) is outside the layer's current rect, grow the buffer first, then write. This is the key to transparent auto-sizing.
- **`ensureRect(x0, y0, x1, y1)`** — pre-extend to cover a rect (called before brush stamp loops to batch the reallocation)
- **`snapshotGeometry()` / `restoreGeometry()`** — for undo

**Auto-extend strategy**: When a point falls outside, compute a new bounding box that is the union of current layer rect and the new point, plus **16px padding** in each growth direction. Allocate new `Uint16Array`, fill with TRANSPARENT, blit old data at the correct offset, update width/height/offsetX/offsetY. The padding amortizes reallocations during brush strokes.

Existing `getPixel` / `setPixel` (layer-local coords) stay unchanged for internal use.

---

## Drawing: Switch to Auto-Extend (`js/tools/BaseTool.js`)

Change `stampBrush()` to call `layer.setPixelAutoExtend()` instead of `layer.setPixel()`. This is the single chokepoint for all drawing tools (Brush, Line, Rect, Ellipse variants), so one change enables auto-extend everywhere.

**EraserTool**: Keep using `layer.setPixel()` via doc-coord translation — erasing outside layer bounds is a no-op (nothing to erase), which is correct.

---

## Renderer Changes (`js/render/Renderer.js`)

Rewrite `composite()` to iterate per-layer over the intersection of the layer rect and the document rect:

```
for each visible layer:
    clip layer rect to document rect
    for each pixel in the intersection:
        translate to layer-local coords
        read layer.data[localY * layer.width + localX]
        write to output ImageData at doc coords
```

This handles layers of any size at any offset, rendering only the visible portion.

---

## Flatten Changes (`js/model/ImageDocument.js`)

Same intersection-based iteration as the renderer. Output is a document-sized layer at offset (0,0).

---

## Undo System Changes (`js/history/UndoManager.js`)

Undo entries now store geometry alongside data:
```
{ layerIndex, beforeData, afterData, beforeGeometry, afterGeometry }
```
Where geometry = `{ width, height, offsetX, offsetY }`.

- `beginOperation()`: snapshot both data and geometry
- `endOperation()`: compare data lengths + content; store both
- `undo()/redo()`: restore geometry first, then **reassign** data array (not `.set()`, since sizes may differ)

---

## Move Tool (`js/tools/MoveTool.js`)

New tool (shortcut: **V**). On pointer down, record start position and layer's current offset. On pointer move, update `layer.offsetX/Y` by the delta. On pointer up, finalize. Undo captures the offset change via the existing geometry snapshot mechanism.

Register in `app.js` tools array, add 'Move' to the beginning of the drawing tools group in `Toolbar.js`.

---

## Import as Layer

Add "Import BMP as Layer..." and "Import PCX as Layer..." to the File menu.

Implementation: parse the file with existing `importBMP`/`importPCX` to get a temporary ImageDocument, extract its first layer (at native dimensions), rename to filename, insert into the current document above the active layer at offset (0,0). The imported layer keeps its native size — no resizing to document dimensions.

Palette note: the imported file's palette indices are used as-is against the current document palette. If palettes differ, colors will look wrong — expected for indexed color. Palette remapping is a future enhancement.

---

## File Format Changes (`js/util/io.js`)

Bump `.pix8` to **version 2**. Per-layer metadata now includes `width`, `height`, `offsetX`, `offsetY`. Each layer's binary section is `layer.width * layer.height * 2` bytes (variable per layer).

Loading version 1 files: treat all layers as document-sized at offset (0,0) — fully backwards compatible.

---

## Tool Coordinate Updates

Tools that **read** pixels need `getPixelDoc()`:
- **ColorPickerTool**: `layer.getPixelDoc(x, y)` instead of `layer.getPixel(x, y)`
- **Brush selector tools** (Rect/Circle/Poly): use `layer.getPixelDoc()` for reading, keep clamping to document bounds (user sees the document viewport; areas outside the layer return TRANSPARENT in the captured brush, which is correct)

Tools that **write** pixels — no changes needed beyond the `stampBrush` update, since they all go through `BaseTool.stampBrush()`.

---

## Implementation Order

| Phase | What | Breaking? |
|-------|------|-----------|
| A | Add offsetX/Y, getPixelDoc, setPixelAutoExtend, ensureRect to Layer | No — offsets default to 0 |
| B | Update UndoManager to snapshot/restore geometry | No — geometry is identical before/after at this point |
| C | Switch BaseTool.stampBrush to setPixelAutoExtend | Yes — layers can now grow |
| D | Rewrite Renderer.composite() and flattenToLayer() for variable-size layers | Yes — required for C to render correctly |
| E | Update ColorPickerTool and brush selectors to use getPixelDoc | Minor fix |
| F | Add MoveTool, register in app.js and Toolbar.js | New feature |
| G | Update pix8 file format to version 2 | Format change (backwards-compatible load) |
| H | Add "Import as Layer" menu items and logic | New feature |

Phases C and D must ship together — auto-extend without the new renderer would break rendering.

---

## Verification

1. Draw near the edge of a layer, continue outside — layer auto-extends, pixels appear correctly
2. Undo the stroke — layer shrinks back to original size
3. Move a layer with the Move tool — content repositions, rendering correct
4. Undo/redo the move — position restores
5. Import a BMP as layer — appears at native size, positioned at (0,0)
6. Move the imported layer around — works correctly
7. Save as .pix8, reload — layer sizes, offsets, and pixel data preserved
8. Load a version 1 .pix8 — still works (all layers at doc size, offset 0)
9. Export BMP/PCX — flattened output clips to document dimensions
10. Use brush selector tools on an offset layer — captured brush reads correct pixels
