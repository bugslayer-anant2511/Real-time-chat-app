import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateToken } from '../utils/generateToken.js';
import { detachUserFromConversations } from '../utils/conversationService.js';
import { ROLES, USER_STATUS, DELETED_USER_LABEL } from '../utils/constants.js';

const sanitizeUser = (userDoc) => {
  const obj = userDoc.toObject({ virtuals: true, versionKey: false });
  delete obj.password;
  return obj;
};

// POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const { username, email, password, displayName } = req.body;

  const conflict = await User.findOne({ $or: [{ email }, { username }] }).lean();
  if (conflict) {
    throw ApiError.conflict('Email or username is already in use');
  }

  const user = await User.create({
    username,
    email,
    password,
    displayName,
    role: ROLES.USER,
  });

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    message: 'Account created',
    data: { user: sanitizeUser(user), token },
  });
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const identifier = String(email || '').trim().toLowerCase();
  const user = await User.findOne({
    $or: [
      { email: identifier },
      { username: identifier },
    ],
  }).select('+password');
  const passwordOk = user ? await user.comparePassword(password) : false;

  if (!user || !passwordOk) {
    throw ApiError.unauthorized('Invalid email, username or password');
  }

  if (user.status === USER_STATUS.SUSPENDED) {
    throw ApiError.forbidden('Account is suspended');
  }
  if (user.status === USER_STATUS.DELETED) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    message: 'Logged in',
    data: { user: sanitizeUser(user), token },
  });
});

// GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: { user: sanitizeUser(req.user) },
  });
});

// PATCH /api/auth/profile
export const updateProfile = asyncHandler(async (req, res) => {
  const ALLOWED = ['displayName', 'bio', 'avatarUrl', 'avatarPublicId'];
  const updates = {};
  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      updates[key] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw ApiError.badRequest('No valid fields provided to update');
  }

  Object.assign(req.user, updates);
  await req.user.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated',
    data: { user: sanitizeUser(req.user) },
  });
});

// PATCH /api/auth/password
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw ApiError.unauthorized('User no longer exists');

  const ok = await user.comparePassword(currentPassword);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect');

  user.password = newPassword;
  await user.save();

  res.status(200).json({ success: true, message: 'Password changed' });
});

const cascadeUserDeletion = async (userId) => {
  const tasks = [];

  tasks.push(
    User.updateMany(
      { 'blockedUsers.user': userId },
      { $pull: { blockedUsers: { user: userId } } },
    ),
  );

  if (mongoose.models.Conversation) {
    tasks.push(detachUserFromConversations(userId));
  }

  if (mongoose.models.Message) {
    const Message = mongoose.models.Message;
    tasks.push(Message.updateMany({ sender: userId }, { $set: { sender: null } }));
  }

  await Promise.all(tasks);
};

// DELETE /api/auth/account
export const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw ApiError.unauthorized('User no longer exists');

  const ok = await user.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Password confirmation failed');

  const tombstoneId = user._id.toString().slice(-6);
  user.status = USER_STATUS.DELETED;
  user.email = `deleted_${tombstoneId}@deleted.local`;
  user.username = `deleted_${tombstoneId}`;
  user.displayName = DELETED_USER_LABEL;
  user.bio = '';
  user.avatarUrl = '';
  user.avatarPublicId = '';
  user.isOnline = false;
  user.blockedUsers = [];
  user.mutedConversations = [];
  user.archivedConversations = [];
  await user.save({ validateBeforeSave: false });

  await cascadeUserDeletion(user._id);

  res.status(200).json({ success: true, message: 'Account deleted' });
});
