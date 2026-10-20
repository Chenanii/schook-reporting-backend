import { PrismaClient } from '@prisma/client';
import { tenantContext } from './tenant-context.js';

const tenantModels = new Set([
  'User', 'Teacher', 'TeacherInvitation', 'StudentAccount', 'Parent',
  'ParentStudent', 'Student', 'AcademicYear', 'Term', 'GradeScale',
  'GradeBoundary', 'ClassLevel', 'ClassGroup', 'Subject', 'ClassSubject',
  'TeachingAssignment', 'Enrollment', 'Assessment', 'AssessmentResult', 'ReportPublication',
  'AnnualSubjectResult', 'AuditLog',
  'PromotionBatch', 'PromotionPolicy', 'SchoolTheme'
]);

function addSchoolId(data, schoolId) {
  const scopeUpdate = (record) => {
    if (Array.isArray(record)) return record.map(scopeUpdate);
    if (!record || typeof record !== 'object') return record;
    const scoped = { ...record, schoolId };
    for (const [field, value] of Object.entries(record)) {
      if (value && typeof value === 'object' && !Array.isArray(value) &&
        ['create', 'createMany', 'connectOrCreate', 'upsert'].some((key) => key in value)) {
        scoped[field] = scopeRelation(value);
      }
    }
    return scoped;
  };

  const scopeRelation = (operation) => {
    if (Array.isArray(operation)) return operation.map(scopeRelation);
    if (!operation || typeof operation !== 'object') return operation;
    const scoped = { ...operation };
    if ('create' in scoped) scoped.create = scopeUpdate(scoped.create);
    if ('createMany' in scoped) {
      scoped.createMany = {
        ...scoped.createMany,
        data: scopeUpdate(scoped.createMany.data)
      };
    }
    if ('connectOrCreate' in scoped) {
      const scopeConnectOrCreate = (item) => ({ ...item, create: scopeUpdate(item.create) });
      scoped.connectOrCreate = Array.isArray(scoped.connectOrCreate)
        ? scoped.connectOrCreate.map(scopeConnectOrCreate)
        : scopeConnectOrCreate(scoped.connectOrCreate);
    }
    if ('upsert' in scoped) {
      const scopeUpsert = (item) => ({ ...item, create: scopeUpdate(item.create) });
      scoped.upsert = Array.isArray(scoped.upsert)
        ? scoped.upsert.map(scopeUpsert)
        : scopeUpsert(scoped.upsert);
    }
    return scoped;
  };

  return scopeUpdate(data);
}

const client = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

export const prisma = client.$extends({
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        const schoolId = tenantContext.getStore();
        if (!schoolId || !tenantModels.has(model)) return query(args);

        const scopedArgs = { ...args };
        if (['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
          'update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany'].includes(operation)) {
          scopedArgs.where = { ...scopedArgs.where, schoolId };
        }

        if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') {
          scopedArgs.data = addSchoolId(scopedArgs.data, schoolId);
        }

        if (operation === 'upsert') {
          scopedArgs.where = { ...scopedArgs.where, schoolId };
          scopedArgs.create = addSchoolId(scopedArgs.create, schoolId);
          scopedArgs.update = { ...scopedArgs.update, schoolId };
        }

        return query(scopedArgs);
      }
    }
  }
});
