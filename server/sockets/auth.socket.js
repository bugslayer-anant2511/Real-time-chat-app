import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { USER_STATUS } from '../utils/constants.js';

const extractToken = (socket) => {
  const fromAuth = socket.handshake?.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.trim()) {
    return fromAuth.trim();
  }

  const header = socket.handshake?.headers?.authorization;
  if (typeof header === 'string') {
    const [scheme, token] = header.split(' ');
    if (scheme === 'Bearer' && token) return token.trim();
  }

  return null;
};

export const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = extractToken(socket);
    if (!token) return next(new Error('Unauthorized'));

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      return next(new Error('Unauthorized'));
    }

    if (!payload?.id) return next(new Error('Unauthorized'));

    const user = await User.findById(payload.id)
      .select('_id username displayName role status')
      .lean();

    if (!user) return next(new Error('Unauthorized'));
    if (user.status !== USER_STATUS.ACTIVE) {
      return next(new Error('Unauthorized'));
    }

    socket.user = {
      _id: String(user._id),
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };

    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
};

export default socketAuthMiddleware;
