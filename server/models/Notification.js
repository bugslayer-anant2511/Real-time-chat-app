import mongoose from 'mongoose';
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TEXT_MAX_LENGTH,
} from '../utils/constants.js';

const { Schema, model } = mongoose;

const notificationSchema = new Schema(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'recipient is required'],
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: [true, 'type is required'],
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    text: {
      type: String,
      required: [true, 'text is required'],
      trim: true,
      maxlength: [
        NOTIFICATION_TEXT_MAX_LENGTH,
        `Notification text must be at most ${NOTIFICATION_TEXT_MAX_LENGTH} characters`,
      ],
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({
  recipient: 1,
  conversationId: 1,
  type: 1,
  createdAt: -1,
});

export const Notification = model('Notification', notificationSchema);
export default Notification;
