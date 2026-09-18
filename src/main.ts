import './styles.css';
import { DATA_FREQ_BASE, END_FREQ, SYNC_FREQ } from './modem/constants.ts';
import { Listener } from './audio/listener.ts';
import { Transmitter } from './audio/transmitter.ts';
import { Waterfall } from './ui/waterfall.ts';

const CARRIER_CONFIDENCE = 2.6;
const CARRIER_HOLD_MS = 450;

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
};

const lamp = el('lamp');
const lampLabel = el('lampLabel');
const veil = el('fieldVeil');
const veilText = el('fieldVeilText');
const scale = el('fieldScale');
const tabListen = el<HTMLButtonElement>('tabListen');
const tabSend = el<HTMLButtonElement>('tabSend');
const panelListen = el('panelListen');
const panelSend = el('panelSend');
const micKey = el<HTMLButtonElement>('micKey');
const micHint = el('micHint');
const micError = el('micError');
const listenState = el('listenState');
const log = el<HTMLOListElement>('log');
const logEmpty = el('logEmpty');
const msg = el<HTMLTextAreaElement>('msg');
const chars = el('chars');
const airtime = el('airtime');
const repeatsSel = el<HTMLSelectElement>('repeats');
const sendKey = el<HTMLButtonElement>('sendKey');
const sendState = el('sendState');
const stage = el('stage');
const stageFill = el<HTMLElement>('stageFill');
const stageText = el('stageText');
const snrOut = el('snr');
const countOut = el('count');

scale.textContent = '';
for (const hz of [SYNC_FREQ, DATA_FREQ_BASE + 8 * 125, END_FREQ]) {
  const s = document.createElement('span');
  s.textContent = `${(hz / 1000).toFixed(2)}k`;
  scale.appendChild(s);
}

const waterfall = new Waterfall(el<HTMLCanvasElement>('waterfall'));
let decoded = 0;
let carrierUntil = 0;

function setLamp(state: 'idle' | 'armed' | 'live', label: string): void {
  lamp.dataset.state = state;
  lampLabel.textContent = label;
}

function setVeil(text: string | null): void {
  if (text === null) { veil.hidden = true; return; }
  veilText.textContent = text;
  veil.hidden = false;
}

const SYMBOL_MS = 32;
let lastRowAt = 0;

const listener = new Listener({
  onLevel: (mags, confidence) => {
    const now = performance.now();
    if (lastRowAt === 0) lastRowAt = now - SYMBOL_MS;
    const due = Math.min(8, Math.floor((now - lastRowAt) / SYMBOL_MS));
    for (let i = 0; i < due; i++) waterfall.pushMeasured(mags, confidence);
    if (due > 0) lastRowAt = now;
    if (confidence >= CARRIER_CONFIDENCE) carrierUntil = now + CARRIER_HOLD_MS;
    const live = now < carrierUntil;
    if (!transmitter.sending) setLamp(live ? 'live' : 'armed', live ? 'Carrier' : 'No carrier');
    snrOut.textContent = live ? `${(20 * Math.log10(confidence)).toFixed(0)} dB` : '—';
  },
  onMessage: ({ text, at }) => {
    decoded++;
    countOut.textContent = String(decoded);
    logEmpty.hidden = true;

    const item = document.createElement('li');
    item.className = 'log__item';
    item.dataset.fresh = '1';

    const body = document.createElement('p');
    body.className = 'log__text';
    body.textContent = text;

    const meta = document.createElement('p');
    meta.className = 'log__meta';
    const time = document.createElement('span');
    time.textContent = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const size = document.createElement('span');
    size.textContent = `${new TextEncoder().encode(text).length} bytes`;
    const tag = document.createElement('span');
    tag.textContent = 'New';
    meta.append(time, size, tag);

    item.append(body, meta);
    log.prepend(item);
  },
});

const transmitter = new Transmitter();

/* ---------- modes ---------- */

type Mode = 'listen' | 'send';

