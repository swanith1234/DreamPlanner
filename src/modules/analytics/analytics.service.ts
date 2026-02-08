import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { UserInsightSnapshot, CheckpointStatus, UserEventType, MotivationTone, InsightType } from '@prisma/client';
import { startOfWeek, endOfWeek, subWeeks, format } from 'date-fns';
import { generateWeeklyInsight } from './analytics.llm';

export class AnalyticsService {

    /**
     * Generates or updates the Weekly Insight Snapshot for a user.
     * This is typically called by a Cron Job.
     */
    async generateWeeklySnapshot(userId: string, date: Date = new Date()): Promise<void> {
        try {
            const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday start
            const weekEnd = endOfWeek(date, { weekStartsOn: 1 });

            // 1. Fetch Data
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { preferences: true }
            });

            if (!user) {
                throw new Error(`User not found: ${userId}`);
            }

            const [userEvents, tasks, checkpoints] = await Promise.all([
                prisma.userEvent.findMany({
                    where: {
                        userId,
                        createdAt: { gte: weekStart, lte: weekEnd }
                    }
                }),
                prisma.task.findMany({
                    where: { userId, updatedAt: { gte: weekStart, lte: weekEnd } },
                    include: { checkpoints: true }
                }),
                prisma.taskCheckpoint.findMany({
                    where: {
                        task: { userId },
                        targetDate: { gte: weekStart, lte: weekEnd }
                    }
                })
            ]);

            // 2. Calculate Metrics

            // Active Days (Consistency)
            const relevantEventTypes: UserEventType[] = [
                UserEventType.CHECKPOINT_STARTED,
                UserEventType.CHECKPOINT_PROGRESS_UPDATED,
                UserEventType.CHECKPOINT_COMPLETED,
                UserEventType.TASK_COMPLETED
            ];

            const activeDaysSet = new Set(
                userEvents
                    .filter(e => relevantEventTypes.includes(e.eventType))
                    .map(e => format(e.createdAt, 'yyyy-MM-dd'))
            );
            const activeDays = activeDaysSet.size;

            // Execution logic
            const totalCheckpointsPlanned = checkpoints.length;
            const totalCheckpointsCompleted = checkpoints.filter(cp => cp.isCompleted).length;

            const lateCheckpoints = checkpoints.filter(cp =>
                cp.isCompleted && cp.status === CheckpointStatus.DUE
            ).length;

            // Early Start logic
            const earlyStarts = checkpoints.filter(cp => cp.startedEarly).length;

            // Overachievement
            const overachievementDays = new Set(
                checkpoints.filter(cp => cp.progress > 100).map(cp => format(cp.targetDate, 'yyyy-MM-dd'))
            ).size;


            // Scores
            // Consistency Score (0-100)
            const consistencyScore = Math.min(Math.round((activeDays / 7) * 100), 100);

            // Execution Rate (0-100)
            const executionRate = totalCheckpointsPlanned > 0
                ? Math.round((totalCheckpointsCompleted / totalCheckpointsPlanned) * 100)
                : 0;

            // Recovery Rate
            // Simplified placeholder per plan explanation
            const recoveryRate = 100;

            // Early Bonus
            // min((EarlyStarts + OverachievementEvents) / PlannedCheckpoints, 1) * 100
            const earlyBonus = totalCheckpointsPlanned > 0
                ? Math.min(Math.round(((earlyStarts + overachievementDays) / totalCheckpointsPlanned) * 100), 100)
                : 0;

            // Discipline Score
            // 0.35 * Consistency + 0.30 * Execution + 0.20 * Recovery + 0.15 * EarlyBonus
            const disciplineScore = Math.round(
                (0.35 * consistencyScore) +
                (0.30 * executionRate) +
                (0.20 * recoveryRate) +
                (0.15 * earlyBonus)
            );

            // Daily Effort Visualization
            const dailyEffort: Record<string, number> = {};
            const dailyStatus: Record<string, string> = {};

            // Initialize days
            for (let i = 0; i < 7; i++) {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + i);
                const key = format(d, 'eee'); // Mon, Tue...
                dailyEffort[key] = 0;
                // Simple logic for effort: sum of progress of checkpoints targeted for that day?
                // Or sum of progress updates happened that day?
                // "Height = % effort for the day".
                // Let's sum progress of checkpoints targeted for that day.
                // Or better, sum of 'UserEvent.CHECKPOINT_PROGRESS_UPDATED' logic?
                // Prompt says: "Daily Effort Json { Mon: 120 ... }".
                // Let's iterate checkpoints and add their progress to their targetDate day.
                const dayCheckpoints = checkpoints.filter(cp => format(cp.targetDate, 'eee') === key);
                const totalProgress = dayCheckpoints.reduce((sum, cp) => {
                    let p = cp.progress;
                    if (p === 0 && cp.isCompleted) p = 100;
                    return sum + p;
                }, 0);
                dailyEffort[key] = totalProgress; // Total % output.
            }


            // 3. Upsert Snapshot (Manual check to handle dreamId: null unique constraint issue)
            const existingSnapshot = await prisma.userInsightSnapshot.findFirst({
                where: {
                    userId,
                    weekStart,
                    dreamId: null
                }
            });

            const updateData = {
                activeDays,
                disciplineScore,
                consistencyScore,
                totalCheckpointsPlanned,
                totalCheckpointsCompleted,
                lateCheckpoints,
                earlyStarts,
                overachievementDays,
                dailyEffort,
                updatedAt: new Date()
            };

            const createData = {
                userId,
                dreamId: null,
                weekStart,
                weekEnd,
                activeDays,
                missedDays: 7 - activeDays,
                longestStreak: 0,
                currentStreak: 0,
                totalCheckpointsPlanned,
                totalCheckpointsCompleted,
                lateCheckpoints,
                earlyStarts,
                overachievementDays,
                avgDailyProgress: 0,
                avgProgressLatencyHours: 0,
                dailyEffort,
                dailyStatus: {},
                disciplineScore,
                consistencyScore,
            };

            let snapshot;
            if (existingSnapshot) {
                snapshot = await prisma.userInsightSnapshot.update({
                    where: { id: existingSnapshot.id },
                    data: updateData
                });
            } else {
                snapshot = await prisma.userInsightSnapshot.create({
                    data: createData
                });
            }

            // 4. Generate AI Insight
            const insight = await generateWeeklyInsight({
                userName: user.name || 'User',
                tone: user.preferences?.motivationTone || MotivationTone.NEUTRAL,
                snapshot,
            });

            await prisma.generatedInsight.create({
                data: {
                    userId,
                    dreamId: null,
                    weekStart,
                    insightType: insight.insightType,
                    evidence: {
                        ...insight.evidence,
                        narrative: insight.message // Store the text in evidence or a separate field? 
                        // Schema: `evidence Json`.
                        // The dashboard needs "Paragraph written by AI".
                        // GeneratedInsight doesn't have a `message` field? 
                        // Phase 1 schema had `message` in Notification, but here GeneratedInsight has `insightType` and `evidence`.
                        // I should store the narrative IN `evidence` JSON.
                    },
                    consumed: false // New unread insight
                }
            });

        } catch (error: any) {
            logger.error('analytics', `Failed to generate weekly snapshot`, { userId, error: error.message });
            throw error;
        }
    }
}

export const analyticsService = new AnalyticsService();
