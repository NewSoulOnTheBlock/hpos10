import type {
  BuiltTransaction,
  CandleListResponse,
  HolderDTO,
  LaunchBuildRequest,
  LaunchpadConfigDTO,
  MetadataUploadRequest,
  MetadataUploadResponse,
  Paginated,
  PlatformStatsDTO,
  ReflectionEpochDTO,
  WalletEarningsResponse,
  ClaimableDTO,
  ClaimBuildResponse,
  WalletReflectionsResponse,
  Timeframe,
  TokenDTO,
  TokenListResponse,
  TokenSort,
  TokenStatus,
  TradeBuildRequest,
  TradeDTO,
  TradeQuote,
  TradeQuoteRequest,
} from '@hpos-pad/shared'
import { API_BASE_URL } from './constants'

const DEFAULT_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

function qs(query?: Query): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function request<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; query?: Query; body?: unknown; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  init.signal?.addEventListener('abort', onAbort)

  try {
    const res = await fetch(`${API_BASE_URL}${path}${qs(init.query)}`, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    })
    const text = await res.text()
    let json: unknown = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = null
      }
    }
    if (!res.ok) {
      const err = json as { error?: string; details?: unknown } | null
      throw new ApiError(err?.error ?? `Request failed (${res.status})`, res.status, err?.details)
    }
    return json as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    if ((e as Error).name === 'AbortError') {
      if (init.signal?.aborted) throw e
      throw new ApiError('Request timed out', 0)
    }
    throw new ApiError('Could not reach the Hatchery API', 0)
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', onAbort)
  }
}

/* ------------------------------- read ------------------------------- */

export const fetchConfig = () => request<LaunchpadConfigDTO>('/config')
export const fetchStats = () => request<PlatformStatsDTO>('/stats')

export type TokenListParams = {
  sort?: TokenSort
  status?: TokenStatus
  q?: string
  creator?: string
  limit?: number
  cursor?: string | null
}
export const fetchTokens = (params: TokenListParams = {}) => request<TokenListResponse>('/tokens', { query: params })
export const fetchToken = (mint: string) => request<TokenDTO>(`/tokens/${mint}`)
export const fetchTokenTrades = (mint: string, cursor?: string | null, limit = 50) =>
  request<Paginated<TradeDTO>>(`/tokens/${mint}/trades`, { query: { cursor, limit } })
export const fetchCandles = (mint: string, tf: Timeframe, limit = 500) =>
  request<CandleListResponse>(`/tokens/${mint}/candles`, { query: { tf, limit } })
export const fetchHolders = (mint: string, limit = 100) =>
  request<HolderDTO[]>(`/tokens/${mint}/holders`, { query: { limit } })
export const fetchTokenReflections = (mint: string, cursor?: string | null, limit = 50) =>
  request<Paginated<ReflectionEpochDTO>>(`/tokens/${mint}/reflections`, { query: { cursor, limit } })
export const fetchRecentTrades = (limit = 30) => request<TradeDTO[]>('/trades/recent', { query: { limit } })

export type WalletReflections = WalletReflectionsResponse
export const fetchWalletReflections = (address: string, cursor?: string | null, limit = 50) =>
  request<WalletReflections>(`/wallets/${address}/reflections`, { query: { cursor, limit } })
export const fetchWalletEarnings = (address: string, mint?: string) =>
  request<WalletEarningsResponse>(`/wallets/${address}/earnings`, { query: { mint } })
export const fetchWalletTrades = (address: string, cursor?: string | null, limit = 50) =>
  request<Paginated<TradeDTO>>(`/wallets/${address}/trades`, { query: { cursor, limit } })

/* ---------------------------- launch/trade ---------------------------- */

export const uploadMetadata = (body: MetadataUploadRequest) =>
  request<MetadataUploadResponse>('/launch/metadata', { method: 'POST', body, timeoutMs: 60_000 })

export const fetchClaimable = (address: string) => request<ClaimableDTO>(`/wallets/${address}/claimable`)
export const buildClaim = (owner: string) =>
  request<ClaimBuildResponse>('/claims/build', { method: 'POST', body: { owner }, timeoutMs: 30_000 })
export const confirmClaim = (id: string, signature: string) =>
  request<{ status: 'PENDING' | 'LANDED' | 'EXPIRED' }>(`/claims/${id}/confirm`, { method: 'POST', body: { signature } })

export const buildLaunch = (body: LaunchBuildRequest) =>
  request<BuiltTransaction>('/launch/build', { method: 'POST', body, timeoutMs: 30_000 })

export const fetchTradeQuote = (params: TradeQuoteRequest, signal?: AbortSignal) =>
  request<TradeQuote>('/trade/quote', { query: params, signal })

export const buildTrade = (body: TradeBuildRequest) =>
  request<BuiltTransaction>('/trade/build', { method: 'POST', body, timeoutMs: 30_000 })
