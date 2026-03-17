import prisma from '../config/database';
import { runNotificationCron } from '../modules/notification/notification.cron';
import { NotificationStatus } from '@prisma/client';

async function testParallelNotifications() {
    console.log('--- Testing Parallel Notification Processing (Redis-less) ---');

    // 1. Get an existing user
    const user = await prisma.user.findFirst();
    if (!user) {
        throw new Error('No users found in database to test with.');
    }

    // 2. Create 5 SCHEDULED notifications due NOW
    console.log('Creating 5 test notifications...');
    const notificationIds: string[] = [];
    for (let i = 0; i < 5; i++) {
        const n = await prisma.notification.create({
            data: {
                userId: user.id,
                type: 'REMINDER',
                message: `Parallel Test Message ${i+1}`,
                scheduledAt: new Date(Date.now() - 1000 * (i + 1)),
                status: NotificationStatus.SCHEDULED
            }
        });
        notificationIds.push(n.id);
    }

    try {
        console.log('Running optimized cron...');
        const startTime = Date.now();
        const result = await runNotificationCron();
        const duration = Date.now() - startTime;
        
        console.log('Cron Result:', result);
        console.log(`Processing took ${duration}ms`);

        // 3. Verify all were SENT
        const updated = await prisma.notification.findMany({
            where: { id: { in: notificationIds } }
        });

        const allSent = updated.every(n => n.status === NotificationStatus.SENT);
        
        if (allSent) {
            console.log('✅ Success: All 5 notifications were processed in parallel and SENT.');
        } else {
            console.log('❌ Failure: Some notifications were not sent.');
            updated.forEach(n => console.log(`ID: ${n.id}, Status: ${n.status}`));
        }

    } catch (err) {
        console.error('Test script failed unexpectedly:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testParallelNotifications();
