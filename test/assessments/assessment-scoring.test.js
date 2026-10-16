import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateFinalSubjectMark } from '../../src/modules/assessments/assessment-scoring.js';

test('averages coursework and mid-term percentages equally into the 40% component', () => {
  assert.equal(calculateFinalSubjectMark([80, 60], 70), 70);
});

test('does not let a legacy component weight alter the equal average', () => {
  assert.equal(calculateFinalSubjectMark([100, 0, 50], 100), 80);
});

test('rounds the final subject mark to two decimal places', () => {
  assert.equal(calculateFinalSubjectMark([33.33, 66.67], 70), 62);
});

test('requires at least one coursework or mid-term percentage', () => {
  assert.throws(() => calculateFinalSubjectMark([], 70), /At least one coursework or mid-term percentage is required/);
});
