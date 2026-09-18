export const SAMPLE_RATE = 48000;

/** 32 ms per symbol -> 31.25 baud. Long enough to survive room echo. */
export const SYMBOL_SAMPLES = 1536;

/** 125 Hz spacing = 4 FFT bins at this window length. Wide enough that
 *  spectral leakage from a neighbour never wins the argmax. */
export const TONE_SPACING = 125;

export const SYNC_FREQ = 1500;
export const DATA_FREQ_BASE = 1625;
export const DATA_TONES = 16; // one hex nibble per symbol
export const END_FREQ = DATA_FREQ_BASE + DATA_TONES * TONE_SPACING; // 3625

export const SYNC_SYMBOLS = 3;
export const MAX_PAYLOAD_BYTES = 120;

/** Index layout used by the detector: [SYNC, d0..d15, END] */
export const ALL_FREQS: number[] = [
  SYNC_FREQ,
  ...Array.from({ length: DATA_TONES }, (_, i) => DATA_FREQ_BASE + i * TONE_SPACING),
  END_FREQ,
];

export const SYNC_IDX = 0;
export const DATA_IDX_BASE = 1;
export const END_IDX = ALL_FREQS.length - 1;

export const BITS_PER_SYMBOL = 4;
export const BAUD = SAMPLE_RATE / SYMBOL_SAMPLES;
export const BITRATE = BAUD * BITS_PER_SYMBOL;
