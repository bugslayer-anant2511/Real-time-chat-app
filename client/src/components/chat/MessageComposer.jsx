import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import EmojiPicker, { EmojiStyle, Theme as EmojiTheme } from 'emoji-picker-react';
import { ImagePlus, Send, Smile, X } from 'lucide-react';

import Spinner from '../common/Spinner.jsx';
import Tooltip from '../common/Tooltip.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { usePreferences } from '../../contexts/PreferencesContext.jsx';
import { useSocket } from '../../contexts/SocketContext.jsx';
import { useOnClickOutside } from '../../hooks/useOnClickOutside.js';
import * as messageService from '../../api/message.service.js';
import { uploadMessageImage } from '../../api/upload.service.js';

const MAX_TEXT_LENGTH = 4000;
const MAX_IMAGE_MB = 5;
const MAX_TEXTAREA_ROWS = 6;
const TYPING_IDLE_MS = 3000;
const SEND_ACK_TIMEOUT_MS = 8000;
const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPT_ATTRIBUTE = ALLOWED_IMAGE_MIMES.join(',');

const generateTempId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const trimEnd = (value) => (typeof value === 'string' ? value.replace(/\s+$/, '') : '');

const isImageFile = (file) =>
  file && typeof file === 'object' && ALLOWED_IMAGE_MIMES.includes(file.type);

const onelinePreview = (text, max = 140) => {
  if (typeof text !== 'string' || text.length === 0) return '';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
};

