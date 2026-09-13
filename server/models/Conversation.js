import mongoose from 'mongoose';
import {
  CONVERSATION_TYPES,
  MESSAGE_TYPES,
  GROUP_NAME_MAX_LENGTH,
  GROUP_MIN_PARTICIPANTS,
  GROUP_MAX_PARTICIPANTS,
  DIRECT_PARTICIPANTS,
} from '../utils/constants.js';

const { Schema, model } = mongoose;

const lastMessageSchema = new Schema(
  {
    text: { type: String, default: '' },
    sender: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type: {
      type: String,
      enum: Object.values(MESSAGE_TYPES),
      default: MESSAGE_TYPES.TEXT,
    },
    createdAt: { type: Date, default: null },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(CONVERSATION_TYPES),
      default: CONVERSATION_TYPES.DIRECT,
      required: true,
      index: true,
    },
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator(arr) {
          if (!Array.isArray(arr)) return false;
          if (this.type === CONVERSATION_TYPES.DIRECT) {
            return arr.length === DIRECT_PARTICIPANTS;
          }
          return (
            arr.length >= GROUP_MIN_PARTICIPANTS &&
            arr.length <= GROUP_MAX_PARTICIPANTS
          );
        },
        message: 'Participants array length is invalid for this conversation type',
      },
    },
    name: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        GROUP_NAME_MAX_LENGTH,
        `Group name must be at most ${GROUP_NAME_MAX_LENGTH} characters`,
      ],
    },
    avatarUrl: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' },
    admins: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'createdBy is required'],
    },
    directKey: { type: String, default: undefined },
    lastMessage: { type: lastMessageSchema, default: null },
    unreadCounts: {
      type: Map,
      of: { type: Number, min: 0, default: 0 },
      default: () => new Map(),
    },
    isActive: { type: Boolean, default: true, index: true },
    isAccepted: { type: Boolean, default: false },
    pinnedBy: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
  },
  { timestamps: true },
);

conversationSchema.index({ participants: 1, updatedAt: -1 });

conversationSchema.index(
  { directKey: 1 },
  {
    unique: true,
    partialFilterExpression: { directKey: { $type: 'string' } },
  },
);

conversationSchema.pre('save', async function () {
  if (this.type === CONVERSATION_TYPES.DIRECT) {
    if (this.participants.length !== DIRECT_PARTICIPANTS) {
      throw new Error('Direct conversation must have exactly 2 participants');
    }
    this.name = '';
    this.avatarUrl = '';
    this.avatarPublicId = '';
    this.admins = [];
    this.directKey = this.participants
      .map((p) => p.toString())
      .sort()
      .join('_');
  } else {
    this.directKey = undefined;
  }

  if (this.type === CONVERSATION_TYPES.GROUP) {
    if (!this.name || !this.name.trim()) {
      throw new Error('Group conversation requires a name');
    }
    if (this.participants.length < GROUP_MIN_PARTICIPANTS) {
      throw new Error('Group conversation requires at least 2 participants');
    }
    if (this.participants.length > GROUP_MAX_PARTICIPANTS) {
      throw new Error(
        `Group conversation cannot have more than ${GROUP_MAX_PARTICIPANTS} participants`,
      );
    }

    const participantSet = new Set(this.participants.map((p) => p.toString()));
    this.admins = this.admins.filter((a) => participantSet.has(a.toString()));

    if (this.admins.length === 0) {
      throw new Error('Group conversation must have at least one admin');
    }
  }
});

export const Conversation = model('Conversation', conversationSchema);
export default Conversation;
