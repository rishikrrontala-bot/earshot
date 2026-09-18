import { SAMPLE_RATE, SYMBOL_SAMPLES, BITRATE } from '../src/modem/constants.ts';
import { buildBurst, synthesize } from '../src/modem/transmit.ts';
import { encodeFrame } from '../src/modem/frame.ts';
import { decodeBuffer } from '../src/modem/decode.ts';

function pad(s: Float32Array, lead: number) {
  const o = new Float32Array(lead + s.length + SYMBOL_SAMPLES * 3); o.set(s, lead); return o;
}
function mulberry(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function addNoise(sig: Float32Array, snrDb: number, rng: () => number) {
  let p = 0; for (const s of sig) p += s * s; p /= sig.length || 1;
  const sigma = Math.sqrt(p / Math.pow(10, snrDb / 10));
  const o = new Float32Array(sig.length);
  for (let i = 0; i < sig.length; i++) {
    const u = Math.max(rng(), 1e-12), v = rng();
    o[i] = sig[i] + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  } return o;
}

const MSG = 'Shelter open at Lincoln High';

console.log('\n=== SNR cliff: single frame, no retransmit ===');
for (const snr of [6, 3, 0, -3, -5, -7, -9, -11, -13]) {
  const rng = mulberry(snr * 131 + 7); let ok = 0; const N = 40;
  for (let i = 0; i < N; i++) {
    if (decodeBuffer(addNoise(pad(synthesize(encodeFrame(MSG)), 2048), snr, rng))[0] === MSG) ok++;
  }
  console.log(`  ${String(snr).padStart(3)} dB -> ${String(((ok / N) * 100).toFixed(0)).padStart(3)}%`);
}

console.log('\n=== SNR cliff: x3 retransmit ===');
for (const snr of [0, -3, -5, -7, -9, -11, -13]) {
  const rng = mulberry(snr * 577 + 3); let ok = 0; const N = 30;
  for (let i = 0; i < N; i++) {
    if (decodeBuffer(addNoise(pad(buildBurst(MSG, { repeats: 3 }), 2048), snr, rng)).includes(MSG)) ok++;
  }
  console.log(`  ${String(snr).padStart(3)} dB -> ${String(((ok / N) * 100).toFixed(0)).padStart(3)}%`);
}

console.log('\n=== False-positive rate on pure noise ===');
{
  const rng = mulberry(4242); let spurious = 0;
  const secs = 120;
  for (let i = 0; i < 20; i++) {
    const noise = new Float32Array(SAMPLE_RATE * (secs / 20));
    for (let j = 0; j < noise.length; j++) {
      const u = Math.max(rng(), 1e-12), v = rng();
      noise[j] = 0.2 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    spurious += decodeBuffer(noise).length;
  }
  console.log(`  ${spurious} false messages in ${secs}s of pure white noise`);
}

console.log('\n=== Airtime by message length (x3 retransmit) ===');
for (const n of [12, 20, 28, 40, 60]) {
  const m = 'x'.repeat(n);
  const one = synthesize(encodeFrame(m)).length / SAMPLE_RATE;
  const three = buildBurst(m, { repeats: 3 }).length / SAMPLE_RATE;
  console.log(`  ${String(n).padStart(2)} chars -> ${one.toFixed(2)}s single, ${three.toFixed(2)}s x3`);
}
console.log(`\n  raw ${BITRATE} bps = ${(BITRATE / 8).toFixed(1)} B/s\n`);
