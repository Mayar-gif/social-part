import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../utils/globalErrorHandling.js';

type Schemas = { body?: ZodTypeAny; params?: ZodTypeAny; query?: ZodTypeAny };

export const validation = (schemas: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
  const issues: { path: string; message: string }[] = [];

  for (const key of ['body', 'params', 'query'] as const) {
    const schema = schemas[key];
    if (!schema) continue;

    const result = schema.safeParse(req[key]);
    if (!result.success) {
      issues.push(...result.error.issues.map((i) => ({ path: `${key}.${i.path.join('.')}`, message: i.message })));
    } else if (key === 'body') {
      req.body = result.data; 
    }
  }

  if (issues.length) return next(new AppError('Validation error', 400, issues));
  next();
};
