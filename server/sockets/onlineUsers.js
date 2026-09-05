const userSockets = new Map();

const toKey = (userId) => String(userId);

export const addUserSocket = (userId, socketId) => {
  const key = toKey(userId);
  let set = userSockets.get(key);
  if (!set) {
    set = new Set();
    userSockets.set(key, set);
  }
  set.add(socketId);
  return set.size;
};

export const removeUserSocket = (userId, socketId) => {
  const key = toKey(userId);
  const set = userSockets.get(key);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) {
    userSockets.delete(key);
    return 0;
  }
  return set.size;
};

export const getUserSocketIds = (userId) =>
  userSockets.get(toKey(userId)) ?? new Set();

export const isUserOnline = (userId) => userSockets.has(toKey(userId));

export const getOnlineUserIds = () => Array.from(userSockets.keys());

export const _resetOnlineUsers = () => {
  userSockets.clear();
};
