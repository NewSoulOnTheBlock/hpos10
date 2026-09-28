import { MAX_IMAGE_BYTES } from './constants'

type Kind = 'png' | 'jpeg' | 'gif' | 'webp'

/** Read the format from the file's bytes; file names and `file.type` are often wrong. */
function sniff(b: Uint8Array): Kind | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (ascii(0, 4) === 'GIF8') return 'gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  return null
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Could not read the image'))
    r.readAsDataURL(blob)
  })
}

/** Decode anything the browser can show and re-encode it, capped at `max` px on the long side. */
async function reencode(file: Blob, type: 'image/png' | 'image/jpeg', max = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This image format cannot be read. Use PNG, JPG, GIF or WEBP.')
  })
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.9))
  if (!out) throw new Error('Could not convert the image')
  return out
}

/**
 * Turn any picked image into an upload the api accepts:
 *   - PNG / JPG / GIF / WEBP under the limit: sent untouched, whatever its name says
 *   - other formats (AVIF, BMP, HEIC where the browser decodes it): converted to PNG
 *   - too large: downscaled (GIFs cannot be, animation would be lost)
 */
export async function prepareImage(file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const kind = sniff(head)

  if (kind && file.size <= MAX_IMAGE_BYTES) return toDataUrl(file)
  if (kind === 'gif') throw new Error('GIFs must be 4 MB or smaller.')

  let blob = await reencode(file, kind === 'jpeg' ? 'image/jpeg' : 'image/png')
  if (blob.size > MAX_IMAGE_BYTES) blob = await reencode(file, 'image/jpeg', 768)
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('Image is too large even after resizing.')
  return toDataUrl(blob)
}
