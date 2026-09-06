import clsx from 'clsx';

const Skeleton = ({ className, rounded = 'md', as: As = 'span' }) => {
  const radius =
    rounded === 'full'
      ? 'rounded-full'
      : rounded === 'lg'
        ? 'rounded-lg'
        : rounded === 'none'
          ? ''
          : 'rounded-md';

  return (
    <As
      aria-hidden="true"
      className={clsx(
        'block animate-pulse bg-gray-200 dark:bg-gray-700/70',
        radius,
        className,
      )}
    />
  );
};

export default Skeleton;
