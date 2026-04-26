/**
 * ANALYTICS SERVICE — Clean, deterministic, sprint-scoped weekly engine.
 *
 * Facts stored  : TaskCheckpoint, Day, completedAt, targetDate, effort
 * Meaning computed : EARLY / ON_TIME / RECOVERED / OVERDUE_PENDING
 * Intelligence returned : rates, scores, activity map
 *
 * Live dashboard → computed on-demand, NOT from snapshot.
 * Weekly cron    → stores finalized results in UserInsightSnapshot (Sunday).
 */

import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { startOfWeek, endOfWeek, differenceInDays, startOfDay, format, endOfDay, min, subDays } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { MotivationTone, UserEventType, BehavioralState } from '@prisma/client';
import { generateNextSprintPlan, generateWeeklyInsight } from './analytics.llm';
import { userEventService } from '../event/user-event.service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SprintDashboard {
    sprintWindow: { start: string; end: string };
    checkpoints: {
        planned: { count: number; items: any[] };
        earlyCompleted: { count: number; items: any[] };
        onTimeCompleted: { count: number; items: any[] };
        recovered: { count: number; items: any[] };
        overduePending: { count: number; items: any[] };
    };
    rates: {
        executionRate: number;
        recoveryRate: number;
    };
    activity: {
        activeDays: number;
        missedDays: number;
        overachievementDays: number;
        totalEffort: number;
        dailyEffort: Record<string, number>;
    };
    scores: {
        consistency: number;
        intensity: number;
        disciplineScore: number;
    };
}

export class AnalyticsService {

    // ── Sprint window helpers ──────────────────────────────────────────────────
    // Pure UTC date-string arithmetic — no server timezone dependency.
    // Input: YYYY-MM-DD string in user's local timezone.
    // Returns: sprint start (Monday) and end (Sunday) as YYYY-MM-DD strings.
    private sprintBounds(todayStr: string): { startStr: string; endStr: string } {
        // Parse the date string as UTC noon to avoid any DST ambiguity
        const d = new Date(todayStr + 'T12:00:00Z');
        // getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat
        // Days since last Monday (Mon=0 offset)
        const dow = (d.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
        const monday = new Date(d);
        monday.setUTCDate(d.getUTCDate() - dow);
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);
        return {
            startStr: monday.toISOString().slice(0, 10), // 'YYYY-MM-DD'
            endStr: sunday.toISOString().slice(0, 10),
        };
    }

    // ── Core: compute live weekly dashboard ───────────────────────────────────

