import mongoose from 'mongoose';
import { ADMIN_AUDIT_ACTIONS } from '../utils/constants.js';

const { Schema, model } = mongoose;

const adminAuditLogSchema = new Schema(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'adminId is required'],
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(ADMIN_AUDIT_ACTIONS),
      required: [true, 'action is required'],
      index: true,
    },
    targetType: { type: String, default: '' },
    targetId: { type: Schema.Types.ObjectId, default: null, index: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, minimize: false },
);

adminAuditLogSchema.index({ adminId: 1, at: -1 });

export const AdminAuditLog = model('AdminAuditLog', adminAuditLogSchema);
export default AdminAuditLog;
