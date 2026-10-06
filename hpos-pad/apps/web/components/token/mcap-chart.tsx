'use client'

import { quoteDisplaySymbol } from '@/lib/quote-display'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { TIMEFRAME_SECONDS, TOKEN_TOTAL_SUPPLY, type TokenDTO, type Timeframe } from '@hpos-pad/shared'
import { useCandles } from '@/hooks/use-tokens'
import { useTopic } from '@/hooks/use-websocket'
import { useLaunchpadConfig } from '@/hooks/use-config'
import { formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Each range reads the candle size that gives it a readable number of points. */
const RANGES: { label: string; tf: Timeframe; seconds: number }[] = [
  { label: '1H', tf: '1m', seconds: 3_600 },
  { label: '6H', tf: '5m', seconds: 21_600 },
  { label: '1D', tf: '15m', seconds: 86_400 },
  { label: '1W', tf: '1h', seconds: 604_800 },
  { label: 'ALL', tf: '4h', seconds: Number.POSITIVE_INFINITY },
]

// Kit-green line on a black screen, gunmetal grid, amber crosshair.
const LINE = '#3dff6a'
const FILL_TOP = 'rgba(61,255,106,0.22)'
const FILL_BOTTOM = 'rgba(61,255,106,0)'
const GRID = 'rgba(110,100,84,0.3)'
const CROSSHAIR = 'rgba(240,168,24,0.6)'

/** $5.0k / $1.25M / $840.12, or the quote symbol when there is no USD price yet. */
function fmtCap(v: number, usd: boolean, symbol: string): string {
  const unit = (s: string) => (usd ? `$${s}` : `${s} ${symbol}`)
  if (!Number.isFinite(v)) return '—'
  if (v >= 1e9) return unit(`${(v / 1e9).toFixed(2)}B`)
  if (v >= 1e6) return unit(`${(v / 1e6).toFixed(2)}M`)
  // Two decimals below $100k: early curves move in small steps, and one decimal flattens every label.
  if (v >= 1e5) return unit(`${(v / 1e3).toFixed(1)}k`)
  if (v >= 1e3) return unit(`${(v / 1e3).toFixed(2)}k`)
  return unit(v.toFixed(2))
}

type Point = { time: UTCTimestamp; value: number }

/**
 * Market-cap telemetry: one phosphor area on the CRT, dollar axis, and a
 * headline readout with the change over the selected range. Candles are the
 * source data; each bucket plots its closing market cap.
 */
export function McapChart({ token }: { token: TokenDTO }) {
  const [rangeIdx, setRangeIdx] = useState(0)
  const range = RANGES[rangeIdx]!
  const { data, isLoading, isError } = useCandles(token.mint, range.tf)
  const { data: config } = useLaunchpadConfig()
  const symbol = quoteDisplaySymbol(config?.quote.symbol)

  // USD per quote unit, derived from the token's own live prices.
  const quoteUsd = token.priceUsd && token.priceQuote ? token.priceUsd / token.priceQuote : null
  const usd = quoteUsd !== null
  const toCap = (priceQuote: number) => priceQuote * TOKEN_TOTAL_SUPPLY * (quoteUsd ?? 1)

  const container = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const lastRef = useRef<Point | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  // Clock for the window edge; ticks so a quiet token's line still reaches "now".
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000)
    return () => clearInterval(id)
  }, [])

  const points = useMemo<Point[]>(() => {
    const items = data?.items ?? []
    if (items.length === 0) return []
    const from = Number.isFinite(range.seconds) ? now - range.seconds : -Infinity
    const inRange = items.filter((c) => c.time >= from)
    // Carry the last price from before the window in, so the line never starts mid-air.
    const before = items.filter((c) => c.time < from).at(-1)
    const step = TIMEFRAME_SECONDS[range.tf]
    const out: Point[] = []
    if (before) out.push({ time: Math.max(from, before.time) as UTCTimestamp, value: toCap(before.close) })
    else if (inRange[0]) out.push({ time: (inRange[0].time - step) as UTCTimestamp, value: toCap(inRange[0].open) })
    for (const c of inRange) {
      if (out.length && c.time <= out[out.length - 1]!.time) continue
      out.push({ time: c.time as UTCTimestamp, value: toCap(c.close) })
    }
    // Extend flat to now, so a quiet token still shows where it stands.
    const last = out[out.length - 1]
    if (last && now > last.time) out.push({ time: now as UTCTimestamp, value: toCap(token.priceQuote || 0) || last.value })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, range, quoteUsd, now])

  useEffect(() => {
    const el = container.current
    if (!el) return
    // The canvas can't resolve CSS variables, so read the readout font's real family name.
    const mono = getComputedStyle(el).getPropertyValue('--font-readout').trim()
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#a59d8c',
        fontFamily: `${mono ? `${mono}, ` : ''}ui-monospace, SFMono-Regular, Menlo, monospace`,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(110,100,84,0.14)', style: LineStyle.Dotted },
        horzLines: { color: GRID, style: LineStyle.Dashed },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: CROSSHAIR, style: LineStyle.Dashed, labelVisible: false },
        horzLine: { color: CROSSHAIR, style: LineStyle.Dashed, labelVisible: false },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.05 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      handleScroll: false,
      handleScale: false,
    })
    const series = chart.addSeries(AreaSeries, {
      lineColor: LINE,
      lineWidth: 2,
      topColor: FILL_TOP,
      bottomColor: FILL_BOTTOM,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: '#f0a818',
      crosshairMarkerBackgroundColor: '#000',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.subscribeCrosshairMove((p) => {
      const d = p.seriesData.get(series) as { value?: number } | undefined
      setHover(p.time && d?.value !== undefined ? d.value : null)
    })
    chartRef.current = chart
    seriesRef.current = series
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    seriesRef.current?.applyOptions({
      priceFormat: { type: 'custom', formatter: (v: number) => fmtCap(v, usd, symbol), minMove: 0.01 },
    })
  }, [usd, symbol])

  useEffect(() => {
    if (!seriesRef.current) return
    seriesRef.current.setData(points)
    lastRef.current = points.at(-1) ?? null
    chartRef.current?.timeScale().fitContent()
  }, [points])

  // Live trades move the tip of the line.
  useTopic(`token:${token.mint}`, (e) => {
    if (e.type !== 'trade' || !seriesRef.current || !e.trade.priceQuote) return
    const t = Math.max(Math.floor(new Date(e.trade.blockTime).getTime() / 1000), lastRef.current?.time ?? 0) as UTCTimestamp
    const p = { time: t, value: toCap(e.trade.priceQuote) }
    seriesRef.current.update(p)
    lastRef.current = p
  })

  const current = token.marketCapUsd ?? token.marketCapQuote
  const shown = hover ?? current
  const first = points[0]?.value
  const change = first && first > 0 ? ((current - first) / first) * 100 : null
  const empty = !isLoading && !isError && points.length === 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {hover !== null ? 'Market cap · cursor' : 'Market cap · live'}
          </p>
          <div className="truncate font-mono text-3xl tabular-nums sc-text sm:text-4xl">
            {fmtCap(shown, usd, symbol)}
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-sm">
            <span className={cn(change === null ? 'text-muted-foreground' : change >= 0 ? 'text-success' : 'text-destructive')}>
              {change === null ? '—' : formatPct(change)}
            </span>
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {range.label === 'ALL' ? 'all time' : range.label}
            </span>
          </div>
        </div>
        <div className="kit-well flex max-w-full items-center gap-1 overflow-x-auto p-1" role="group" aria-label="Chart range">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              aria-pressed={i === rangeIdx}
              className={cn(
                'kit-toggle h-7 shrink-0 px-2.5 text-[11px]',
                i === rangeIdx && 'is-on',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="kit-well relative h-[300px] w-full overflow-hidden sm:h-[380px]">
        <div ref={container} className="absolute inset-0" />
        {(isLoading || isError || empty) && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center font-mono text-sm text-muted-foreground">
            {isLoading ? '> acquiring signal…' : isError ? '> telemetry offline' : '> no trades yet. The first buy starts the chart.'}
          </div>
        )}
      </div>
    </div>
  )
}
