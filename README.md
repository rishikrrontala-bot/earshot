# Earshot

**Send a short message to every phone in the room using nothing but sound.**

One device turns a line of text into audio tones and plays it out loud. Every
nearby device with the page open hears it through the microphone and decodes it
back to text. No internet, no Bluetooth pairing, no accounts, no install.

Live: https://rishikrrontala-bot.github.io/earshot/

## Why

When connectivity fails, the devices in the room still work — they just cannot
talk to each other. Bluetooth needs pairing, one pair at a time. AirDrop is
Apple-only. QR codes are one reader at a time and cap out around two kilobytes.
There is no way to get the same sentence onto thirty phones at once when the
network is gone.

Sound has none of those problems. It is omnidirectional, it is one-to-many for
free, and every phone made in the last twenty years can both produce and hear it.

## How it works

A 16-FSK acoustic modem built from scratch in TypeScript. No audio libraries.

| | |
|---|---|
| Modulation | 16-tone FSK, continuous phase |
| Band | 1500–3625 Hz, 125 Hz spacing |
| Symbol | 32 ms (1536 samples at 48 kHz) |
| Rate | 125 bps / 15.6 B/s |
| Framing | 3 sync symbols, payload nibbles, CRC-8, end tone |
| Detection | Hann-windowed Goertzel over 18 tones, argmax with confidence gate |
| Timing | Sync-plateau onset refinement, then sub-symbol offset search arbitrated by CRC |
| Reliability | Whole frame retransmitted N times; first copy that passes CRC wins |

Transmit synthesises continuous-phase FSK into an `AudioBuffer`. Receive pulls
microphone blocks through an `AudioWorklet`, resamples to 48 kHz if the hardware
disagrees, and runs the same decoder the tests cover.

Echo cancellation, noise suppression and auto gain are all explicitly disabled on
the input stream — they are tuned to remove exactly the kind of steady narrowband
tone this depends on.

## Measured

From `npm test`, which runs the modem headless against synthetic channels:

- Decodes correctly at **−13 dB SNR** — signal well below the noise floor
- **0 false messages in 120 s of pure white noise**; CRC-8 rejects rather than mis-delivers
- Survives simulated room reverb (11 ms and 27 ms taps) and arbitrary sub-symbol timing offsets
- A 28-character alert is 2.0 s of airtime, or 6.0 s with 3× retransmit
- Full decode of a 3× burst takes ~100 ms in-browser

## Limitations, honestly

- **Not private.** Anything within earshot receives it. That is the mechanism, not a bug.
- **Not fast.** 15.6 bytes per second. This is for a sentence, not a file.
- **Not guaranteed.** There is no acknowledgement and no retry negotiation. The
  transmitter repeats blindly and hopes.
- Payload is capped at 120 bytes.
- Very loud continuous broadband noise will beat it. It handles noise far below
  the signal, not a fire alarm at close range.
- No forward error correction yet — reliability comes from retransmission. FEC
  would cut airtime substantially.

## Run it

```
npm install
npm test      # headless modem verification
npm run dev
```

The microphone requires HTTPS or localhost.

## Attribution

Written from scratch for TechCommons Hacks V2. No audio, DSP or UI libraries.

- Build tooling: [Vite](https://vitejs.dev) and TypeScript
- Typefaces: [Archivo](https://fonts.google.com/specimen/Archivo) and
  [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono), both SIL Open Font License
- Everything else — the modem, the framing, the detector, the interface — is original

Built with AI assistance (Claude), disclosed per the hackathon's AI policy. The
protocol design, parameter choices and verification strategy are documented above
and in the source comments.

## Licence

MIT — see [LICENSE](LICENSE).
