import wasmUrl from '@jitsi/rnnoise-wasm/dist/rnnoise.wasm?url'
import workletSource from '../worklets/noise-worklet.js?raw'
import { useNoise } from '../stores/noise'

let ctx = null
let node = null
let srcNode = null
let dstNode = null
let srcStream = null
let wasmBytes = null
let workletUrl = null

async function loadWasmBytes() {
  if (!wasmBytes) {
    const buffer = await fetch(wasmUrl).then((res) => res.arrayBuffer())
    wasmBytes = new Uint8Array(buffer)
  }
  return wasmBytes
}

async function ensureGraph() {
  if (ctx) return ctx
  ctx = new AudioContext({ sampleRate: 48000 })
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  workletUrl = URL.createObjectURL(new Blob([workletSource], { type: 'application/javascript' }))
  await ctx.audioWorklet.addModule(workletUrl)
  node = new AudioWorkletNode(ctx, 'rnnoise-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  })
  node.port.postMessage({ type: 'intensity', value: useNoise.getState().intensity / 100 })
  loadWasmBytes()
    .then((bytes) => node?.port.postMessage({ type: 'init', bytes }))
    .catch(() => {})
  return ctx
}

export async function getCleanStream(rawStream) {
  const audioCtx = await ensureGraph()
  try {
    srcNode?.disconnect()
  } catch {}
  try {
    dstNode?.disconnect()
  } catch {}
  srcStream = rawStream
  srcNode = audioCtx.createMediaStreamSource(rawStream)
  dstNode = audioCtx.createMediaStreamDestination()
  srcNode.connect(node)
  node.connect(dstNode)
  useNoise.getState().setActive(true)
  return dstNode.stream
}

export function destroyNoiseGraph() {
  try {
    srcNode?.disconnect()
  } catch {}
  try {
    node?.disconnect()
  } catch {}
  ctx?.close().catch(() => {})
  ctx = null
  node = null
  srcNode = null
  dstNode = null
  srcStream = null
  if (workletUrl) {
    URL.revokeObjectURL(workletUrl)
    workletUrl = null
  }
  useNoise.getState().setActive(false)
}

export function getNoiseSourceStream() {
  return srcStream
}

export function updateNoiseIntensity() {
  node?.port.postMessage({ type: 'intensity', value: useNoise.getState().intensity / 100 })
}

export function isNoiseActive() {
  return ctx != null
}
