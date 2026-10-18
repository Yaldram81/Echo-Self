import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, Info, X, ChevronDown, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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

export function SampleDataToast() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-[5.5rem] lg:bottom-6 z-40 flex items-center gap-2.5 rounded-full bg-charcoal/95 text-paper shadow-lifted pl-3.5 pr-2 py-2 max-w-[calc(100vw-2rem)]"
    >
      <Info className="w-4 h-4 shrink-0 text-amberclay-light" aria-hidden />
      <span className="text-xs leading-snug">
        Viewing sample data — a fictional demo persona.
      </span>
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-paper/80 hover:text-paper hover:bg-white/10 transition-colors"
      >
        <X className="w-3.5 h-3.5" aria-hidden />
      </button>
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

export interface FilterDropdownOption<T extends string = string> {
  value: T;
  label: string;
  badge?: string | number;
}

export function FilterDropdown<T extends string = string>({
  value,
  defaultValue = 'all' as T,
  options,
  onChange,
  icon: Icon,
  title,
  ariaLabel,
  fullWidth = false,
  align = 'left',
  className = '',
}: {
  value: T;
  defaultValue?: T;
  options: FilterDropdownOption<T>[];
  onChange: (value: T) => void;
  icon?: LucideIcon;
  title?: string;
  ariaLabel?: string;
  fullWidth?: boolean;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [open]);

  const activeOption = options.find((o) => o.value === value) ?? options[0];
  const activeLabel = activeOption?.label ?? String(value);
  const isCustomActive = value !== defaultValue;

  return (
    <div ref={ref} className={`relative ${fullWidth ? 'w-full' : 'inline-block'} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`h-9 sm:h-10 inline-flex items-center gap-1.5 rounded-full border px-3 text-xs sm:text-sm font-medium transition-all shadow-xs cursor-pointer ${
          fullWidth ? 'w-full justify-between' : ''
        } ${
          isCustomActive
            ? 'border-terracotta bg-terracotta/10 text-terracotta-deep font-semibold'
            : 'border-linen-dark bg-white/90 text-slateink-dark hover:border-terracotta hover:bg-white'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || title || 'Filter option'}
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          {Icon && (
            <Icon
              className={`w-3.5 h-3.5 shrink-0 ${
                isCustomActive ? 'text-terracotta' : 'text-slateink-light'
              }`}
              aria-hidden="true"
            />
          )}
          <span className="truncate max-w-[130px] sm:max-w-[180px]">{activeLabel}</span>
          {activeOption?.badge !== undefined && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-linen-dark/60 text-slateink font-bold">
              {activeOption.badge}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slateink-light shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-1.5 min-w-[170px] sm:min-w-[200px] max-w-[280px] max-h-64 overflow-y-auto rounded-2xl bg-paper-soft/95 backdrop-blur-md border border-linen-dark/80 shadow-xl p-1.5 z-50 space-y-0.5 animate-[fadeIn_120ms_ease-out]`}
        >
          {title && (
            <div className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-slateink-light">
              {title}
            </div>
          )}
          {options.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 sm:py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-terracotta/15 text-terracotta-deep font-semibold'
                    : 'text-slateink-dark hover:bg-linen/80 hover:text-charcoal'
                }`}
              >
                <span className="truncate pr-2">{opt.label}</span>
                <span className="flex items-center gap-1 shrink-0">
                  {opt.badge !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-linen-dark/50 text-slateink font-medium">
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && <Check className="w-3.5 h-3.5 text-terracotta" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