    async computeDashboard(userId: string, date: Date = new Date()): Promise<SprintDashboard> {
        // ── 0. Initial Setup & Parallel Fetch ──────────────────────────────────────
        
        // Fetch timezone and planned checkpoints in parallel
        const [userRecord, dayRecords] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: { timezone: true },
            }),
            prisma.day.findMany({
                where: {
                    userId,
                    date: {
                        gte: subDays(startOfWeek(date), 2), // Buffer for TZ
                        lte: endOfDay(endOfWeek(date)),
                    },
                },
            }),
        ]);

        const tz = userRecord?.timezone || 'Asia/Kolkata';
        const toLocalDate = (d: Date) => formatInTimeZone(d, tz, 'yyyy-MM-dd');
        const todayLocal = toLocalDate(date);
        const { startStr: sprintStartStr, endStr: sprintEndStr } = this.sprintBounds(todayLocal);

        // Pad range for query
        const queryStart = new Date(sprintStartStr + 'T00:00:00Z');
        queryStart.setUTCDate(queryStart.getUTCDate() - 1);
        const queryEnd = new Date(sprintEndStr + 'T23:59:59Z');
        queryEnd.setUTCDate(queryEnd.getUTCDate() + 1);

        // Fetch planned checkpoints and task-specific checkpoints in parallel
        const allPlannedRaw = await prisma.taskCheckpoint.findMany({
            where: {
                task: { userId },
                targetDate: { gte: queryStart, lte: queryEnd },
            },
            orderBy: { orderIndex: 'asc' },
        });

        // Identify tasks in this sprint and fetch their specific checkpoints surgicaly
        const activeTaskIds = [...new Set(allPlannedRaw.map(cp => cp.taskId))];
        
        // Parallel fetch for task-specific checkpoints to avoid "fetch all"
        const taskCheckpoints = await prisma.taskCheckpoint.findMany({
            where: { taskId: { in: activeTaskIds } },
            orderBy: { orderIndex: 'asc' },
            select: { id: true, taskId: true, orderIndex: true, targetDate: true, isCompleted: true, completedAt: true }
        });

        // ── 1. Map-based Optimisation ─────────────────────────────────────────────
        
        // Group task checkpoints for O(1) lookup
        const checkpointsByTask = new Map<string, typeof taskCheckpoints>();
        for (const cp of taskCheckpoints) {
            const arr = checkpointsByTask.get(cp.taskId) ?? [];
            arr.push(cp);
            checkpointsByTask.set(cp.taskId, arr);
        }

        // Group day records for O(1) lookup
        const daysByCheckpoint = new Map<string, typeof dayRecords>();
        for (const d of dayRecords) {
            const arr = daysByCheckpoint.get(d.checkpointId) ?? [];
            arr.push(d);
            daysByCheckpoint.set(d.checkpointId, arr);
        }

        // ── 2. Categorisation ─────────────────────────────────────────────────────

        const planned = allPlannedRaw.filter(cp => {
            const d = toLocalDate(cp.targetDate);
            return d >= sprintStartStr && d <= sprintEndStr;
        });

        const earlyCompleted: any[] = [];
        const onTimeCompleted: any[] = [];
        const recovered: any[] = [];
        const overduePending: any[] = [];

        for (const cp of planned) {
            if (cp.isCompleted) {
                // Find next checkpoint using the pre-grouped Map (O(1) vs O(N))
                const taskCps = checkpointsByTask.get(cp.taskId) || [];
                const nextCp = taskCps.find(c => c.orderIndex > cp.orderIndex);

                let isEarly = false;
                if (nextCp) {
                    const nextDays = daysByCheckpoint.get(nextCp.id) ?? [];
                    const nextCpTargetStart = startOfDay(nextCp.targetDate);
                    isEarly = nextDays.some(d => d.date < nextCpTargetStart);
                }

                if (isEarly) {
                    earlyCompleted.push(cp);
                } else if (cp.completedAt) {
                    const completedDay = toLocalDate(cp.completedAt);
                    const targetDay = toLocalDate(cp.targetDate);
                    if (completedDay > targetDay) {
                        recovered.push(cp);
                    } else {
                        onTimeCompleted.push(cp);
                    }
                } else {
                    onTimeCompleted.push(cp);
                }
            } else {
                const targetDay = toLocalDate(cp.targetDate);
                if (targetDay < todayLocal) {
                    overduePending.push(cp);
                }
            }
        }

        // ── 3. Rates & Metrics ──────────────────────────────────────────────────

        const totalCompleted = earlyCompleted.length + onTimeCompleted.length + recovered.length;
        const totalPlanned = planned.length;

        const executionRate = totalPlanned === 0 ? 100 : Math.round((totalCompleted / totalPlanned) * 100);
        const totalOverdue = overduePending.length + recovered.length;
        const recoveryRate = totalOverdue === 0 ? 100 : Math.round((recovered.length / totalOverdue) * 100);

        const dailyEffort: Record<string, number> = {};
        for (let i = 0; i < 7; i++) {
            const d = new Date(sprintStartStr + 'T12:00:00Z');
            d.setUTCDate(d.getUTCDate() + i);
            dailyEffort[d.toISOString().slice(0, 10)] = 0;
        }

        let totalEffort = 0;
        for (const d of dayRecords) {
            const key = toLocalDate(d.date);
            if (key in dailyEffort) {
                dailyEffort[key] += d.effort;
            }
            totalEffort += d.effort;
        }

        const effortValues = Object.values(dailyEffort);
        const activeDays = effortValues.filter(e => e > 0).length;
        const missedDays = 7 - activeDays;
        const avgEffort = activeDays > 0 ? totalEffort / activeDays : 0;
        const overachievementDays = effortValues.filter(e => e > avgEffort).length;

        const consistency = Math.min(Math.round((activeDays / 7) * 100), 100);
        const intensity = Math.min(Math.round(activeDays > 0 ? totalEffort / activeDays : 0), 100);
        const disciplineScore = Math.round((consistency * 0.25) + (executionRate * 0.25) + (recoveryRate * 0.25) + (intensity * 0.25));

        return {
            sprintWindow: { start: sprintStartStr, end: sprintEndStr },
            checkpoints: {
                planned: { count: totalPlanned, items: planned },
                earlyCompleted: { count: earlyCompleted.length, items: earlyCompleted },
                onTimeCompleted: { count: onTimeCompleted.length, items: onTimeCompleted },
                recovered: { count: recovered.length, items: recovered },
                overduePending: { count: overduePending.length, items: overduePending },
            },
            rates: { executionRate, recoveryRate },
            activity: { activeDays, missedDays, overachievementDays, totalEffort, dailyEffort },
            scores: { consistency, intensity, disciplineScore },
        };
    }

    // ── Weekly cron: finalize & store snapshot (Sunday 23:59) ─────────────────
    // Called ONLY by cron. Live dashboard must call computeDashboard() directly.

    async finalizeWeeklySnapshot(userId: string, date: Date = new Date()): Promise<void> {
        try {
            const dashboard = await this.computeDashboard(userId, date);
            const tz2 = (await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }))?.timezone || 'Asia/Kolkata';
            const todayStr2 = formatInTimeZone(date, tz2, 'yyyy-MM-dd');
            const { startStr: weekStart, endStr: weekEnd } = this.sprintBounds(todayStr2);

            const {
                checkpoints: { planned, earlyCompleted, onTimeCompleted, recovered, overduePending },
                rates: { executionRate, recoveryRate },
                activity: { activeDays, totalEffort, dailyEffort },
                scores: { disciplineScore, consistency: consistencyScore },
            } = dashboard;

            const totalCompleted = earlyCompleted.count + onTimeCompleted.count + recovered.count;
            const lateCheckpoints = recovered.count + overduePending.count;
            const earlyStarts = earlyCompleted.count;

            const updatePayload = {
                activeDays,
                missedDays: 7 - activeDays,
                disciplineScore,
                consistencyScore,
                executionRate,
                recoveryRate,
                intensityScore: dashboard.scores.intensity,
                totalCheckpointsPlanned: planned.count,
                totalCheckpointsCompleted: totalCompleted,
                lateCheckpoints,
                earlyStarts,
                overachievementDays: dashboard.activity.overachievementDays,
                overduePending: overduePending.count,
                recovered: recovered.count,
                dailyEffort,
                finalizedAt: new Date(),
                updatedAt: new Date(),
            };

            // weekStart/weekEnd stored as DateTime — convert ISO date strings to Date objects
            const weekStartDate = new Date(weekStart + 'T00:00:00Z');
            const weekEndDate = new Date(weekEnd + 'T00:00:00Z');

            // ── COMPUTE BEHAVIORAL STATE ────────────────────────────────────────────────
            const previousWeekStart = subDays(weekStartDate, 7);
            const pastSnapshot = await prisma.userInsightSnapshot.findFirst({
                where: { userId, dreamId: null, weekStart: previousWeekStart }
            });

            // 1. Discipline Trend
            const pastDiscipline = pastSnapshot?.disciplineScore ?? disciplineScore;
            const disciplineTrend = disciplineScore - pastDiscipline;

            // 2. Effort Trend (Last 3 days vs Previous 3 days of *this* sprint)
            const effortValues = Object.values(dailyEffort as Record<string, number>);
            const recent3 = effortValues.slice(-3).reduce((a, b) => a + b, 0) / 3;
            const prev3 = effortValues.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;

            let effortTrendStr = 'STABLE';
            if (prev3 > 0) {
                if (recent3 < prev3 * 0.7) effortTrendStr = 'DECLINING';
                if (recent3 > prev3 * 1.2) effortTrendStr = 'BUILDING';
            } else if (recent3 > 0) {
                effortTrendStr = 'BUILDING'; // from 0 to something
            }

            // 3. Avoidance Pattern
            const remainingWorkPercent = totalCompleted > 0 ? 100 - executionRate : 100;
            const avoidancePattern = lateCheckpoints > 2 && remainingWorkPercent > 40 && activeDays < 4;

            // 4. Overcommitment
            const overloaded = planned.count > 15 && executionRate < 40 && (7 - activeDays) > 2;

            // 5. Recovery Strong
            const recoveryStrong = (overduePending.count + recovered.count) > 0 && recovered.count > 0 && recoveryRate >= 50;

            // Classify State
            let behavioralState: BehavioralState = BehavioralState.STABLE;

            if (disciplineScore > 80 && (activeDays / 7) >= 0.8) {
                behavioralState = BehavioralState.HIGH_PERFORMER;
            } else if (disciplineTrend <= -5 && effortTrendStr === 'DECLINING') {
                behavioralState = BehavioralState.MOMENTUM_DECLINING;
            } else if (avoidancePattern) {
                behavioralState = BehavioralState.AVOIDANCE_MODE;
            } else if (overloaded) {
                behavioralState = BehavioralState.OVERLOADED;
            } else if (recoveryStrong) {
                behavioralState = BehavioralState.RESILIENT_FIGHTER;
            } else if (disciplineTrend >= 5 || effortTrendStr === 'BUILDING') {
                behavioralState = BehavioralState.MOMENTUM_BUILDING;
            } else if (disciplineTrend === 0 && effortTrendStr === 'STABLE' && executionRate < 50) {
                behavioralState = BehavioralState.STAGNATING;
            }

            const existing = await prisma.userInsightSnapshot.findFirst({
                where: { userId, dreamId: null, weekStart: weekStartDate },
            });

            let snapshot;
            if (existing) {
                snapshot = await prisma.userInsightSnapshot.update({
                    where: { id: existing.id },
                    data: { ...updatePayload, behavioralState },
                });
            } else {
                snapshot = await prisma.userInsightSnapshot.create({
                    data: {
                        userId,
                        dreamId: null,
                        weekStart: weekStartDate,
                        weekEnd: weekEndDate,
                        longestStreak: 0,
                        currentStreak: 0,
                        avgDailyProgress: 0,
                        avgProgressLatencyHours: 0,
                        dailyStatus: {},
                        behavioralState,
                        ...updatePayload,
                    },
                });
            }

            // Generate AI insight for this finalized week
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { preferences: true },
            });

            if (user) {
                const insight = await generateWeeklyInsight({
                    userName: user.name || 'User',
                    tone: user.preferences?.motivationTone ?? MotivationTone.NEUTRAL,
                    snapshot,
                });

                await prisma.generatedInsight.create({
                    data: {
                        userId,
                        dreamId: null,
                        weekStart: weekStartDate,
                        insightType: insight.insightType,
                        evidence: { ...insight.evidence, narrative: insight.message },
                        consumed: false,
                    },
                });

                // ── Roadmap-based next sprint plan (if user has an ACTIVE roadmap) ──
                const activeRoadmap = await prisma.roadmap.findFirst({
                    where: { userId, status: 'ACTIVE' },
                    include: {
                        dream: { select: { title: true } },
                        milestones: {
                            orderBy: { orderIndex: 'asc' },
                            include: { skills: { orderBy: { orderIndex: 'asc' } } }
                        },
                    },
                    orderBy: { updatedAt: 'desc' },
                });

                if (activeRoadmap) {
                    const nextMilestone = activeRoadmap.milestones.find(m => m.status !== 'COMPLETED');
                    const upcomingSkills = (nextMilestone?.skills || [])
                        .filter(s => s.status !== 'COMPLETED')
                        .slice(0, 3)
                        .map(s => ({
                            title: s.title,
                            completionCriteria: s.completionCriteria,
                            difficulty: String(s.difficulty),
                        }));

                    if (upcomingSkills.length) {
                        const plan = await generateNextSprintPlan({
                            userName: user.name || 'User',
                            tone: user.preferences?.motivationTone ?? MotivationTone.NEUTRAL,
                            roadmapTitle: activeRoadmap.dream.title,
                            upcomingMilestoneTitle: nextMilestone?.title,
                            upcomingSkills,
                            lastWeekSnapshot: snapshot,
                        });

                        await prisma.generatedInsight.create({
                            data: {
                                userId,
                                dreamId: activeRoadmap.dreamId,
                                weekStart: weekStartDate,
                                insightType: plan.insightType,
                                evidence: {
                                    ...plan.evidence,
                                    narrative: plan.message,
                                    roadmapId: activeRoadmap.id,
                                    milestoneId: nextMilestone?.id,
                                },
                                consumed: false,
                            },
                        });
                    }
                }
            }

            await logger.info('analytics', 'Weekly snapshot finalized', { userId, weekStart });
        } catch (error: any) {
            logger.error('analytics', 'Failed to finalize weekly snapshot', { userId, error: error.message });
            throw error;
        }
    }

    // ── List all finalized sprint snapshots for a user (for sprint picker) ────
    async listPastSprints(userId: string) {
        return prisma.userInsightSnapshot.findMany({
            where: { userId, dreamId: null, finalizedAt: { not: null } },
            orderBy: { weekStart: 'desc' },
            select: {
                id: true,
                weekStart: true,
                weekEnd: true,
                disciplineScore: true,
                executionRate: true,
                recoveryRate: true,
                totalCheckpointsPlanned: true,
                totalCheckpointsCompleted: true,
            },
        });
    }

    // ── Get full stored snapshot by weekStart ISO string ──────────────────────
    async getSprintSnapshot(userId: string, weekStart: string) {
        const weekStartDate = new Date(weekStart + 'T00:00:00Z');
        return prisma.userInsightSnapshot.findFirst({
            where: { userId, dreamId: null, weekStart: weekStartDate },
        });
    }

    // ── Top-level triggers for external Webhooks (Render cron) ────────────────

    async runWeeklySnapshotsForAllUsers(targetDateStr?: string) {
        try {
            const targetDate = targetDateStr ? new Date(targetDateStr + 'T12:00:00Z') : new Date();
            const users = await prisma.user.findMany({ select: { id: true } });
            for (const user of users) {
                await this.finalizeWeeklySnapshot(user.id, targetDate);
            }
            logger.info('analytics', `Weekly snapshots done for ${users.length} users`, { targetDateStr });
        } catch (error: any) {
            logger.error('analytics', 'Error running weekly snapshots', { error: error.message });
            throw error;
        }
    }

    async runDailyActivityCheckForAllUsers() {
        try {
            const todayStart = startOfDay(new Date());
            const users = await prisma.user.findMany({ select: { id: true } });

            for (const user of users) {
                const hadActivity = await prisma.day.findFirst({
                    where: { userId: user.id, date: todayStart },
                });

                if (!hadActivity) {
                    await userEventService.logEvent(
                        user.id,
                        UserEventType.DAY_WITH_NO_ACTIVITY,
                        'NOTIFICATION',
                        'system',
                        { date: todayStart.toISOString() }
                    );
                }
            }
            logger.info('analytics', `Daily activity check done for ${users.length} users`);
        } catch (error: any) {
            logger.error('analytics', 'Error running daily activity check', { error: error.message });
            throw error;
        }
    }
}

export const analyticsService = new AnalyticsService();
