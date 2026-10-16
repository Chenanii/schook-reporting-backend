import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldIncludeReportSubject } from '../../src/modules/class-subjects/subject-requirements.js';
import {
  createClassSubjectSchema,
  updateClassSubjectSchema,
} from '../../src/modules/class-subjects/class-subjects.validation.js';

test('includes required subjects for every student', () => {
  assert.equal(
    shouldIncludeReportSubject({ isActive: true, isRequired: true, selected: false, hasPublishedResult: false }),
    true,
  );
});

test('includes optional subjects only when selected or already published', () => {
  assert.equal(
    shouldIncludeReportSubject({ isActive: true, isRequired: false, selected: false, hasPublishedResult: false }),
    false,
  );
  assert.equal(
    shouldIncludeReportSubject({ isActive: true, isRequired: false, selected: true, hasPublishedResult: false }),
    true,
  );
  assert.equal(
    shouldIncludeReportSubject({ isActive: true, isRequired: false, selected: false, hasPublishedResult: true }),
    true,
  );
});

test('does not require inactive subjects even when linked as required or previously published', () => {
  assert.equal(
    shouldIncludeReportSubject({ isActive: false, isRequired: true, selected: true, hasPublishedResult: true }),
    false,
  );
});

test('class subjects default to required and may be created as optional', () => {
  const required = createClassSubjectSchema.parse({ classLevelId: 'level-1', subjectId: 'subject-1' });
  assert.equal(required.isRequired, true);
  assert.equal(
    createClassSubjectSchema.parse({ classLevelId: 'level-1', subjectId: 'subject-1', isRequired: false }).isRequired,
    false,
  );
});

test('class subject requirement can be changed', () => {
  assert.equal(updateClassSubjectSchema.safeParse({ isRequired: false }).success, true);
  assert.equal(updateClassSubjectSchema.safeParse({}).success, false);
});
