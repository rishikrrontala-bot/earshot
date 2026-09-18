import { ALL_FREQS, SAMPLE_RATE, SYMBOL_SAMPLES } from './constants.ts';
import { encodeFrame } from './frame.ts';

/** Continuous-phase FSK. Phase carries across symbol boundaries so there are
 *  no discontinuity clicks, which would splatter energy into neighbouring tones
 *  and break the argmax at the receiver. */
export function synthesize(symbols: number[], sampleRate = SAMPLE_RATE): Float32Array {
  const out = new Float32Array(symbols.length * SYMBOL_SAMPLES);
  let phase = 0;
  let n = 0;
  for (const sym of symbols) {
    const step = (2 * Math.PI * ALL_FREQS[sym]) / sampleRate;
    for (let i = 0; i < SYMBOL_SAMPLES; i++) {
      out[n++] = Math.sin(phase);
      phase += step;
      if (phase > Math.PI * 2) phase -= Math.PI * 2;
    }
  }
  // 5 ms raised-cosine fade at each end so the burst itself starts and stops cleanly.
  const fade = Math.min(240, Math.floor(out.length / 2));
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}

export type BurstOptions = { repeats?: number; gapSymbols?: number; sampleRate?: number };

/** The whole frame is sent several times back to back. The receiver keeps the
 *  first copy whose CRC passes, which is worth far more than forward error
 *  correction for the cost. */
export function buildBurst(text: string, opts: BurstOptions = {}): Float32Array {
  const { repeats = 4, gapSymbols = 1, sampleRate = SAMPLE_RATE } = opts;
  const frame = synthesize(encodeFrame(text), sampleRate);
  const gap = gapSymbols * SYMBOL_SAMPLES;
  const out = new Float32Array((frame.length + gap) * repeats);
  for (let r = 0; r < repeats; r++) out.set(frame, r * (frame.length + gap));
  return out;
}

export function burstSeconds(text: string, opts: BurstOptions = {}): number {
  return buildBurst(text, opts).length / (opts.sampleRate ?? SAMPLE_RATE);
}
