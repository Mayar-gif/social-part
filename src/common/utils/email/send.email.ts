import nodemailer from 'nodemailer';
import { config } from '../../../config/config.service.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: config.emailUser, pass: config.emailPass },
});

export const sendEmail = async ({ to, subject, html }: { to: string; subject: string; html: string }) => {
  await transporter.sendMail({ from: `"Social App" <${config.emailUser}>`, to, subject, html });
};

export const otpTemplate = (title: string, otp: string) => `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px">
    <h2>${title}</h2>
    <p>Your verification code is:</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:6px">${otp}</p>
    <p>This code expires in 5 minutes. If you did not request it, ignore this email.</p>
  </div>`;
