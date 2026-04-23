import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/errors';
import { RoadmapNodeStatus } from '@prisma/client';

function minutesBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

/**
 * Evidence-backed forecasting: reproducible input snapshot + stored outputs.
 * MVP: deterministic ETA from observed completion pace + remaining minutes estimates.
 */
export class ForecastService {
  async runForecast(userId: string, dreamId: string) {
    const dream = await prisma.dream.findUnique({ where: { id: dreamId } });
    if (!dream || dream.userId !== userId) throw new NotFoundError('Dream');

    const roadmap = await prisma.roadmap.findFirst({
      where: { userId, dreamId, status: 'ACTIVE' },
      include: { milestones: { include: { skills: true }, orderBy: { orderIndex: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!roadmap) throw new NotFoundError('Roadmap');

    // Build evidence from completed skills: actual time gaps between status transitions via `completedAt` vs createdAt.
    const completedSkills = roadmap.milestones.flatMap(m => m.skills).filter(s => s.status === RoadmapNodeStatus.COMPLETED && s.completedAt);
    const observedDurations = completedSkills
      .map(s => minutesBetween(s.createdAt, s.completedAt!))
      .filter(m => m > 0);

    const avgMinutesPerSkill = observedDurations.length
      ? Math.round(observedDurations.reduce((a, b) => a + b, 0) / observedDurations.length)
      : 600; // fallback

    const pendingSkills = roadmap.milestones.flatMap(m => m.skills).filter(s => s.status !== RoadmapNodeStatus.COMPLETED);
    const estimatedRemainingMinutes = pendingSkills.reduce((sum, s) => sum + (s.estimatedMinutes ?? avgMinutesPerSkill), 0);

    // Convert to ETA date using an assumed weekly capacity derived from last 2 snapshots (if present)
    const recent = await prisma.userInsightSnapshot.findMany({
      where: { userId, dreamId: null, finalizedAt: { not: null } },
      orderBy: { weekStart: 'desc' },
      take: 2,
      select: { dailyEffort: true },
    });
    const avgDailyEffort = recent.length
      ? Math.round(
          recent
            .map(r => Object.values((r.dailyEffort as any) || {}).reduce((a: number, b: any) => a + Number(b || 0), 0) / 7)
            .reduce((a, b) => a + b, 0) / recent.length
        )
      : 60; // points as minutes proxy (Phase-1 effort points align roughly to minutes)

    const minutesPerDayCapacity = Math.max(30, Math.min(240, avgDailyEffort));
    const daysNeeded = Math.ceil(estimatedRemainingMinutes / minutesPerDayCapacity);
    const eta = new Date();
    eta.setUTCDate(eta.getUTCDate() + daysNeeded);

    const asOfWeekStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const inputs = {
      avgMinutesPerSkill,
      minutesPerDayCapacity,
      pendingSkillCount: pendingSkills.length,
      pendingSkillEstimatedMinutes: pendingSkills.map(s => ({ id: s.id, est: s.estimatedMinutes })),
    };
    const outputs = {
      estimatedRemainingMinutes,
      daysNeeded,
      etaISO: eta.toISOString(),
      distanceScore: Math.max(0, Math.min(100, Math.round((1 - estimatedRemainingMinutes / (estimatedRemainingMinutes + 10_000)) * 100))),
    };

    const evidenceRefs = {
      completedSkillsSampleMinutes: observedDurations.slice(0, 20),
      snapshotsUsed: recent.length,
    };

    const run = await prisma.forecastRun.create({
      data: {
        userId,
        dreamId,
        roadmapId: roadmap.id,
        asOfWeekStart,
        modelVersion: 'forecast.v1',
        inputs,
        outputs,
        evidenceRefs,
      },
    });

    await logger.info('forecast', 'Forecast run created', { forecastRunId: run.id, dreamId }, userId);
    return run;
  }

  async listForecastRuns(userId: string, dreamId: string) {
    return prisma.forecastRun.findMany({
      where: { userId, dreamId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}

export const forecastService = new ForecastService();

