# GIF89a Animation Export

Pix8 includes a native GIF89a encoder (`js/util/gif.js`) that writes animated GIFs directly from the indexed-color document without any external libraries.

## Why GIF is a Natural Fit

GIF natively supports 256-color palettes, which maps perfectly to Pix8's indexed-color model. No color conversion or quantization is needed — the document's palette becomes the GIF's Global Color Table directly.

## File Structure

A GIF89a file consists of these blocks in order:

```
1. Header            "GIF89a" (6 bytes)
2. Logical Screen    Width, height, color table info (7 bytes)
   Descriptor
3. Global Color      256 entries x 3 bytes = 768 bytes
   Table             (directly from document palette)
4. Netscape          Application Extension enabling loop playback
   Extension         Loop count: 0=infinite, 1=once, N=N times
5. Frame blocks      Repeated for each animation frame:
   a. Graphic        Delay time, disposal method (8 bytes)
      Control Ext
   b. Image          Position, size, local table flag (10 bytes)
      Descriptor
   c. Image Data     LZW-compressed pixel indices
6. Trailer           0x3B (1 byte)
```

## Frame Timing

GIF stores frame delays in **centiseconds** (1/100th of a second). Pix8 frames use milliseconds, so values are divided by 10.

Most browsers clamp delays below 20ms (2 centiseconds) to 100ms. Practical minimum for smooth animation is ~20ms (50 FPS), though 50-100ms (10-20 FPS) is typical for pixel art.

## LZW Compression

GIF requires LZW (Lempel-Ziv-Welch) variable-length code compression for image data.

### Encoding Process

1. Initialize code table with 256 palette entries + Clear Code (256) + EOI Code (257)
2. Start with 9-bit codes (minimum code size 8 + 1)
3. Build strings from the pixel stream using a trie:
   - Read pixels one at a time
   - If `current_string + pixel` exists in the table, extend the string
   - Otherwise, output the code for `current_string`, add `current_string + pixel` to the table, start new string with `pixel`
4. When the table reaches 4096 entries (12-bit max), emit a Clear Code and reset
5. End with an EOI code

### Bit Packing

LZW codes are variable-width (9 to 12 bits) and are packed into bytes LSB-first. The byte stream is then split into sub-blocks of up to 255 bytes each, prefixed by their length byte, and terminated by a zero-length block.

```
Code width progression:
  9 bits: codes 0-511
 10 bits: codes 512-1023
 11 bits: codes 1024-2047
 12 bits: codes 2048-4095 (max, then clear and reset)
```

### Trie Structure

The code table is implemented as a trie (prefix tree) for O(1) string lookup. Each node has a `children` Map keyed by pixel index, avoiding the need to concatenate and hash strings.

## Export Options

The export dialog provides:

| Option | Values | Description |
|--------|--------|-------------|
| Frames | All / per tag | Export all frames or only a specific tag group |
| Scale  | 1x-10x | Nearest-neighbor upscaling for larger output |
| Loop   | Infinite, Once, 2x, 3x, 5x | Netscape extension loop count |

## Scaling

When scale > 1x, each source pixel is replicated as a scale x scale block. The RGBA-to-index reverse lookup happens at source resolution; scaling is applied during index array construction. This preserves crisp pixel art edges.

## RGBA to Index Reverse Mapping

The renderer outputs RGBA pixels. To write GIF image data, these must be mapped back to palette indices. A reverse lookup table is built from the palette:

```
key = (R << 16) | (G << 8) | B  ->  palette index
```

Transparent pixels (alpha < 128) map to index 0. Since the document is indexed-color, every rendered pixel color exists in the palette — no nearest-color search is needed.

## References

- GIF89a Specification: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
- LZW compression: Welch, T. "A Technique for High-Performance Data Compression" (IEEE Computer, 1984)
- Netscape Application Extension (loop): de facto standard, not part of the original GIF89a spec
