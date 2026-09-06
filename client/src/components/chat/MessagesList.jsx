import {
  forwardRef,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { ArrowDown, MessageCircle } from 'lucide-react';

import MessageBubble from './MessageBubble.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import EmptyState from '../common/EmptyState.jsx';
import Spinner from '../common/Spinner.jsx';
import MessagesListSkeleton from '../common/skeletons/MessagesListSkeleton.jsx';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll.js';
import { groupConsecutiveBy } from '../../utils/helpers.js';
import { formatDaySeparator, isSameCalendarDay } from '../../utils/formatDate.js';

const STICK_THRESHOLD = 100;

const idOf = (value) => (value && value._id ? String(value._id) : String(value ?? ''));

const computeReadSummary = (
  message,
  currentUserId,
  prefShowReceipts,
  recipientIdSet,
) => {
  if (message?._failed) return { status: 'failed', tooltip: '' };
  if (message?._pending) return { status: 'pending', tooltip: '' };

  const meId = String(currentUserId || '');
  const senderId = idOf(message?.sender);
  if (!meId || senderId !== meId) return { status: 'sent', tooltip: '' };
  if (!prefShowReceipts) return { status: 'sent', tooltip: '' };

  const totalRecipients = recipientIdSet?.size ?? 0;
  if (totalRecipients === 0) return { status: 'sent', tooltip: '' };

  const readers = Array.isArray(message?.readBy) ? message.readBy : [];
  let readCount = 0;
  const seen = new Set();
  for (const entry of readers) {
    const userId = idOf(entry?.user);
    if (!userId || userId === meId || seen.has(userId)) continue;
    if (recipientIdSet.has(userId)) {
      seen.add(userId);
      readCount += 1;
    }
  }

  if (readCount === 0) return { status: 'sent', tooltip: '' };
  if (readCount >= totalRecipients) return { status: 'read', tooltip: '' };
  return {
    status: 'partial',
    tooltip: `Read by ${readCount}/${totalRecipients}`,
  };
};

const MessagesList = forwardRef(
  (
    {
      messages = [],
      currentUserId,
      isGroup = false,
      isAdmin = false,
      participants = [],
      isLoadingInitial = false,
      isLoadingOlder = false,
      hasMore = false,
      onLoadOlder,
      typingUsers = [],
      showReadReceipts = true,
      highlightMessageId = null,
      onReply,
      onEdit,
      onDelete,
      onReact,
      onRetry,
    },
    ref,
  ) => {
    const containerRef = useRef(null);
    const isFirstRenderRef = useRef(true);
    const previousLastIdRef = useRef(null);
    const bubbleRefsMapRef = useRef(new Map());

    const setBubbleRef = useCallback((messageId, node) => {
      const map = bubbleRefsMapRef.current;
      if (!messageId) return;
      if (node) {
        map.set(messageId, node);
      } else {
        map.delete(messageId);
      }
    }, []);

    const [pendingNewCount, setPendingNewCount] = useState(0);
    const [isAtBottom, setIsAtBottom] = useState(true);

    const sentinelRef = useInfiniteScroll(
      useCallback(async () => {
        if (typeof onLoadOlder !== 'function') return;
        const el = containerRef.current;
        if (!el) {
          await onLoadOlder();
          return;
        }
        const distanceFromBottom = el.scrollHeight - el.scrollTop;
        await onLoadOlder();
        requestAnimationFrame(() => {
          if (!el.isConnected) return;
          el.scrollTop = el.scrollHeight - distanceFromBottom;
        });
      }, [onLoadOlder]),
      { hasMore: hasMore && messages.length > 0, rootMargin: '120px' },
    );

    const measureBottom = useCallback(() => {
      const el = containerRef.current;
      if (!el) return true;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      return distance <= STICK_THRESHOLD;
    }, []);

    const handleScroll = useCallback(() => {
      const nearBottom = measureBottom();
      setIsAtBottom(nearBottom);
      if (nearBottom && pendingNewCount > 0) {
        setPendingNewCount(0);
      }
    }, [measureBottom, pendingNewCount]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const last = messages[messages.length - 1] ?? null;
      const lastId = idOf(last);
      const previousLastId = previousLastIdRef.current;

      if (isFirstRenderRef.current) {
        if (lastId) {
          el.scrollTop = el.scrollHeight;
          previousLastIdRef.current = lastId;
          isFirstRenderRef.current = false;
        }
        return;
      }

      if (lastId === previousLastId) return;

      const isOwn =
        last && currentUserId && idOf(last.sender) === String(currentUserId);
      const wasNearBottom = measureBottom();

      if (isOwn || wasNearBottom) {
        requestAnimationFrame(() => {
          if (!el.isConnected) return;
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
        setPendingNewCount(0);
      } else {
        setPendingNewCount((prev) => prev + 1);
      }

      previousLastIdRef.current = lastId;
    }, [messages, currentUserId, measureBottom]);

    useEffect(() => {
      isFirstRenderRef.current = true;
      previousLastIdRef.current = null;
      setPendingNewCount(0);
    }, []);

    useEffect(() => {
      if (!highlightMessageId) return;
      const node = bubbleRefsMapRef.current.get(String(highlightMessageId));
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [highlightMessageId]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom: ({ behavior = 'smooth' } = {}) => {
          const el = containerRef.current;
          if (!el) return;
          el.scrollTo({ top: el.scrollHeight, behavior });
          setPendingNewCount(0);
        },
        isNearBottom: () => measureBottom(),
      }),
      [measureBottom],
    );

    const grouped = useMemo(() => groupConsecutiveBy(messages), [messages]);

    const recipientIdSet = useMemo(() => {
      const meId = String(currentUserId || '');
      const set = new Set();
      for (const participant of participants ?? []) {
        const id = idOf(participant);
        if (!id || id === meId) continue;
        set.add(id);
      }
      return set;
    }, [participants, currentUserId]);

    const handlePillClick = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setPendingNewCount(0);
    }, []);

    if (isLoadingInitial && messages.length === 0) {
      return (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-gray-50 dark:bg-gray-950">
          <MessagesListSkeleton />
        </div>
      );
    }

    const showEmptyState = !isLoadingInitial && messages.length === 0;

    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="scrollbar-thin flex-1 overflow-y-auto bg-gray-50 px-2 py-3 dark:bg-gray-950"
        >
          {showEmptyState ? (
            <div className="flex h-full items-center justify-center px-4 py-8">
              <EmptyState
                icon={MessageCircle}
                title="No messages yet"
                description="Say hi to break the ice — your first message starts the conversation."
                className="border-transparent bg-transparent dark:border-transparent"
              />
            </div>
          ) : null}
          {hasMore ? (
            <div ref={sentinelRef} className="flex h-8 items-center justify-center">
              {isLoadingOlder ? <Spinner size="sm" /> : null}
            </div>
          ) : messages.length > 0 ? (
            <p className="px-3 py-2 text-center text-[11px] text-gray-400 dark:text-gray-500">
              Beginning of conversation
            </p>
          ) : null}

          <ul className="flex flex-col gap-1.5">
            {grouped.map(({ message, isGroupStart, isGroupEnd }, index) => {
              const previousMessage = index > 0 ? grouped[index - 1].message : null;
              const showDaySeparator =
                !previousMessage ||
                !isSameCalendarDay(previousMessage.createdAt, message.createdAt);

              const isOwn =
                currentUserId && idOf(message.sender) === String(currentUserId);
              const { status: tickStatus, tooltip: tickTooltip } = isOwn
                ? computeReadSummary(
                    message,
                    currentUserId,
                    showReadReceipts,
                    recipientIdSet,
                  )
                : { status: 'sent', tooltip: '' };

              return (
                <Fragment key={message._id || message.clientTempId || index}>
                  {showDaySeparator ? (
                    <li className="flex justify-center py-2" aria-hidden="false">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-gray-500 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-800">
                        {formatDaySeparator(message.createdAt)}
                      </span>
                    </li>
                  ) : null}

                  <li
                    ref={(node) => setBubbleRef(message._id, node)}
                    className={clsx(
                      isGroupStart ? 'mt-1.5' : 'mt-0.5',
                      isGroupEnd ? 'mb-1' : 'mb-0',
                      'scroll-mt-4 scroll-mb-4',
                    )}
                  >
                    <MessageBubble
                      message={message}
                      isOwn={isOwn}
                      isGroup={isGroup}
                      isAdmin={isAdmin}
                      currentUserId={currentUserId}
                      showAvatar={!isOwn && isGroupEnd}
                      showName={!isOwn && isGroupStart}
                      tickStatus={tickStatus}
                      tickTooltip={tickTooltip}
                      isHighlighted={
                        highlightMessageId &&
                        String(message._id) === String(highlightMessageId)
                      }
                      onReply={onReply}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onReact={onReact}
                      onRetry={onRetry}
                    />
                  </li>
                </Fragment>
              );
            })}
          </ul>

          {typingUsers.length > 0 ? (
            <div className="mt-2">
              <TypingIndicator users={typingUsers} />
            </div>
          ) : null}
        </div>

        {!isAtBottom && pendingNewCount > 0 ? (
          <button
            type="button"
            onClick={handlePillClick}
            className="absolute right-4 bottom-4 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition-transform hover:scale-105 dark:bg-brand-500"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {pendingNewCount} new message{pendingNewCount === 1 ? '' : 's'}
            </span>
          </button>
        ) : null}
      </div>
    );
  },
);

MessagesList.displayName = 'MessagesList';

export default memo(MessagesList);
