import pino from 'pino'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { envSchema } from '../src/config/env.js'
import type { Ctx } from '../src/context.js'
import { Ipfs } from '../src/services/ipfs.js'

const KEY = '11111111111111111111111111111112'
const env = envSchema.parse({
  DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
  REDIS_URL: 'redis://localhost:6379',
  RPC_URL: 'https://example.invalid',
  DBC_CONFIG: KEY,
  QUOTE_MINT: KEY,
  QUOTE_DECIMALS: '6',
  FEE_CLAIMER: KEY,
  TREASURY: KEY,
  TRADE_FEE_BPS: '450',
  REFLECTION_BPS: '230',
  CREATOR_BPS: '70',
})

// Routes under test never reach the database or the chain; any access is a bug.
const trap = new Proxy({}, { get: () => { throw new Error('unexpected dependency access') } })
const ctx = {
  env,
  prisma: trap,
  redis: { cmd: { get: async () => '0.25' }, sub: trap },
  chain: { poolConfig: { migrationQuoteThreshold: '44288312000' }, planTrade: trap, buildTrade: trap, buildLaunch: trap },
  ipfs: new Ipfs(undefined, env.IPFS_GATEWAY),
  logger: pino({ level: 'silent' }),
  quoteMeta: { name: 'HPOS10I', logoUrl: null },
} as unknown as Ctx
const app = createApp(ctx)

describe('config', () => {
  it('discloses the 4.5% = 2.3% holders + 0.7% creator + 0.6% platform + 0.9% Meteora split in UI units', async () => {
    const res = await request(app).get('/config').expect(200)
    expect(res.body.fees).toEqual({ tradeFeeBps: 450, protocolBps: 90, reflectionBps: 230, creatorBps: 70, platformBps: 60 })
    expect(res.body.curve.migrationQuoteThreshold).toBe('44288.312')
  })
})

describe('validation', () => {
  it('rejects a malformed mint', async () => {
    const res = await request(app).get('/tokens/not-a-mint').expect(400)
    expect(res.body.error).toBe('invalid request')
  })

  it('rejects an invalid launch with field-level reasons', async () => {
    const res = await request(app)
      .post('/launch/build')
      .send({ creator: KEY, mint: KEY, name: 'x'.repeat(40), symbol: 'bad sym', uri: 'nope' })
      .expect(400)
    const paths = res.body.details.map((d: { path: string }) => d.path)
    expect(paths).toEqual(expect.arrayContaining(['name', 'symbol', 'uri']))
  })

  it('rejects a trade with a bad owner or amount', async () => {
    await request(app).post('/trade/build').send({ mint: KEY, owner: 'zz', side: 'BUY', amount: '1', payWith: 'SOL' }).expect(400)
    await request(app).post('/trade/build').send({ mint: KEY, owner: KEY, side: 'BUY', amount: '-1', payWith: 'SOL' }).expect(400)
  })

  it('refuses non-https social links', async () => {
    const res = await request(app)
      .post('/launch/build')
      .send({ creator: KEY, mint: KEY, name: 'Cat', symbol: 'CAT', uri: 'https://x.io/m.json', twitter: 'javascript:alert(1)' })
      .expect(400)
    expect(res.body.details[0].path).toBe('twitter')
  })
})

describe('uploads', () => {
  const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).toString('base64')

  it('reports uploads as unconfigured without PINATA_JWT', async () => {
    const res = await request(app).post('/launch/metadata').send({ name: 'Cat', symbol: 'CAT', image: png }).expect(503)
    expect(res.body.error).toMatch(/PINATA_JWT/)
  })

  it('rejects content that is not a supported image, whatever it claims to be', async () => {
    const fake = 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64')
    const res = await request(app).post('/launch/metadata').send({ name: 'Cat', symbol: 'CAT', image: fake }).expect(400)
    expect(res.body.error).toMatch(/unsupported image/)
  })

  it('accepts a real image under the wrong declared type (a WebP saved as .jpg)', async () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(8)])
    const misnamed = 'data:image/jpeg;base64,' + webp.toString('base64')
    // Passes validation and reaches the pin step, which is unconfigured in tests.
    await request(app).post('/launch/metadata').send({ name: 'Cat', symbol: 'CAT', image: misnamed }).expect(503)
  })

  it('identifies formats by signature', async () => {
    const { sniffImage } = await import('../src/services/ipfs.js')
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg')
    expect(sniffImage(Buffer.from('GIF89a......'))?.mime).toBe('image/gif')
    expect(sniffImage(Buffer.from('<svg></svg>'))).toBeNull()
  })
})

it('404s unknown routes as JSON', async () => {
  const res = await request(app).get('/nope').expect(404)
  expect(res.body).toEqual({ error: 'not found' })
})

describe('ipfs gateway', () => {
  it('always serves content under /ipfs/', async () => {
    const { normalizeGateway } = await import('../src/services/ipfs.js')
    expect(normalizeGateway('https://name.mypinata.cloud')).toBe('https://name.mypinata.cloud/ipfs/')
    expect(normalizeGateway('https://name.mypinata.cloud/')).toBe('https://name.mypinata.cloud/ipfs/')
    expect(normalizeGateway('https://gateway.pinata.cloud/ipfs/')).toBe('https://gateway.pinata.cloud/ipfs/')
    expect(normalizeGateway('https://gateway.pinata.cloud/ipfs')).toBe('https://gateway.pinata.cloud/ipfs/')
  })
})

describe('rpc proxy', () => {
  it('refuses methods outside the allowlist without calling upstream', async () => {
    const res = await request(app).post('/rpc').send({ jsonrpc: '2.0', id: 1, method: 'getProgramAccounts', params: [] }).expect(403)
    expect(res.body.error.message).toMatch(/not allowed/)
  })
  it('refuses oversized batches', async () => {
    const batch = Array.from({ length: 21 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'getSlot' }))
    await request(app).post('/rpc').send(batch).expect(400)
  })
})
