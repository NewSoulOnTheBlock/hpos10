'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { readLarva, writeLarva } from '@/lib/larva'
import { AnimatedSprite, LarvaSprite, SpriteSequence } from '@/components/creep/sprites'
import { TokenImage } from '@/components/token-image'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { toast } from 'sonner'
import { Check, ImagePlus, Loader2, X } from 'lucide-react'
import type { PayWith } from '@hpos-pad/shared'
import { buildLaunch, uploadMetadata } from '@/lib/api'
import { prepareImage } from '@/lib/image'
import { normalizeUrl, solscanTx } from '@/lib/solana'
import { useLaunchpadConfig } from '@/hooks/use-config'
import { describeTxError, useSendBuiltTransaction } from '@/hooks/use-send-built-tx'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FeeDisclosure } from '@/components/fee-disclosure'
import { cn } from '@/lib/utils'
import { QuoteIcon } from '@/components/quote-icon'
import { LarvaIcon } from '@/components/sc/icons'

const optionalLink = z
  .string()
  .trim()
  .max(200)
  .optional()
  .refine((v) => !v || !/\s/.test(v), 'No spaces')

const schema = z.object({
  name: z.string().trim().min(1, 'Required').max(32, 'Max 32 characters'),
  symbol: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(10, 'Max 10 characters')
    .regex(/^[A-Z0-9]+$/, 'Letters and numbers only'),
  description: z.string().trim().max(1000, 'Max 1000 characters').optional(),
  website: optionalLink,
  twitter: optionalLink,
  telegram: optionalLink,
  firstBuy: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (/^\d*\.?\d*$/.test(v) && Number(v) >= 0), 'Enter a positive amount'),
  slippagePct: z
    .string()
    .trim()
    .refine((v) => Number(v) > 0 && Number(v) <= 50, '0.1–50%'),
})

type FormValues = z.infer<typeof schema>

type Step = 'idle' | 'upload' | 'build' | 'sign' | 'confirm' | 'done'
const STEPS: { id: Exclude<Step, 'idle' | 'done'>; label: string }[] = [
  { id: 'upload', label: 'Pin image + metadata to IPFS' },
  { id: 'build', label: 'Build launch transaction' },
  { id: 'sign', label: 'Approve in your wallet' },
  { id: 'confirm', label: 'Confirm on Solana' },
]

