import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { isUserOnline } from './onlineUsers.js';
import { userRoom } from './rooms.js';

const { Types } = mongoose;

const PRESENCE_LIST_MAX_IDS = 200;

const isValidObjectId = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{24}$/i.test(value) &&
  Types.ObjectId.isValid(value);

const sanitizeIdList = (raw) => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  for (const value of raw) {
    if (seen.size >= PRESENCE_LIST_MAX_IDS) break;
    if (typeof value !== 'string') continue;
    if (!isValidObjectId(value)) continue;
    seen.add(value);
  }
  return Array.from(seen);
};

export const getShowOnlineStatus = async (userId) => {
  const doc = await User.findById(userId)
    .select('preferences.showOnlineStatus')
    .lean();
  return doc?.preferences?.showOnlineStatus !== false;
};

export const broadcastUserOnline = (
  io,
  userId,
  roomNames,
  showOnlineStatus,
) => {
  if (!showOnlineStatus || roomNames.length === 0) return;
  for (const name of roomNames) {
    io.to(name).except(userRoom(userId)).emit('userOnline', { userId });
  }
};

export const broadcastUserOffline = (
  io,
  userId,
  roomNames,
  lastSeenAt,
  showOnlineStatus,
) => {
  if (!showOnlineStatus || roomNames.length === 0) return;
  for (const name of roomNames) {
    io.to(name).emit('userOffline', { userId, lastSeenAt });
  }
};

export const registerPresenceHandlers = (io, socket) => {
  socket.on('presence:list', async (payload, ack) => {
    const respond = typeof ack === 'function' ? ack : () => {};

    try {
      const ids = sanitizeIdList(payload?.userIds);
      if (ids.length === 0) {
        return respond({ success: true, presence: {} });
      }

      const docs = await User.find(
        { _id: { $in: ids } },
        'preferences.showOnlineStatus',
      ).lean();

      const allowsBroadcast = new Map();
      for (const doc of docs) {
        allowsBroadcast.set(
          String(doc._id),
          doc?.preferences?.showOnlineStatus !== false,
        );
      }

      const presence = {};
      for (const id of ids) {
        if (!allowsBroadcast.get(id)) {
          presence[id] = false;
          continue;
        }
        presence[id] = isUserOnline(id);
      }

      return respond({ success: true, presence });
    } catch {
      return respond({ success: false, message: 'presence:list failed' });
    }
  });
};

export default registerPresenceHandlers;

export const _internals = { sanitizeIdList, isValidObjectId };
