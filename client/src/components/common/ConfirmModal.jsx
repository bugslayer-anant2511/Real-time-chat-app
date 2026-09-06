import { useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle } from 'lucide-react';

import Modal from './Modal.jsx';
import Spinner from './Spinner.jsx';

const VARIANT_STYLES = {
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 dark:bg-red-600 dark:hover:bg-red-700',
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500 dark:bg-brand-500 dark:hover:bg-brand-600',
};

const ConfirmModal = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  disabled = false,
  children,
}) => {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (submitting || disabled) return;
    setSubmitting(true);
    try {
      await onConfirm?.();
    } catch (err) {
      // Swallowed
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={title}
      description={description}
      size="sm"
      closeOnBackdrop={false}
      closeOnEscape={!submitting}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={disabled || submitting}
            className={clsx(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950',
              'disabled:cursor-not-allowed disabled:opacity-60',
              VARIANT_STYLES[variant] ?? VARIANT_STYLES.primary,
            )}
          >
            {submitting ? <Spinner size="sm" /> : null}
            <span>{confirmLabel}</span>
          </button>
        </>
      }
    >
      <div className="flex gap-3 px-5 py-4">
        {variant === 'danger' ? (
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400"
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1 text-sm text-gray-700 dark:text-gray-200">
          {children}
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;
