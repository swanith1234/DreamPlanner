import { Response } from 'express';
import { AuthRequest } from '../../types';
import { forecastService } from './forecast.service';
import { logger } from '../../utils/logger';

export class ForecastController {
  async run(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.body || {};
      if (!dreamId || typeof dreamId !== 'string') {
        res.status(400).json({ error: 'dreamId is required' });
        return;
      }
      const run = await forecastService.runForecast(req.userId!, dreamId);
      res.status(201).json(run);
    } catch (error: any) {
      await logger.error('forecast', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async list(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const runs = await forecastService.listForecastRuns(req.userId!, dreamId);
      res.status(200).json({ runs });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
}

export const forecastController = new ForecastController();

