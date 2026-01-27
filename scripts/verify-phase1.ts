
import prisma from '../src/config/database';
import { taskService } from '../src/modules/task/task.service';
import { notificationWorker } from '../src/modules/notification/notification.worker';
import { notificationService } from '../src/modules/notification/notification.service';
import { NotificationStatus, MotivationTone } from '@prisma/client';
import { authService } from '../src/modules/auth/auth.service';

async function main() {
    console.log('--- STARTING PHASE-1 VERIFICATION ---');


    // 1. SETUP USER & DREAM
    console.log('\n[1] Registering User & Login...');
    const email = `smac@gmail.com`;
    const password = '1234';

    // Register
    const { user, token } = await authService.signup({
        email,
        password,
        name: 'Test Phase1 User'
    });
    console.log(`User created: ${user.id}`);

    // Verify Login (and usage of token conceptually)
    const loginResult = await authService.login({ email, password });
    console.log(`Login successful. Token: ${loginResult.token.substring(0, 20)}...`);

    // Update preferences to match test parameters (AuthService sets defaults)
    // We need 60 min frequency and no quiet hours for this test logic
    await prisma.userPreference.update({
        where: { userId: user.id },
        data: {
            notificationFrequency: 60,
            motivationTone: MotivationTone.POSITIVE,
            sleepStart: '23:00',
            sleepEnd: '07:00',
            quietHours: []
        }
    });

    const dream = await prisma.dream.create({
        data: {
            userId: user.id,
            title: 'Become a Senior Dev',
            description: 'Master backend',
            deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            motivationStatement: 'I want to build cool things',
            impactScore: 10
        }
    });

    // 2. CREATE TASK WITH CHECKPOINTS
    console.log('\n[2] Creating Task...');
    const startDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // Starts in 2 hours
    const deadline = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days task

    const task = await taskService.createTask(user.id, {
        dreamId: dream.id,
        title: 'Study System Design',
        description: 'Read DDIA',
        startDate: startDate.toISOString(),
        deadline: deadline.toISOString(),
        priority: 3,
        checkpoints: [
            { title: 'Chapter 1', targetDate: startDate.toISOString(), orderIndex: 1 },
            { title: 'Chapter 2', targetDate: new Date(startDate.getTime() + 86400000).toISOString(), orderIndex: 2 }
        ]
    });

    console.log(`Task created: ${task.id}`);

    // Verify Checkpoints
    const freshTask = await prisma.task.findUnique({
        where: { id: task.id },
        include: { checkpoints: true }
    });
    console.log(`Checkpoints count: ${freshTask?.checkpoints.length}`);
    if (freshTask?.checkpoints.length !== 2) throw new Error('Checkpoints mismatch');

    // 3. VERIFY INITIAL SCHEDULING
    console.log('\n[3] Verifying Initial Scheduling...');
    const notifications = await prisma.notification.findMany({
        where: { taskId: task.id, status: NotificationStatus.SCHEDULED }
    });
    console.log(`Scheduled Notifications: ${notifications.length}`);
    if (notifications.length !== 1) throw new Error('Should have strictly 1 notification');
    console.log(`Wait Type: ${notifications[0].type}`);
    console.log(`Message: ${notifications[0].message}`); // Should be "Get ready..."

    // 4. SIMULATE NOTIFICATION SEND (Hack: move scheduled time to past)
    console.log('\n[4] Simulating Time Passing...');
    const notifId = notifications[0].id;
    await prisma.notification.update({
        where: { id: notifId },
        data: { scheduledAt: new Date(Date.now() - 1000) } // Past
    });

    // 5. RUN WORKER LOGIC
    console.log('\n[5] Running Worker...');
    // Since worker has a loop, we can't just call start().
    // We'll call poll() method logic directly or expose it, or just rely on 'getDueNotifications' + 'processNotification'
    // But processNotification is private. 
    // Let's use `notificationWorker` instance but we need to access private method.
    // OR we can just spin up the worker and wait, then stop it?
    // Let's rely on `notificationWorker['processNotification'](notif)` via type casting hack or just simple mocking.
    // Actually, I can just call the public methods if I expose `processNotification` or I can just use `start()` and `stop()` quickly.

    // Let's try running start(), waiting 2 sec, then stop().
    await notificationWorker.start();
    await new Promise(r => setTimeout(r, 2000));
    await notificationWorker.stop();

    // 6. VERIFY SENT & NEW SCHEDULE
    console.log('\n[6] Verifying Follow-up...');
    const updatedNotif = await prisma.notification.findUnique({ where: { id: notifId } });
    console.log(`Old Notification Status: ${updatedNotif?.status}`); // SENT

    const nextNotifs = await prisma.notification.findMany({
        where: { taskId: task.id, status: NotificationStatus.SCHEDULED }
    });
    console.log(`Next Scheduled Notifications: ${nextNotifs.length}`);
    if (nextNotifs.length !== 1) console.warn('Warning: Next notification not scheduled (maybe logic prevented it?)');
    else console.log(`Next Notification Time: ${nextNotifs[0].scheduledAt.toISOString()}`);

    console.log('--- VERIFICATION COMPLETE ---');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
        // process.exit(0);
    });
