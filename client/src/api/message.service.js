import api from './axios.js';

export const getMessages = async (conversationId, { before, limit = 30 } = {}) => {
  const { data } = await api.get(`/conversations/${conversationId}/messages`, {
    params: { before, limit },
  });
  return data;
};

export const sendMessage = async (conversationId, payload) => {
  const { data } = await api.post(
    `/conversations/${conversationId}/messages`,
    payload,
  );
  return data;
};

export const editMessage = async (messageId, text) => {
  const { data } = await api.patch(`/messages/${messageId}`, { text });
  return data;
};

export const deleteMessage = async (
  messageId,
  { scope = 'self', hard = false } = {},
) => {
  const { data } = await api.delete(`/messages/${messageId}`, {
    params: hard ? { hard: 'true' } : undefined,
    data: { for: scope },
  });
  return data;
};

export const toggleReaction = async (messageId, emoji) => {
  const { data } = await api.post(`/messages/${messageId}/reactions`, { emoji });
  return data;
};

export const searchMessages = async (conversationId, q, { limit = 30 } = {}) => {
  const { data } = await api.get(
    `/conversations/${conversationId}/messages/search`,
    { params: { q, limit } },
  );
  return data;
};
