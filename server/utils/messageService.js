import mongoose from 'mongoose';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { ApiError } from './apiError.js';
import { assertParticipant, resetUnread } from './conversationService.js';
import { escapeRegex } from './escapeRegex.js';
import { isAllowedCloudinaryUrl } from '../config/cloudinary.js';
import {
  CONVERSATION_TYPES,
  MESSAGE_TYPES,
  MESSAGE_DELETED_FOR,
  MESSAGE_TEXT_MAX_LENGTH,
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MS,
  REACTION_EMOJI_MAX_LENGTH,
  ROLES,
} from './constants.js';

const { Types } = mongoose;

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (value._id) return value._id.toString();
  return null;
};

const isValidObjectId = (value) =>
  typeof value === 'string' &&
  Types.ObjectId.isValid(value) &&
  /^[a-f0-9]{24}$/i.test(value);

const SENDER_PROJECTION = '_id username displayName avatarUrl';
const REPLY_PROJECTION = '_id type text imageUrl deletedFor sender createdAt';

const MESSAGE_POPULATE = [
  { path: 'sender', select: SENDER_PROJECTION },
  {
    path: 'replyTo',
    select: REPLY_PROJECTION,
    populate: { path: 'sender', select: SENDER_PROJECTION },
  },
];

const sanitizePlainSegment = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>&"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
};

export const buildSystemMessageText = (template, vars = {}) => {
  if (typeof template !== 'string') return '';
  const out = template.replace(/\{(\w+)\}/g, (_match, key) =>
    sanitizePlainSegment(vars[key], ''),
  );
  return out.slice(0, MESSAGE_TEXT_MAX_LENGTH);
};

export const createSystemMessage = async ({ conversationId, text }) => {
  const cid = toIdString(conversationId);
  if (!cid || !isValidObjectId(cid)) {
    throw ApiError.badRequest('Invalid conversation id');
  }

  const safeText = sanitizePlainSegment(text);
  if (!safeText) {
    throw ApiError.badRequest('System message text is required');
  }

  return Message.create({
    conversationId: cid,
    sender: null,
    type: MESSAGE_TYPES.SYSTEM,
    text: safeText.slice(0, MESSAGE_TEXT_MAX_LENGTH),
  });
};

const getDirectBlockState = async ({ conversation, viewerId }) => {
  if (!conversation || conversation.type !== CONVERSATION_TYPES.DIRECT) {
    return { otherId: null, cutoffAt: null, viewerBlocked: false, theyBlocked: false };
  }

  const vid = toIdString(viewerId);
  const otherRaw = (conversation.participants || []).find(
    (p) => toIdString(p) !== vid,
  );
  const otherId = toIdString(otherRaw);
  if (!otherId) {
    return { otherId: null, cutoffAt: null, viewerBlocked: false, theyBlocked: false };
  }

  const [me, them] = await Promise.all([
    User.findById(vid).select('blockedUsers').lean(),
    User.findById(otherId).select('blockedUsers').lean(),
  ]);

  const myBlock = (me?.blockedUsers || []).find(
    (entry) => String(entry?.user) === otherId,
  );
  const theirBlock = (them?.blockedUsers || []).find(
    (entry) => String(entry?.user) === vid,
  );

  let cutoffAt = null;
  if (myBlock?.blockedAt) cutoffAt = new Date(myBlock.blockedAt);
  if (theirBlock?.blockedAt) {
    const t = new Date(theirBlock.blockedAt);
    if (!cutoffAt || t < cutoffAt) cutoffAt = t;
  }

  return {
    otherId,
    cutoffAt,
    viewerBlocked: Boolean(myBlock),
    theyBlocked: Boolean(theirBlock),
  };
};

