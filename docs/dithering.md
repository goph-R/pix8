# Color Quantization & Dithering Algorithms

References for the algorithms used in Pix8's truecolor-to-indexed conversion (`js/util/quantize.js`).

## Median Cut

- **Original paper:** Paul Heckbert, "Color Image Quantization for Frame Buffer Display" (SIGGRAPH 1982) -- the foundational algorithm. Splits color space recursively along the axis with the largest range.
- https://en.wikipedia.org/wiki/Median_cut

## Floyd-Steinberg Dithering

- **Original paper:** Robert Floyd & Louis Steinberg, "An Adaptive Algorithm for Spatial Greyscale" (1976, Proceedings of the SID). The error diffusion weights (7/16, 3/16, 5/16, 1/16) come directly from this.
- https://en.wikipedia.org/wiki/Floyd%E2%80%93Steinberg_dithering

## Ordered (Bayer) Dithering

- **Bayer matrix from:** Bryce Bayer, "An optimum method for two-level rendition of continuous-tone pictures" (IEEE 1973). The 4x4 threshold pattern we use is the classic Bayer matrix.
- https://en.wikipedia.org/wiki/Ordered_dithering

## General Overviews

- "A Survey of Color Quantization in Images" by Celebi et al. (2011) -- compares median cut, octree, K-means, and others
- "Computer Graphics: Principles and Practice" (Foley, van Dam) -- has a great chapter on color quantization and dithering
- For the VGA-era context specifically, Michael Abrash's "Graphics Programming Black Book" covers palette tricks

The Wikipedia articles are the best starting point -- they have the algorithms with pseudocode and visual examples.
