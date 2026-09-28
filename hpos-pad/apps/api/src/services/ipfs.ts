import { HttpError } from '../middleware/errors.js'

const MAX_IMAGE_BYTES = 4 * 1024 * 1024
/** Identify an image by its magic bytes. Only formats every wallet and terminal renders. */
export function sniffImage(b: Buffer): { mime: string; ext: string } | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('ascii'))) return { mime: 'image/gif', ext: 'gif' }
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return null
}

/** Pins files to IPFS through Pinata's v3 API and returns gateway URLs. */
/**
 * A gateway base that ends in `/ipfs/`. Pinata's dashboard shows dedicated
 * gateways as bare hosts (https://name.mypinata.cloud), which serve content
 * only under /ipfs/<cid>; without it every link is a 400.
 */
export function normalizeGateway(url: string): string {
  const base = url.replace(/\/+$/, '')
  return /\/ipfs$/.test(base) ? `${base}/` : `${base}/ipfs/`
}

export class Ipfs {
  private readonly gateway: string

  constructor(
    private readonly jwt: string | undefined,
    gateway: string,
  ) {
    this.gateway = normalizeGateway(gateway)
  }

  /**
   * The URL goes on-chain in an immutable token, so it must work before we
   * return it. Gateways can lag a few seconds behind a fresh pin; retry.
   */
  private async assertReachable(url: string): Promise<void> {
    for (let i = 0; i < 6; i++) {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10_000) }).catch(() => null)
      if (res?.ok) return
      if (res && res.status >= 400 && res.status < 500 && res.status !== 404 && res.status !== 429) break
      await new Promise((r) => setTimeout(r, 1_000 * (i + 1)))
    }
    throw new HttpError(502, `uploaded file is not reachable at ${url}; check IPFS_GATEWAY`)
  }

  private async pin(blob: Blob, name: string): Promise<string> {
    if (!this.jwt) throw new HttpError(503, 'uploads are not configured (PINATA_JWT)')
    const form = new FormData()
    form.append('file', blob, name)
    form.append('network', 'public')
    const res = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.jwt}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    })
    const body = (await res.json().catch(() => ({}))) as { data?: { cid?: string } }
    const cid = body.data?.cid
    if (!res.ok || !cid) throw new HttpError(502, `IPFS upload failed (${res.status})`)
    const url = `${this.gateway}${cid}`
    await this.assertReachable(url)
    return url
  }

  /** Validate and pin a data: URL image. The declared type must match the file's magic bytes. */
  /**
   * Validate and pin a data: URL image. The declared type is ignored: files
   * are often misnamed (a ".jpg" saved from X is usually WebP), so the format
   * is read from the file's own signature, and that is what gets pinned.
   */
  async pinImage(dataUrl: string): Promise<{ url: string; mime: string }> {
    const m = /^data:[^;,]*(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl)
    if (!m) throw new HttpError(400, 'image must be a base64 data: URL')
    const bytes = Buffer.from(m[1]!, 'base64')
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(400, 'image must be under 4 MB')
    const kind = sniffImage(bytes)
    if (!kind) throw new HttpError(400, 'unsupported image; use png, jpg, gif or webp')
    return { url: await this.pin(new Blob([bytes], { type: kind.mime }), `image.${kind.ext}`), mime: kind.mime }
  }


  async pinJson(obj: unknown): Promise<string> {
    return this.pin(new Blob([JSON.stringify(obj)], { type: 'application/json' }), 'metadata.json')
  }
}
