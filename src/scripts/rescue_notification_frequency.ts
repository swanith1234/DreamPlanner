import prisma from '../config/database';

async function rescueNotificationFrequency() {
  console.log('🚀 Starting notification frequency rescue script...');

  try {
    const result = await prisma.userPreference.updateMany({
      where: {
        notificationFrequency: 1,
      },
      data: {
        notificationFrequency: 180,
      },
    });

    console.log(`✅ Successfully updated ${result.count} user preferences from 1 to 180.`);
  } catch (error) {
    console.error('❌ Failed to update notification frequencies:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

rescueNotificationFrequency();
