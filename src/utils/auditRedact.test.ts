import { describe, it, expect } from 'vitest';
import { redactAuditArgs } from './auditRedact';

describe('redactAuditArgs', () => {
  it('redacts passwordHash from a user.create args shape', () => {
    // This is the exact shape AuthService.signup passes to prisma.user.create.
    const args = {
      data: {
        name: 'Ada',
        email: 'ada@example.com',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
        timezone: 'UTC',
      },
    };

    const out = redactAuditArgs(args) as any;

    expect(out.data.passwordHash).toBe('[REDACTED]');
    expect(out.data.email).toBe('ada@example.com');
    expect(out.data.name).toBe('Ada');
  });

  it('redacts nested refresh-token and push-credential fields', () => {
    const args = {
      data: {
        userId: 'u1',
        token: 'sha256-hash-of-refresh-token',
        subscription: { auth: 'auth-secret', p256dh: 'p256dh-key', endpoint: 'https://fcm/xyz' },
      },
    };

    const out = redactAuditArgs(args) as any;

    expect(out.data.token).toBe('[REDACTED]');
    expect(out.data.subscription.auth).toBe('[REDACTED]');
    expect(out.data.subscription.p256dh).toBe('[REDACTED]');
    // Endpoint is not secret — it must survive so audits stay useful.
    expect(out.data.subscription.endpoint).toBe('https://fcm/xyz');
  });

  it('redacts sensitive keys inside arrays', () => {
    const args = { data: [{ password: 'a' }, { password: 'b' }] };
    const out = redactAuditArgs(args) as any;
    expect(out.data[0].password).toBe('[REDACTED]');
    expect(out.data[1].password).toBe('[REDACTED]');
  });

  it('passes through scalars, null and undefined untouched', () => {
    expect(redactAuditArgs('plain')).toBe('plain');
    expect(redactAuditArgs(42)).toBe(42);
    expect(redactAuditArgs(null)).toBe(null);
    expect(redactAuditArgs(undefined)).toBe(undefined);
  });

  it('preserves Date instances rather than flattening them to {}', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    const out = redactAuditArgs({ data: { deadline: d } }) as any;
    expect(out.data.deadline).toBeInstanceOf(Date);
    expect(out.data.deadline.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('truncates beyond the depth guard instead of recursing forever', () => {
    // Build a structure deeper than the depth-8 guard.
    let deep: any = { leaf: true };
    for (let i = 0; i < 12; i++) deep = { nested: deep };

    const out = redactAuditArgs(deep);

    // Walk down and assert we hit the truncation sentinel rather than blowing the stack.
    let cursor: any = out;
    let hops = 0;
    while (cursor && typeof cursor === 'object' && 'nested' in cursor) {
      cursor = cursor.nested;
      hops++;
      if (hops > 20) break;
    }
    expect(cursor).toBe('[TRUNCATED]');
  });
});
