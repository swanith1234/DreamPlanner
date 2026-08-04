import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { redactAuditArgs } from '../utils/auditRedact';
import { logDbDiagnostics } from './dbDiagnostics';

// NOTE: this file used to set NODE_TLS_REJECT_UNAUTHORIZED='0' process-wide.
// It never actually fixed the Render connection — proven by a startup probe in
// which every SSL variant, including sslmode=disable, still failed with
// "Error opening a TLS connection: OpenSSL error". The Rust query engine does
// not consult Node's TLS settings, so the flag only ever weakened every OTHER
// outbound call (LLM providers, Telegram, FCM, web-push).
//
// The `pg` adapter below routes database TLS through Node and relaxes
// verification for that pool ALONE, which is the scoped equivalent of what the
// global flag was reaching for.

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

// Printed once at startup, before the first query. Prisma's TLS error names
// neither the host it dialled nor the engine it loaded, so without this a
// crash-looping container gives no way to tell a bad connection string from a
// missing platform engine. Credentials are never included.
logDbDiagnostics(dbUrl);

/**
 * Connect through the `pg` driver adapter instead of the Rust query engine's
 * built-in TLS.
 *
 * WHY: on Render, every connection attempt failed with
 *   "Error opening a TLS connection: OpenSSL error"
 * A startup probe tried five variants — sslmode=require+sslaccept, prefer,
 * disable, the 6543 transaction pooler, and a second host via the other env
 * var — and ALL five failed identically. `sslmode=disable` failing with a TLS
 * error is the tell: no handshake should occur at all, so the parameters were
 * never being honoured. The engine binary loads (queries are attempted) but its
 * OpenSSL linkage is broken in that container image.
 *
 * The adapter routes Postgres over `pg`, so TLS is handled by Node rather than
 * the query engine, bypassing the broken stack entirely.
 *
 * `rejectUnauthorized: false` is scoped to THIS pool — it accepts Supabase's
 * pooler certificate chain without weakening TLS for any other outbound call,
 * which is what let the process-wide NODE_TLS_REJECT_UNAUTHORIZED be removed.
 */
const adapter = new PrismaPg({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    adapter,
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
                args: redactAuditArgs(args),
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

/**
 * The connection string actually handed to Prisma, after port rewriting and
 * sslmode normalisation. Exported so startup diagnostics can probe variants of
 * the real URL rather than re-deriving it and testing something different.
 * Contains credentials — never log it directly.
 */
export const resolvedDatabaseUrl = dbUrl;