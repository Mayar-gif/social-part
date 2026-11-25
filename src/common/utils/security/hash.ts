import bcrypt from 'bcryptjs';
import { config } from '../../../config/config.service.js';

export const hash = (plain: string) => bcrypt.hash(plain, config.saltRounds);
export const compareHash = (plain: string, hashed: string) => bcrypt.compare(plain, hashed);
