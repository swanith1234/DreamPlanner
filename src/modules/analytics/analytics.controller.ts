import { Response } from 'express';
import { AuthRequest } from '../../types';
import { analyticsService } from './analytics.service';

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

            const date = req.query.date
                ? new Date(req.query.date as string)
                : new Date();

            const dashboard = await analyticsService.computeDashboard(userId, date);
            res.json(dashboard);
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
