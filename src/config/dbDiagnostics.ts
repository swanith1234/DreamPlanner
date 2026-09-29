import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Startup diagnostics for database connectivity.
 *
 * Exists because "Error opening a TLS connection: OpenSSL error" from Prisma is
 * almost entirely opaque: it does not say which host it dialled, which engine
 * binary it loaded, or whether that engine matches the platform. Debugging it
 * from a crash-looping container previously meant one guess per deploy.
 *
 * SAFETY: never logs credentials. The connection string is decomposed and only
 * host / port / database / sslmode are reported — username and password are
 * dropped entirely, not masked.
 */

export interface DbDiagnostics {
    source: 'DIRECT_URL' | 'DATABASE_URL' | 'none';
    host: string;
    port: string;
    database: string;
    sslmode: string;
    platform: string;
    nodeVersion: string;
    engines: string[];
    expectedEnginePresent: boolean;
}

/** Parse a Postgres URL, discarding credentials entirely. */
function describeUrl(raw: string): Pick<DbDiagnostics, 'host' | 'port' | 'database' | 'sslmode'> {
    try {
        const u = new URL(raw);
        return {
            host: u.hostname || '(none)',
            port: u.port || '(default)',
            database: u.pathname.replace(/^\//, '') || '(none)',
            sslmode: u.searchParams.get('sslmode') || '(unset)',
        };
    } catch {
        return { host: '(unparseable)', port: '(unparseable)', database: '(unparseable)', sslmode: '(unparseable)' };
    }
}

/**
 * On Linux, Prisma needs libquery_engine-debian-openssl-3.0.x.so.node. If the
 * build cache served a client generated without it, every query fails with the
 * OpenSSL TLS error even though the connection string is perfectly valid.
 */
function listEngines(): { engines: string[]; expectedEnginePresent: boolean } {
    const candidates = [
        join(process.cwd(), 'node_modules', '.prisma', 'client'),
        join(__dirname, '..', '..', 'node_modules', '.prisma', 'client'),
    ];

    for (const dir of candidates) {
        if (!existsSync(dir)) continue;
        const engines = readdirSync(dir).filter((f) => f.includes('query_engine'));
        const needed = process.platform === 'linux'
            ? engines.some((e) => e.includes('debian-openssl-3.0.x') || e.includes('linux'))
            : true;
        return { engines, expectedEnginePresent: needed };
    }

    return { engines: ['(client directory not found)'], expectedEnginePresent: false };
}

// ─── Connection variant probe ────────────────────────────────────────────────

/**
 * Candidate connection strings to try when the primary one fails.
 *
 * The container that is currently serving production connects fine with the
 * SAME connection string that a freshly built container cannot use, which
 * isolates the fault to the runtime image rather than the URL or the database.
 * Since that is not reproducible off-Render, this enumerates the plausible
 * variants and reports which (if any) succeed there.
 *
 * `sslmode=no-verify` is a libpq spelling; Prisma's documented way to accept a
 * certificate it cannot validate is `sslaccept=accept_invalid_certs`. Both are
 * tried, along with the transaction pooler on 6543.
 */
export function buildConnectionVariants(primary: string): Array<{ label: string; url: string }> {
    const variants: Array<{ label: string; url: string }> = [];
    const push = (label: string, mutate: (u: URL) => void) => {
        try {
            const u = new URL(primary);
            mutate(u);
            variants.push({ label, url: u.toString() });
        } catch {
            /* unparseable primary — nothing to vary */
        }
    };

    push('sslmode=require + sslaccept=accept_invalid_certs', (u) => {
        u.searchParams.set('sslmode', 'require');
        u.searchParams.set('sslaccept', 'accept_invalid_certs');
    });
    push('sslmode=prefer', (u) => {
        u.searchParams.delete('sslaccept');
        u.searchParams.set('sslmode', 'prefer');
    });
    push('sslmode=disable', (u) => {
        u.searchParams.delete('sslaccept');
        u.searchParams.set('sslmode', 'disable');
    });
    push('port 6543 (transaction pooler) + pgbouncer', (u) => {
        u.port = '6543';
        u.searchParams.set('pgbouncer', 'true');
    });

    // The alternate env var, untouched, in case only one of the two is stale.
    const alt = process.env.DIRECT_URL ? process.env.DATABASE_URL : process.env.DIRECT_URL;
    if (alt && alt !== primary) {
        variants.push({ label: 'the other env var, as configured', url: alt });
    }

    return variants;
}

/**
 * Try each variant with a trivial query and report the outcome.
 *
 * Diagnostic only — deliberately does NOT rewire the exported client. Swapping
 * the live singleton would mean silently running production against a connection
 * nobody chose; naming the working variant lets that be a deliberate one-line
 * change instead.
 */
export async function probeConnectionVariants(primary: string): Promise<void> {
    const variants = buildConnectionVariants(primary);
    if (variants.length === 0) return;

    // Imported lazily so this file stays cheap for the normal startup path.
    const { PrismaClient } = await import('@prisma/client');

    console.error('[db-probe] primary connection failed — testing alternatives:');

    let anyWorked = false;
    for (const { label, url } of variants) {
        const client = new PrismaClient({ datasources: { db: { url } }, log: [] });
        try {
            await client.$queryRaw`SELECT 1`;
            console.error(`[db-probe]   ✅ WORKS  → ${label}`);
            anyWorked = true;
        } catch (err: any) {
            const msg = String(err?.message ?? '').split('\n').filter(Boolean).pop() ?? 'unknown error';
            console.error(`[db-probe]   ❌ fails  → ${label}  (${msg.slice(0, 90)})`);
        } finally {
            await client.$disconnect().catch(() => { /* ignore */ });
        }
    }

    console.error(
        anyWorked
            ? '[db-probe] At least one variant connects. Apply that form to getFormattedDatabaseUrl().'
            : '[db-probe] No variant connects. The fault is not the SSL parameters — likely the ' +
              'Rust engine TLS stack in this image. Next step is the `pg` driver adapter, which ' +
              'routes Postgres TLS through Node instead of the query engine.'
    );
}

export function collectDbDiagnostics(resolvedUrl: string): DbDiagnostics {
    const source: DbDiagnostics['source'] =
        process.env.DIRECT_URL ? 'DIRECT_URL' :
        process.env.DATABASE_URL ? 'DATABASE_URL' :
        'none';

    const { engines, expectedEnginePresent } = listEngines();

    return {
        source,
        ...describeUrl(resolvedUrl),
        platform: `${process.platform}-${process.arch}`,
        nodeVersion: process.version,
        engines,
        expectedEnginePresent,
    };
}

/** Print diagnostics to stdout. Console only — the DB may be unreachable. */
export function logDbDiagnostics(resolvedUrl: string): void {
    const d = collectDbDiagnostics(resolvedUrl);
    console.log(
        '[db-diagnostics] ' +
        `source=${d.source} host=${d.host} port=${d.port} db=${d.database} sslmode=${d.sslmode} ` +
        `platform=${d.platform} node=${d.nodeVersion} ` +
        `engines=[${d.engines.join(', ')}] engineOk=${d.expectedEnginePresent}`
    );

    if (!d.expectedEnginePresent) {
        console.error(
            '[db-diagnostics] No matching Prisma query engine for this platform. ' +
            'This produces "Error opening a TLS connection: OpenSSL error" regardless of the ' +
            'connection string. Fix: clear the build cache and redeploy so `npm install` ' +
            're-downloads engines for binaryTargets.'
        );
    }
}
