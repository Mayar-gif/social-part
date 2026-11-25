import { randomInt } from 'node:crypto';
import { redisService } from './redis.service.js';
import { compareHash, hash } from '../utils/security/hash.js';
import { otpTemplate, sendEmail } from '../utils/email/send.email.js';
import { AppError } from '../utils/globalErrorHandling.js';
import { OtpTypeEnum } from '../enums/user.enums.js';

const OTP_TTL = 5 * 60;
const RESEND_COOLDOWN = 60;
const MAX_ATTEMPTS = 5;

const keys = (type: OtpTypeEnum, email: string) => ({
  otp: `otp:${type}:${email}`,
  cooldown: `otp:cooldown:${type}:${email}`,
  attempts: `otp:attempts:${type}:${email}`,
});

const subjects: Record<OtpTypeEnum, string> = {
  [OtpTypeEnum.confirmEmail]: 'Confirm your email',
  [OtpTypeEnum.resetPassword]: 'Reset your password',
};

export const sendOtp = async (email: string, type: OtpTypeEnum) => {
  const k = keys(type, email);

  if (await redisService.exists(k.cooldown)) {
    const wait = await redisService.ttl(k.cooldown);
    throw new AppError(`Please wait ${wait}s before requesting a new code`, 429);
  }

  const otp = String(randomInt(100000, 1000000));
  await redisService.set(k.otp, await hash(otp), OTP_TTL);
  await redisService.set(k.cooldown, '1', RESEND_COOLDOWN);
  await redisService.del(k.attempts);

  await sendEmail({ to: email, subject: subjects[type], html: otpTemplate(subjects[type], otp) });
};

export const verifyOtp = async (email: string, type: OtpTypeEnum, otp: string) => {
  const k = keys(type, email);

  const hashed = await redisService.get(k.otp);
  if (!hashed) throw new AppError('Code expired or not requested', 400);

  const attempts = await redisService.incr(k.attempts, OTP_TTL);
  if (attempts > MAX_ATTEMPTS) {
    await redisService.del(k.otp);
    throw new AppError('Too many wrong attempts, request a new code', 429);
  }

  if (!(await compareHash(otp, hashed))) throw new AppError('Invalid code', 400);

  await redisService.del(k.otp, k.attempts, k.cooldown);
};
