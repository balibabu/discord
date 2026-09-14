let ctx = null

function audio() {
  if (typeof AudioContext !== 'undefined') {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  return null
}

function tone({ freq, endFreq, duration, delay = 0, type = 'sine', gain = 0.05 }) {
  const ac = audio()
  if (!ac) return
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  const start = ac.currentTime + delay
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration)
  amp.gain.setValueAtTime(0.0001, start)
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.015)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(amp)
  amp.connect(ac.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

export function playSend() {
  tone({ freq: 720, endFreq: 940, duration: 0.09, type: 'triangle' })
}

export function playReceive() {
  tone({ freq: 620, duration: 0.07, type: 'triangle' })
  tone({ freq: 820, duration: 0.09, delay: 0.08, type: 'triangle' })
}

export function playJoinVoice() {
  tone({ freq: 440, duration: 0.1, type: 'sine' })
  tone({ freq: 660, duration: 0.12, delay: 0.09, type: 'sine' })
}

export function playLeaveVoice() {
  tone({ freq: 660, duration: 0.1, type: 'sine' })
  tone({ freq: 440, duration: 0.14, delay: 0.09, type: 'sine' })
}

export function playMute() {
  tone({ freq: 500, endFreq: 320, duration: 0.12, type: 'square', gain: 0.03 })
}

export function playUnmute() {
  tone({ freq: 320, endFreq: 500, duration: 0.12, type: 'square', gain: 0.03 })
}

export function playDeafen() {
  tone({ freq: 440, endFreq: 300, duration: 0.12, type: 'sawtooth', gain: 0.03 })
  tone({ freq: 330, endFreq: 220, duration: 0.12, delay: 0.1, type: 'sawtooth', gain: 0.03 })
}

export function playUndeafen() {
  tone({ freq: 300, endFreq: 440, duration: 0.12, type: 'sawtooth', gain: 0.03 })
  tone({ freq: 220, endFreq: 330, duration: 0.12, delay: 0.1, type: 'sawtooth', gain: 0.03 })
}

export function playShareStart() {
  tone({ freq: 520, duration: 0.09, type: 'triangle' })
  tone({ freq: 700, duration: 0.09, delay: 0.08, type: 'triangle' })
  tone({ freq: 880, duration: 0.12, delay: 0.16, type: 'triangle' })
}

export function playShareStop() {
  tone({ freq: 880, duration: 0.09, type: 'triangle' })
  tone({ freq: 700, duration: 0.09, delay: 0.08, type: 'triangle' })
  tone({ freq: 520, duration: 0.12, delay: 0.16, type: 'triangle' })
}

export function playPeerJoin() {
  tone({ freq: 700, duration: 0.08, type: 'sine', gain: 0.04 })
  tone({ freq: 1000, duration: 0.1, delay: 0.07, type: 'sine', gain: 0.04 })
}
