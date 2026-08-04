import { PrismaClient } from '@prisma/client';
import { redactAuditArgs } from '../utils/auditRedact';
import { logDbDiagnostics } from './dbDiagnostics';

// ─────────────────────────────────────────────────────────────────────────────
// LOAD-BEARING — DO NOT REMOVE WITHOUT DEPLOYING TO RENDER FIRST.
//
// Without this line the Render container cannot open a database connection:
//
//   prisma:error Invalid `prisma.$queryRaw()` invocation:
//   Error opening a TLS connection: OpenSSL error
//   ==> Exited with status 1
//
// It works locally regardless, because macOS resolves the Supabase certificate
// chain that Render's Linux/OpenSSL 3 image rejects. So local success proves
// nothing about this line — it must be validated on Render.
//
// It was removed once on the reasoning that Prisma's Rust engine does its own
// TLS handshake and honours `sslmode=no-verify` from the connection string, and
// therefore would not consult Node's TLS settings. That reasoning is wrong in
// practice: the deploy crash-looped immediately. The later "route through direct
// port 5432" fix is CUMULATIVE with this one, not a replacement for it.
//
// It must be set here rather than in index.ts: TypeScript hoists every require()
// above other statements, so an assignment written at the top of index.ts runs
// AFTER this module has already been loaded and the client constructed.
//
// KNOWN TRADE-OFF: this is process-wide, so it also disables certificate
// verification for outbound LLM, Telegram, FCM and web-push calls. The correct
// long-term fix is to pin Supabase's CA certificate and re-enable verification;
// until that is validated on Render, this stays.
// ─────────────────────────────────────────────────────────────────────────────
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

// Printed once at startup, before the first query. Prisma's TLS error names
// neither the host it dialled nor the engine it loaded, so without this a
// crash-looping container gives no way to tell a bad connection string from a
// missing platform engine. Credentials are never included.
logDbDiagnostics(dbUrl);

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