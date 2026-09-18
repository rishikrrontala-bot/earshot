import { ALL_FREQS, SAMPLE_RATE, SYMBOL_SAMPLES } from '../modem/constants.ts';
import { findSyncPositions, searchDecodeFrom } from '../modem/decode.ts';
import { readSymbol } from '../modem/goertzel.ts';

const RETAIN_SECONDS = 26;
const SCAN_INTERVAL_MS = 250;
const FIRST_ATTEMPT_TRAIL = SAMPLE_RATE * 3;
const SECOND_ATTEMPT_TRAIL = SAMPLE_RATE * 8;
const DEDUPE_MS = 6000;

export type Received = { text: string; at: number };
export type ListenerEvents = {
  onMessage: (m: Received) => void;
  onLevel: (mags: Float32Array, confidence: number) => void;
};

type Pending = { at: number; tries: number };

/** Linear resample to the modem's rate. Browsers usually honour a 48 kHz
 *  request, but some hardware does not, and a 44.1 kHz stream would shift every
 *  tone by 9% and decode nothing. */
function resampleTo48k(block: Float32Array, fromRate: number): Float32Array {
  if (fromRate === SAMPLE_RATE) return block;
  const ratio = SAMPLE_RATE / fromRate;
  const out = new Float32Array(Math.round(block.length * ratio));
  for (let i = 0; i < out.length; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const frac = src - i0;
    const a = block[i0] ?? 0;
    const b = block[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export class Listener {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private buf = new Float32Array(SAMPLE_RATE * RETAIN_SECONDS);
  private filled = 0;
  private scanFrom = 0;
  private pending: Pending[] = [];
  private recent: { text: string; at: number }[] = [];
  private timer: number | null = null;
  private raf = 0;

  constructor(private events: ListenerEvents) {}

  get running(): boolean { return this.ctx !== null; }

  async start(): Promise<void> {
    if (this.ctx) return;
    // Every one of these must be off. Echo cancellation and noise suppression
    // are tuned to remove exactly the kind of steady narrowband tone we send.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    await ctx.resume();
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-worklet.js`);

    const src = ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(ctx, 'capture');
    node.port.onmessage = (e) => this.ingest(e.data as Float32Array, ctx.sampleRate);
    src.connect(node);
    // Keep the graph pulling without putting the microphone back out of the speaker.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(ctx.destination);

    this.ctx = ctx;
    this.timer = window.setInterval(() => this.scan(), SCAN_INTERVAL_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
    this.stream = null;
    this.filled = 0;
    this.scanFrom = 0;
    this.pending = [];
  }

  private ingest(block: Float32Array, rate: number): void {
    const s = resampleTo48k(block, rate);
    if (this.filled + s.length > this.buf.length) {
      const drop = Math.max(s.length, Math.floor(this.buf.length / 4));
      this.buf.copyWithin(0, drop, this.filled);
      this.filled -= drop;
      this.scanFrom = Math.max(0, this.scanFrom - drop);
      this.pending = this.pending.map((p) => ({ ...p, at: p.at - drop })).filter((p) => p.at >= 0);
    }
    this.buf.set(s, this.filled);
    this.filled += s.length;
  }

  /** Live spectrum for the waterfall, from the same maths the decoder uses. */
  private tick = (): void => {
    if (!this.ctx) return;
    if (this.filled >= SYMBOL_SAMPLES) {
      const { mags, confidence } = readSymbol(
        this.buf, this.filled - SYMBOL_SAMPLES, ALL_FREQS, SAMPLE_RATE,
      );
      this.events.onLevel(mags, confidence);
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private scan(): void {
    const view = this.buf.subarray(0, this.filled);
    const limit = this.filled - SYMBOL_SAMPLES;
    if (limit > this.scanFrom) {
      for (const at of findSyncPositions(view, this.scanFrom, SAMPLE_RATE)) {
        this.pending.push({ at, tries: 0 });
      }
      this.scanFrom = limit;
    }

    const keep: Pending[] = [];
    for (const p of this.pending) {
      const trail = this.filled - p.at;
      const due = (p.tries === 0 && trail >= FIRST_ATTEMPT_TRAIL)
        || (p.tries === 1 && trail >= SECOND_ATTEMPT_TRAIL);
      if (!due) { if (trail < SECOND_ATTEMPT_TRAIL) keep.push(p); continue; }

      const got = searchDecodeFrom(view, p.at, SAMPLE_RATE);
      p.tries++;
      if (got) { this.deliver(got.text); continue; }
      if (p.tries < 2) keep.push(p);
    }
    this.pending = keep;
  }

  private deliver(text: string): void {
    const now = Date.now();
    this.recent = this.recent.filter((r) => now - r.at < DEDUPE_MS);
    if (this.recent.some((r) => r.text === text)) return;
    this.recent.push({ text, at: now });
    this.events.onMessage({ text, at: now });
  }
}
