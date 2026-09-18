/** Pulls microphone samples off the audio thread in fixed blocks. The decoder
 *  runs on the main thread so it can share exactly the code the tests cover. */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(1024);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.block[this.n++] = ch[i];
      if (this.n === this.block.length) {
        this.port.postMessage(this.block.slice(0));
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('capture', CaptureProcessor);
