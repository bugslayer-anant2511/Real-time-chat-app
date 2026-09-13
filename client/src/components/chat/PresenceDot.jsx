import clsx from 'clsx';

const SIZE_MAP = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
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
          className="absolute inset-0 animate-ping rounded-full"
          style={{ background: 'rgba(74,222,128,0.45)' }}
        />
      ) : null}
      <span
        aria-hidden="true"
        className={clsx(
          'relative inline-block h-full w-full rounded-full',
          withRing && 'ring-2 ring-white dark:ring-[#16162a]',
          online ? 'bg-[#4ade80] shadow-[0_0_6px_1px_rgba(74,222,128,0.45)]' : 'bg-gray-300 dark:bg-[#4a4a6a]'
        )}
      />
    </span>
  );
};

export default PresenceDot;
