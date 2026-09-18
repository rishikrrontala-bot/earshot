import { ALL_FREQS, SAMPLE_RATE, SYMBOL_SAMPLES } from '../modem/constants.ts';
import { encodeFrame } from '../modem/frame.ts';
import { synthesize } from '../modem/transmit.ts';

export type SendProgress = {
  symbol: number; symbols: number; repeat: number; repeats: number;
  elapsed: number; total: number;
  /** Tones whose symbol slot completed since the last callback. One row per
   *  symbol keeps the display meaningful regardless of frame rate. */
  newTones: number[];
};

export class Transmitter {
  private ctx: AudioContext | null = null;
  private node: AudioBufferSourceNode | null = null;
  private raf = 0;

  get sending(): boolean { return this.node !== null; }

  /** Airtime for a message, without generating the audio twice. */
  static airtime(text: string, repeats: number): number {
    if (!text) return 0;
    const symbols = encodeFrame(text).length;
    return ((symbols + 1) * repeats * SYMBOL_SAMPLES) / SAMPLE_RATE;
  }

  async send(text: string, repeats: number, onProgress: (p: SendProgress) => void): Promise<void> {
    this.cancel();
    const symbols = encodeFrame(text);
    const frame = synthesize(symbols, SAMPLE_RATE);
    const gapSamples = SYMBOL_SAMPLES;
    const strideSamples = frame.length + gapSamples;

    const ctx = this.ctx ?? new AudioContext({ sampleRate: SAMPLE_RATE });
    this.ctx = ctx;
    await ctx.resume();

    const total = strideSamples * repeats;
    const buffer = ctx.createBuffer(1, total, SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let r = 0; r < repeats; r++) channel.set(frame, r * strideSamples);

    const node = ctx.createBufferSource();
    node.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    node.connect(gain).connect(ctx.destination);

    const totalSeconds = total / SAMPLE_RATE;
    const startedAt = ctx.currentTime;
    const strideSymbols = symbols.length + 1; // frame plus its trailing gap
    const totalSlots = strideSymbols * repeats;
    let lastSlot = -1;

    const toneAtSlot = (slot: number): number => {
      const within = slot % strideSymbols;
      return within < symbols.length ? symbols[within] : -1;
    };

    return new Promise<void>((resolve) => {
      const emit = (elapsed: number) => {
        const slot = Math.min(totalSlots - 1, Math.floor((elapsed * SAMPLE_RATE) / SYMBOL_SAMPLES));
        const newTones: number[] = [];
        for (let s = lastSlot + 1; s <= slot; s++) newTones.push(toneAtSlot(s));
        lastSlot = Math.max(lastSlot, slot);
        const repeat = Math.min(repeats - 1, Math.floor(slot / strideSymbols));
        const within = slot % strideSymbols;
        onProgress({
          symbol: Math.min(symbols.length, within + 1), symbols: symbols.length,
          repeat: repeat + 1, repeats,
          elapsed, total: totalSeconds,
          newTones,
        });
      };

      const step = () => {
        if (!this.node) return;
        emit(Math.min(ctx.currentTime - startedAt, totalSeconds));
        this.raf = requestAnimationFrame(step);
      };

      node.onended = () => {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.node = null;
        emit(totalSeconds);
        resolve();
      };

      this.node = node;
      node.start();
      step();
    });
  }

  cancel(): void {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    if (this.node) { this.node.onended = null; try { this.node.stop(); } catch { /* already stopped */ } this.node = null; }
  }

  static toneCount(): number { return ALL_FREQS.length; }
}
