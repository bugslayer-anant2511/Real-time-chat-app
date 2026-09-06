import clsx from 'clsx';

import Avatar from '../common/Avatar.jsx';

const formatTypers = (users) => {
  if (!Array.isArray(users) || users.length === 0) return '';
  const names = users
    .map((user) => user?.displayName || user?.username || 'Someone')
    .filter(Boolean);

  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} and ${others} other${others === 1 ? '' : 's'} are typing…`;
};

const TypingIndicator = ({ users = [], className }) => {
  if (!Array.isArray(users) || users.length === 0) return null;
  const label = formatTypers(users);
  const showAvatar = users.length === 1;

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx('flex items-end gap-2 px-2 py-1', className)}
    >
      {showAvatar ? (
        <Avatar
          src={users[0]?.avatarUrl}
          name={users[0]?.displayName || users[0]?.username || ''}
          size="xs"
        />
      ) : null}
      <span className="inline-flex items-center gap-1 rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        <span className="flex items-center gap-0.5" aria-hidden="true">
          <span
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500"
            style={{ animationDelay: '300ms' }}
          />
        </span>
        <span className="ml-1">{label}</span>
      </span>
    </div>
  );
};

export default TypingIndicator;
