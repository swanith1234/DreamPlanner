import { PrismaClient } from '@prisma/client';

// Disable Node.js TLS rejection for OpenSSL 3 compatibility on Render/Linux
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const globalForPrisma = global as unknown as { basePrisma: PrismaClient | undefined };

function getFormattedDatabaseUrl(): string {
  // Prefer DIRECT_URL (port 5432) over DATABASE_URL (port 6543).
  // Port 6543 is PgBouncer transaction pooler, which drops Rust engine TLS handshakes on Linux/Render.
  // Port 5432 is direct PostgreSQL/Supavisor, which handles standard TLS handshakes cleanly.
  let dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
  if (!dbUrl) return '';

  // Convert port 6543 to 5432 to bypass PgBouncer TLS handshake issues on Render
  if (dbUrl.includes(':6543')) {
    dbUrl = dbUrl.replace(':6543', ':5432');
  }

  // Force sslmode=no-verify
  if (dbUrl.includes('sslmode=')) {
    dbUrl = dbUrl.replace(/sslmode=[^&]+/, 'sslmode=no-verify');
  } else {
    const separator = dbUrl.includes('?') ? '&' : '?';
    dbUrl = `${dbUrl}${separator}sslmode=no-verify`;
  }

  // Remove pgbouncer=true parameter when connecting to port 5432
  dbUrl = dbUrl.replace(/&?pgbouncer=true/g, '');

  return dbUrl;
}

const dbUrl = getFormattedDatabaseUrl();

const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
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
          }).catch(() => {
            // Silently ignore audit log errors if DB is unreachable
          });
        }

        return result;
      },
    },
  },
});

export default prisma;
export { basePrisma };