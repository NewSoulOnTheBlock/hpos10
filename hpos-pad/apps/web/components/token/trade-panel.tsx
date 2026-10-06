'use client'

import { quoteDisplaySymbol, quoteDisplayRoute } from '@/lib/quote-display'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { toast } from 'sonner'
import { Loader2, Settings2 } from 'lucide-react'
import type { PayWith, TokenDTO } from '@hpos-pad/shared'
import { buildTrade, fetchTradeQuote } from '@/lib/api'
import { formatAmount, formatPct } from '@/lib/format'
import { solscanTx } from '@/lib/solana'
import { useDebounce } from '@/hooks/use-debounce'
import { feeShort, useLaunchpadConfig } from '@/hooks/use-config'
import { useSettings } from '@/hooks/use-settings'
import { useTokenBalance } from '@/hooks/use-token-balance'
import { toUi } from '@hpos-pad/shared'
import { describeTxError, useSendBuiltTransaction } from '@/hooks/use-send-built-tx'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { QuoteIcon } from '@/components/quote-icon'

type Side = 'BUY' | 'SELL'

const QUICK: Record<Side, Record<PayWith, string[]>> = {
  BUY: { SOL: ['0.1', '0.5', '1', '5'], QUOTE: ['100', '500', '1000', '5000'] },
  SELL: { SOL: [], QUOTE: [] },
}

