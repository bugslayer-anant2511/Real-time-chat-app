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
      className={clsx('flex items-end gap-2 px-3 py-1', className)}
    >
      {showAvatar ? (
        <Avatar
          src={users[0]?.avatarUrl}
          name={users[0]?.displayName || users[0]?.username || ''}
          size="xs"
        />
      ) : null}
      <span
        className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs"
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(124,58,237,0.20)',
          color: '#9090b8',
        }}
      >
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="ww-typing-dot" />
          <span className="ww-typing-dot" />
          <span className="ww-typing-dot" />
        </span>
        <span className="ml-0.5">{label}</span>
      </span>
    </div>
  );
};

export default TypingIndicator;
