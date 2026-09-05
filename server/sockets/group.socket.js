import { convRoom, userRoom } from './rooms.js';

const isValidIds = (ids) =>
  Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id.length > 0);

export const emitGroupCreated = (io, { conversation, memberIds }) => {
  if (!io || !conversation || !isValidIds(memberIds)) return;
  const conversationId = String(conversation._id);
  const room = convRoom(conversationId);

  for (const memberId of memberIds) {
    io.in(userRoom(memberId)).socketsJoin(room);
    io.to(userRoom(memberId)).emit('group:created', { conversation });
  }
};

export const emitGroupMemberAdded = (
  io,
  { conversation, addedUsers, addedUserIds, byUserId },
) => {
  if (!io || !conversation || !Array.isArray(addedUsers)) return;
  if (!isValidIds(addedUserIds)) return;

  const conversationId = String(conversation._id);
  const room = convRoom(conversationId);
  const actor = byUserId ? String(byUserId) : null;

  for (const newId of addedUserIds) {
    io.in(userRoom(newId)).socketsJoin(room);
    io.to(userRoom(newId)).emit('group:created', { conversation });
  }

  const exclusions = addedUserIds.map((id) => userRoom(id));
  for (const user of addedUsers) {
    if (!user) continue;
    io.to(room).except(exclusions).emit('group:memberAdded', {
      conversationId,
      user,
      byUserId: actor,
    });
  }
};

export const emitGroupMemberRemoved = (
  io,
  { conversationId, userId, byUserId, reason = 'removed' },
) => {
  if (!io || !conversationId || !userId) return;
  const cid = String(conversationId);
  const uid = String(userId);
  const room = convRoom(cid);

  io.in(userRoom(uid)).socketsLeave(room);

  io.to(room).emit('group:memberRemoved', {
    conversationId: cid,
    userId: uid,
    byUserId: byUserId ? String(byUserId) : null,
  });

  io.to(userRoom(uid)).emit('group:youWereRemoved', {
    conversationId: cid,
    byUserId: byUserId ? String(byUserId) : null,
    reason,
  });
};

export const emitGroupUpdated = (io, { conversationId, changes, byUserId }) => {
  if (!io || !conversationId || !changes || typeof changes !== 'object') return;
  const payload = {
    conversationId: String(conversationId),
    byUserId: byUserId ? String(byUserId) : null,
  };
  if (Object.prototype.hasOwnProperty.call(changes, 'name')) {
    payload.name = changes.name;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'avatarUrl')) {
    payload.avatarUrl = changes.avatarUrl;
  }
  io.to(convRoom(conversationId)).emit('group:updated', payload);
};

export const emitGroupAdminChanged = (
  io,
  { conversationId, userId, isAdmin, byUserId },
) => {
  if (!io || !conversationId || !userId) return;
  io.to(convRoom(conversationId)).emit('group:adminChanged', {
    conversationId: String(conversationId),
    userId: String(userId),
    isAdmin: Boolean(isAdmin),
    byUserId: byUserId ? String(byUserId) : null,
  });
};

export default {
  emitGroupCreated,
  emitGroupMemberAdded,
  emitGroupMemberRemoved,
  emitGroupUpdated,
  emitGroupAdminChanged,
};
