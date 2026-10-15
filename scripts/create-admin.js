import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const firstName = process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim();
const lastName = process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

try {
  if (!email || !firstName || !lastName || !password) {
    throw new Error('Missing administrator details in environment variables.');
  }

  if (password.length < 12 || password.length > 128) {
    throw new Error('The administrator password must be 12–128 characters.');
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true }
  });

  if (existingAdmin) {
    throw new Error(
      'A SUPER_ADMIN already exists. Bootstrap creation is disabled.'
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true }
  });

  if (existingUser) {
    throw new Error('A user with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      firstName,
      lastName,
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE'
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true
    }
  });

  console.log('Administrator created successfully:');
  console.log(user);
} catch (error) {
  console.error('Administrator creation failed:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}