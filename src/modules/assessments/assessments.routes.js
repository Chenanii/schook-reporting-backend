import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  createAssessmentController,
  listAssessmentsController,
  getAssessmentController,
  updateAssessmentController,
} from './assessments.controller.js';

import {
  getAssessmentResultsController,
  saveAssessmentResultsController,
} from './assessment-results.controller.js';

import {
  transitionAssessmentController,
} from './assessment-lifecycle.controller.js';

import {
  calculateTermSubjectResultsController,
} from './term-results-calculation.controller.js';

export const assessmentsRouter = Router();

assessmentsRouter.use(
  authenticate,
  requireActiveSubscription,
  authorize(
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'HEADTEACHER',
    'ACADEMIC_ADMIN',
    'EXAMS_OFFICER',
  ),
);

assessmentsRouter.post('/', createAssessmentController);
assessmentsRouter.get('/', listAssessmentsController);
assessmentsRouter.get('/:id', getAssessmentController);
assessmentsRouter.patch('/:id', updateAssessmentController);
assessmentsRouter.get('/:id/results', getAssessmentResultsController);
assessmentsRouter.put('/:id/results', saveAssessmentResultsController);
assessmentsRouter.post('/:id/transition', transitionAssessmentController);
assessmentsRouter.post('/terms/:termId/results/calculate', calculateTermSubjectResultsController,);
