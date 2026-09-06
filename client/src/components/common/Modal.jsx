import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

const SIZE_MAP = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const Modal = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  hideCloseButton = false,
  panelClassName,
}) => {
  const dialogRef = useRef(null);
  const previousActiveRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;

    previousActiveRef.current = document.activeElement;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const explicit = initialFocusRef?.current;
      if (explicit && typeof explicit.focus === 'function') {
        explicit.focus();
        return;
      }
      const dialog = dialogRef.current;
      if (!dialog) return;
      const firstFocusable = dialog.querySelector(FOCUSABLE_SELECTOR);
      if (firstFocusable instanceof HTMLElement) {
        firstFocusable.focus();
      } else {
        dialog.focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      body.style.overflow = previousOverflow;
      const previous = previousActiveRef.current;
      if (previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [open, initialFocusRef]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('aria-hidden'));
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeOnEscape, onClose],
  );

  const handleBackdropClick = useCallback(
    (event) => {
      if (!closeOnBackdrop) return;
      if (event.target === event.currentTarget) {
        onClose?.();
      }
    },
    [closeOnBackdrop, onClose],
  );

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
      onMouseDown={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl outline-none',
          'dark:bg-gray-900 dark:ring-1 dark:ring-white/10',
          SIZE_MAP[size] ?? SIZE_MAP.md,
          panelClassName,
        )}
      >
        {(title || !hideCloseButton) && (
          <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="min-w-0">
              {title ? (
                <h2
                  id={titleId}
                  className="truncate text-base font-semibold text-gray-900 dark:text-white"
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p
                  id={descriptionId}
                  className="mt-1 text-xs text-gray-500 dark:text-gray-400"
                >
                  {description}
                </p>
              ) : null}
            </div>
            {!hideCloseButton ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-m-1 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </header>
        )}

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-5 py-3 dark:border-gray-800 dark:bg-gray-900/60">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
