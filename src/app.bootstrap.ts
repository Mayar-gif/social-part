import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { config } from './config/config.service.js';
import { connectDB } from './DB/connectionDB.js';
import { redisService } from './common/services/redis.service.js';
import { AppError, globalErrorHandler } from './common/utils/globalErrorHandling.js';
import authRouter from './modules/auth/auth.controller.js';
import userRouter from './modules/users/user.controller.js';

export const bootstrap = async () => {
  const app = express();

  app.use(helmet(), cors(), express.json({ limit: '1mb' }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  await connectDB();
  await redisService.connect();

  app.get('/', (_req: Request, res: Response) => res.json({ success: true, message: 'Social App API' }));
  app.use('/auth', authRouter);
  app.use('/users', userRouter);

  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
  });
  app.use(globalErrorHandler);

  app.listen(config.port, () => console.log(`Server running on port ${config.port}`));
};
