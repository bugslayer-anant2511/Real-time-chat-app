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
      className="fixed inset-0 z-50 flex items-end justify-center px-3 py-4 sm:items-center sm:px-4 sm:py-6"
      style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
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
          'relative flex max-h-full w-full flex-col overflow-hidden rounded-2xl outline-none ww-scale-in',
          'bg-white/95 dark:bg-[#16162a]/95 backdrop-blur-xl border border-[rgba(124,58,237,0.22)] shadow-xl dark:shadow-[0_24px_60px_rgba(0,0,0,0.6),0_0_40px_rgba(124,58,237,0.10)]',
          SIZE_MAP[size] ?? SIZE_MAP.md,
          panelClassName,
        )}
      >
        {(title || !hideCloseButton) && (
          <header
            className="flex items-start justify-between gap-3 px-5 py-4"
            style={{ borderBottom: '1px solid rgba(124,58,237,0.15)' }}
          >
            <div className="min-w-0">
              {title ? (
                <h2
                  id={titleId}
                  className="truncate text-base font-bold text-gray-900 dark:text-white"
                  style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p id={descriptionId} className="mt-1 text-xs text-gray-500 dark:text-[#9090b8]">
                  {description}
                </p>
              ) : null}
            </div>
            {!hideCloseButton ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-m-1 rounded-lg p-1 transition-colors"
                style={{ color: '#6b6b8a' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.background = 'rgba(124,58,237,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#6b6b8a'; e.currentTarget.style.background = ''; }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </header>
        )}

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer ? (
          <footer
            className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50/60 dark:bg-[#16162a]/60"
            style={{ borderTop: '1px solid rgba(124,58,237,0.15)' }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
