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
