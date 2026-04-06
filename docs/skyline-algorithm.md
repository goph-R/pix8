# Skyline Bottom-Left Bin Packing

Used by the SPX export to pack cropped sprite frames into the smallest possible PCX sprite sheets (max 320x200, VGA constraint).

## Problem

Given N rectangles of varying sizes (cropped animation frames), pack them into one or more fixed-max-size bins (320x200 PCX files) minimizing total wasted area.

## Algorithm

The skyline algorithm maintains a 1D profile of the "top edge" of all placed rectangles, called the skyline. Initially the skyline is flat at y=0 across the full width.

### Data Structure

The skyline is an array of segments, each with `{x, y, w}`:

```
Segment: x=0, y=0, w=320    (initial state - empty sheet)
```

After placing a 32x24 rect at (0,0):

```
Segments: [{x:0, y:24, w:32}, {x:32, y:0, w:288}]
```

### Insertion

To place a rectangle of size `rw x rh`:

1. For each skyline segment, check if the rect fits starting at that segment's x position
2. "Fits" means: the rect doesn't exceed `maxW` horizontally, and the highest skyline point under the rect's footprint plus `rh` doesn't exceed `maxH`
3. Among all valid positions, choose the one where `maxY + rh` is minimized (bottom-left preference)
4. Place the rect and update the skyline segments

### Skyline Update

After placing a rect at `(x, y)` with size `(rw, rh)`:

1. A new segment `{x, y: y+rh, w: rw}` replaces the covered region
2. Partially covered segments on the left and right are trimmed
3. Adjacent segments with the same y are merged

### Visual Example

```
Before:                 After placing 20x15:
                       
|         |            |##########|         |
|         |            |##########|         |
|▓▓▓▓▓|  |            |##########|         |
|▓▓▓▓▓|  |            |▓▓▓▓▓|####|         |
|▓▓▓▓▓|  |            |▓▓▓▓▓|####|         |
+---------+            +---------+
skyline: 10,5  20,0    skyline: 10,15  20,5  30,0
```

## Pre-sort

Frames are sorted by height descending before packing. Taller frames placed first create a more even skyline, leaving fewer small gaps. This is a standard heuristic that significantly improves packing density.

## Multi-sheet Overflow

When a frame doesn't fit in the current 320x200 sheet, a new sheet (PCX file) is started. Each sheet has its own skyline packer.

## Tag Group Coherence

SPX sprites reference a single image (PCX). All frames of a tag group must be in the same PCX. After packing, if a group is split across sheets, stray frames are re-packed into the sheet containing the majority of the group's frames.

## Complexity

- Insertion: O(S) per rectangle where S is the number of skyline segments (typically small, bounded by the number of placed rects)
- Total: O(N * S) for N frames
- In practice very fast for sprite-sized inputs (dozens to low hundreds of frames)

## References

- Jukka Jylanki, "A Thousand Ways to Pack the Bin" (2010) - survey of 2D bin packing algorithms
- The skyline/bottom-left algorithm is a simplified variant of the Shelf algorithms, optimized for variable-height rectangles
