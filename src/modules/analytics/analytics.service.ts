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
import { startOfWeek, endOfWeek, startOfDay, format } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { MotivationTone } from '@prisma/client';
import { generateWeeklyInsight } from './analytics.llm';

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

    private sprintBounds(date: Date = new Date()) {
        return {
            start: startOfWeek(date, { weekStartsOn: 1 }),  // Monday 00:00
            end: endOfWeek(date, { weekStartsOn: 1 }),     // Sunday 23:59:59
        };
    }

    // ── Core: compute live weekly dashboard ───────────────────────────────────

    async computeDashboard(userId: string, date: Date = new Date()): Promise<SprintDashboard> {
        // ── 0. User timezone ──────────────────────────────────────────────────────
        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { timezone: true },
        });
        const tz = userRecord?.timezone || 'Asia/Kolkata'; // fall back to IST if not set

        // Helper: convert any UTC Date to a YYYY-MM-DD string in the user's TZ
        const toLocalDate = (d: Date) => formatInTimeZone(d, tz, 'yyyy-MM-dd');

        // "Today" in user's local timezone
        const todayLocal = toLocalDate(date);

        // ── Sprint window in user's timezone ──────────────────────────────────────
        // Convert "now" to the user's local midnight, then compute Mon/Sun of that week
        const nowInUserTZ = toZonedTime(date, tz);
        const { start: sprintStart, end: sprintEnd } = this.sprintBounds(nowInUserTZ);

        // Sprint YYYY-MM-DD strings in user's TZ (used to label the window)
        const sprintStartStr = toLocalDate(sprintStart);
        const sprintEndStr = toLocalDate(sprintEnd);

        // For the DB query: pad 1 day on each side to catch any UTC-vs-TZ edge cases;
        // we'll filter the in-sprint checkpoints in JS using the user's timezone.
        const queryStart = new Date(sprintStart); queryStart.setDate(queryStart.getDate() - 1);
        const queryEnd = new Date(sprintEnd); queryEnd.setDate(queryEnd.getDate() + 1);

        // ── 1. Fetch checkpoints near the sprint and filter in JS by user TZ ─────
        const allPlannedRaw = await prisma.taskCheckpoint.findMany({
            where: {
                task: { userId },
                targetDate: { gte: queryStart, lte: queryEnd },
            },
            orderBy: { orderIndex: 'asc' },
        });

        // Keep only checkpoints whose targetDate calendar-day (in user's TZ)
        // falls within [sprintStartStr, sprintEndStr]
        const planned = allPlannedRaw.filter(cp => {
            const d = toLocalDate(cp.targetDate);
            return d >= sprintStartStr && d <= sprintEndStr;
        });

        // ── 2. Fetch ALL checkpoints for the user to support EARLY detection ──────
        // EARLY check needs the next checkpoint's targetDate and its Day entries.
        const allCheckpoints = await prisma.taskCheckpoint.findMany({
            where: { task: { userId } },
            orderBy: { orderIndex: 'asc' },
        });

        // Build a map of checkpointId → Day[] for this sprint (for EARLY detection)
        const dayRecords = await prisma.day.findMany({
            where: {
                userId,
                date: { gte: queryStart, lte: queryEnd },
            },
        });

        // daysByCheckpoint: checkpointId → Day[]
        const daysByCheckpoint = new Map<string, typeof dayRecords>();
        for (const d of dayRecords) {
            const arr = daysByCheckpoint.get(d.checkpointId) ?? [];
            arr.push(d);
            daysByCheckpoint.set(d.checkpointId, arr);
        }

        const now = date;

        // ── 3. Categorise each planned checkpoint ────────────────────────────────

        const earlyCompleted: any[] = [];
        const onTimeCompleted: any[] = [];
        const recovered: any[] = [];
        const overduePending: any[] = [];

        for (const cp of planned) {
            if (cp.isCompleted) {
                // Find next checkpoint (higher orderIndex, same task)
                const nextCp = allCheckpoints.find(
                    c => c.taskId === cp.taskId && c.orderIndex > cp.orderIndex
                );

                // EARLY_COMPLETED: next CP exists AND there's a Day record for it
                // with date < startOfDay(nextCp.targetDate)
                let isEarly = false;
                if (nextCp) {
                    const nextDays = daysByCheckpoint.get(nextCp.id) ?? [];
                    isEarly = nextDays.some(d => d.date < startOfDay(nextCp.targetDate));
                }

                if (isEarly) {
                    earlyCompleted.push(cp);
                } else if (cp.completedAt) {
                    // RECOVERED: completedAt calendar date (user TZ) is after targetDate calendar date (user TZ)
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
                // OVERDUE: not completed AND targetDate calendar day (user TZ) is before today (user TZ)
                const targetDay = toLocalDate(cp.targetDate);
                if (targetDay < todayLocal) {
                    overduePending.push(cp);
                }
                // targetDay === todayLocal → in-progress today, not yet overdue
                // targetDay > todayLocal  → future checkpoint
            }
        }

        // ── 4. Rates ─────────────────────────────────────────────────────────────

        const totalCompleted = earlyCompleted.length + onTimeCompleted.length + recovered.length;
        const totalPlanned = planned.length;

        const executionRate = totalPlanned === 0
            ? 100
            : Math.round((totalCompleted / totalPlanned) * 100);

        const totalOverdue = overduePending.length + recovered.length;
        const recoveryRate = totalOverdue === 0
            ? 100
            : Math.round((recovered.length / totalOverdue) * 100);

        // ── 5. Daily effort & active days ────────────────────────────────────────
        // Initialize all 7 sprint days to 0 (ISO date keys: YYYY-MM-DD)
        const TOTAL_SPRINT_DAYS = 7;
        const dailyEffort: Record<string, number> = {};
        for (let i = 0; i < TOTAL_SPRINT_DAYS; i++) {
            const d = new Date(sprintStart);
            d.setDate(d.getDate() + i);
            dailyEffort[format(d, 'yyyy-MM-dd')] = 0;
        }

        // Accumulate Day records (one row per user/checkpoint/day) into the map
        let totalEffort = 0;
        for (const d of dayRecords) {
            const key = format(d.date, 'yyyy-MM-dd');
            if (key in dailyEffort) {
                dailyEffort[key] += d.effort;
            }
            totalEffort += d.effort;
        }

        const activeDays = Object.values(dailyEffort).filter(e => e > 0).length;
        const missedDays = TOTAL_SPRINT_DAYS - activeDays;

        // ── 6. Overachievement days ─────────────────────────────────────────────
        const avgEffort = activeDays > 0 ? totalEffort / activeDays : 0;
        const overachievementDays = Object.values(dailyEffort).filter(e => e > avgEffort).length;

        // ── 7. Scores ────────────────────────────────────────────────────────────

        const consistency = Math.min(Math.round((activeDays / TOTAL_SPRINT_DAYS) * 100), 100);

        const avgEffortPerActiveDay = activeDays > 0 ? totalEffort / activeDays : 0;
        const intensity = Math.min(Math.round(avgEffortPerActiveDay), 100);

        const disciplineScore = Math.round(
            (consistency * 0.25) +
            (executionRate * 0.25) +
            (recoveryRate * 0.25) +
            (intensity * 0.25)
        );

        // ── 8. Build response ───────────────────────────────────────────────────

        return {
            sprintWindow: {
                start: sprintStartStr,
                end: sprintEndStr,
            },
            checkpoints: {
                planned: { count: totalPlanned, items: planned },
                earlyCompleted: { count: earlyCompleted.length, items: earlyCompleted },
                onTimeCompleted: { count: onTimeCompleted.length, items: onTimeCompleted },
                recovered: { count: recovered.length, items: recovered },
                overduePending: { count: overduePending.length, items: overduePending },
            },
            rates: { executionRate, recoveryRate },
            activity: {
                activeDays,
                missedDays,
                overachievementDays,
                totalEffort,
                dailyEffort,
            },
            scores: { consistency, intensity, disciplineScore },
        };
    }

    // ── Weekly cron: finalize & store snapshot (Sunday 23:59) ─────────────────
    // Called ONLY by cron. Live dashboard must call computeDashboard() directly.

    async finalizeWeeklySnapshot(userId: string, date: Date = new Date()): Promise<void> {
        try {
            const dashboard = await this.computeDashboard(userId, date);
            const { start: weekStart, end: weekEnd } = this.sprintBounds(date);

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
                disciplineScore,
                consistencyScore,
                totalCheckpointsPlanned: planned.count,
                totalCheckpointsCompleted: totalCompleted,
                lateCheckpoints,
                earlyStarts,
                overachievementDays: dashboard.activity.overachievementDays,
                dailyEffort,
                updatedAt: new Date(),
            };

            const existing = await prisma.userInsightSnapshot.findFirst({
                where: { userId, dreamId: null, weekStart },
            });

            let snapshot;
            if (existing) {
                snapshot = await prisma.userInsightSnapshot.update({
                    where: { id: existing.id },
                    data: updatePayload,
                });
            } else {
                snapshot = await prisma.userInsightSnapshot.create({
                    data: {
                        userId,
                        dreamId: null,
                        weekStart,
                        weekEnd,
                        missedDays: 7 - activeDays,
                        longestStreak: 0,
                        currentStreak: 0,
                        avgDailyProgress: 0,
                        avgProgressLatencyHours: 0,
                        dailyStatus: {},
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
                        weekStart,
                        insightType: insight.insightType,
                        evidence: { ...insight.evidence, narrative: insight.message },
                        consumed: false,
                    },
                });
            }

            await logger.info('analytics', 'Weekly snapshot finalized', { userId, weekStart });
        } catch (error: any) {
            logger.error('analytics', 'Failed to finalize weekly snapshot', { userId, error: error.message });
            throw error;
        }
    }
}

export const analyticsService = new AnalyticsService();
