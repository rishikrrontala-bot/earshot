# Earshot

Send a short message to every phone in the room using nothing but sound.

## What it is
A single web page. One device turns a line of text into audio tones and plays it
out loud. Every nearby device with the page open hears it through the microphone
and decodes it back to text. No internet, no Bluetooth pairing, no accounts, no
install, no app store. A speaker and a microphone are the entire protocol stack.

## The problem
When connectivity fails, the devices in the room still work — they just cannot
talk to each other. Every fallback has a catch: Bluetooth needs pairing, one pair
at a time. AirDrop is Apple-only. QR codes are one reader at a time and cap out
around two kilobytes. There is no way to get the same sentence onto thirty phones
at once when the network is gone.

Sound has none of those problems. It is omnidirectional, it is one-to-many for
free, and every phone made in the last twenty years can both produce and hear it.

## Who it is for
- People in a building or area with no signal: a basement, a rural clinic, a
  school with dead wifi, a plane, a protest, a storm outage.
- Anyone who needs to reach a group of mixed iPhone and Android devices with no
  shared app and no time to set one up.

## What it is not
- Not a messaging app. There are no accounts, no history that outlives the tab,
  no delivery guarantees.
- Not fast. It moves 15.6 bytes per second. It is for a sentence, not a file.
- Not private. Anything within earshot receives it. That is the point, and it is
  also the limitation, and the interface should say so.

## Proven capability (measured, not claimed)
- 125 bps, 16-FSK, 32 ms symbols, continuous phase
- Decodes correctly at -13 dB SNR (signal below the noise floor)
- 0 false messages across 120 s of pure white noise; CRC-8 rejects rather than
  mis-delivers
- Survives simulated room reverb and arbitrary sub-symbol timing offsets
- A 20-character alert is 4.5 s of airtime with 3x retransmit

## Surface in scope
One screen. Two modes on it: Broadcast and Listen. A live spectrum view that is
simultaneously the aesthetic centrepiece and the evidence the transfer is real.
A received-message list. A stats readout.

## Mode
**Operate.** The visitor completes a task — get a sentence from here to there.
But this surface is also the entire demo artifact for a judged competition, so
the first viewport has to explain itself with no narration.

## Constraints
- Must run on GitHub Pages as a static build. Microphone requires HTTPS.
- Must look intentional on a laptop and on a phone at the same time; the demo
  shows a laptop broadcasting to several phones simultaneously.
- No backend. Nothing leaves the device, ever — verifiable in the network tab.

## Assumption to confirm
The founding personal story behind this build is pending from the author and
will replace the general framing in the pitch. Labelled as an assumption until
supplied.
