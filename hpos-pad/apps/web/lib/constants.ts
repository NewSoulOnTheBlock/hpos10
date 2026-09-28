export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws'
/**
 * Browser RPC goes through the api's allowlisted /rpc proxy by default: the
 * provider key stays server-side and public nodes (which 403 browser
 * sendTransaction) are never used. Override only for a dedicated, domain-
 * restricted browser RPC.
 */
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || `${API_BASE_URL}/rpc`

export const SOL_DECIMALS = 9
export const DEFAULT_SLIPPAGE_BPS = 300
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

export const HPOSPAD_X_URL = 'https://x.com/hpos10ireturns'
export const HPOSPAD_X_HANDLE = '@hpos10ireturns'
export const HPOSPAD_TG_URL = 'https://t.me/hpos10i'
export const HPOSPAD_TG_HANDLE = 't.me/hpos10i'
