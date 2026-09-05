import mongoose from 'mongoose';
import {
  REPORT_TARGET_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_DESCRIPTION_MAX_LENGTH,
  REPORT_REVIEW_NOTE_MAX_LENGTH,
} from '../utils/constants.js';

const { Schema, model } = mongoose;

const reportSchema = new Schema(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'reporter is required'],
      index: true,
    },
    targetType: {
      type: String,
      enum: Object.values(REPORT_TARGET_TYPES),
      required: [true, 'targetType is required'],
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: [true, 'targetId is required'],
      index: true,
    },
    reason: {
      type: String,
      enum: Object.values(REPORT_REASONS),
      required: [true, 'reason is required'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        REPORT_DESCRIPTION_MAX_LENGTH,
        `Description must be at most ${REPORT_DESCRIPTION_MAX_LENGTH} characters`,
      ],
    },
    status: {
      type: String,
      enum: Object.values(REPORT_STATUSES),
      default: REPORT_STATUSES.PENDING,
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        REPORT_REVIEW_NOTE_MAX_LENGTH,
        `Review note must be at most ${REPORT_REVIEW_NOTE_MAX_LENGTH} characters`,
      ],
    },
  },
  { timestamps: true },
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, targetType: 1, targetId: 1, createdAt: -1 });

export const Report = model('Report', reportSchema);
export default Report;
