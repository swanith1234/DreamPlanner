// End-to-end chat check against the live DB with a real signed JWT.
// Run: npx tsx src/scripts/e2e_chat_check.ts <userId> <email>
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../config/database';

const userId = process.argv[2];
const email = process.argv[3];
const BASE = process.env.E2E_BASE || 'http://localhost:3999';

async function main() {
    const token = jwt.sign({ userId, email }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    const cookie = `accessToken=${token}`;

    const turns = [
        'what are my pending tasks?',
        'how is my discipline score this week?',
    ];

    for (const message of turns) {
        const t0 = Date.now();
        const res = await fetch(`${BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ message }),
        });
        const body: any = await res.json();
        console.log(`\n▶ "${message}"`);
        console.log(`  status=${res.status} mode=${body.responseMode} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        console.log(`  text: ${String(body.text ?? body.error).slice(0, 300)}`);
    }
}

main()
    .catch(e => { console.error('FATAL', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