export const createMessage = async ({
  conversationId,
  senderId,
  type = MESSAGE_TYPES.TEXT,
  text = '',
  imageUrl = '',
  imagePublicId = '',
  replyTo = null,
}) => {
  const cid = toIdString(conversationId);
  const sid = toIdString(senderId);

  if (!cid || !isValidObjectId(cid)) {
    throw ApiError.badRequest('Invalid conversation id');
  }
  if (!sid || !isValidObjectId(sid)) {
    throw ApiError.badRequest('Invalid sender id');
  }

  if (!Object.values(MESSAGE_TYPES).includes(type)) {
    throw ApiError.badRequest('Invalid message type');
  }
  if (type === MESSAGE_TYPES.SYSTEM) {
    throw ApiError.forbidden('System messages cannot be created via this API');
  }

  const conversation = await Conversation.findById(cid);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  assertParticipant(conversation, sid);

  if (conversation.type === CONVERSATION_TYPES.DIRECT) {
    const { viewerBlocked, theyBlocked } = await getDirectBlockState({
      conversation,
      viewerId: sid,
    });
    if (viewerBlocked) {
      throw ApiError.forbidden('You have blocked this user');
    }
    if (theyBlocked) {
      throw ApiError.forbidden('You can no longer message this user');
    }
  }

  const payload = {
    conversationId: cid,
    sender: sid,
    type,
    replyTo: null,
  };

  if (type === MESSAGE_TYPES.TEXT) {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (trimmed.length === 0) {
      throw ApiError.badRequest('Text message cannot be empty');
    }
    if (trimmed.length > MESSAGE_TEXT_MAX_LENGTH) {
      throw ApiError.badRequest(
        `Text message must be at most ${MESSAGE_TEXT_MAX_LENGTH} characters`,
      );
    }
    payload.text = trimmed;
  }

  if (type === MESSAGE_TYPES.IMAGE) {
    if (!isAllowedCloudinaryUrl(imageUrl)) {
      throw ApiError.badRequest('Invalid image url');
    }
    payload.imageUrl = imageUrl;
    payload.imagePublicId =
      typeof imagePublicId === 'string' ? imagePublicId : '';
  }

  if (replyTo) {
    const rid = toIdString(replyTo);
    if (!rid || !isValidObjectId(rid)) {
      throw ApiError.badRequest('Invalid replyTo id');
    }
    const parent = await Message.findById(rid).select('conversationId');
    if (!parent || parent.conversationId.toString() !== cid) {
      throw ApiError.badRequest('replyTo must reference a message in the same conversation');
    }
    payload.replyTo = rid;
  }

  const message = await Message.create(payload);
  return message.populate(MESSAGE_POPULATE);
};

export const markConversationAsRead = async ({ conversationId, userId }) => {
  const cid = toIdString(conversationId);
  const uid = toIdString(userId);

  if (!cid || !isValidObjectId(cid)) {
    throw ApiError.badRequest('Invalid conversation id');
  }
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const conversation = await Conversation.findById(cid).select('participants');
  if (!conversation) throw ApiError.notFound('Conversation not found');
  assertParticipant(conversation, uid);

  const result = await Message.updateMany(
    {
      conversationId: cid,
      sender: { $ne: new Types.ObjectId(uid) },
      'readBy.user': { $ne: new Types.ObjectId(uid) },
    },
    { $push: { readBy: { user: uid, at: new Date() } } },
  );

  await resetUnread(cid, uid);

  return { matched: result.matchedCount ?? 0, modified: result.modifiedCount ?? 0 };
};

export const assertCanModifyMessage = (
  message,
  actor,
  { action = 'edit' } = {},
) => {
  if (!message) throw ApiError.notFound('Message not found');
  if (!actor) throw ApiError.unauthorized('Unauthenticated');

  const actorId = toIdString(actor);
  if (!actorId) throw ApiError.unauthorized('Unauthenticated');

  const senderId = toIdString(message.sender);
  const isAdmin = actor.role === ROLES.ADMIN;

  if (message.deletedFor === MESSAGE_DELETED_FOR.EVERYONE) {
    throw ApiError.badRequest('Message has already been deleted');
  }

  switch (action) {
    case 'edit': {
      if (senderId !== actorId) {
        throw ApiError.forbidden('Only the sender can edit this message');
      }
      if (message.type !== MESSAGE_TYPES.TEXT) {
        throw ApiError.badRequest('Only text messages can be edited');
      }
      const ageMs = Date.now() - new Date(message.createdAt).getTime();
      if (ageMs > MESSAGE_EDIT_WINDOW_MS) {
        throw ApiError.forbidden('Edit window has expired');
      }
      return;
    }

    case 'deleteForEveryone': {
      if (isAdmin) return;
      if (senderId !== actorId) {
        throw ApiError.forbidden(
          'Only the sender can delete this message for everyone',
        );
      }
      const ageMs = Date.now() - new Date(message.createdAt).getTime();
      if (ageMs > MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MS) {
        throw ApiError.forbidden('Delete-for-everyone window has expired');
      }
      return;
    }

    case 'deleteForSelf':
      return;

    default:
      throw ApiError.badRequest('Unknown modify action');
  }
};

