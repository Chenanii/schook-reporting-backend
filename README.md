# School Reporting Backend — foundation

A JavaScript REST API foundation using Node.js, Express, PostgreSQL and Prisma.

## Requirements

- Node.js 20+
- PostgreSQL 15+ (or a compatible current release)
- npm

## 1. Install dependencies

```bash
npm install
cp .env.example .env
```

Edit `.env` and set a valid PostgreSQL connection string and a random `JWT_SECRET` of at least 32 characters.

## 2. Create the database

Example using `psql` as a PostgreSQL administrator:

```sql
CREATE USER school_app WITH PASSWORD 'replace_with_a_strong_password';
CREATE DATABASE school_reporting OWNER school_app;
```

Ensure `DATABASE_URL` in `.env` uses the same credentials.

## 3. Generate Prisma Client and create the first migration

```bash
npm run prisma:generate
npm run db:migrate -- --name init
```

## 4. Start the API

```bash
npm run dev
```

- API root: `http://localhost:4000/`
- Health check: `http://localhost:4000/api/v1/health`

The health check verifies both the API and database connection.

## Current foundation

- Express application and versioned API prefix
- Environment variable validation
- CORS allowlist, Helmet security headers, JSON request-size limit
- Centralized 404 and error handling
- Prisma schema for users, teachers, students, academic years, terms, classes, subjects, teaching assignments, enrolments, assessments, results and audit logs
- Graceful shutdown and database health check

## Important domain rules to enforce in services

Prisma's relational schema cannot enforce every cross-record academic rule by itself. Service-layer validation must verify that:

1. An assessment's term, subject, and teaching assignment agree.
2. An assessment result's enrolment belongs to the class/term assigned to that assessment.
3. Marks are between zero and the assessment maximum; a missing mark is not silently treated as zero.
4. Finalized/published terms and locked assessments cannot be edited without an explicit authorized reopening workflow.
5. Promotion creates a new enrolment for the destination term/class and preserves the previous enrolment and all historical results.
6. Sensitive operations are transactional and produce audit records.

## Next implementation phase

Implement login, password hashing, JWT verification, role/permission middleware, and a protected first-admin bootstrap command. Then implement CRUD APIs for academic years, terms, class levels, class groups, subjects, teachers, and students.

Do not expose this starter publicly before authentication, authorization, rate limiting, production configuration, backups, and tests are implemented.
