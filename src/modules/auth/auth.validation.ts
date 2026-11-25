import { z } from 'zod';
import { GenderEnum } from '../../common/enums/user.enums.js';

const email = z.string().trim().toLowerCase().email('Invalid email');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/\d/, 'Password must contain a number');

const otp = z.string().regex(/^\d{6}$/, 'OTP must be 6 digits');

const name = z.string().trim().min(2).max(25);

const passwordsMatch = <T extends { password: string; confirmPassword: string }>(data: T) =>
  data.password === data.confirmPassword;

export const signUpSchema = z
  .object({
    firstName: name,
    lastName: name,
    email,
    password,
    confirmPassword: z.string(),
    gender: z.nativeEnum(GenderEnum).optional(),
    phone: z
      .string()
      .regex(/^01[0125]\d{8}$/, 'Invalid Egyptian phone number')
      .optional(),
  })
  .refine(passwordsMatch, { message: 'Passwords do not match', path: ['confirmPassword'] });

export const confirmEmailSchema = z.object({ email, otp });
export const resendOtpSchema = z.object({ email });
export const signInSchema = z.object({ email, password: z.string().min(1) });
export const refreshTokenSchema = z.object({ refreshToken: z.string().min(1) });
export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
  allDevices: z.boolean().optional().default(false),
});
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z
  .object({ email, otp, password, confirmPassword: z.string() })
  .refine(passwordsMatch, { message: 'Passwords do not match', path: ['confirmPassword'] });
export const googleLoginSchema = z.object({ idToken: z.string().min(1) });

export type SignUpDTO = z.infer<typeof signUpSchema>;
export type ConfirmEmailDTO = z.infer<typeof confirmEmailSchema>;
export type ResendOtpDTO = z.infer<typeof resendOtpSchema>;
export type SignInDTO = z.infer<typeof signInSchema>;
export type RefreshTokenDTO = z.infer<typeof refreshTokenSchema>;
export type LogoutDTO = z.infer<typeof logoutSchema>;
export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;
export type GoogleLoginDTO = z.infer<typeof googleLoginSchema>;
