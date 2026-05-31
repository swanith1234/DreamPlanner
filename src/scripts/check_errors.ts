import prisma from '../config/database';

async function main() {
  try {
    const logs = await prisma.appLog.findMany({
      where: { level: 'ERROR' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    console.log('--- Last 10 Errors in AppLog ---');
    console.log(JSON.stringify(logs, null, 2));
  } catch (error: any) {
    console.error('Error fetching logs:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
