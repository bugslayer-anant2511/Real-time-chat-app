const URL_REGEX = /\bhttps?:\/\/[^\s<>"'`]+/gi;

const isSafeUrl = (raw) => {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const linkifyText = (text) => {
  if (typeof text !== 'string' || text.length === 0) return [];

  const tokens = [];
  let cursor = 0;
  URL_REGEX.lastIndex = 0;
  let match;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;

    let trimmed = raw;
    let trail = '';
    while (trimmed.length > 0 && /[.,;:!?)\]}'"]/.test(trimmed.slice(-1))) {
      trail = trimmed.slice(-1) + trail;
      trimmed = trimmed.slice(0, -1);
    }

    if (start > cursor) {
      tokens.push({ type: 'text', value: text.slice(cursor, start) });
    }

    if (isSafeUrl(trimmed)) {
      tokens.push({ type: 'link', href: trimmed, label: trimmed });
    } else {
      tokens.push({ type: 'text', value: trimmed });
    }

    if (trail) tokens.push({ type: 'text', value: trail });
    cursor = start + raw.length;
  }

  if (cursor < text.length) {
    tokens.push({ type: 'text', value: text.slice(cursor) });
  }

  return tokens;
};

export {
  isSameCalendarDay,
  formatDaySeparator,
  formatClockTime,
  formatLastSeen,
} from './formatDate.js';

export const groupConsecutiveBy = (messages, gapMs = 5 * 60 * 1000) => {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const result = messages.map((message) => ({
    message,
    isGroupStart: true,
    isGroupEnd: true,
  }));

  for (let i = 1; i < result.length; i += 1) {
    const prev = result[i - 1].message;
    const curr = result[i].message;
    if (!prev || !curr) continue;
    if (prev.type === 'system' || curr.type === 'system') continue;

    const sameSender =
      prev.sender?._id && curr.sender?._id &&
      String(prev.sender._id) === String(curr.sender._id);
    if (!sameSender) continue;

    const prevTime = new Date(prev.createdAt).getTime();
    const currTime = new Date(curr.createdAt).getTime();
    if (Number.isNaN(prevTime) || Number.isNaN(currTime)) continue;
    if (currTime - prevTime > gapMs) continue;

    result[i - 1].isGroupEnd = false;
    result[i].isGroupStart = false;
  }

  return result;
};
