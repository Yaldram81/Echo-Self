import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card-surface p-6 ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
  as: Tag = 'h2',
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  /** Render the title as h1 for the page's single top heading. */
  as?: 'h1' | 'h2';
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        {eyebrow && (
          <p className="text-xs uppercase tracking-[0.18em] text-slateink font-medium mb-1.5">
            {eyebrow}
          </p>
        )}
        <Tag className="font-serif text-2xl md:text-[1.7rem] font-medium text-charcoal leading-tight">
          {title}
        </Tag>
      </div>
      {action}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  neutral: 'bg-linen text-charcoal-soft',
  terracotta: 'bg-terracotta/15 text-terracotta-deep',
  sage: 'bg-sage-light text-sage-dark',
  amber: 'bg-amberclay-light text-amberclay-DEFAULT',
  clay: 'bg-clayred-light text-clayred-DEFAULT',
};

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slateink" role="status">
      <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <AlertTriangle className="w-6 h-6 text-clayred-DEFAULT mb-3" aria-hidden />
      <p className="text-charcoal font-medium mb-1">Something went wrong</p>
      <p className="text-sm text-slateink max-w-sm mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm font-medium text-terracotta-deep hover:text-terracotta-dark underline underline-offset-4"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      {icon && <div className="text-terracotta/70 mb-3">{icon}</div>}
      <p className="font-serif text-lg text-charcoal mb-1.5">{title}</p>
      <p className="text-sm text-slateink max-w-sm mb-4">{description}</p>
      {action}
    </div>
  );
}

export function DemoModeBanner() {
  return (
    <div className="flex items-start gap-3 bg-amberclay-light/60 border border-amberclay-DEFAULT/40 rounded-xl px-4 py-3">
      <span
        className="mt-0.5 inline-flex shrink-0 items-center rounded-full bg-amberclay-DEFAULT px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
      >
        Sample data
      </span>
      <p className="text-xs leading-relaxed text-charcoal-soft">
        Everything here is a fictional demo persona, not your data. Explore freely: add or
        remove things to see how the app behaves.
      </p>
    </div>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" title={`Confidence ${value}%`}>
      <div className="h-1 w-16 rounded-full bg-linen-dark overflow-hidden">
        <div
          className="h-full rounded-full bg-terracotta/80"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="text-[11px] text-slateink">{value}%</span>
    </div>
  );
}

export function StrengthMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" title={`Strength ${value}/100`}>
      <div className="flex gap-0.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-3.5 w-1.5 rounded-full ${
              value > i * 20 ? 'bg-terracotta' : 'bg-linen-dark'
            }`}
          />
        ))}
      </div>
      <span className="text-[11px] text-slateink tabular-nums">{value}/100</span>
    </div>
  );
}
