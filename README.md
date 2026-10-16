# School Reporting Backend

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

## 3. Generate Prisma Client and apply migrations

```bash
npm run prisma:generate
npm run db:deploy
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
- School signup, school-scoped academic data, subscription plans, trials and subscription access checks

## School subscriptions

Apply outstanding migrations before starting the updated API:

```bash
npm run db:deploy
npm run prisma:generate
```

Create the platform administrator with `npm run admin:create`. A platform administrator must create at least one plan before schools can register. Plans use integer minor-unit prices and a three-letter currency code:

```http
POST /api/v1/subscriptions/plans
Authorization: Bearer <platform-admin-token>
Content-Type: application/json
```

Example plan body:

```json
{
  "code": "standard-monthly",
  "name": "Standard",
  "interval": "MONTHLY",
  "priceMinor": 250000,
  "currency": "MWK",
  "trialDays": 14,
  "maxStudents": 500,
  "maxStaff": 40
}
```

Schools can view active plans at `GET /api/v1/subscriptions/plans` and register with `POST /api/v1/schools/signup`. Signup creates a school and its first `SCHOOL_ADMIN` account. The administrator then signs in at `POST /api/v1/auth/login`. Trial length and capacity are set per plan.

Authenticated school administrators can view subscription state at `GET /api/v1/subscriptions/current` and request another plan at `POST /api/v1/subscriptions/change-plan`. Since a payment provider is not connected yet, paid plan requests remain `PENDING_PAYMENT`. A platform administrator reviews them at `GET /api/v1/subscriptions/manage/subscriptions` and confirms activation with `PATCH /api/v1/subscriptions/:id/status`; activating a subscription requires a future `currentPeriodEnd`.

The platform administrator can list schools at `GET /api/v1/schools` and suspend or reactivate one with `PATCH /api/v1/schools/:id/status`. Platform administrators can scope normal school-data API requests with the `X-School-ID` header. School users are automatically restricted to their own school's records.

Existing records are assigned to a migrated `Legacy School` tenant and its grandfathered active subscription. Rename that school after migrating if needed. Payment collection, automatic renewals, invoices and provider webhooks remain to be integrated.

## Important domain rules to enforce in services

Prisma's relational schema cannot enforce every cross-record academic rule by itself. Service-layer validation must verify that:

1. An assessment's term, subject, and teaching assignment agree.
2. An assessment result's enrolment belongs to the class/term assigned to that assessment.
3. Marks are between zero and the assessment maximum; a missing mark is not silently treated as zero.
4. Finalized/published terms and locked assessments cannot be edited without an explicit authorized reopening workflow.
5. Promotion creates a new enrolment for the destination term/class and preserves the previous enrolment and all historical results.
6. Subjects can be assigned directly to a teacher and class group as standalone subjects. When a subject has curriculum links, assignments must use a class group at one of those linked levels.

Promotion policies are configured per class level by school administrators and headteachers using `GET /api/v1/promotions/policies` and `PUT /api/v1/promotions/policies/:classLevelId`. Policies set a minimum average, subject pass mark, minimum number of subjects passed, and subjects that must be passed. If a level has no saved policy, the system uses a 50% average and pass mark, requires at least half of its assigned subjects passed, and has no compulsory pass subjects. Recommendations use published final-term subject marks. Staff can override recommendations during approval, but must record a reason; the approved batch stores the policy and recommendation snapshot. Final-year students can repeat or graduate based on the policy.
7. Sensitive operations are transactional and produce audit records.

Payment collection, automated renewal and webhook reconciliation are the next billing phase. Before production launch, add automated tests, backups, monitoring, and a shared rate-limit store for multi-instance deployments.
