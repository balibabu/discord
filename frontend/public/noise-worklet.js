const FRAME = 480
const QUANTUM = 128
const RING_SIZE = 8192
const PRIME = 960

class RnnoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ready = false
    this.failed = false
    this.primed = false
    this.intensity = 0
    this.inBuf = new Float32Array(FRAME)
    this.inFill = 0
    this.ring = new Float32Array(RING_SIZE)
    this.ringRead = 0
    this.ringWrite = 0
    this.ringCount = 0
    this.instance = null
    this.state = 0
    this.inPtr = 0
    this.outPtr = 0
    this.port.onmessage = (event) => {
      const data = event.data
      if (data.type === 'init') this.init(data.bytes)
      else if (data.type === 'intensity') this.intensity = Math.min(1, Math.max(0, data.value))
    }
  }

  init(bytes) {
    if (this.ready || this.failed) return
    try {
      const module = new WebAssembly.Module(bytes)
      let instance = null
      const env = {
        a: (requested) => {
          const memory = instance.exports.c
          const current = memory.buffer.byteLength
          if (requested <= current) return 1
          try {
            memory.grow(Math.ceil((requested - current) / 65536))
            return 1
          } catch {
            return 0
          }
        },
        b: (dest, src, num) => {
          new Uint8Array(instance.exports.c.buffer).copyWithin(dest, src, src + num)
        },
      }
      instance = new WebAssembly.Instance(module, { a: env })
      const exports = instance.exports
      if (typeof exports.f !== 'function' || typeof exports.j !== 'function') throw new Error('bad exports')
      if (sampleRate !== 48000) throw new Error('unsupported sample rate')
      exports.d()
      this.state = exports.f()
      this.inPtr = exports.g(1920)
      this.outPtr = exports.g(1920)
      this.instance = instance
      this.ready = true
    } catch {
      this.failed = true
    }
  }

  ringPush(samples) {
    let n = samples.length
    if (this.ringCount + n > RING_SIZE) {
      const drop = this.ringCount + n - RING_SIZE
      this.ringRead = (this.ringRead + drop) % RING_SIZE
      this.ringCount -= drop
    }
    while (n > 0) {
      const space = RING_SIZE - this.ringWrite
      const take = Math.min(space, n)
      this.ring.set(samples.subarray(samples.length - n, samples.length - n + take), this.ringWrite)
      this.ringWrite = (this.ringWrite + take) % RING_SIZE
      this.ringCount += take
      n -= take
    }
  }

  ringPop(output) {
    let written = 0
    let n = Math.min(this.ringCount, output.length)
    while (n > 0) {
      const avail = RING_SIZE - this.ringRead
      const take = Math.min(avail, n)
      output.set(this.ring.subarray(this.ringRead, this.ringRead + take), written)
      this.ringRead = (this.ringRead + take) % RING_SIZE
      this.ringCount -= take
      written += take
      n -= take
    }
    return written
  }

  processFrame() {
    const exports = this.instance.exports
    const heap = new Float32Array(exports.c.buffer)
    const inOffset = this.inPtr >> 2
    const outOffset = this.outPtr >> 2
    heap.set(this.inBuf, inOffset)
    exports.j(this.state, this.inPtr, this.outPtr)
    const w = this.intensity
    const wet = heap.subarray(outOffset, outOffset + FRAME)
    const blended = new Float32Array(FRAME)
    for (let i = 0; i < FRAME; i++) {
      const dry = this.inBuf[i]
      blended[i] = dry + (wet[i] - dry) * w
    }
    this.ringPush(blended)
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0]
    const output = outputs[0] && outputs[0][0]
    if (!output) return true
    if (!this.ready || this.failed) {
      if (input) output.set(input)
      else output.fill(0)
      return true
    }
    if (input) {
      let i = 0
      while (i < input.length) {
        const take = Math.min(FRAME - this.inFill, input.length - i)
        this.inBuf.set(input.subarray(i, i + take), this.inFill)
        this.inFill += take
        i += take
        if (this.inFill >= FRAME) {
          this.processFrame()
          this.inFill = 0
        }
      }
    }
    if (!this.primed) {
      output.fill(0)
      if (this.ringCount >= PRIME) this.primed = true
      return true
    }
    const written = this.ringPop(output)
    if (written < QUANTUM) {
      output.fill(0, written)
      this.primed = false
    }
    return true
  }
}

registerProcessor('rnnoise-processor', RnnoiseProcessor)
