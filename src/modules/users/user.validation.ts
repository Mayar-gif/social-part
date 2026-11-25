import { Types } from 'mongoose';
import { z } from 'zod';
import { GenderEnum } from '../../common/enums/user.enums.js';

const password = z
  .string()
  .min(8)
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/\d/, 'Password must contain a number');

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid id');

export const idParamsSchema = z.object({ id: objectId });

export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(2).max(25).optional(),
    lastName: z.string().trim().min(2).max(25).optional(),
    bio: z.string().trim().max(200).optional(),
    gender: z.nativeEnum(GenderEnum).optional(),
    phone: z
      .string()
      .regex(/^01[0125]\d{8}$/, 'Invalid Egyptian phone number')
      .optional(),
    profilePicture: z.string().url().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Send at least one field to update' });

export const privacySchema = z.object({ isPrivate: z.boolean() });

export const changePasswordSchema = z
  .object({ oldPassword: z.string().min(1), password, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((d) => d.password !== d.oldPassword, { message: 'New password must be different', path: ['password'] });

export const deleteAccountSchema = z.object({ password: z.string().optional() });

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(50),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type UpdateProfileDTO = z.infer<typeof updateProfileSchema>;
export type PrivacyDTO = z.infer<typeof privacySchema>;
export type ChangePasswordDTO = z.infer<typeof changePasswordSchema>;
export type DeleteAccountDTO = z.infer<typeof deleteAccountSchema>;
