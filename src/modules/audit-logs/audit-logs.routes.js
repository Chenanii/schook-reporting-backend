import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { listAuditLogsController } from './audit-logs.controller.js';

export const auditLogsRouter = Router();
auditLogsRouter.use(authenticate, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'));
auditLogsRouter.get('/', listAuditLogsController);
