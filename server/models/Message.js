import mongoose from 'mongoose';
import { Conversation } from './Conversation.js';
import { User } from './User.js';
import {
  MESSAGE_TYPES,
  MESSAGE_DELETED_FOR,
  MESSAGE_TEXT_MAX_LENGTH,
  REACTION_EMOJI_MAX_LENGTH,
} from '../utils/constants.js';

const { Schema, model } = mongoose;

const readReceiptSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const reactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: {
      type: String,
      required: true,
      trim: true,
      maxlength: [
        REACTION_EMOJI_MAX_LENGTH,
        `Reaction emoji must be at most ${REACTION_EMOJI_MAX_LENGTH} characters`,
      ],
    },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'conversationId is required'],
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    type: {
      type: String,
      enum: Object.values(MESSAGE_TYPES),
      default: MESSAGE_TYPES.TEXT,
      required: true,
    },
    text: {
      type: String,
      default: '',
      maxlength: [
        MESSAGE_TEXT_MAX_LENGTH,
        `Message text must be at most ${MESSAGE_TEXT_MAX_LENGTH} characters`,
      ],
    },
    imageUrl: { type: String, default: '' },
    imagePublicId: { type: String, default: '' },
    readBy: { type: [readReceiptSchema], default: [] },
    reactions: { type: [reactionSchema], default: [] },
    editedAt: { type: Date, default: null },
    deletedFor: {
      type: String,
      enum: Object.values(MESSAGE_DELETED_FOR),
      default: MESSAGE_DELETED_FOR.NONE,
    },
    hiddenFor: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: []
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    isPinned: { type: Boolean, default: false },
    pinnedAt: { type: Date, default: null },
    pinnedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    starredBy: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sent'],
      default: 'sent',
    },
    scheduledFor: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: -1 });

messageSchema.pre('save', async function () {
  this.$wasNew = this.isNew;
  if (this.type === MESSAGE_TYPES.TEXT) {
    if (!this.text || this.text.trim().length === 0) {
      throw new Error('Text message cannot be empty');
    }
  }

  if (this.type === MESSAGE_TYPES.IMAGE) {
    if (!this.imageUrl) {
      throw new Error('Image message requires imageUrl');
    }
  }

  if (Array.isArray(this.readBy) && this.readBy.length > 1) {
    const seen = new Set();
    this.readBy = this.readBy.filter((entry) => {
      const uid = entry?.user?.toString();
      if (!uid || seen.has(uid)) return false;
      seen.add(uid);
      return true;
    });
  }

  if (Array.isArray(this.reactions) && this.reactions.length > 1) {
    const lastByUser = new Map();
    for (const r of this.reactions) {
      const uid = r?.user?.toString();
      if (!uid) continue;
      lastByUser.set(uid, r);
    }
    this.reactions = Array.from(lastByUser.values());
  }

  if (this.deletedFor === MESSAGE_DELETED_FOR.EVERYONE) {
    this.text = '';
    this.imageUrl = '';
  }
});

const buildLastMessageSnapshot = (doc) => {
  let text = '';
  if (doc.deletedFor === MESSAGE_DELETED_FOR.EVERYONE) {
    text = '';
  } else if (doc.type === MESSAGE_TYPES.TEXT) {
    text = doc.text || '';
  } else if (doc.type === MESSAGE_TYPES.IMAGE) {
    text = '[image]';
  } else if (doc.type === MESSAGE_TYPES.SYSTEM) {
    text = doc.text || '';
  }

  return {
    text,
    sender: doc.sender ?? null,
    type: doc.type,
    createdAt: doc.createdAt,
  };
};

messageSchema.post('save', async function (doc) {
  try {
    const wasNew = doc.isNew || doc.$wasNew;
    if (!wasNew) return;

    const conversation = await Conversation.findById(doc.conversationId).select(
      'participants',
    );
    if (!conversation) return;

    const update = { $set: { lastMessage: buildLastMessageSnapshot(doc) } };

    if (doc.sender) {
      const senderId = doc.sender.toString();
      const recipientIds = conversation.participants
        .map((p) => p.toString())
        .filter((pid) => pid !== senderId);

      let mutedSet = new Set();
      if (recipientIds.length > 0) {
        const mutedRows = await User.find(
          {
            _id: { $in: recipientIds },
            mutedConversations: doc.conversationId,
          },
          { _id: 1 },
        ).lean();
        mutedSet = new Set(mutedRows.map((u) => u._id.toString()));
      }

      const inc = {};
      for (const pid of recipientIds) {
        if (mutedSet.has(pid)) continue;
        inc[`unreadCounts.${pid}`] = 1;
      }
      if (Object.keys(inc).length > 0) update.$inc = inc;
    }

    await Conversation.findByIdAndUpdate(doc.conversationId, update);
  } catch (err) {
    console.error('[Message post-save] conversation sync failed:', err);
  }
});

export const Message = model('Message', messageSchema);
export default Message;
