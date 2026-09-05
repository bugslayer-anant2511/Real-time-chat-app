import clsx from 'clsx';

const SIZE_MAP = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
  xl: 'h-14 w-14 border-4',
};

const Spinner = ({ size = 'md', fullPage = false, label = 'Loading…', className }) => {
  const ring = (
    <span
      role="status"
      aria-label={label}
      className={clsx(
        'inline-block animate-spin rounded-full border-solid',
        'border-brand-500/30 border-t-brand-500',
        'dark:border-brand-400/30 dark:border-t-brand-400',
        SIZE_MAP[size] ?? SIZE_MAP.md,
        className,
      )}
    >
      <span className="sr-only">{label}</span>
    </span>
  );

  if (!fullPage) return ring;

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-white dark:bg-gray-950"
      aria-busy="true"
    >
      {ring}
    </div>
  );
};

export default Spinner;
