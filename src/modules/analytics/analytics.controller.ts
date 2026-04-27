import { Response } from 'express';
import { AuthRequest } from '../../types';
import { analyticsService } from './analytics.service';
import { globalCache, MemoryCache } from '../../utils/cache';

export class AnalyticsController {

    /**
     * GET /api/analytics/dashboard
     * Optional query param: ?date=YYYY-MM-DD  (defaults to current week)
     *
     * Computes the sprint analytics on-demand — never reads from snapshot.
     */
    async getWeeklyDashboard(req: AuthRequest, res: Response) {
        try {
            const userId = req.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const queryParams: any = {};
            if (req.query.date) queryParams.date = req.query.date;
            if (req.query.range) queryParams.range = req.query.range;
            
            const cacheKey = MemoryCache.generateKey('dashboard', userId, queryParams);
            const cachedData = globalCache.get(cacheKey);
            
            if (cachedData) {
                res.json(cachedData);
                return;
            }

            const date = req.query.date
                ? new Date(req.query.date as string)
                : new Date();

            const dashboard = await analyticsService.computeDashboard(userId, date);
            
            globalCache.set(cacheKey, dashboard);
            res.json(dashboard);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /api/analytics/sprints
     * Returns summary list of all finalized sprint snapshots for the sprint picker.
     */
    async listSprints(req: AuthRequest, res: Response) {
        try {
            const userId = req.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            
            const cacheKey = MemoryCache.generateKey('sprints_list', userId);
            const cachedData = globalCache.get(cacheKey);
            
            if (cachedData) {
                res.json(cachedData);
                return;
            }

            const sprints = await analyticsService.listPastSprints(userId);
            
            globalCache.set(cacheKey, sprints);
            res.json(sprints);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * GET /api/analytics/sprint/:weekStart
     * Returns the full stored snapshot for a specific week (YYYY-MM-DD).
     */
    async getSprintByWeekStart(req: AuthRequest, res: Response) {
        try {
            const userId = req.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const { weekStart } = req.params;

            const cacheKey = MemoryCache.generateKey('sprint_snapshot', userId, { weekStart });
            const cachedData = globalCache.get(cacheKey);

            if (cachedData) {
                res.json(cachedData);
                return;
            }

            const snapshot = await analyticsService.getSprintSnapshot(userId, weekStart);
            if (!snapshot) return res.status(404).json({ error: 'Sprint snapshot not found' });
            
            globalCache.set(cacheKey, snapshot);
            res.json(snapshot);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /api/analytics/cron/weekly
     * Public webhook for external cron runner to trigger weekly snapshot for all users
     */
    async runWeeklyCron(req: import('express').Request, res: Response) {
        try {
            const targetDateStr = (req.body?.date || req.query?.date) as string | undefined;
            await analyticsService.runWeeklySnapshotsForAllUsers(targetDateStr);
            res.json({ success: true, message: 'Weekly snapshots processed', date: targetDateStr || 'today' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /api/analytics/cron/daily
     * Public webhook for external cron runner to trigger daily lack of activity checks
     */
    async runDailyCron(req: import('express').Request, res: Response) {
        try {
            await analyticsService.runDailyActivityCheckForAllUsers();
            res.json({ success: true, message: 'Daily activity check processed' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * POST /api/analytics/generate
     * Developer / test helper — manually triggers snapshot finalization.
     */
    async triggerGeneration(req: AuthRequest, res: Response) {
        try {
            const userId = req.userId;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            await analyticsService.finalizeWeeklySnapshot(userId);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const analyticsController = new AnalyticsController();
