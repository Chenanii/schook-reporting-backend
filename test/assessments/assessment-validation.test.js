import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAssessmentSchema,
  updateAssessmentSchema,
} from '../../src/modules/assessments/assessments.validation.js';

import {
  saveAssessmentResultsSchema,
} from '../../src/modules/assessments/assessment-results.validation.js';

const validAssessment = {
  title: 'Mid-term test',
  assessmentType: 'MID_TERM_EXAM',
  termId: 'term-1',
  teachingAssignmentId: 'assignment-1',
};

test('accepts an assessment without maximum mark or contribution inputs', () => {
  assert.equal(createAssessmentSchema.safeParse(validAssessment).success, true);
});

test('rejects unsupported assessment types', () => {
  assert.equal(
    createAssessmentSchema.safeParse({
      ...validAssessment,
      assessmentType: 'QUIZ',
    }).success,
    false,
  );
});

test('accepts updating assessment details without weighting fields', () => {
  assert.equal(updateAssessmentSchema.safeParse({ title: 'Updated test' }).success, true);
});

test('accepts a present student with mark 100', () => {
  assert.equal(
    saveAssessmentResultsSchema.safeParse({
      results: [{ enrollmentId: 'enrolment-1', status: 'PRESENT', mark: 100 }],
    }).success,
    true,
  );
});

test('rejects student marks above 100', () => {
  assert.equal(
    saveAssessmentResultsSchema.safeParse({
      results: [{ enrollmentId: 'enrolment-1', status: 'PRESENT', mark: 101 }],
    }).success,
    false,
  );
});

test('requires a mark when a student is present', () => {
  assert.equal(
    saveAssessmentResultsSchema.safeParse({
      results: [{ enrollmentId: 'enrolment-1', status: 'PRESENT' }],
    }).success,
    false,
  );
});

test('rejects numeric marks for absent students', () => {
  assert.equal(
    saveAssessmentResultsSchema.safeParse({
      results: [{ enrollmentId: 'enrolment-1', status: 'ABSENT', mark: 20 }],
    }).success,
    false,
  );
});

test('rejects duplicate enrolments in one result request', () => {
  assert.equal(
    saveAssessmentResultsSchema.safeParse({
      results: [
        { enrollmentId: 'enrolment-1', status: 'PRESENT', mark: 70 },
        { enrollmentId: 'enrolment-1', status: 'ABSENT' },
      ],
    }).success,
    false,
  );
});
