export function pickMime(candidates) {
  if (typeof MediaRecorder === 'undefined') return null
  for (const mime of candidates) {
    try {
      if (!mime || MediaRecorder.isTypeSupported(mime)) return mime || ''
    } catch {}
  }
  return null
}

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function base64ToBytes(data) {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