export function TradePanel({ token, initialSide = 'BUY' }: { token: TokenDTO; initialSide?: Side }) {
  const { data: config } = useLaunchpadConfig()
  const quoteSymbol = quoteDisplaySymbol(config?.quote.symbol)
  const { publicKey } = useWallet()
  const { setVisible } = useWalletModal()
  const sendBuilt = useSendBuiltTransaction()
  const qc = useQueryClient()
  const { slippageBps, payWith, setPayWith } = useSettings()
  const balance = useTokenBalance(token.mint)

  const [side, setSide] = useState<Side>(initialSide)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const debounced = useDebounce(amount.trim(), 400)
  const valid = /^\d*\.?\d+$/.test(debounced) && Number(debounced) > 0

  const params = useMemo(
    () => ({ mint: token.mint, side, amount: debounced, payWith, slippageBps }),
    [token.mint, side, debounced, payWith, slippageBps],
  )

  const quote = useQuery({
    queryKey: ['trade-quote', params],
    queryFn: ({ signal }) => fetchTradeQuote(params, signal),
    enabled: valid && token.status !== 'COMPLETE',
    staleTime: 5_000,
    refetchInterval: 10_000,
    retry: false,
  })

  const inSymbol = side === 'BUY' ? (payWith === 'SOL' ? 'SOL' : quoteSymbol) : token.symbol
  const outSymbol = side === 'BUY' ? token.symbol : payWith === 'SOL' ? 'SOL' : quoteSymbol
  const migrating = token.status === 'COMPLETE'

  async function submit() {
    if (!publicKey) {
      setVisible(true)
      return
    }
    if (!valid) return
    setSubmitting(true)
    const id = toast.loading(side === 'BUY' ? `Buying $${token.symbol}…` : `Selling $${token.symbol}…`)
    try {
      const built = await buildTrade({ ...params, owner: publicKey.toBase58() })
      const sig = await sendBuilt(built, [], { onSigned: () => toast.loading('Confirming on Solana…', { id }) })
      toast.success(side === 'BUY' ? `Bought $${token.symbol}` : `Sold $${token.symbol}`, {
        id,
        action: { label: 'Solscan', onClick: () => window.open(solscanTx(sig, config?.cluster), '_blank') },
      })
      setAmount('')
      void qc.invalidateQueries({ queryKey: ['token', token.mint] })
      void qc.invalidateQueries({ queryKey: ['balance'] })
    } catch (e) {
      toast.error(describeTxError(e), { id })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card title="Trade Console" leds={['blue', 'green']} vents keys className="flex flex-col gap-4 p-4">
      <div className="kit-well grid grid-cols-2 gap-1 p-1" role="group" aria-label="Trade side">
        {(['BUY', 'SELL'] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={side === s ? (s === 'BUY' ? 'success' : 'destructive') : 'subtle'}
            aria-pressed={side === s}
            onClick={() => {
              setSide(s)
              setAmount('')
            }}
            className="h-9 tracking-[0.18em]"
          >
            {s === 'BUY' ? 'Buy' : 'Sell'}
          </Button>
        ))}
      </div>

      {token.status === 'MIGRATED' && (
        <p className="kit-well flex items-start gap-2 border-phosphor/40 px-3 py-2 text-sm text-phosphor-bright">
          <span className="led on-green mt-1.5 shrink-0" aria-hidden />
          Graduated. Trades route via Jupiter to the DAMM v2 pool.
        </p>
      )}
      {migrating && (
        <p className="kit-well flex items-start gap-2 border-amber/50 px-3 py-2 text-sm text-amber">
          <span className="led on-amber mt-1.5 shrink-0 animate-pulse-dot" aria-hidden />
          The curve is full and migrating to DAMM v2. Trading reopens in a moment.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="kit-well inline-flex min-w-0 gap-1 p-1" role="group" aria-label={side === 'BUY' ? 'Pay with' : 'Receive'}>
          {(['SOL', 'QUOTE'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPayWith(p)}
              aria-pressed={payWith === p}
              className={cn(
                'kit-toggle min-w-0 gap-1 px-2 py-1 text-[10px]',
                payWith === p && 'is-on',
              )}
            >
              {p === 'QUOTE' && <QuoteIcon className="size-3.5" />}
              <span className="truncate">
                {side === 'BUY' ? 'Pay' : 'Get'} {p === 'SOL' ? 'SOL' : quoteSymbol}
              </span>
            </button>
          ))}
        </div>
        <SlippageDialog />
      </div>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <Input
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            className="h-12 pr-24 text-xl"
            aria-label={`Amount in ${inSymbol}`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 max-w-20 -translate-y-1/2 truncate font-display text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {inSymbol}
          </span>
        </div>
        {side === 'SELL' && publicKey && (
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              BAL {balance.data ? `${formatAmount(balance.data.ui)} ${token.symbol}` : '…'}
            </span>
            <div className="flex shrink-0 gap-1.5">
              {[25, 50, 100].map((pct) => (
                <Button
                  key={pct}
                  size="sm"
                  variant="subtle"
                  disabled={!balance.data || balance.data.raw === 0n}
                  onClick={() => {
                    if (!balance.data) return
                    const raw = (balance.data.raw * BigInt(pct)) / 100n
                    setAmount(toUi(raw, balance.data.decimals))
                  }}
                  className="h-7 px-2 text-[10px]"
                >
                  {pct === 100 ? 'Max' : `${pct}%`}
                </Button>
              ))}
            </div>
          </div>
        )}
        {QUICK[side][payWith].length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {QUICK[side][payWith].map((q) => (
              <Button
                key={q}
                size="sm"
                variant="subtle"
                onClick={() => setAmount(q)}
                aria-label={`${q} ${inSymbol}`}
                className="px-1 font-mono text-xs tracking-normal"
              >
                {q}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="kit-well flex min-h-24 flex-col gap-1.5 p-3 font-mono text-sm" aria-live="polite">
        {!valid ? (
          <p className="text-muted-foreground">&gt; enter an amount to get a quote_</p>
        ) : quote.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> &gt; computing quote…
          </div>
        ) : quote.isError ? (
          <p className="text-destructive">&gt; {(quote.error as Error).message}</p>
        ) : quote.data ? (
          <>
            <Row label="You receive" value={`${formatAmount(quote.data.outAmount)} ${outSymbol}`} strong />
            <Row label="Minimum" value={`${formatAmount(quote.data.minOut)} ${outSymbol}`} />
            <Row label="Trade fee" value={`${formatAmount(quote.data.feeQuote)} ${quoteSymbol}`} quote />
            {quote.data.priceImpactPct !== null && (
              <Row
                label="Price impact"
                value={formatPct(quote.data.priceImpactPct)}
                warn={quote.data.priceImpactPct > 5}
              />
            )}
            <Row label="Route" value={quoteDisplayRoute(quote.data.route)} />
          </>
        ) : null}
      </div>

      <Button
        size="lg"
        variant={side === 'BUY' ? 'success' : 'destructive'}
        disabled={submitting || migrating || (!!publicKey && (!valid || !quote.data))}
        onClick={submit}
      >
        {submitting && <Loader2 className="animate-spin" />}
        <span className="truncate">
          {!publicKey ? 'Connect wallet' : side === 'BUY' ? `Buy $${token.symbol}` : `Sell $${token.symbol}`}
        </span>
      </Button>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        SLIPPAGE {slippageBps / 100}% ·{' '}
        {feeShort(config)}
      </p>
    </Card>
  )
}

function Row({
  label,
  value,
  strong,
  warn,
  quote,
}: {
  label: string
  value: string
  strong?: boolean
  warn?: boolean
  quote?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span
        className={cn(
          'flex min-w-0 items-center gap-1 truncate text-right tabular-nums',
          strong ? 'sc-text' : warn ? 'text-amber' : 'text-foreground',
        )}
      >
        {quote && <QuoteIcon className="size-3.5" />}
        <span className="truncate">{value}</span>
      </span>
    </div>
  )
}

function SlippageDialog() {
  const { slippageBps, setSlippageBps } = useSettings()
  const [draft, setDraft] = useState(String(slippageBps / 100))
  const presets = [1, 3, 5, 10]
  return (
    <Dialog onOpenChange={(o) => o && setDraft(String(slippageBps / 100))}>
      <DialogTrigger asChild>
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[2px] font-mono text-sm text-muted-foreground outline-none hover:text-[#f0a818] focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Slippage settings"
        >
          <Settings2 className="size-4" /> {slippageBps / 100}%
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Max slippage</DialogTitle>
        <DialogDescription>The trade reverts if the price moves more than this before it lands.</DialogDescription>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => {
                setDraft(String(p))
                setSlippageBps(p * 100)
              }}
              aria-pressed={slippageBps === p * 100}
              className={cn(
                'kit-toggle kit-well py-2 font-mono text-sm',
                slippageBps === p * 100 && 'is-on',
              )}
            >
              {p}%
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={() => {
              const v = Number(draft)
              if (v > 0) setSlippageBps(v * 100)
            }}
            aria-label="Custom slippage percent"
          />
          <span className="font-mono text-muted-foreground">%</span>
        </div>
        {Number(draft) > 15 && <p className="mt-2 text-sm text-amber">High slippage makes you easy to front-run.</p>}
      </DialogContent>
    </Dialog>
  )
}
