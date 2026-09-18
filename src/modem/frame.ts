import { crc8 } from './crc.ts';
import { DATA_IDX_BASE, END_IDX, MAX_PAYLOAD_BYTES, SYNC_IDX, SYNC_SYMBOLS } from './constants.ts';

/** [SYNC x3][payload nibbles, high first][crc nibbles][END] */
export function encodeFrame(text: string): number[] {
  const payload = new TextEncoder().encode(text);
  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`payload ${payload.length}B exceeds ${MAX_PAYLOAD_BYTES}B`);
  }
  const symbols: number[] = [];
  for (let i = 0; i < SYNC_SYMBOLS; i++) symbols.push(SYNC_IDX);
  const pushByte = (b: number) => {
    symbols.push(DATA_IDX_BASE + ((b >> 4) & 0x0f));
    symbols.push(DATA_IDX_BASE + (b & 0x0f));
  };
  for (const b of payload) pushByte(b);
  pushByte(crc8(payload));
  symbols.push(END_IDX);
  return symbols;
}

export type DecodeResult = { text: string; bytes: number } | null;

/** Inverse of encodeFrame. Returns null on any structural or CRC failure. */
export function decodeSymbols(symbols: number[]): DecodeResult {
  let i = 0;
  while (i < symbols.length && symbols[i] === SYNC_IDX) i++;
  const nibbles: number[] = [];
  let sawEnd = false;
  for (; i < symbols.length; i++) {
    const s = symbols[i];
    if (s === END_IDX) { sawEnd = true; break; }
    if (s === SYNC_IDX) return null;
    nibbles.push(s - DATA_IDX_BASE);
  }
  if (!sawEnd || nibbles.length < 2 || nibbles.length % 2 !== 0) return null;

  const all = new Uint8Array(nibbles.length / 2);
  for (let j = 0; j < all.length; j++) all[j] = (nibbles[2 * j] << 4) | nibbles[2 * j + 1];

  const payload = all.slice(0, -1);
  if (crc8(payload) !== all[all.length - 1]) return null;

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(payload), bytes: payload.length };
  } catch {
    return null;
  }
}
