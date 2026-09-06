const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export function formatRelativeTime(input, now = Date.now()) {
  if (!input) return '';

  const date = input instanceof Date ? input : new Date(input);
  const time = date.getTime();
  if (Number.isNaN(time)) return '';

  const diff = now - time;

  if (diff < ONE_MINUTE_MS) return 'now';
  if (diff < ONE_HOUR_MS) return `${Math.floor(diff / ONE_MINUTE_MS)}m`;
  if (diff < ONE_DAY_MS) return `${Math.floor(diff / ONE_HOUR_MS)}h`;

  if (diff < 7 * ONE_DAY_MS) return WEEKDAY_FORMATTER.format(date);

  const reference = new Date(now);
  if (date.getFullYear() === reference.getFullYear()) {
    return SHORT_DATE_FORMATTER.format(date);
  }
  return FULL_DATE_FORMATTER.format(date);
}

export default formatRelativeTime;
