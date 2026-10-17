import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStaffSchema,
  listStaffSchema,
  updateStaffSchema
} from '../../src/modules/users/users.validation.js';

test('requires parent accounts to be created through verified setup', () => {
  assert.equal(createStaffSchema.safeParse({
    email: 'parent@example.com',
    firstName: 'Amina',
    lastName: 'Phiri',
    role: 'PARENT',
    password: 'a-secure-parent-password'
  }).success, false);
  assert.equal(listStaffSchema.safeParse({ role: 'PARENT' }).success, true);
  assert.equal(updateStaffSchema.safeParse({ role: 'PARENT' }).success, true);
});
