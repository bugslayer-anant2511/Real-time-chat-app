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
        SIZE_MAP[size] ?? SIZE_MAP.md,
        className,
      )}
      style={{
        borderColor: 'rgba(124,58,237,0.25)',
        borderTopColor: '#8b5cf6',
      }}
    >
      <span className="sr-only">{label}</span>
    </span>
  );

  if (!fullPage) return ring;

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-gray-50 dark:bg-ww-void"
      aria-busy="true"
    >
      {ring}
    </div>
  );
};

export default Spinner;
