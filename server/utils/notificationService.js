import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { ApiError } from './apiError.js';
import {
  MESSAGE_TYPES,
  NOTIFICATION_TYPES,
  NOTIFICATION_TEXT_MAX_LENGTH,
  NOTIFICATION_COLLAPSE_WINDOW_MS,
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

const sanitizePlainSegment = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>&"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
};

const truncate = (value, max = NOTIFICATION_TEXT_MAX_LENGTH) => {
  if (typeof value !== 'string') return '';
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
};

export const buildMessageNotificationText = ({ message, fromUser }) => {
  const actor = sanitizePlainSegment(
    fromUser?.displayName || fromUser?.username || '',
    'Someone',
  );

  const type = message?.type;

  if (type === MESSAGE_TYPES.IMAGE) {
    return truncate(`${actor} sent a photo`);
  }

  if (type === MESSAGE_TYPES.SYSTEM) {
    return truncate(sanitizePlainSegment(message?.text || '', actor));
  }

  const preview = sanitizePlainSegment(message?.text || '', '');
  if (!preview) return truncate(`${actor} sent a message`);
  return truncate(`${actor}: ${preview}`);
};

export const persistMessageNotification = async ({
  recipientId,
  conversationId,
  messageId,
  actorId,
  message,
  fromUser,
}) => {
  const rid = toIdString(recipientId);
  const cid = toIdString(conversationId);
  const mid = toIdString(messageId);
  const aid = toIdString(actorId);

  if (!rid || !isValidObjectId(rid)) return null;
  if (!cid || !isValidObjectId(cid)) return null;
  if (!mid || !isValidObjectId(mid)) return null;

  const text = buildMessageNotificationText({ message, fromUser });
  if (!text) return null;

  const cutoff = new Date(Date.now() - NOTIFICATION_COLLAPSE_WINDOW_MS);

  const existing = await Notification.findOne({
    recipient: rid,
    conversationId: cid,
    type: NOTIFICATION_TYPES.MESSAGE,
    isRead: false,
    createdAt: { $gte: cutoff },
  })
    .sort({ createdAt: -1 })
    .select('_id');

  if (existing) {
    const updated = await Notification.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          text,
          messageId: new Types.ObjectId(mid),
          actor: aid ? new Types.ObjectId(aid) : null,
          createdAt: new Date(),
        },
      },
      { new: true },
    ).lean();
    return updated;
  }

  const created = await Notification.create({
    recipient: rid,
    type: NOTIFICATION_TYPES.MESSAGE,
    conversationId: cid,
    messageId: mid,
    actor: aid || null,
    text,
  });
  return created.toObject();
};

export const listNotifications = async ({ userId, page = 1, limit = 20 }) => {
  const uid = toIdString(userId);
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const skip = (safePage - 1) * safeLimit;

  const filter = { recipient: uid };

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate({ path: 'actor', select: '_id username displayName avatarUrl' })
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: uid, isRead: false }),
  ]);

  return { items, total, unreadCount, page: safePage, limit: safeLimit };
};

export const markNotificationRead = async ({ notificationId, userId }) => {
  const nid = toIdString(notificationId);
  const uid = toIdString(userId);

  if (!nid || !isValidObjectId(nid)) {
    throw ApiError.badRequest('Invalid notification id');
  }
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const updated = await Notification.findOneAndUpdate(
    { _id: nid, recipient: uid },
    { $set: { isRead: true } },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.notFound('Notification not found');
  return updated;
};

export const markAllNotificationsRead = async ({ userId }) => {
  const uid = toIdString(userId);
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const result = await Notification.updateMany(
    { recipient: uid, isRead: false },
    { $set: { isRead: true } },
  );

  return { modified: result.modifiedCount ?? 0 };
};

export const deleteNotification = async ({ notificationId, userId }) => {
  const nid = toIdString(notificationId);
  const uid = toIdString(userId);

  if (!nid || !isValidObjectId(nid)) {
    throw ApiError.badRequest('Invalid notification id');
  }
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const deleted = await Notification.findOneAndDelete({
    _id: nid,
    recipient: uid,
  }).lean();

  if (!deleted) throw ApiError.notFound('Notification not found');
  return { id: nid };
};

export const getUnreadNotificationCount = async ({ userId }) => {
  const uid = toIdString(userId);
  if (!uid || !isValidObjectId(uid)) {
    throw ApiError.badRequest('Invalid user id');
  }

  const count = await Notification.countDocuments({
    recipient: uid,
    isRead: false,
  });
  return count;
};

export const _internals = {
  toIdString,
  isValidObjectId,
  sanitizePlainSegment,
  truncate,
};
