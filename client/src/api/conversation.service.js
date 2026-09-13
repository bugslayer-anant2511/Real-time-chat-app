import api from './axios.js';

export const getConversations = async ({ archived = false, page = 1, limit = 20 } = {}) => {
  const { data } = await api.get('/conversations', {
    params: { archived, page, limit },
  });
  return data;
};

export const getConversation = async (id) => {
  const { data } = await api.get(`/conversations/${id}`);
  return data;
};

export const createDirect = async (userId) => {
  const { data } = await api.post('/conversations/direct', { userId });
  return data;
};

export const createGroup = async (payload) => {
  const { data } = await api.post('/conversations/group', payload);
  return data;
};

export const updateGroup = async (id, payload) => {
  const { data } = await api.patch(`/conversations/${id}`, payload);
  return data;
};

export const addMembers = async (id, userIds) => {
  const { data } = await api.post(`/conversations/${id}/members`, { userIds });
  return data;
};

export const removeMember = async (id, userId) => {
  const { data } = await api.delete(`/conversations/${id}/members/${userId}`);
  return data;
};

export const promoteAdmin = async (id, userId, { promote = true } = {}) => {
  const { data } = promote
    ? await api.post(`/conversations/${id}/admins/${userId}`)
    : await api.delete(`/conversations/${id}/admins/${userId}`);
  return data;
};

export const toggleMute = async (id) => {
  const { data } = await api.post(`/conversations/${id}/mute`);
  return data;
};

export const toggleArchive = async (id) => {
  const { data } = await api.post(`/conversations/${id}/archive`);
  return data;
};

export const leaveOrDeleteConversation = async (id) => {
  const { data } = await api.delete(`/conversations/${id}`);
  return data;
};

export const markAsRead = async (id) => {
  const { data } = await api.post(`/conversations/${id}/read`);
  return data;
};

export const getUnreadSummary = async () => {
  const { data } = await api.get('/conversations/unread-summary');
  return data;
};

export const acceptFriendRequest = async (id) => {
  const { data } = await api.post(`/conversations/${id}/accept`);
  return data;
};

export const togglePinConversation = async (id) => {
  const { data } = await api.post(`/conversations/${id}/pin`);
  return data;
};
