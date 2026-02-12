/**
 * sharp stub for almostnode containers
 *
 * Provides the sharp() API surface but returns no-op pipelines.
 * Image metadata calls return sensible defaults.
 * Actual pixel manipulation is not possible in this environment.
 */
'use strict';

class SharpPipeline {
  constructor(input, options) {
    this._input = input;
    this._options = options || {};
    this._operations = [];
  }

  // --- Metadata ---
  async metadata() {
    return {
      format: 'png',
      width: 1,
      height: 1,
      channels: 4,
      premultiplied: false,
      size: this._input ? this._input.length || 0 : 0,
      density: 72,
      hasAlpha: true,
      hasProfile: false,
      isProgressive: false,
    };
  }

  async stats() {
    return { channels: [{ min: 0, max: 255, sum: 0, squaresSum: 0, mean: 0, stdev: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 }], isOpaque: false, entropy: 0, sharpness: 0 };
  }

  // --- Resize / transform (all return `this` for chaining) ---
  resize()     { return this; }
  extend()     { return this; }
  extract()    { return this; }
  trim()       { return this; }
  rotate()     { return this; }
  flip()       { return this; }
  flop()       { return this; }
  affine()     { return this; }
  sharpen()    { return this; }
  median()     { return this; }
  blur()       { return this; }
  flatten()    { return this; }
  unflatten()  { return this; }
  gamma()      { return this; }
  negate()     { return this; }
  normalise()  { return this; }
  normalize()  { return this; }
  clahe()      { return this; }
  convolve()   { return this; }
  threshold()  { return this; }
  boolean()    { return this; }
  linear()     { return this; }
  recomb()     { return this; }
  modulate()   { return this; }
  tint()       { return this; }
  greyscale()  { return this; }
  grayscale()  { return this; }
  pipelineColourspace() { return this; }
  pipelineColorspace()  { return this; }
  toColourspace()       { return this; }
  toColorspace()        { return this; }
  composite()  { return this; }
  withMetadata() { return this; }
  keepExif()   { return this; }
  withExif()   { return this; }
  keepIccProfile() { return this; }
  withIccProfile() { return this; }
  keepMetadata()   { return this; }

  // --- Format ---
  jpeg() { return this; }
  png()  { return this; }
  webp() { return this; }
  avif() { return this; }
  gif()  { return this; }
  tiff() { return this; }
  heif() { return this; }
  raw()  { return this; }

  // --- Output ---
  toFormat() { return this; }

  async toBuffer(opts) {
    const buf = Buffer.alloc(0);
    if (opts && opts.resolveWithObject) {
      return { data: buf, info: { format: 'png', width: 1, height: 1, channels: 4, premultiplied: false, size: 0 } };
    }
    return buf;
  }

  async toFile(path) {
    // In VFS environments the caller's fs.writeFileSync would handle this.
    // We return info similar to a real write.
    return { format: 'png', width: 1, height: 1, channels: 4, premultiplied: false, size: 0 };
  }

  pipe(dest) { return dest; }

  clone() { return new SharpPipeline(this._input, this._options); }
}

function sharp(input, options) {
  return new SharpPipeline(input, options);
}

// Static helpers
sharp.format = {
  jpeg: { id: 'jpeg' },
  png:  { id: 'png'  },
  webp: { id: 'webp' },
  avif: { id: 'avif' },
  gif:  { id: 'gif'  },
  tiff: { id: 'tiff' },
  heif: { id: 'heif' },
  raw:  { id: 'raw'  },
  svg:  { id: 'svg'  },
};

sharp.versions = { sharp: '0.34.0-stub', vips: '0.0.0' };
sharp.interpolators = {};
sharp.queue = { on() {} };
sharp.counters = () => ({ queue: 0, process: 0 });
sharp.cache = (opts) => opts || { memory: { current: 0, high: 0, max: 0 }, files: 0, items: 0 };
sharp.concurrency = (n) => n || 1;
sharp.simd = () => false;

module.exports = sharp;
module.exports.default = sharp;
