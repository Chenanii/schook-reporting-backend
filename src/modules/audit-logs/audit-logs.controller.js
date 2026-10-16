import { listAuditLogsSchema } from './audit-logs.validation.js';
import { listAuditLogs } from './audit-logs.service.js';

export async function listAuditLogsController(req, res, next) {
  const parsed = listAuditLogsSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: parsed.error.issues }
    });
  }
  try {
    return res.status(200).json({ success: true, ...(await listAuditLogs(parsed.data)) });
  } catch (error) {
    return next(error);
  }
}
