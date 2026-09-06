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
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-200',
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
        paletteClass,
        sizeClasses,
        className,
      )}
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
            'absolute right-0 bottom-0 rounded-full ring-2 ring-white dark:ring-gray-950',
            dotClasses,
            online ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-600',
          )}
          aria-label={online ? 'Online' : 'Offline'}
        />
      ) : null}
    </span>
  );
};

export default Avatar;
