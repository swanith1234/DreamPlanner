/**
 * Redaction for AuditLog.metadata.
 *
 * The Prisma `$extends` hook in config/database.ts records the raw `args` of every
 * write operation. Without redaction, `prisma.user.create({ data: { passwordHash } })`
 * persists the bcrypt hash into AuditLog — a table the admin dashboard reads and
 * renders. Refresh tokens and Web Push keys have the same exposure.
 *
 * Kept in its own module (rather than inline in database.ts) so it can be unit
 * tested without instantiating a PrismaClient.
 */

/** Field names whose values must never reach AuditLog.metadata. */
export const AUDIT_REDACTED_KEYS = new Set([
  'passwordHash',
  'password',
  'token',
  'refreshToken',
  'accessToken',
  'auth',
  'p256dh',
  'embedding',
]);

/**
 * Recursively replace sensitive values with '[REDACTED]'.
 *
 * @param value - Any Prisma args structure (object, array, or scalar)
 * @param depth - Recursion guard against deeply nested / cyclic structures
 */
export function redactAuditArgs(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => redactAuditArgs(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = AUDIT_REDACTED_KEYS.has(key) ? '[REDACTED]' : redactAuditArgs(val, depth + 1);
  }
  return out;
}
