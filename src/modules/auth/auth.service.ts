import type { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config/config.service.js';
import { AppError } from '../../common/utils/globalErrorHandling.js';
import { UserRepository } from '../../DB/repositories/user.repository.js';
import { OtpTypeEnum, ProviderEnum } from '../../common/enums/user.enums.js';
import { compareHash, hash } from '../../common/utils/security/hash.js';
import {
  generateTokens,
  isRefreshTokenActive,
  revokeAccessToken,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  verifyToken,
} from '../../common/utils/security/token.js';
import { sendOtp, verifyOtp } from '../../common/services/otp.service.js';
import { redisService } from '../../common/services/redis.service.js';
import { toOwnUser } from '../../common/utils/user.mapper.js';
import type {
  ConfirmEmailDTO,
  ForgotPasswordDTO,
  GoogleLoginDTO,
  LogoutDTO,
  RefreshTokenDTO,
  ResendOtpDTO,
  ResetPasswordDTO,
  SignInDTO,
  SignUpDTO,
} from './auth.validation.js';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;

class AuthService {
  private readonly _userRepo = new UserRepository();
  private readonly _googleClient = new OAuth2Client(config.googleClientId);

  constructor() {}

  // ----------Registration & email verification ----------
  signUp = async (req: Request, res: Response, _next: NextFunction) => {
    const { firstName, lastName, email, password, gender, phone } = req.body as SignUpDTO;

    const emailExist = await this._userRepo.findOne({ filter: { email } });
    if (emailExist) throw new AppError('email already exist', 409);

    const user = await this._userRepo.create({
      firstName,
      lastName,
      email,
      password: await hash(password),
      gender,
      phone,
    });

    await sendOtp(email, OtpTypeEnum.confirmEmail);

    return res.status(201).json({
      success: true,
      message: 'Account created. Check your email for the verification code.',
      data: { id: user._id, email: user.email },
    });
  };

  confirmEmail = async (req: Request, res: Response, _next: NextFunction) => {
    const { email, otp } = req.body as ConfirmEmailDTO;

    const user = await this._userRepo.findOne({ filter: { email } });
    if (!user) throw new AppError('Account not found', 404);
    if (user.confirmedAt) throw new AppError('Email already confirmed', 409);

    await verifyOtp(email, OtpTypeEnum.confirmEmail, otp);

    user.confirmedAt = new Date();
    await user.save();

    return res.status(200).json({ success: true, message: 'Email confirmed successfully' });
  };

  resendConfirmEmail = async (req: Request, res: Response, _next: NextFunction) => {
    const { email } = req.body as ResendOtpDTO;

    const user = await this._userRepo.findOne({ filter: { email } });
    if (!user || user.confirmedAt) throw new AppError('Account not found or already confirmed', 400);

    await sendOtp(email, OtpTypeEnum.confirmEmail);
    return res.status(200).json({ success: true, message: 'A new code has been sent' });
  };

  // ----------Login & session generation ----------
  signIn = async (req: Request, res: Response, _next: NextFunction) => {
    const { email, password } = req.body as SignInDTO;

    // failed-login lockout
    const failKey = `login:fail:${email}`;
    const failed = Number((await redisService.get(failKey)) ?? 0);
    if (failed >= MAX_LOGIN_ATTEMPTS) {
      const wait = await redisService.ttl(failKey);
      throw new AppError(`Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s)`, 429);
    }

    const user = await this._userRepo.findByEmailWithPassword(email);

    const valid =
      !!user && user.provider === ProviderEnum.system && !!user.password && (await compareHash(password, user.password));

    if (!user || !valid) {
      await redisService.incr(failKey, LOCK_SECONDS);
      throw new AppError('Invalid email or password', 401);
    }

    if (!user.confirmedAt) throw new AppError('Please confirm your email first', 403);

    await redisService.del(failKey);
    const tokens = await generateTokens(user._id, user.role);

    return res.status(200).json({ success: true, data: { user: toOwnUser(user), ...tokens } });
  };

  // ---------- Token refreshing & revocation ----------
  refreshToken = async (req: Request, res: Response, _next: NextFunction) => {
    const { refreshToken } = req.body as RefreshTokenDTO;

    const payload = verifyToken(refreshToken, 'refresh');
    if (!(await isRefreshTokenActive(payload))) {
      await revokeAllRefreshTokens(payload.sub as string);
      throw new AppError('Refresh token reuse detected. Please login again', 401);
    }

    const user = await this._userRepo.findById({ id: payload.sub as string });
    if (!user) throw new AppError('User not found', 401);
    if (user.credentialsChangedAt && (payload.iat ?? 0) < Math.floor(user.credentialsChangedAt.getTime() / 1000)) {
      throw new AppError('Session expired, please login again', 401);
    }
    await revokeRefreshToken(payload);
    const tokens = await generateTokens(user._id, user.role);

    return res.status(200).json({ success: true, data: tokens });
  };

  logout = async (req: Request, res: Response, _next: NextFunction) => {
    const { refreshToken, allDevices } = req.body as LogoutDTO;
    const user = req.user!;

    await revokeAccessToken(req.tokenPayload!);

    if (allDevices) {
      await revokeAllRefreshTokens(String(user._id));
      user.credentialsChangedAt = new Date();
      await user.save();
    } else if (refreshToken) {
      const payload = verifyToken(refreshToken, 'refresh', true);
      if (payload.sub === String(user._id)) await revokeRefreshToken(payload);
    }

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  };

  // ----------Password reset (OTP) ----------
  forgotPassword = async (req: Request, res: Response, _next: NextFunction) => {
    const { email } = req.body as ForgotPasswordDTO;

    const user = await this._userRepo.findOne({ filter: { email } });
    if (user && user.confirmedAt && user.provider === ProviderEnum.system) {
      try {
        await sendOtp(email, OtpTypeEnum.resetPassword);
      } catch {
      }
    }

    return res.status(200).json({ success: true, message: 'If the email exists, a reset code has been sent' });
  };

  resetPassword = async (req: Request, res: Response, _next: NextFunction) => {
    const { email, otp, password } = req.body as ResetPasswordDTO;

    const user = await this._userRepo.findOne({ filter: { email, provider: ProviderEnum.system } });
    if (!user) throw new AppError('Invalid code or email', 400);

    await verifyOtp(email, OtpTypeEnum.resetPassword, otp);

    user.password = await hash(password);
    user.credentialsChangedAt = new Date(); // kills every old access token
    await user.save();

    await revokeAllRefreshTokens(String(user._id));
    await redisService.del(`login:fail:${email}`);

    return res.status(200).json({ success: true, message: 'Password reset successfully. Please login.' });
  };

  // ---------- OAuth 2.0 (Google sign-in) ----------
  googleLogin = async (req: Request, res: Response, _next: NextFunction) => {
    const { idToken } = req.body as GoogleLoginDTO;

    const ticket = await this._googleClient
      .verifyIdToken({ idToken, audience: config.googleClientId })
      .catch(() => {
        throw new AppError('Invalid Google token', 401);
      });

    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) throw new AppError('Google email is not verified', 401);

    const email = payload.email.toLowerCase();
    let user = await this._userRepo.findOne({ filter: { email } });
    let isNew = false;

    if (user && user.provider !== ProviderEnum.google) {
      throw new AppError('This email is registered with email/password. Please login with your password.', 409);
    }

    if (!user) {
      isNew = true;
      user = await this._userRepo.create({
        firstName: (payload.given_name ?? payload.name ?? 'User').slice(0, 25),
        lastName: (payload.family_name ?? 'Google').slice(0, 25),
        email,
        profilePicture: payload.picture,
        provider: ProviderEnum.google,
        confirmedAt: new Date(),
      });
    }

    const tokens = await generateTokens(user._id, user.role);
    return res.status(isNew ? 201 : 200).json({ success: true, data: { user: toOwnUser(user), ...tokens } });
  };
}

export default new AuthService();
