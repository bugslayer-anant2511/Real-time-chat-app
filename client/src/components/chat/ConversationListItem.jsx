import { memo } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { BellOff, Image as ImageIcon, Users } from 'lucide-react';

import Avatar from '../common/Avatar.jsx';
import PresenceDot from './PresenceDot.jsx';
import UnreadBadge from './UnreadBadge.jsx';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

const buildPreview = (conversation) => {
  const last = conversation?.lastMessage;
  if (!last) return { text: 'New conversation', isSystem: false, isImage: false };

  if (last.type === 'system') {
    return { text: last.text || 'Conversation updated', isSystem: true, isImage: false };
  }

  if (!last.text && last.type === 'image') {
    return { text: 'Photo', isSystem: false, isImage: true };
  }

  return { text: last.text || '', isSystem: false, isImage: false };
};

const ConversationListItem = ({
  conversation,
  to,
  isActive,
  isMuted,
  otherParticipant,
  isGroup,
  isOnline,
  unreadCount,
  onClick,
  isPinned,
  onTogglePin,
}) => {
  const displayName = isGroup
    ? conversation.name || 'Untitled group'
    : otherParticipant?.displayName || otherParticipant?.username || 'Unknown user';

  const avatarSrc = isGroup ? conversation.avatarUrl : otherParticipant?.avatarUrl;
  const preview = buildPreview(conversation);
  const time = formatRelativeTime(conversation.updatedAt ?? conversation.lastMessage?.createdAt);
  const showPresenceDot = !isGroup && Boolean(otherParticipant) && isOnline;
  const hasUnread = Number(unreadCount) > 0;

  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={isActive ? 'true' : undefined}
      className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all duration-200"
      style={isActive
        ? {
            background: 'rgba(124,58,237,0.16)',
            borderLeft: '2px solid #7c3aed',
            paddingLeft: '8px',
          }
        : { borderLeft: '2px solid transparent' }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(124,58,237,0.08)'; } }}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = ''; } }}
    >
      <span className="relative shrink-0">
        <Avatar src={avatarSrc} name={displayName} size="md" />
        {showPresenceDot ? (
          <span className="absolute right-0 bottom-0">
            <PresenceDot online size="sm" />
          </span>
        ) : null}
        {isGroup ? (
          <span
            className="absolute -right-1 -bottom-1 inline-flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white dark:ring-[#16162a] bg-brand-50 dark:bg-[rgba(22,22,42,0.9)] text-brand-600 dark:text-[#a78bfa] border border-brand-200 dark:border-[rgba(124,58,237,0.30)]"
          >
            <Users className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        ) : null}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center justify-between gap-2">
          <span
            className={clsx(
              "truncate text-sm",
              hasUnread 
                ? "font-bold text-gray-900 dark:text-white" 
                : "font-medium text-gray-700 dark:text-[#c4c4e0]"
            )}
          >
            {displayName}
          </span>
          {time ? (
            <span
              className={clsx(
                "shrink-0 text-[11px] tabular-nums",
                hasUnread
                  ? "font-semibold text-brand-600 dark:text-[#a78bfa]"
                  : "font-normal text-gray-500 dark:text-[#6b6b8a]"
              )}
            >
              {time}
            </span>
          ) : null}
        </span>

        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span
            className={clsx(
              'flex min-w-0 items-center gap-1 truncate text-xs',
              preview.isSystem && 'italic',
              hasUnread ? "text-gray-900 dark:text-[#a0a0c0]" : "text-gray-500 dark:text-[#6b6b8a]"
            )}
          >
            {preview.isImage ? (
              <ImageIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : null}
            <span className="truncate">{preview.text}</span>
          </span>

          <span className="flex shrink-0 items-center gap-1">
            <button
              onClick={onTogglePin}
              className={clsx(
                "p-1 rounded-md transition-opacity duration-200",
                isPinned ? "opacity-100 text-indigo-400" : "opacity-0 group-hover:opacity-100 text-gray-500 hover:text-indigo-400"
              )}
              title={isPinned ? "Unpin conversation" : "Pin conversation"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22"></line>
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
              </svg>
            </button>
            {isMuted ? (
              <BellOff className="h-3.5 w-3.5 text-gray-500 dark:text-[#6b6b8a]" aria-label="Muted" />
            ) : null}
            {hasUnread ? <UnreadBadge count={unreadCount} /> : null}
          </span>
        </span>
      </span>
    </Link>
  );
};

export default memo(ConversationListItem);
