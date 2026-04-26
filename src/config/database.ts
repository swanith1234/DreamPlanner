import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { basePrisma: PrismaClient | undefined };

const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    // Explicitly configure pooling if needed via URL, 
    // but Prisma handles this automatically from DATABASE_URL.
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.basePrisma = basePrisma;

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);

        const writeOperations = ['create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany'];
        
        if (writeOperations.includes(operation)) {
          // Log the operation to the AuditLog table asynchronously
          // Using basePrisma to avoid infinite audit recursion
          basePrisma.auditLog.create({
            data: {
              tableName: model,
              operation: operation,
              recordId: (result as any)?.id?.toString() || (args as any)?.where?.id?.toString() || null,
              metadata: JSON.parse(JSON.stringify({
                args: args,
                timestamp: new Date().toISOString()
              }))
            }
          }).catch(err => console.error('Failed to create audit log:', err));
        }

        return result;
      },
    },
  },
});

export default prisma;
export { basePrisma };