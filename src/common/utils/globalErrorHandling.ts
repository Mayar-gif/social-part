import type { NextFunction, Request, Response } from 'express';
import { config } from '../../config/config.service.js';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const globalErrorHandler = (
  err: Error & { statusCode?: number; details?: unknown },
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const status = err.statusCode ?? (err.name === 'MulterError' ? 400 : 500);
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    details: err.details,
    ...(config.env === 'development' && { stack: err.stack }),
  });
};
