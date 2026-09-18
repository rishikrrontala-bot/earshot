import { ALL_FREQS } from '../modem/constants.ts';

const ROW_HEIGHT = 4;
const GAMMA = 2.0;
const LIVE_CONFIDENCE = 1.55;

/** Hann-windowed detection genuinely picks up energy in the bins either side of
 *  the sounding tone, so the transmit view shows that skirt rather than a bare
 *  single column. It is what a spectrum analyser would actually display. */
const SKIRT = [1, 0.24, 0.07];

/** Every tone is always present as an unlit ghost; the sounding one is struck
 *  forward. Values snap — no tweening — and older rows decay as they descend. */
export class Waterfall {
  private ctx: CanvasRenderingContext2D;
  private rows: Float32Array[] = [];
  private capacity = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.capacity = Math.ceil(rect.height / ROW_HEIGHT) + 1;
    if (this.rows.length > this.capacity) this.rows.length = this.capacity;
    this.draw();
  }

  pushMeasured(mags: Float32Array, confidence: number): void {
    const row = new Float32Array(ALL_FREQS.length);
    if (confidence >= LIVE_CONFIDENCE) {
      let max = 0;
      for (const m of mags) if (m > max) max = m;
      if (max > 0) for (let i = 0; i < row.length; i++) row[i] = Math.pow(mags[i] / max, GAMMA);
    }
    this.push(row);
  }

  pushTone(tone: number): void {
    const row = new Float32Array(ALL_FREQS.length);
    if (tone >= 0 && tone < row.length) {
      for (let d = 0; d < SKIRT.length; d++) {
        if (tone - d >= 0) row[tone - d] = Math.max(row[tone - d], SKIRT[d]);
        if (tone + d < row.length) row[tone + d] = Math.max(row[tone + d], SKIRT[d]);
      }
    }
    this.push(row);
  }

  private push(row: Float32Array): void {
    this.rows.unshift(row);
    if (this.rows.length > this.capacity) this.rows.length = this.capacity;
    this.draw();
  }

  clear(): void { this.rows = []; this.draw(); }

  private draw(): void {
    const { ctx, canvas, dpr } = this;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cols = ALL_FREQS.length;
    const rowH = ROW_HEIGHT * dpr;
    const colW = w / cols;
    const barW = Math.max(1, colW - 1.5 * dpr);
    const inset = (colW - barW) / 2;

    // Ghost band: every tone present even in silence.
    ctx.fillStyle = 'oklch(0.360 0.020 254 / 0.45)';
    for (let c = 0; c < cols; c++) ctx.fillRect(c * colW + inset, 0, barW, h);

    for (let r = 0; r < this.rows.length; r++) {
      const row = this.rows[r];
      const y = r * rowH;
      if (y > h) break;
      const decay = Math.pow(1 - r / this.capacity, 1.3);
      for (let c = 0; c < cols; c++) {
        const v = row[c];
        if (v < 0.04) continue;
        const a = v * decay;
        // Halo first, then the core, so a struck tone reads as light rather than paint.
        if (a > 0.3) {
          ctx.fillStyle = `oklch(0.795 0.165 67 / ${(a * 0.22).toFixed(3)})`;
          ctx.fillRect(c * colW - colW * 0.35, y - rowH * 0.5, colW * 1.7, rowH * 2);
        }
        ctx.fillStyle = `oklch(0.795 0.165 67 / ${a.toFixed(3)})`;
        ctx.fillRect(c * colW + inset, y, barW, rowH);
      }
    }

    // The strike line: where "now" is, so the trail has a leading edge.
    if (this.rows.length > 0) {
      ctx.fillStyle = 'oklch(0.945 0.006 90 / 0.14)';
      ctx.fillRect(0, 0, w, Math.max(1, dpr));
    }
  }
}