export const listMessages = async ({
  conversationId,
  userId,
  before = null,
  limit = 30,
}) => {
  const cid = toIdString(conversationId);
  const uid = toIdString(userId);

  if (!cid || !isValidObjectId(cid)) {
    throw ApiError.badRequest('Invalid conversation id');
  }
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const conversation = await Conversation.findById(cid).select(
    'participants type',
  );
  assertParticipant(conversation, uid);

  const filter = {
    conversationId: cid,
    hiddenFor: { $ne: new Types.ObjectId(uid) },
  };

  if (conversation.type === CONVERSATION_TYPES.DIRECT) {
    const { otherId, cutoffAt } = await getDirectBlockState({
      conversation,
      viewerId: uid,
    });
    if (otherId && cutoffAt) {
      filter.$nor = (filter.$nor || []).concat({
        sender: new Types.ObjectId(otherId),
        createdAt: { $gt: cutoffAt },
      });
    }
  }

  if (before) {
    const bid = toIdString(before);
    if (!bid || !isValidObjectId(bid)) {
      throw ApiError.badRequest('Invalid cursor');
    }
    filter._id = { $lt: new Types.ObjectId(bid) };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 50);

  const docs = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(safeLimit + 1)
    .populate(MESSAGE_POPULATE);

  const hasMore = docs.length > safeLimit;
  const sliced = hasMore ? docs.slice(0, safeLimit) : docs;
  const nextCursor = hasMore ? sliced[sliced.length - 1]._id.toString() : null;

  const items = sliced.reverse();

  return { items, hasMore, nextCursor };
};

export const editMessage = async ({ messageId, actor, text }) => {
  const mid = toIdString(messageId);
  if (!mid || !isValidObjectId(mid)) {
    throw ApiError.badRequest('Invalid message id');
  }

  const message = await Message.findById(mid);
  if (!message) throw ApiError.notFound('Message not found');

  const conversation = await Conversation.findById(message.conversationId).select(
    'participants',
  );
  assertParticipant(conversation, actor?._id);

  assertCanModifyMessage(message, actor, { action: 'edit' });

  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed.length === 0) {
    throw ApiError.badRequest('Text message cannot be empty');
  }
  if (trimmed.length > MESSAGE_TEXT_MAX_LENGTH) {
    throw ApiError.badRequest(
      `Text message must be at most ${MESSAGE_TEXT_MAX_LENGTH} characters`,
    );
  }

  message.text = trimmed;
  message.editedAt = new Date();
  await message.save();

  return message.populate(MESSAGE_POPULATE);
};

const refreshLastMessageIfLatest = async (message) => {
  const cid = message.conversationId;
  const latest = await Message.findOne({ conversationId: cid })
    .sort({ createdAt: -1, _id: -1 })
    .select('_id type text imageUrl sender createdAt deletedFor')
    .lean();
  if (!latest || String(latest._id) !== String(message._id)) return;

  let text = '';
  if (latest.deletedFor === MESSAGE_DELETED_FOR.EVERYONE) {
    text = '';
  } else if (latest.type === MESSAGE_TYPES.IMAGE) {
    text = '[image]';
  } else {
    text = latest.text || '';
  }

  await Conversation.findByIdAndUpdate(cid, {
    $set: {
      lastMessage: {
        text,
        sender: latest.sender ?? null,
        type: latest.type,
        createdAt: latest.createdAt,
      },
    },
  });
};

