import { Router } from 'express';
import authService from './auth.service.js';
import { validation } from '../../common/middleware/validation.middleware.js';
import { authentication } from '../../common/middleware/auth.middleware.js';
import {
  confirmEmailSchema,
  forgotPasswordSchema,
  googleLoginSchema,
  logoutSchema,
  refreshTokenSchema,
  resendOtpSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from './auth.validation.js';

const router = Router();

router.post('/signup', validation({ body: signUpSchema }), authService.signUp);
router.post('/confirm-email', validation({ body: confirmEmailSchema }), authService.confirmEmail);
router.post('/resend-otp', validation({ body: resendOtpSchema }), authService.resendConfirmEmail);

router.post('/login', validation({ body: signInSchema }), authService.signIn);
router.post('/google', validation({ body: googleLoginSchema }), authService.googleLogin);

router.post('/refresh-token', validation({ body: refreshTokenSchema }), authService.refreshToken);
router.post('/logout', authentication, validation({ body: logoutSchema }), authService.logout);

router.post('/forgot-password', validation({ body: forgotPasswordSchema }), authService.forgotPassword);
router.post('/reset-password', validation({ body: resetPasswordSchema }), authService.resetPassword);

export default router;
