import { asyncHandler } from '../utils/asyncHandler.js';
import { createReport } from '../utils/reportService.js';

export const createReportController = asyncHandler(async (req, res) => {
  const { targetType, targetId, reason, description = '' } = req.body;

  const report = await createReport({
    reporterId: req.user._id,
    targetType,
    targetId,
    reason,
    description,
  });

  res.status(201).json({
    success: true,
    message: 'Report submitted',
    data: {
      id: String(report._id),
      targetType: report.targetType,
      targetId: String(report.targetId),
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
    },
  });
});

export default { createReportController };
