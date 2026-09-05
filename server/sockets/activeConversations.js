const viewers = new Map();

const key = (conversationId, userId) => `${conversationId}:${userId}`;

export const addActiveViewer = (conversationId, userId) => {
  const k = key(String(conversationId), String(userId));
  const current = viewers.get(k) ?? 0;
  const next = current + 1;
  viewers.set(k, next);
  return next;
};

export const removeActiveViewer = (conversationId, userId) => {
  const k = key(String(conversationId), String(userId));
  const current = viewers.get(k) ?? 0;
  if (current <= 1) {
    viewers.delete(k);
    return 0;
  }
  const next = current - 1;
  viewers.set(k, next);
  return next;
};

export const isUserActiveInConversation = (conversationId, userId) =>
  (viewers.get(key(String(conversationId), String(userId))) ?? 0) > 0;

export const clearActiveForSocket = (socket) => {
  const userId = socket?.user?._id;
  const activeId = socket?.data?.activeConversationId;
  if (!userId || !activeId) return;
  removeActiveViewer(activeId, userId);
  socket.data.activeConversationId = null;
};

export const _resetActiveConversations = () => {
  viewers.clear();
};