export const deleteMessage = async ({ messageId, actor, scope }) => {
  if (scope !== 'self' && scope !== 'everyone') {
    throw ApiError.badRequest("scope must be 'self' or 'everyone'");
  }
  const mid = toIdString(messageId);
  if (!mid || !isValidObjectId(mid)) {
    throw ApiError.badRequest('Invalid message id');
  }

  const message = await Message.findById(mid);
  if (!message) throw ApiError.notFound('Message not found');

  const conversation = await Conversation.findById(message.conversationId).select(
    'participants',
  );
  assertParticipant(conversation, actor?._id);

  if (scope === 'self') {
    assertCanModifyMessage(message, actor, { action: 'deleteForSelf' });
    const actorId = toIdString(actor._id);
    const already = (message.hiddenFor || []).some(
      (id) => toIdString(id) === actorId,
    );
    if (!already) {
      message.hiddenFor.push(new Types.ObjectId(actorId));
      await message.save();
    }
    return { scope: 'self', message };
  }

  assertCanModifyMessage(message, actor, { action: 'deleteForEveryone' });
  const previousImagePublicId = message.imagePublicId || '';
  message.deletedFor = MESSAGE_DELETED_FOR.EVERYONE;
  message.imagePublicId = '';
  await message.save();

  await refreshLastMessageIfLatest(message);

  return {
    scope: 'everyone',
    message: await message.populate(MESSAGE_POPULATE),
    imagePublicId: previousImagePublicId,
  };
};

export const toggleReaction = async ({ messageId, actor, emoji }) => {
  const mid = toIdString(messageId);
  if (!mid || !isValidObjectId(mid)) {
    throw ApiError.badRequest('Invalid message id');
  }
  const trimmed = typeof emoji === 'string' ? emoji.trim() : '';
  if (trimmed.length === 0) {
    throw ApiError.badRequest('emoji is required');
  }
  if ([...trimmed].length > REACTION_EMOJI_MAX_LENGTH) {
    throw ApiError.badRequest(
      `emoji must be at most ${REACTION_EMOJI_MAX_LENGTH} characters`,
    );
  }

  const message = await Message.findById(mid);
  if (!message) throw ApiError.notFound('Message not found');
  if (message.deletedFor === MESSAGE_DELETED_FOR.EVERYONE) {
    throw ApiError.badRequest('Cannot react to a deleted message');
  }

  const conversation = await Conversation.findById(message.conversationId).select(
    'participants',
  );
  assertParticipant(conversation, actor?._id);

  const actorId = toIdString(actor._id);
  const existingIdx = message.reactions.findIndex(
    (r) => toIdString(r.user) === actorId,
  );

  let action;
  if (existingIdx === -1) {
    message.reactions.push({ user: new Types.ObjectId(actorId), emoji: trimmed });
    action = 'added';
  } else if (message.reactions[existingIdx].emoji === trimmed) {
    message.reactions.splice(existingIdx, 1);
    action = 'removed';
  } else {
    message.reactions[existingIdx].emoji = trimmed;
    action = 'replaced';
  }

  await message.save();
  await message.populate(MESSAGE_POPULATE);

  return { action, message };
};

export const searchMessages = async ({
  conversationId,
  userId,
  q,
  limit = 30,
}) => {
  const cid = toIdString(conversationId);
  const uid = toIdString(userId);

  if (!cid || !isValidObjectId(cid)) {
    throw ApiError.badRequest('Invalid conversation id');
  }
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const term = typeof q === 'string' ? q.trim() : '';
  if (term.length < 2 || term.length > 100) {
    throw ApiError.badRequest('Search term must be 2–100 characters');
  }

  const conversation = await Conversation.findById(cid).select(
    'participants type',
  );
  assertParticipant(conversation, uid);

  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 50);
  const safe = escapeRegex(term);

  const filter = {
    conversationId: cid,
    type: MESSAGE_TYPES.TEXT,
    text: { $regex: safe, $options: 'i' },
    deletedFor: { $ne: MESSAGE_DELETED_FOR.EVERYONE },
    hiddenFor: { $ne: new Types.ObjectId(uid) },
  };

  if (conversation.type === CONVERSATION_TYPES.DIRECT) {
    const { otherId, cutoffAt } = await getDirectBlockState({
      conversation,
      viewerId: uid,
    });
    if (otherId && cutoffAt) {
      filter.$nor = (filter.$nor || []).concat({
        sender: new Types.ObjectId(otherId),
        createdAt: { $gt: cutoffAt },
      });
    }
  }

  const items = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .populate(MESSAGE_POPULATE);

  return { items, total: items.length };
};

export const _internals = {
  toIdString,
  isValidObjectId,
  isAllowedCloudinaryUrl,
  buildLastMessageSnapshotFields: SENDER_PROJECTION,
};
