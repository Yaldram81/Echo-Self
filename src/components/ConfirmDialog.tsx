import { useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useDialogA11y } from '@/hooks/useDialogA11y';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  previewText,
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  previewText?: string;
  tone?: 'danger' | 'warning' | 'neutral';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, onCancel, dialogRef);

  if (!open) return null;

  const isDanger =
    tone === 'danger' ||
    confirmLabel.toLowerCase().includes('delete') ||
    confirmLabel.toLowerCase().includes('wipe') ||
    confirmLabel.toLowerCase().includes('dismiss');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/50 backdrop-blur-xs animate-[fadeIn_150ms_ease-out]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md max-h-[92dvh] overflow-y-auto scroll-elegant rounded-3xl bg-paper p-5 sm:p-6 shadow-2xl border border-linen-dark/90 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                isDanger
                  ? 'bg-clayred-light text-clayred-DEFAULT'
                  : 'bg-amberclay-light/60 text-amberclay-DEFAULT'
              }`}
            >
              {isDanger ? (
                <Trash2 className="w-5 h-5" aria-hidden />
              ) : (
                <AlertTriangle className="w-5 h-5" aria-hidden />
              )}
            </span>
            <div>
              <h2 id="confirm-title" className="font-serif text-lg font-bold text-charcoal">
                {title}
              </h2>
              <p id="confirm-desc" className="text-xs sm:text-sm text-slateink leading-relaxed mt-1">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-full text-slateink-light hover:text-charcoal hover:bg-linen/60 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {previewText && (
          <div className="rounded-2xl border-l-3 border-clayred-DEFAULT bg-white/70 p-3 sm:p-3.5 border border-linen-dark/60 text-xs sm:text-sm font-serif italic text-charcoal">
            “{previewText}”
          </div>
        )}

        <div className="pt-2 border-t border-linen-dark/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-xs sm:text-sm font-medium text-slateink hover:text-charcoal hover:bg-linen/60 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer ${
              isDanger
                ? 'bg-clayred-DEFAULT text-white hover:bg-clayred-dark active:scale-98'
                : 'bg-charcoal text-paper hover:bg-slateink-dark active:scale-98'
            }`}
          >
            {isDanger && <Trash2 className="w-3.5 h-3.5" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
