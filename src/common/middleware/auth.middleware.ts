import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/globalErrorHandling.js';
import { revokedKey, verifyToken } from '../utils/security/token.js';
import { redisService } from '../services/redis.service.js';
import { UserRepository } from '../../DB/repositories/user.repository.js';
import type { RoleEnum } from '../enums/user.enums.js';

const userRepo = new UserRepository();

export const authentication = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('Missing bearer token', 401);

  const payload = verifyToken(header.slice(7), 'access');

  if (await redisService.exists(revokedKey(payload.jti as string))) {
    throw new AppError('Token has been revoked', 401);
  }

  const user = await userRepo.findById({ id: payload.sub as string });
  if (!user) throw new AppError('User not found', 401);
  if (user.credentialsChangedAt && (payload.iat ?? 0) < Math.floor(user.credentialsChangedAt.getTime() / 1000)) {
    throw new AppError('Session expired, please login again', 401);
  }

  req.user = user;
  req.tokenPayload = payload;
  next();
};

export const authorization =
  (...roles: RoleEnum[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw new AppError('You are not allowed to access this resource', 403);
    next();
  };
