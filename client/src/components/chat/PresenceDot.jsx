import clsx from 'clsx';

const SIZE_MAP = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

const PresenceDot = ({
  online = false,
  size = 'sm',
  className,
  withRing = true,
  pulse = true,
}) => {
  const sizeClasses = SIZE_MAP[size] ?? SIZE_MAP.sm;

  return (
    <span
      role="status"
      aria-label={online ? 'Online' : 'Offline'}
      className={clsx('relative inline-flex', sizeClasses, className)}
    >
      {online && pulse ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70"
        />
      ) : null}
      <span
        aria-hidden="true"
        className={clsx(
          'relative inline-block h-full w-full rounded-full',
          online ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-600',
          withRing && 'ring-2 ring-white dark:ring-gray-900',
        )}
      />
    </span>
  );
};

export default PresenceDot;