const MessageComposer = ({
  conversationId,
  replyTo = null,
  onCancelReply,
  onOptimisticAdd,
  onOptimisticUpdate,
  onAfterSend,
  disabled = false,
  disabledReason = '',
  isBlocked = false,
  onUnblock = null,
}) => {
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const { isConnected, emit, socket } = useSocket();

  const enterToSend = preferences?.enterToSend !== false;
  const emojiTheme =
    preferences?.theme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT;

  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiContainerRef = useRef(null);

  const typingActiveRef = useRef(false);
  const typingTimerRef = useRef(null);

  const clearTypingTimer = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  const stopTyping = useCallback(() => {
    clearTypingTimer();
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    if (conversationId) {
      emit('typing:stop', { conversationId });
    }
  }, [clearTypingTimer, conversationId, emit]);

  const pingTyping = useCallback(() => {
    if (!conversationId || disabled) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      emit('typing:start', { conversationId });
    }
    clearTypingTimer();
    typingTimerRef.current = setTimeout(() => {
      stopTyping();
    }, TYPING_IDLE_MS);
  }, [clearTypingTimer, conversationId, disabled, emit, stopTyping]);

  useEffect(() => {
    setText('');
    setAttachment(null);
    setAttachmentPreview('');
    setIsEmojiOpen(false);
    setIsSending(false);
    setIsUploading(false);
    stopTyping();
  }, [conversationId]);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  useEffect(() => {
    if (!socket) {
      typingActiveRef.current = false;
      clearTypingTimer();
    }
  }, [socket, clearTypingTimer]);

  useEffect(() => {
    if (!attachment) {
      setAttachmentPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(attachment);
    setAttachmentPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 20;
    const maxHeight = lineHeight * MAX_TEXTAREA_ROWS;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [text, attachmentPreview, replyTo]);

  useOnClickOutside(
    emojiContainerRef,
    useCallback(() => {
      setIsEmojiOpen(false);
    }, []),
  );

  const trimmedText = useMemo(() => trimEnd(text), [text]);
  const hasText = trimmedText.length > 0;
  const hasAttachment = Boolean(attachment);
  const isOverLimit = trimmedText.length > MAX_TEXT_LENGTH;
  const canSend =
    !disabled &&
    !isSending &&
    !isUploading &&
    Boolean(conversationId) &&
    (hasText || hasAttachment) &&
    !isOverLimit;

  const handleEmojiSelect = useCallback(
    (emojiData) => {
      const insert = emojiData?.emoji ?? '';
      if (!insert) return;
      const el = textareaRef.current;
      const start = el?.selectionStart ?? text.length;
      const end = el?.selectionEnd ?? text.length;
      const next = `${text.slice(0, start)}${insert}${text.slice(end)}`;
      if (next.length > MAX_TEXT_LENGTH) {
        toast.error(`Message too long (max ${MAX_TEXT_LENGTH} characters).`);
        return;
      }
      setText(next);
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        const caret = start + insert.length;
        el.setSelectionRange(caret, caret);
      });
      pingTyping();
    },
    [pingTyping, text],
  );

  const handleAttachClick = useCallback(() => {
    if (disabled || isSending || isUploading) return;
    fileInputRef.current?.click();
  }, [disabled, isSending, isUploading]);

  const handleFileChange = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isImageFile(file)) {
      toast.error('Only JPG, PNG or WEBP images are allowed.');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast.error(`Image too large. Max ${MAX_IMAGE_MB} MB.`);
      return;
    }
    setAttachment(file);
    setIsEmojiOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const clearAttachment = useCallback(() => {
    setAttachment(null);
  }, []);

  const buildOptimisticMessage = useCallback(
    ({ clientTempId, type, body, imageUrl }) => {
      const senderProjection = user
        ? {
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl ?? '',
          }
        : null;
      return {
        _id: undefined,
        clientTempId,
        conversationId,
        type,
        text: body,
        imageUrl: imageUrl ?? '',
        sender: senderProjection,
        createdAt: new Date().toISOString(),
        replyTo: replyTo ?? null,
        reactions: [],
        readBy: [],
        editedAt: null,
        deletedFor: 'none',
        _pending: true,
        _failed: false,
      };
    },
    [conversationId, replyTo, user],
  );

  const sendOverSocket = useCallback(
    (payload) =>
      new Promise((resolve, reject) => {
        if (!socket || !isConnected) {
          reject(new Error('disconnected'));
          return;
        }
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('timeout'));
        }, SEND_ACK_TIMEOUT_MS);

        socket.emit('message:send', payload, (ack) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (ack && ack.success && ack.message) {
            resolve(ack.message);
          } else {
            reject(new Error(ack?.message || 'Send failed'));
          }
        });
      }),
    [isConnected, socket],
  );

  const sendOverRest = useCallback(
    async (payload) => {
      const result = await messageService.sendMessage(conversationId, payload);
      const wire = result?.data ?? result;
      if (!wire) throw new Error('Empty response from server');
      return wire;
    },
    [conversationId],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSend) return;

    const clientTempId = generateTempId();
    const trimmed = trimmedText;
    const replyToId = replyTo?._id ? String(replyTo._id) : null;

    setIsSending(true);
    setIsEmojiOpen(false);
    stopTyping();

    let optimistic = null;
    let imageUrl = '';
    let imagePublicId = '';

    try {
      if (hasAttachment) {
        setIsUploading(true);
        try {
          const uploaded = await uploadMessageImage(attachment);
          const data = uploaded?.data ?? uploaded;
          imageUrl = data?.url || '';
          imagePublicId = data?.publicId || '';
          if (!imageUrl) throw new Error('Upload did not return a URL');
        } finally {
          setIsUploading(false);
        }
      }

      const type = imageUrl ? 'image' : 'text';
      optimistic = buildOptimisticMessage({
        clientTempId,
        type,
        body: trimmed,
        imageUrl,
      });
      onOptimisticAdd?.(optimistic);

      setText('');
      setAttachment(null);
      onCancelReply?.();
      onAfterSend?.();

      const payload = {
        conversationId,
        type,
        text: trimmed,
        imageUrl,
        imagePublicId,
        replyTo: replyToId,
        clientTempId,
      };

      let serverMessage = null;
      try {
        serverMessage = await sendOverSocket(payload);
      } catch (socketErr) {
        const reason = socketErr?.message || '';
        const isRecoverable = reason === 'disconnected' || reason === 'timeout';
        if (!isRecoverable) throw socketErr;
        serverMessage = await sendOverRest(payload);
      }

      onOptimisticUpdate?.(clientTempId, {
        ...serverMessage,
        clientTempId,
        _pending: false,
        _failed: false,
      });
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to send message';
      toast.error(message);
      if (optimistic) {
        onOptimisticUpdate?.(clientTempId, {
          _pending: false,
          _failed: true,
        });
      }
    } finally {
      setIsSending(false);
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      if (!isMobile) {
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }
  }, [
    attachment,
    buildOptimisticMessage,
    canSend,
    conversationId,
    hasAttachment,
    onAfterSend,
    onCancelReply,
    onOptimisticAdd,
    onOptimisticUpdate,
    replyTo,
    sendOverRest,
    sendOverSocket,
    stopTyping,
    trimmedText,
  ]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key !== 'Enter') return;
      if (event.nativeEvent?.isComposing) return;

      if (enterToSend) {
        if (event.shiftKey) return;
        event.preventDefault();
        handleSubmit();
      } else if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [enterToSend, handleSubmit],
  );

  const handleTextChange = useCallback(
    (event) => {
      const value = event.target.value;
      if (value.length > MAX_TEXT_LENGTH * 1.1) {
        toast.error(`Message too long (max ${MAX_TEXT_LENGTH} characters).`);
        return;
      }
      setText(value);
      pingTyping();
    },
    [pingTyping],
  );

  const handlePaste = useCallback(
    (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file && isImageFile(file) && file.size <= MAX_IMAGE_MB * 1024 * 1024) {
            event.preventDefault();
            setAttachment(file);
            return;
          }
        }
      }
    },
    [],
  );

  if (isBlocked) {
    return (
      <div className="flex items-center justify-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
        <span>You have blocked this contact.</span>
        <button
          type="button"
          onClick={onUnblock}
          className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          Unblock
        </button>
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
        {disabledReason || 'You cannot send messages in this conversation.'}
      </div>
    );
  }

  const remaining = MAX_TEXT_LENGTH - trimmedText.length;
  const showCounter = trimmedText.length > MAX_TEXT_LENGTH * 0.8;

  const sendTooltipLabel = !isConnected
    ? 'Offline — will try to send over HTTP'
    : '';
  const sendVisuallyMuted = canSend && !isConnected;

  return (
    <div className="relative border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {replyTo ? (
        <div className="flex items-start gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/60">
          <span className="mt-0.5 inline-block h-full w-0.5 self-stretch rounded bg-brand-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-brand-600 dark:text-brand-300">
              Replying to {replyTo?.sender?.displayName || replyTo?.sender?.username || 'message'}
            </p>
            <p className="truncate text-xs text-gray-600 dark:text-gray-400">
              {onelinePreview(replyTo?.text) ||
                (replyTo?.type === 'image' ? '📷 Photo' : 'Message')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {attachmentPreview ? (
        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/60">
          <div className="relative">
            <img
              src={attachmentPreview}
              alt="Attachment preview"
              className="h-16 w-16 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-700"
            />
            {isUploading ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                <Spinner size="sm" />
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">
              {attachment?.name || 'Image'}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Add an optional caption below, then send.
            </p>
          </div>
          <button
            type="button"
            onClick={clearAttachment}
            disabled={isUploading || isSending}
            className="rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Remove attachment"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {isEmojiOpen ? (
        <div
          ref={emojiContainerRef}
          className="absolute bottom-full right-2 z-30 mb-2 overflow-hidden rounded-xl shadow-2xl"
        >
          <EmojiPicker
            onEmojiClick={handleEmojiSelect}
            theme={emojiTheme}
            emojiStyle={EmojiStyle.NATIVE}
            lazyLoadEmojis
            searchPlaceholder="Search emoji"
            previewConfig={{ showPreview: false }}
            width={320}
            height={380}
          />
        </div>
      ) : null}

      <form
        className="flex items-end gap-2 px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          onChange={handleFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        <Tooltip content="Attach image" position="top">
          <button
            type="button"
            onClick={handleAttachClick}
            disabled={isSending || isUploading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-brand-300"
            aria-label="Attach image"
          >
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
          </button>
        </Tooltip>

        <div className="flex min-w-0 flex-1 items-end gap-1 rounded-2xl bg-gray-100 px-3 py-1.5 dark:bg-gray-800">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={stopTyping}
            placeholder={hasAttachment ? 'Add a caption…' : 'Message…'}
            rows={1}
            maxLength={Math.floor(MAX_TEXT_LENGTH * 1.1)}
            aria-label="Message text"
            className="scrollbar-thin max-h-40 min-h-6 w-full resize-none border-0 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none dark:text-gray-100 dark:placeholder-gray-500"
            style={{ outline: 'none', boxShadow: 'none' }}
          />

          <Tooltip content="Choose emoji" position="top">
            <button
              type="button"
              onClick={() => setIsEmojiOpen((prev) => !prev)}
              disabled={isSending}
              className={clsx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                isEmojiOpen
                  ? 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300'
                  : 'text-gray-500 hover:bg-gray-200 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-brand-300',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
              aria-label="Insert emoji"
              aria-expanded={isEmojiOpen}
            >
              <Smile className="h-5 w-5" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>

        <Tooltip label={sendTooltipLabel} position="top">
          <button
            type="submit"
            disabled={!canSend}
            onMouseDown={(e) => e.preventDefault()}
            aria-disabled={!canSend || sendVisuallyMuted}
            className={clsx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all',
              !canSend
                ? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                : sendVisuallyMuted
                ? 'bg-amber-500/80 text-white shadow-sm hover:bg-amber-500 active:scale-95 dark:bg-amber-600/80 dark:hover:bg-amber-600'
                : 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:scale-95 dark:bg-brand-500 dark:hover:bg-brand-400',
            )}
            aria-label={
              sendVisuallyMuted ? 'Send message (offline)' : 'Send message'
            }
            title={sendVisuallyMuted ? 'Offline — will try to send over HTTP' : 'Send message'}
          >
            {isSending || isUploading ? (
              <Spinner size="sm" className="border-white/40 border-t-white" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </Tooltip>
      </form>

      {(showCounter || isOverLimit || !isConnected) ? (
        <div className="flex items-center justify-between gap-2 px-4 pb-1.5 text-[10px]">
          <span
            className={clsx(
              'truncate',
              isConnected ? 'text-gray-400 dark:text-gray-500' : 'text-amber-600 dark:text-amber-400',
            )}
          >
            {isConnected ? '' : 'Offline — message will be sent over HTTP.'}
          </span>
          {showCounter || isOverLimit ? (
            <span
              className={clsx(
                'tabular-nums',
                isOverLimit
                  ? 'font-medium text-red-600 dark:text-red-400'
                  : 'text-gray-400 dark:text-gray-500',
              )}
            >
              {remaining}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default memo(MessageComposer);
