import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { env } from './config/env.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { usersRouter } from './modules/users/users.routes.js';
import { academicYearsRouter } from './modules/academic-years/academic-years.routes.js';
import { termsRouter } from './modules/terms/terms.routes.js';
import { classLevelsRouter } from './modules/class-levels/class-levels.routes.js';
import { classGroupsRouter } from './modules/class-groups/class-groups.routes.js';
import { subjectsRouter } from './modules/subjects/subjects.routes.js';
import { classSubjectsRouter } from './modules/class-subjects/class-subjects.routes.js';
import { teachingAssignmentsRouter } from './modules/teaching-assignments/teaching-assignments.routes.js';
import { teachersRouter } from './modules/teachers/teachers.routes.js';
import { studentsRouter } from './modules/students/students.routes.js';
import { enrollmentsRouter } from './modules/enrollments/enrollments.routes.js';
import { assessmentsRouter } from './modules/assessments/assessments.routes.js';
import { termResultsRouter } from './modules/term-results/term-results.routes.js';
import { reportCardsRouter } from './modules/report-cards/report-cards.routes.js';
import { promotionRouter } from './modules/promotions/promotion.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());

app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(`${env.API_PREFIX}/academic-years`, academicYearsRouter);
app.use(`${env.API_PREFIX}/terms`, termsRouter);
app.use(`${env.API_PREFIX}/class-levels`, classLevelsRouter);
app.use(`${env.API_PREFIX}/class-groups`, classGroupsRouter);
app.use(`${env.API_PREFIX}/subjects`, subjectsRouter);
app.use(`${env.API_PREFIX}/class-subjects`, classSubjectsRouter);
app.use(`${env.API_PREFIX}/teaching-assignments`, teachingAssignmentsRouter);
app.use(`${env.API_PREFIX}/teachers`, teachersRouter);
app.use(`${env.API_PREFIX}/students`, studentsRouter);
app.use(`${env.API_PREFIX}/enrollments`, enrollmentsRouter);
app.use(`${env.API_PREFIX}/assessments`, assessmentsRouter);
app.use(`${env.API_PREFIX}/term-results`, termResultsRouter);
app.use(`${env.API_PREFIX}/report-cards`, reportCardsRouter);
app.use(`${env.API_PREFIX}/promotions`, promotionRouter);

app.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'School Reporting API',
      version: '1.0.0'
    }
  });
});

app.use(`${env.API_PREFIX}/health`, healthRouter);
app.use(`${env.API_PREFIX}/auth`, authRouter);
app.use(`${env.API_PREFIX}/users`, usersRouter);

app.use(notFoundHandler);
app.use(errorHandler);