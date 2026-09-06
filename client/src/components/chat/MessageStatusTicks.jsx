import clsx from 'clsx';
import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';

const STATUS_CLASSES = {
  pending: 'text-gray-300 dark:text-gray-500',
  sent: 'text-gray-400 dark:text-gray-500',
  partial: 'text-gray-400 dark:text-gray-500',
  read: 'text-brand-500 dark:text-brand-300',
  failed: 'text-red-500 dark:text-red-400',
};

const STATUS_LABELS = {
  pending: 'Sending',
  sent: 'Sent',
  partial: 'Read by some',
  read: 'Read',
  failed: 'Failed to send',
};

const ICONS = {
  pending: Clock,
  sent: Check,
  partial: Check,
  read: CheckCheck,
  failed: AlertCircle,
};

const MessageStatusTicks = ({ status = 'sent', tooltip = '', className }) => {
  const variant = STATUS_CLASSES[status] ? status : 'sent';
  const Icon = ICONS[variant] ?? Check;
  const label = tooltip || STATUS_LABELS[variant];

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={clsx('inline-flex shrink-0', STATUS_CLASSES[variant], className)}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
};

export default MessageStatusTicks;
