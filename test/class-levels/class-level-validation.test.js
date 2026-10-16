import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createClassLevelSchema,
  updateClassLevelSchema,
} from '../../src/modules/class-levels/class-levels.validation.js';

const classLevel = {
  name: 'Primary 1',
  levelOrder: 1,
};

test('creates a class level without a grading scale when automatic selection is available', () => {
  assert.equal(createClassLevelSchema.safeParse(classLevel).success, true);
});

test('accepts an explicit grading scale for a class level', () => {
  assert.equal(
    createClassLevelSchema.safeParse({ ...classLevel, gradeScaleId: 'scale-primary' }).success,
    true,
  );
});

test('allows clearing a class-level grading scale assignment', () => {
  assert.equal(updateClassLevelSchema.safeParse({ gradeScaleId: null }).success, true);
});