function setMode(next: Mode): void {
  const listening = next === 'listen';
  tabListen.setAttribute('aria-selected', String(listening));
  tabSend.setAttribute('aria-selected', String(!listening));
  panelListen.hidden = !listening;
  panelSend.hidden = listening;
  if (listening && !listener.running) setVeil('Start listening to bring the band up.');
  else if (!listening && !transmitter.sending) setVeil('Type a message, then transmit.');
  else setVeil(null);
}

tabListen.addEventListener('click', () => setMode('listen'));
tabSend.addEventListener('click', () => setMode('send'));

/* ---------- listen ---------- */

micKey.addEventListener('click', async () => {
  if (listener.running) {
    listener.stop();
    waterfall.clear();
    micKey.textContent = 'Start listening';
    listenState.textContent = 'Microphone stopped';
    setLamp('idle', 'No carrier');
    snrOut.textContent = '—';
    setVeil('Start listening to bring the band up.');
    return;
  }
  micError.hidden = true;
  micKey.disabled = true;
  micKey.textContent = 'Starting…';
  listenState.textContent = 'Requesting microphone';
  try {
    await listener.start();
    micKey.textContent = 'Stop listening';
    listenState.textContent = 'Listening';
    micHint.textContent = 'Listening. Nothing is recorded and nothing leaves this device.';
    setLamp('armed', 'No carrier');
    setVeil(null);
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    micError.hidden = false;
    micError.textContent = name === 'NotAllowedError'
      ? 'Microphone permission was denied. Allow it in your browser settings, then start listening again.'
      : name === 'NotFoundError'
        ? 'No microphone was found on this device.'
        : 'The microphone could not be started. Earshot needs an https connection and a working microphone.';
    micKey.textContent = 'Start listening';
    listenState.textContent = 'Microphone unavailable';
  } finally {
    micKey.disabled = false;
  }
});

/* ---------- broadcast ---------- */

function refreshAirtime(): void {
  const text = msg.value.trim();
  const bytes = new TextEncoder().encode(msg.value).length;
  chars.textContent = String(bytes);
  const seconds = text ? Transmitter.airtime(text, Number(repeatsSel.value)) : 0;
  airtime.textContent = seconds.toFixed(1);
  sendKey.disabled = text.length === 0 || transmitter.sending;
}

msg.addEventListener('input', refreshAirtime);
repeatsSel.addEventListener('change', refreshAirtime);

sendKey.addEventListener('click', async () => {
  const text = msg.value.trim();
  if (!text || transmitter.sending) return;

  sendKey.disabled = true;
  sendKey.dataset.live = '1';
  sendKey.textContent = 'Transmitting';
  sendState.textContent = 'On air';
  stage.hidden = false;
  setVeil(null);
  setLamp('live', 'Transmitting');

  try {
    await transmitter.send(text, Number(repeatsSel.value), (p) => {
      for (const tone of p.newTones) waterfall.pushTone(tone);
      stageFill.style.transform = `scaleX(${(p.elapsed / p.total).toFixed(4)})`;
      stageText.textContent =
        `Symbol ${p.symbol} of ${p.symbols} · pass ${p.repeat} of ${p.repeats} · ${p.elapsed.toFixed(1)}s of ${p.total.toFixed(1)}s`;
    });
    sendState.textContent = 'Sent';
    stageText.textContent = `Sent ${new TextEncoder().encode(text).length} bytes in ${Transmitter.airtime(text, Number(repeatsSel.value)).toFixed(1)}s`;
  } catch {
    sendState.textContent = 'Could not play audio';
    stageText.textContent = 'Your browser blocked audio playback. Tap the page once, then transmit again.';
  } finally {
    sendKey.dataset.live = '0';
    sendKey.textContent = 'Transmit';
    setLamp(listener.running ? 'armed' : 'idle', 'No carrier');
    refreshAirtime();
  }
});

/* ---------- boot ---------- */

countOut.textContent = '0';
setMode('listen');
refreshAirtime();
