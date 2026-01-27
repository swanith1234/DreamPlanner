import { Response } from 'express';
import { AuthRequest } from '../../types';
import { userService } from './user.service';

export class UserController {
    async updatePreferences(req: AuthRequest, res: Response) {
        try {
            const result = await userService.updatePreferences(req.userId!, req.body);
            res.status(200).json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getPreferences(req: AuthRequest, res: Response) {
        try {
            const result = await userService.getPreferences(req.userId!);
            res.status(200).json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const userController = new UserController();
