import { useEffect, useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '../lib/utils'

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('panel', className)} {...props} />
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">{title}</h1>
        {description ? <p className="muted mt-2 max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

type Tone = 'mint' | 'sky' | 'amber' | 'rose' | 'slate' | 'violet' | 'orange'

const toneClasses: Record<Tone, string> = {
  mint: 'border-mint-400/25 bg-mint-400/10 text-mint-300',
  sky: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  amber: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  rose: 'border-rose-400/25 bg-rose-400/10 text-rose-300',
  slate: 'border-white/10 bg-white/[0.04] text-slate-400',
  violet: 'border-violet-400/25 bg-violet-400/10 text-violet-300',
  orange: 'border-orange-400/25 bg-orange-400/10 text-orange-300',
}

export function Badge({
  tone = 'slate',
  className,
  children,
}: {
  tone?: Tone
  className?: string
  children: ReactNode
}) {
  return <span className={cn('chip', toneClasses[tone], className)}>{children}</span>
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-mint-400 text-ink-950 shadow-glow hover:bg-mint-300 active:bg-mint-500 disabled:bg-mint-400/40 disabled:text-ink-950/60',
  secondary:
    'border border-white/10 bg-white/[0.05] text-slate-100 hover:border-white/20 hover:bg-white/[0.08] disabled:text-slate-500',
  ghost: 'text-slate-300 hover:bg-white/[0.06] hover:text-white disabled:text-slate-600',
  danger: 'border border-rose-400/25 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'slate',
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
  tone?: Tone
}) {
  return (
    <div className="panel-inset p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        {icon ? <span className={cn('rounded-lg border p-1.5', toneClasses[tone])}>{icon}</span> : null}
      </div>
      <p className="mt-2 font-mono text-xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden="true" />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-ink-900/40 px-6 py-12 text-center">
      {icon ? <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-mint-400">{icon}</div> : null}
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="muted mt-2 max-w-md">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function ProgressBar({
  value,
  tone = 'mint',
  label,
}: {
  value: number
  tone?: 'mint' | 'amber' | 'rose'
  label?: string
}) {
  const width = Math.min(100, Math.max(0, value))
  const barTone =
    tone === 'rose' ? 'bg-rose-400' : tone === 'amber' ? 'bg-amber-400' : 'bg-mint-400'
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full transition-all', barTone)} style={{ width: `${width}%` }} />
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}) {
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink-850 shadow-panel sm:rounded-2xl',
          size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-white">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="muted mt-1">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
