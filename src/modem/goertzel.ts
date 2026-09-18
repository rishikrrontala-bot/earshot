import { SYMBOL_SAMPLES } from './constants.ts';

/** Hann window, precomputed once. Suppresses sidelobes so a loud neighbouring
 *  tone can't leak enough energy to win the argmax. */
const HANN = new Float32Array(SYMBOL_SAMPLES);
for (let i = 0; i < SYMBOL_SAMPLES; i++) {
  HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SYMBOL_SAMPLES - 1));
}

/** Goertzel magnitude at an arbitrary (non-bin-centred) frequency. */
export function goertzel(
  buf: Float32Array, start: number, length: number, freq: number, sampleRate: number,
): number {
  const coeff = 2 * Math.cos((2 * Math.PI * freq) / sampleRate);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < length; i++) {
    const s0 = buf[start + i] * HANN[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const mag2 = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return mag2 > 0 ? Math.sqrt(mag2) : 0;
}

export type SymbolRead = { index: number; confidence: number; mags: Float32Array };

/** Score every tone over one symbol window and return the winner.
 *  Confidence is peak / median, so it is independent of absolute volume. */
export function readSymbol(
  buf: Float32Array, start: number, freqs: number[], sampleRate: number,
): SymbolRead {
  const mags = new Float32Array(freqs.length);
  let best = -1, bestIdx = -1;
  for (let i = 0; i < freqs.length; i++) {
    const m = goertzel(buf, start, SYMBOL_SAMPLES, freqs[i], sampleRate);
    mags[i] = m;
    if (m > best) { best = m; bestIdx = i; }
  }
  const sorted = Array.from(mags).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1e-9;
  return { index: bestIdx, confidence: best / median, mags };
}
