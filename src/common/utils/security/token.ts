import jwt, { type JwtPayload } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import { config } from '../../../config/config.service.js';
import { redisService } from '../../services/redis.service.js';
import { AppError } from '../globalErrorHandling.js';
import type { RoleEnum } from '../../enums/user.enums.js';

const refreshKey = (userId: string, jti: string) => `refresh:${userId}:${jti}`;
export const revokedKey = (jti: string) => `revoked:${jti}`;

export const generateTokens = async (userId: Types.ObjectId | string, role: RoleEnum) => {
  const sub = String(userId);

  const accessToken = jwt.sign({ role }, config.accessSecret, {
    subject: sub,
    jwtid: randomUUID(),
    expiresIn: config.accessTtl,
  });

  const refreshJti = randomUUID();
  const refreshToken = jwt.sign({ role }, config.refreshSecret, {
    subject: sub,
    jwtid: refreshJti,
    expiresIn: config.refreshTtl,
  });

  await redisService.set(refreshKey(sub, refreshJti), '1', config.refreshTtl);

  return { accessToken, refreshToken };
};

export const verifyToken = (token: string, type: 'access' | 'refresh', ignoreExpiration = false): JwtPayload => {
  try {
    const secret = type === 'access' ? config.accessSecret : config.refreshSecret;
    return jwt.verify(token, secret, { ignoreExpiration }) as JwtPayload;
  } catch {
    throw new AppError(`Invalid or expired ${type} token`, 401);
  }
};

export const isRefreshTokenActive = (payload: JwtPayload) =>
  redisService.exists(refreshKey(payload.sub as string, payload.jti as string));

export const revokeRefreshToken = (payload: JwtPayload) =>
  redisService.del(refreshKey(payload.sub as string, payload.jti as string));

export const revokeAllRefreshTokens = (userId: string) => redisService.deleteByPattern(`refresh:${userId}:*`);

export const revokeAccessToken = async (payload: JwtPayload) => {
  const remaining = (payload.exp ?? 0) - Math.floor(Date.now() / 1000);
  if (remaining > 0) await redisService.set(revokedKey(payload.jti as string), '1', remaining);
};
