import { useMemo, useState } from 'react';
import clsx from 'clsx';

const SIZE_MAP = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

const DOT_SIZE = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-3.5 w-3.5',
};

const FALLBACK_PALETTE = [
  { bg: 'rgba(124,58,237,0.20)', color: '#c4b5fd' },
  { bg: 'rgba(236,72,153,0.20)', color: '#f9a8d4' },
  { bg: 'rgba(59,130,246,0.20)', color: '#93c5fd' },
  { bg: 'rgba(20,184,166,0.20)', color: '#5eead4' },
  { bg: 'rgba(245,158,11,0.20)', color: '#fcd34d' },
  { bg: 'rgba(239,68,68,0.20)', color: '#fca5a5' },
  { bg: 'rgba(34,197,94,0.20)', color: '#86efac' },
  { bg: 'rgba(168,85,247,0.22)', color: '#d8b4fe' },
];

const getInitials = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const hashString = (input = '') => {
  const value = String(input);
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const pickPaletteClass = (seed) => {
  if (!seed) return FALLBACK_PALETTE[0];
  return FALLBACK_PALETTE[hashString(seed) % FALLBACK_PALETTE.length];
};

const Avatar = ({
  src,
  name = '',
  username,
  size = 'md',
  online = false,
  showStatus = false,
  className,
}) => {
  const [errored, setErrored] = useState(false);
  const initials = useMemo(() => getInitials(name), [name]);
  const sizeClasses = SIZE_MAP[size] ?? SIZE_MAP.md;
  const dotClasses = DOT_SIZE[size] ?? DOT_SIZE.md;
  const paletteClass = useMemo(
    () => pickPaletteClass(username || name || initials),
    [username, name, initials],
  );

  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
        sizeClasses,
        className,
      )}
      style={!(src && !errored) ? { background: paletteClass.bg, color: paletteClass.color } : undefined}
      title={name || undefined}
    >
      {src && !errored ? (
        <img
          src={src}
          alt={name ? `${name} avatar` : 'User avatar'}
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
      {showStatus ? (
        <span
          className={clsx(
            'absolute right-0 bottom-0 rounded-full ring-2 ring-white dark:ring-[#16162a]',
            online ? 'bg-[#4ade80] shadow-[0_0_5px_rgba(74,222,128,0.5)]' : 'bg-gray-300 dark:bg-[#4a4a6a]',
            dotClasses,
          )}
          aria-label={online ? 'Online' : 'Offline'}
        />
      ) : null}
    </span>
  );
};

export default Avatar;
