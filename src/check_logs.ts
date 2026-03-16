
import prisma from './config/database';

async function checkLogs() {
  const logs = await prisma.appLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  console.log('--- RECENT LOGS ---');
  logs.forEach(log => {
    console.log(`[${log.createdAt.toISOString()}] [${log.level}] [${log.source}] ${log.message}`);
    if (log.context) {
      console.log('Context:', JSON.stringify(log.context, null, 2));
    }
    console.log('---');
  });

  process.exit(0);
}

checkLogs().catch(err => {
  console.error(err);
  process.exit(1);
});
