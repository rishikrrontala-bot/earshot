import { SAMPLE_RATE, SYMBOL_SAMPLES, BITRATE } from '../src/modem/constants.ts';
import { buildBurst, synthesize } from '../src/modem/transmit.ts';
import { encodeFrame } from '../src/modem/frame.ts';
import { decodeBuffer } from '../src/modem/decode.ts';

function pad(sig: Float32Array, leadSamples: number, tailSamples = SYMBOL_SAMPLES * 3): Float32Array {
  const out = new Float32Array(leadSamples + sig.length + tailSamples);
  out.set(sig, leadSamples);
  return out;
}

function addNoise(sig: Float32Array, snrDb: number, rng: () => number): Float32Array {
  let power = 0;
  for (const s of sig) power += s * s;
  power /= sig.length || 1;
  const noisePower = power / Math.pow(10, snrDb / 10);
  const sigma = Math.sqrt(noisePower);
  const out = new Float32Array(sig.length);
  for (let i = 0; i < sig.length; i++) {
    // Box-Muller
    const u = Math.max(rng(), 1e-12), v = rng();
    out[i] = sig[i] + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  return out;
}

/** Crude room model: a couple of attenuated delayed copies. */
function addEcho(sig: Float32Array): Float32Array {
  const out = Float32Array.from(sig);
  const taps = [[Math.floor(0.011 * SAMPLE_RATE), 0.35], [Math.floor(0.027 * SAMPLE_RATE), 0.18]];
  for (const [d, g] of taps) {
    for (let i = d; i < out.length; i++) out[i] += g * sig[i - d];
  }
  return out;
}

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MESSAGES = [
  'Shelter open at Lincoln High. Bring ID.',
  'Boil water advisory until 6pm Thursday.',
  'hello world',
  'Bus 14 cancelled. Walk to Oak & 3rd.',
  'Unicode check: cafe naive 123 !@#$%',
];

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

console.log('\n=== 1. Clean loopback, single frame ===');
for (const m of MESSAGES) {
  const sig = pad(synthesize(encodeFrame(m)), 4096);
  const got = decodeBuffer(sig);
  check(`"${m.slice(0, 32)}"`, got[0] === m, `-> ${JSON.stringify(got)}`);
}

console.log('\n=== 2. Random timing offsets (sub-symbol alignment) ===');
{
  const rng = mulberry(7);
  let ok = 0;
  const N = 40;
  for (let i = 0; i < N; i++) {
    const lead = Math.floor(rng() * SYMBOL_SAMPLES * 4);
    const sig = pad(synthesize(encodeFrame('timing test ' + i)), lead);
    if (decodeBuffer(sig)[0] === 'timing test ' + i) ok++;
  }
  check(`${ok}/${N} decoded at arbitrary offsets`, ok === N);
}

console.log('\n=== 3. AWGN sweep, single frame (no retransmit) ===');
for (const snr of [30, 20, 15, 12, 10, 8, 6]) {
  const rng = mulberry(snr * 101);
  let ok = 0;
  const N = 30;
  for (let i = 0; i < N; i++) {
    const clean = pad(synthesize(encodeFrame('shelter open at lincoln high')), 2048);
    if (decodeBuffer(addNoise(clean, snr, rng))[0] === 'shelter open at lincoln high') ok++;
  }
  console.log(`  SNR ${String(snr).padStart(2)} dB -> ${((ok / N) * 100).toFixed(0)}% frame success`);
}

console.log('\n=== 4. Retransmit burst rescues marginal SNR ===');
for (const snr of [10, 8, 6, 4]) {
  const rng = mulberry(snr * 997);
  let ok = 0;
  const N = 20;
  const msg = 'Boil water advisory until 6pm.';
  for (let i = 0; i < N; i++) {
    const clean = pad(buildBurst(msg, { repeats: 4 }), 2048);
    if (decodeBuffer(addNoise(clean, snr, rng)).includes(msg)) ok++;
  }
  console.log(`  SNR ${String(snr).padStart(2)} dB x4 repeats -> ${((ok / N) * 100).toFixed(0)}% message success`);
}

console.log('\n=== 5. Room echo ===');
{
  const msg = 'Shelter open at Lincoln High. Bring ID.';
  const sig = addEcho(pad(buildBurst(msg, { repeats: 4 }), 2048));
  check('decodes through simulated reverb', decodeBuffer(sig).includes(msg));
}

console.log('\n=== 6. Corruption is rejected, not mis-delivered ===');
{
  const rng = mulberry(3);
  const clean = pad(synthesize(encodeFrame('integrity matters here')), 2048);
  let wrong = 0;
  for (let i = 0; i < 40; i++) {
    const got = decodeBuffer(addNoise(clean, 2, rng));
    for (const g of got) if (g !== 'integrity matters here') wrong++;
  }
  check(`0 silent corruptions across 40 heavily-noised frames`, wrong === 0, `got ${wrong}`);
}

console.log('\n=== Throughput ===');
{
  const msg = 'Shelter open at Lincoln High. Bring ID.';
  const one = synthesize(encodeFrame(msg)).length / SAMPLE_RATE;
  const burst = buildBurst(msg, { repeats: 4 }).length / SAMPLE_RATE;
  console.log(`  raw bitrate            ${BITRATE.toFixed(1)} bps (${(BITRATE / 8).toFixed(1)} B/s)`);
  console.log(`  ${msg.length}-char frame        ${one.toFixed(2)} s`);
  console.log(`  same, x4 retransmit    ${burst.toFixed(2)} s`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
