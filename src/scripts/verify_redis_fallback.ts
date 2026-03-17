import prisma from '../config/database';
import { runNotificationCron } from '../modules/notification/notification.cron';
import * as queue from '../modules/notification/queue';
import { NotificationStatus } from '@prisma/client';

async function testRedisFallback() {
    console.log('--- Testing Redis Fallback Logic ---');

    // 1. Get an existing user
    const user = await prisma.user.findFirst();
    if (!user) {
        throw new Error('No users found in database to test with.');
    }

    // 2. Create a SCHEDULED notification due NOW
    const notification = await prisma.notification.create({
        data: {
            userId: user.id,
            type: 'REMINDER',
            message: 'Test Fallback Message',
            scheduledAt: new Date(Date.now() - 1000), // 1s ago
            status: NotificationStatus.SCHEDULED
        }
    });

    console.log(`Created test notification: ${notification.id}`);

    // 3. Mock enqueueNotificationJob to FAIL
    const originalEnqueue = queue.enqueueNotificationJob;
    (queue as any).enqueueNotificationJob = async () => {
        throw new Error('REDIS_CONNECTION_ERROR_SIMULATED');
    };

    try {
        console.log('Running cron with simulated Redis failure...');
        const result = await runNotificationCron();
        console.log('Cron Result:', result);

        // 4. Verify the notification was processed via fallback
        const updated = await prisma.notification.findUnique({
            where: { id: notification.id }
        });

        console.log(`Notification status after cron: ${updated?.status}`);
        
        if (updated?.status === NotificationStatus.SENT) {
            console.log('✅ Success: Cron fell back to Direct Dispatch and SENT the notification.');
        } else {
            console.log('❌ Failure: Notification was NOT processed via fallback.');
        }

    } catch (err) {
        console.error('Test script failed unexpectedly:', err);
    } finally {
        // Restore mock
        (queue as any).enqueueNotificationJob = originalEnqueue;
        // Cleanup if needed (optional)
        // await prisma.notification.delete({ where: { id: notification.id } });
        await prisma.$disconnect();
    }
}

testRedisFallback();
