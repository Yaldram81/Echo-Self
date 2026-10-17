import { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDialogA11y } from '@/hooks/useDialogA11y';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, onCancel, dialogRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 px-5"
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
        className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-lifted border border-linen-dark"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clayred-light text-clayred-DEFAULT">
            <AlertTriangle className="w-4 h-4" aria-hidden />
          </span>
          <div>
            <h2 id="confirm-title" className="font-serif text-lg text-charcoal mb-1">
              {title}
            </h2>
            <p id="confirm-desc" className="text-sm text-slateink leading-relaxed">
              {description}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full px-5 py-2.5 text-sm font-medium text-slateink-dark hover:bg-linen transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full bg-clayred-DEFAULT px-5 py-2.5 text-sm font-medium text-white hover:bg-clayred-dark transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
