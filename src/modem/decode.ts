import {
  ALL_FREQS, END_IDX, MAX_PAYLOAD_BYTES, SAMPLE_RATE,
  SYMBOL_SAMPLES, SYNC_IDX, SYNC_SYMBOLS,
} from './constants.ts';
import { decodeSymbols, type DecodeResult } from './frame.ts';
import { goertzel, readSymbol } from './goertzel.ts';

const MAX_SYMBOLS = SYNC_SYMBOLS + MAX_PAYLOAD_BYTES * 2 + 2 + 1 + 4;
const SYNC_RUN_SAMPLES = SYNC_SYMBOLS * SYMBOL_SAMPLES;
const MIN_SYNC_CONFIDENCE = 3.0;
const MIN_SYMBOL_CONFIDENCE = 1.8;

/** Read symbols forward from `start` until END, then verify. Bails the moment a
 *  symbol looks like noise, which is what makes the offset search below cheap. */
export function tryDecodeAt(buf: Float32Array, start: number, sampleRate = SAMPLE_RATE): DecodeResult {
  const symbols: number[] = [];
  for (let s = 0; s < MAX_SYMBOLS; s++) {
    const at = start + s * SYMBOL_SAMPLES;
    if (at + SYMBOL_SAMPLES > buf.length) return null;
    const { index, confidence } = readSymbol(buf, at, ALL_FREQS, sampleRate);
    if (confidence < MIN_SYMBOL_CONFIDENCE) return null;
    if (index === SYNC_IDX) return null;
    symbols.push(index);
    if (index === END_IDX) return decodeSymbols(symbols);
  }
  return null;
}

/** Locate the onset of a sync run by finding the left edge of its magnitude
 *  plateau. The run is 3 symbols but the window is 1, so magnitude stays at peak
 *  across a 2-symbol span; the leftmost offset at peak is the true onset. */
function refineSyncOnset(buf: Float32Array, near: number, sampleRate: number): number | null {
  const lo = Math.max(0, near - SYMBOL_SAMPLES);
  const hi = Math.min(buf.length - SYMBOL_SAMPLES, near + SYMBOL_SAMPLES);
  if (hi <= lo) return null;

  let peak = 0;
  const profile: { at: number; mag: number }[] = [];
  for (let at = lo; at <= hi; at += 64) {
    const mag = goertzel(buf, at, SYMBOL_SAMPLES, ALL_FREQS[SYNC_IDX], sampleRate);
    profile.push({ at, mag });
    if (mag > peak) peak = mag;
  }
  if (peak <= 0) return null;
  for (const p of profile) if (p.mag >= 0.9 * peak) return p.at;
  return null;
}

/** CRC is the arbiter for timing: try a few sub-symbol offsets and keep whichever
 *  one produces a frame that validates. */
export function searchDecodeFrom(
  buf: Float32Array, syncNear: number, sampleRate = SAMPLE_RATE,
): DecodeResult {
  const onset = refineSyncOnset(buf, syncNear, sampleRate);
  if (onset === null) return null;
  const dataStart = onset + SYNC_RUN_SAMPLES;
  for (const delta of [0, -48, 48, -96, 96, -160, 160, -240, 240, -320, 320]) {
    const at = dataStart + delta;
    if (at < 0) continue;
    const got = tryDecodeAt(buf, at, sampleRate);
    if (got) return got;
  }
  return null;
}

export function findSyncPositions(
  buf: Float32Array, from = 0, sampleRate = SAMPLE_RATE, hop = 256,
): number[] {
  const hits: number[] = [];
  let armed = true;
  for (let at = from; at + SYMBOL_SAMPLES <= buf.length; at += hop) {
    const { index, confidence } = readSymbol(buf, at, ALL_FREQS, sampleRate);
    const isSync = index === SYNC_IDX && confidence >= MIN_SYNC_CONFIDENCE;
    if (isSync && armed) { hits.push(at); armed = false; }
    else if (!isSync) armed = true;
  }
  return hits;
}

/** Offline decode of a complete buffer. Used by the test harness and by the
 *  self-test path in the UI. */
export function decodeBuffer(buf: Float32Array, sampleRate = SAMPLE_RATE): string[] {
  const out: string[] = [];
  for (const p of findSyncPositions(buf, 0, sampleRate)) {
    const got = searchDecodeFrom(buf, p, sampleRate);
    if (got) out.push(got.text);
  }
  return out;
}
