import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';

const ImageLightbox = ({ open, src, alt = '', onClose, downloadHref }) => {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  const handleBackdropClick = useCallback(
    (event) => {
      if (event.target === event.currentTarget) onClose?.();
    },
    [onClose],
  );

  if (!open || !src || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Image preview'}
      onMouseDown={handleBackdropClick}
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 px-4 py-6"
    >
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        {downloadHref ? (
          <a
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer nofollow"
            download
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label="Download image"
            title="Download image"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          autoFocus
          aria-label="Close image preview"
          title="Close (Esc)"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <img
        src={src}
        alt={alt || 'Shared image'}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
      />
    </div>,
    document.body,
  );
};

export default ImageLightbox;
