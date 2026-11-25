import multer from 'multer';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { AppError } from '../utils/globalErrorHandling.js';

export const fileTypes = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  pdf: ['application/pdf'],
  video: ['video/mp4'],
};

export const uploadFile = ({ allowed = fileTypes.image, maxSizeMB = 5 }: { allowed?: string[]; maxSizeMB?: number } = {}) =>
  multer({
    storage: multer.diskStorage({
      destination: os.tmpdir(),
      filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    fileFilter: (_req, file, cb) => {
      if (!allowed.includes(file.mimetype)) return cb(new AppError(`Invalid file type: ${file.mimetype}`, 400));
      cb(null, true);
    },
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
  });