export function CreateTokenForm({ larva = 0 }: { larva?: number }) {
  const router = useRouter()
  const { publicKey } = useWallet()
  const { setVisible } = useWalletModal()
  const { data: config } = useLaunchpadConfig()
  const sendBuilt = useSendBuiltTransaction()

  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [payWith, setPayWith] = useState<PayWith>('SOL')
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', symbol: '', description: '', website: '', twitter: '', telegram: '', firstBuy: '', slippagePct: '5' },
    mode: 'onTouched',
  })
  const { register, handleSubmit, formState, setValue, control } = form
  const quoteSymbol = config?.quote.symbol ?? 'HPOS10I'
  const busy = step !== 'idle' && step !== 'done'

  // The selected larva's draft: load it once, then keep it saved as you type.
  const loaded = useRef(false)
  useEffect(() => {
    const d = readLarva(larva)
    if (d) {
      form.reset({ ...form.getValues(), ...Object.fromEntries(Object.entries(d).filter(([k, v]) => k in form.getValues() && typeof v === 'string')) })
      // Loading a draft from this browser's storage after mount (it doesn't exist during SSR).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (d.image) setImage(d.image)
    }
    loaded.current = true
  }, [larva, form])
  const draftValues = useWatch({ control })
  useEffect(() => {
    if (!loaded.current || step === 'done') return
    const t = setTimeout(() => {
      const { name, symbol, description, website, twitter, telegram, firstBuy } = draftValues
      const empty = ![name, symbol, description, website, twitter, telegram, firstBuy].some(Boolean) && !image
      writeLarva(larva, empty ? null : { name, symbol, description, website, twitter, telegram, firstBuy, image })
    }, 400)
    return () => clearTimeout(t)
  }, [draftValues, image, larva, step])

  const acceptFile = useCallback(async (file: File | undefined) => {
    setImageError(null)
    if (!file) return
    if (file.type && !file.type.startsWith('image/')) {
      setImageError('Pick an image file.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setImageError('Image must be 20 MB or smaller.')
      return
    }
    try {
      setImage({ dataUrl: await prepareImage(file), name: file.name })
    } catch (e) {
      setImageError((e as Error).message)
    }
  }, [])

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    if (!image) {
      setImageError('An image is required.')
      return
    }
    if (!publicKey) {
      setVisible(true)
      return
    }

    const website = normalizeUrl(values.website, 'website')
    const twitter = normalizeUrl(values.twitter, 'twitter')
    const telegram = normalizeUrl(values.telegram, 'telegram')
    const firstBuyAmount = values.firstBuy && Number(values.firstBuy) > 0 ? values.firstBuy : undefined

    try {
      setStep('upload')
      const meta = await uploadMetadata({
        name: values.name,
        symbol: values.symbol,
        description: values.description || undefined,
        website,
        twitter,
        telegram,
        image: image.dataUrl,
      })

      setStep('build')
      // The server assigns the mint (a …hpos vanity address from the pool) and
      // signs for it; the wallet only signs as payer.
      const built = await buildLaunch({
        creator: publicKey.toBase58(),
        name: values.name,
        symbol: values.symbol,
        uri: meta.uri,
        description: values.description || undefined,
        website,
        twitter,
        telegram,
        imageUrl: meta.imageUrl,
        firstBuy: firstBuyAmount
          ? { amount: firstBuyAmount, payWith, slippageBps: Math.round(Number(values.slippagePct) * 100) }
          : undefined,
      })

      setStep('sign')
      if (!built.mint || !built.mintSigned) throw new Error('The server did not assign a token address; please try again.')
      const mintAddress = built.mint
      const signature = await sendBuilt(built, [], { onSigned: () => setStep('confirm') })

      setStep('done')
      writeLarva(larva, null)
      toast.success(`$${values.symbol} has morphed`, {
        description: 'Your egg is gestating on the creep.',
        action: { label: 'View tx', onClick: () => window.open(solscanTx(signature, config?.cluster), '_blank') },
      })
      router.push(`/?hatched=${mintAddress}`)
    } catch (e) {
      setStep('idle')
      setError(describeTxError(e))
    }
  })

  const symbolValue = useWatch({ control, name: 'symbol' })
  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <form onSubmit={onSubmit} className="grid min-w-0 gap-6 lg:grid-cols-[1fr_360px]" noValidate>
      <Card title={`Larva ${larva + 1} // morph grid`} leds={['blue', 'green']} vents keys className="flex flex-col gap-5 p-4 sm:p-5">
        <p className="font-mono text-xs text-muted-foreground">&gt; define the strain. metadata is sealed at spawn_</p>
        <div className="flex flex-col gap-2">
          <Label id="image-label">Infest portrait</Label>
          <div
            role="button"
            tabIndex={0}
            aria-labelledby="image-label"
            aria-describedby={imageError ? 'image-error' : undefined}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInput.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void acceptFile(e.dataTransfer.files[0])
            }}
            className={cn(
              'kit-well relative flex min-h-40 cursor-pointer items-center gap-4 border-dashed p-4 transition-colors outline-none hover:border-[#f0a818]/60 focus-visible:border-[#f0a818] focus-visible:ring-2 focus-visible:ring-ring',
              dragging && 'border-[#3dff6a] bg-[#3dff6a]/5',
              imageError && 'border-destructive',
            )}
          >
            {image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.dataUrl}
                  alt="Token image preview"
                  className="size-24 shrink-0 rounded-[4px] border border-[#f0a818]/60 object-cover shadow-[0_0_0_2px_#000] sm:size-32"
                />
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="truncate font-mono text-sm sc-text">{image.name}</p>
                  <Button
                    type="button"
                    variant="subtle"
                    size="sm"
                    className="w-fit"
                    onClick={(e) => {
                      e.stopPropagation()
                      setImage(null)
                    }}
                  >
                    <X /> Remove
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex w-full flex-col items-center gap-2 text-center text-muted-foreground">
                <ImagePlus className="size-8 text-[#f0a818]/80" />
                <p className="font-display text-xs font-bold uppercase tracking-[0.14em] kit-amber">Drop an image or click to choose</p>
                <p className="font-mono text-xs">any image · large ones are resized · square works best</p>
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void acceptFile(e.target.files?.[0])}
            />
          </div>
          {imageError && (
            <p id="image-error" className="font-mono text-sm text-destructive">
              {imageError}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Strain (name)" error={formState.errors.name?.message}>
            <Input id="name" placeholder="Broodling" maxLength={32} {...register('name')} aria-invalid={!!formState.errors.name} />
          </Field>
          <Field id="symbol" label="Ticker" error={formState.errors.symbol?.message}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[#f0a818]">$</span>
              <Input
                id="symbol"
                placeholder="BROOD"
                maxLength={10}
                className="pl-7 uppercase"
                {...register('symbol', {
                  onChange: (e) => setValue('symbol', String(e.target.value).toUpperCase().replace(/[^A-Z0-9]/g, '')),
                })}
                aria-invalid={!!formState.errors.symbol}
              />
            </div>
          </Field>
        </div>

        <Field id="description" label="Genome (description)" error={formState.errors.description?.message}>
          <Textarea id="description" placeholder="What's the story?" maxLength={1000} {...register('description')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="website" label="Web cyst" error={formState.errors.website?.message}>
            <Input id="website" placeholder="yoursite.xyz" {...register('website')} />
          </Field>
          <Field id="twitter" label="X cyst" error={formState.errors.twitter?.message}>
            <Input id="twitter" placeholder="@handle" {...register('twitter')} />
          </Field>
          <Field id="telegram" label="TG cyst" error={formState.errors.telegram?.message}>
            <Input id="telegram" placeholder="t.me/group" {...register('telegram')} />
          </Field>
        </div>
        <p className="flex items-start gap-2 font-mono text-xs text-muted-foreground">
          <span className="led on-amber mt-1 shrink-0" aria-hidden />
          Name, ticker, image and links are written to immutable metadata. They cannot be changed after spawn.
        </p>
        {/* The morph stage: your larva on the creep; it becomes a cocoon while the launch transaction goes through. */}
        <MorphStage larva={larva} step={step} stepIndex={stepIndex} image={image?.dataUrl} symbol={symbolValue} />
      </Card>

      <div className="flex min-w-0 flex-col gap-6">
        <Card title="Nutrient (dev buy)" leds={['blue']} className="flex flex-col gap-4 p-4">
          <p className="text-sm text-muted-foreground">
            Optional. Buy in the same transaction that creates the pool, so nobody can get in before you.
          </p>
          <div className="kit-well inline-flex w-fit gap-1 p-1" role="group" aria-label="Pay with">
            {(['SOL', 'QUOTE'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={payWith === p}
                onClick={() => setPayWith(p)}
                className={cn(
                  'kit-toggle h-8 gap-1 px-3 text-[11px]',
                  payWith === p && 'is-on',
                )}
              >
                {p === 'QUOTE' && <QuoteIcon className="size-3.5" />}
                Pay {p === 'SOL' ? 'SOL' : quoteSymbol}
              </button>
            ))}
          </div>
          <Field id="firstBuy" label={`Amount (${payWith === 'SOL' ? 'SOL' : quoteSymbol})`} error={formState.errors.firstBuy?.message}>
            <Input id="firstBuy" inputMode="decimal" placeholder="0" {...register('firstBuy')} />
          </Field>
          <Field id="slippagePct" label="Slippage %" error={formState.errors.slippagePct?.message}>
            <Input id="slippagePct" inputMode="decimal" {...register('slippagePct')} />
          </Field>
        </Card>

        <Card title="Morph" leds={busy ? ['amber', 'amber'] : ['green', 'green']} className="flex flex-col gap-4 p-4">
          {config && config.fees.creatorBps > 0 && (
            <div className="kit-well flex items-start gap-3 border-phosphor/40 p-3">
              <QuoteIcon className="mt-0.5 size-5" />
              <p className="text-sm text-muted-foreground">
                <span className="font-display font-bold uppercase tracking-wide sc-text">
                  You earn {config.fees.creatorBps / 100}% of every trade
                </span>{' '}
                on your token, in {config.quote.symbol}, sent to this wallet automatically, before and after graduation.
              </p>
            </div>
          )}
          <FeeDisclosure />
          {busy || step === 'done' ? (
            <ol className="kit-well flex flex-col gap-2 p-3" aria-live="polite">
              {STEPS.map((s, i) => {
                const state = step === 'done' || i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'todo'
                return (
                  <li key={s.id} className="flex items-center gap-2 font-mono text-sm">
                    {state === 'done' ? (
                      <Check className="size-4 text-phosphor-bright" />
                    ) : state === 'active' ? (
                      <Loader2 className="size-4 animate-spin text-cyan" />
                    ) : (
                      <span className="grid size-4 place-items-center" aria-hidden>
                        <span className="led" />
                      </span>
                    )}
                    <span className={state === 'todo' ? 'text-muted-foreground' : state === 'active' ? 'kit-amber' : 'sc-text'}>
                      {s.label}
                    </span>
                  </li>
                )
              })}
            </ol>
          ) : null}
          {error && (
            <p role="alert" className="kit-well border-destructive/60 p-3 font-mono text-sm text-destructive">
              &gt; {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy} className="h-14 w-full text-base tracking-[0.2em] [&_svg]:size-5">
            {busy ? <Loader2 className="animate-spin" /> : <LarvaIcon />}
            {!publicKey ? 'Connect wallet' : busy ? 'Morphing…' : `Morph ${symbolValue ? `$${symbolValue}` : 'token'}`}
          </Button>
        </Card>
      </div>
    </form>
  )
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="font-mono text-sm text-destructive">{error}</p>}
    </div>
  )
}

/** The larva on a patch of creep, in a selection ring. While morphing it is a cocoon with the launch step as a readout. */
function MorphStage({
  larva,
  step,
  stepIndex,
  image,
  symbol,
}: {
  larva: number
  step: Step
  stepIndex: number
  image?: string
  symbol?: string
}) {
  const done = step === 'done'
  const busy = step !== 'idle' && !done
  const cocoon = busy || done
  const current = STEPS[stepIndex]
  const segments = 20
  const lit = Math.max(1, done ? segments : busy ? Math.round(((stepIndex + 0.5) / STEPS.length) * segments) : 0)
  return (
    <div className="kit-well creep-ground relative mt-auto h-[280px] overflow-hidden sm:h-[300px]">
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_55%,transparent_20%,rgb(0_0_0/0.55)_60%,rgb(0_0_0/0.92)_100%)]" aria-hidden />
      <p className="kit-amber absolute left-3 top-2.5 font-mono text-[11px] uppercase tracking-[0.2em]">
        Larva {larva + 1} {'// '}
        {done ? 'hatched' : busy ? 'gestating' : 'awaiting morph'}
      </p>
      <div className="absolute inset-x-0 top-[46%] flex -translate-y-1/2 justify-center">
        <div className={cn('relative', cocoon ? 'w-40' : 'w-44')}>
          <span className={cn('select-ring absolute inset-x-[-10%] h-[42%]', cocoon ? 'bottom-[-10%]' : 'bottom-[-24%]')} aria-hidden />
          {cocoon ? (
            done ? (
              <AnimatedSprite name="prebirth" className="relative w-full drop-shadow-[0_8px_10px_rgb(0_0_0/0.7)]" />
            ) : (
              // The larva curls into an egg, then the egg pulses while the transactions land.
              <SpriteSequence first="curl" then="egg" className="relative w-full drop-shadow-[0_8px_10px_rgb(0_0_0/0.7)] crt-flicker" />
            )
          ) : (
            <LarvaSprite className="relative w-full drop-shadow-[0_8px_10px_rgb(0_0_0/0.7)]" />
          )}
          {image && (
            <span className="absolute -right-[8%] -bottom-[6%] size-12 overflow-hidden rounded-full border-2 border-[#f0a818] shadow-[0_0_10px_rgb(240_168_24/0.5)]">
              <TokenImage src={image} symbol={symbol || '?'} className="size-full rounded-none border-0 shadow-none" />
            </span>
          )}
        </div>
      </div>
      <div className="absolute inset-x-3 bottom-3 flex flex-col items-center gap-1.5 text-center" aria-live="polite">
        {busy && current ? (
          <>
            <p className="sc-text font-mono text-xs uppercase tracking-[0.12em] sm:text-sm">
              Gestation {stepIndex + 1}/{STEPS.length} · {current.label}
            </p>
            <span className="hp" aria-hidden>
              {Array.from({ length: segments }, (_, i) => (
                <i key={i} className={i < lit ? 'on' : undefined} />
              ))}
            </span>
          </>
        ) : done ? (
          <>
            <p className="sc-text font-display text-base font-bold uppercase tracking-[0.3em]">Hatched</p>
            <span className="hp" aria-hidden>
              {Array.from({ length: segments }, (_, i) => (
                <i key={i} className="on" />
              ))}
            </span>
          </>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">&gt; define the strain, then MORPH_</p>
        )}
      </div>
    </div>
  )
}
