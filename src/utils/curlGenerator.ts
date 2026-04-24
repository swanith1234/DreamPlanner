import { Request } from 'express';

// ─── Redaction Config ──────────────────────────────────────────────────────────

/** Headers whose values are replaced with [REDACTED] verbatim */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]);

/** Top-level JSON body keys whose values are replaced with [REDACTED] */
const SENSITIVE_BODY_KEYS = new Set([
  'password',
  'token',
  'secret',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'privateKey',
  'private_key',
  'ssn',
  'creditCard',
  'credit_card',
]);

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Recursively walk a parsed JSON object and replace sensitive field values.
 */
function redactBody(obj: unknown, depth = 0): unknown {
  // Prevent runaway recursion on deeply nested / circular structures
  if (depth > 10) return '[TRUNCATED]';

  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactBody(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = SENSITIVE_BODY_KEYS.has(key) ? '[REDACTED]' : redactBody(value, depth + 1);
  }
  return result;
}

/**
 * Shell-escape a string so it is safe to embed inside single-quoted cURL args.
 * Replaces each ' with '\'' (end quote, literal apostrophe, reopen quote).
 */
function shellEscape(value: string): string {
  return value.replace(/'/g, "'\\''");
}

// ─── Main Export ───────────────────────────────────────────────────────────────

/**
 * Converts an Express `Request` into a copy-pasteable cURL one-liner.
 *
 * Security guarantees:
 *  - Sensitive headers are replaced with [REDACTED].
 *  - Sensitive JSON body fields are replaced with [REDACTED] (recursive).
 *  - Non-JSON bodies are replaced with '[NON-JSON BODY REDACTED]'.
 *
 * @param req - The Express request at the point the error was thrown
 * @returns   - A cURL string suitable for webhook payloads and bug reports
 */
export function generateCurl(req: Request): string {
  const parts: string[] = ['curl -X ' + req.method.toUpperCase()];

  // ── Protocol + Host + Path + Query ────────────────────────────────────
  const protocol = req.protocol ?? 'http';
  const host = (req.headers['host'] as string) ?? 'localhost';
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;
  parts.push(`  '${shellEscape(fullUrl)}'`);

  // ── Headers ────────────────────────────────────────────────────────────
  for (const [rawKey, rawValue] of Object.entries(req.headers)) {
    const key = rawKey.toLowerCase();
    // Skip pseudo-headers and internal node http fields
    if (key.startsWith(':')) continue;

    const value = SENSITIVE_HEADERS.has(key)
      ? '[REDACTED]'
      : Array.isArray(rawValue)
        ? rawValue.join(', ')
        : (rawValue ?? '');

    parts.push(`  -H '${shellEscape(rawKey)}: ${shellEscape(String(value))}'`);
  }

  // ── Body ───────────────────────────────────────────────────────────────
  const contentType = ((req.headers['content-type'] as string) ?? '').toLowerCase();
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE';

  if (hasBody && req.body && Object.keys(req.body).length > 0) {
    if (contentType.includes('application/json')) {
      try {
        const redacted = redactBody(req.body);
        const json = JSON.stringify(redacted);
        parts.push(`  -d '${shellEscape(json)}'`);
      } catch {
        parts.push(`  -d '[BODY SERIALIZATION ERROR]'`);
      }
    } else {
      // Anything that isn't JSON (multipart, form-encoded, binary) is unsafe to reproduce
      parts.push(`  -d '[NON-JSON BODY REDACTED]'`);
    }
  }

  return parts.join(' \\\n');
}
