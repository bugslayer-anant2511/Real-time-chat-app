import { useId } from 'react';
import clsx from 'clsx';

const CharacterCounter = ({
  current = 0,
  max,
  id,
  className,
  showRemaining = false,
}) => {
  const generatedId = useId();
  const counterId = id ?? `char-counter-${generatedId}`;

  if (!max || max <= 0) return null;

  const safeCurrent = Math.max(0, Number(current) || 0);
  const ratio = safeCurrent / max;
  const isOverCap = safeCurrent >= max;
  const isNearCap = !isOverCap && ratio >= 0.8;

  const display = showRemaining
    ? `${Math.max(0, max - safeCurrent)} left`
    : `${safeCurrent}/${max}`;

  const announcement = `${safeCurrent} of ${max} characters`;

  return (
    <span
      id={counterId}
      aria-live="polite"
      className={clsx(
        'block text-right text-[11px] tabular-nums transition-colors',
        isOverCap
          ? 'font-medium text-red-600 dark:text-red-400'
          : isNearCap
            ? 'font-medium text-amber-600 dark:text-amber-400'
            : 'text-gray-400 dark:text-gray-500',
        className,
      )}
    >
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">{announcement}</span>
    </span>
  );
};

export default CharacterCounter;
