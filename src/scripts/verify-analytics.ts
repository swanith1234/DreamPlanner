import prisma from '../config/database';
import { analyticsService } from '../modules/analytics/analytics.service';
import { userEventService } from '../modules/event/user-event.service';
import { UserEventType } from '@prisma/client';
import { startOfWeek } from 'date-fns';

async function main() {
    console.log('--- Starting Analytics Verification ---');

    // 1. Get or Create User
    let user = await prisma.user.findFirst({ where: { email: 'verify@test.com' } });
    if (!user) {
        user = await prisma.user.create({
            data: {
                email: 'verify@test.com',
                passwordHash: 'hashedpassword', // Updated field name
                name: 'Verify User'
            }
        });
        console.log('Created test user:', user.id);
    } else {
        console.log('Using existing test user:', user.id);
    }

    // 2. Clear previous data for this week
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    await prisma.userEvent.deleteMany({
        where: { userId: user.id, createdAt: { gte: weekStart } }
    });
    await prisma.userInsightSnapshot.deleteMany({
        where: { userId: user.id, weekStart }
    });
    console.log('Cleared previous week data.');

    // 3. Create Dummy Events
    // Simulating: 3 days active, some checkpoints completed.
    await userEventService.logEvent(user.id, UserEventType.TASK_CREATED, 'TASK', 'task-1');
    await userEventService.logEvent(user.id, UserEventType.CHECKPOINT_STARTED, 'CHECKPOINT', 'cp-1');
    await userEventService.logEvent(user.id, UserEventType.CHECKPOINT_COMPLETED, 'CHECKPOINT', 'cp-1');

    // Need to ensure different days for consistency?
    // userEventService.logEvent uses `new Date()`. hard to mock without modifying service or DB directly.
    // I'll insert directly to Prisma for different timestamps.

    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    await prisma.userEvent.create({
        data: {
            userId: user.id,
            entityType: 'CHECKPOINT',
            entityId: 'cp-old',
            eventType: UserEventType.CHECKPOINT_COMPLETED,
            createdAt: yesterday
        }
    });

    await prisma.userEvent.create({
        data: {
            userId: user.id,
            entityType: 'CHECKPOINT',
            entityId: 'cp-older',
            eventType: UserEventType.CHECKPOINT_COMPLETED,
            createdAt: twoDaysAgo
        }
    });

    console.log('Created dummy events.');

    // 4. Create Dummy Tasks/Checkpoints for Execution Rate
    // Need a dream if required?
    const dream = await prisma.dream.create({
        data: {
            userId: user.id,
            title: 'Test Dream',
            description: 'Test Description',
            impactScore: 5,
            status: 'ACTIVE',
            deadline: new Date()
        }
    });

    const task = await prisma.task.create({
        data: {
            userId: user.id,
            dreamId: dream.id,
            title: 'Verification Task',
            priority: 2,
            deadline: new Date(),
            checkpoints: {
                create: [
                    { title: 'CP1', orderIndex: 0, targetDate: new Date(), isCompleted: true, progress: 100 },
                    { title: 'CP2', orderIndex: 1, targetDate: new Date(), isCompleted: false },
                ]
            }
        }
    });
    console.log('Created dummy task with checkpoints.');

    // 5. Run Analytics
    console.log('Generating Weekly Snapshot...');
    await analyticsService.generateWeeklySnapshot(user.id);

    // 6. Verify Result
    const snapshot = await prisma.userInsightSnapshot.findFirst({
        where: {
            userId: user.id,
            dreamId: null, // Global
            weekStart
        }
    });

    const insight = await prisma.generatedInsight.findFirst({
        where: { userId: user.id, weekStart },
        orderBy: { createdAt: 'desc' }
    });

    console.log('--- Verification Results ---');
    if (snapshot) {
        console.log('Snapshot Created:', snapshot.id);
        console.log('Active Days:', snapshot.activeDays); // Should be at least 3 (Today, Yesterday, 2DaysAgo)
        console.log('Discipline Score:', snapshot.disciplineScore);
        console.log('Consistency Score:', snapshot.consistencyScore);
        console.log('Execution Rate (Calc):', Math.round((snapshot.totalCheckpointsCompleted / (snapshot.totalCheckpointsPlanned || 1)) * 100) + '%');
        console.log('Daily Effort:', snapshot.dailyEffort);
    } else {
        console.error('FAILED: No snapshot found.');
    }

    if (insight) {
        console.log('Insight Generated:', insight.insightType);
        console.log('Narrative:', (insight.evidence as any).narrative);
    } else {
        console.error('FAILED: No insight found. (LLM might have failed or mocked?)');
    }

    // Cleanup? Maybe keep for manual inspection.
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
