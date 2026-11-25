import dotenv from 'dotenv';
import path from 'node:path';

const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
};

export const config = {
  env,
  port: Number(process.env.PORT) || 3000,
  mongoUri: required('MONGO_URI'),
  redisUrl: required('REDIS_URL'),
  accessSecret: required('ACCESS_TOKEN_SECRET'),
  refreshSecret: required('REFRESH_TOKEN_SECRET'),
  accessTtl: Number(process.env.ACCESS_TOKEN_TTL) || 900, // seconds
  refreshTtl: Number(process.env.REFRESH_TOKEN_TTL) || 604800, // seconds
  saltRounds: Number(process.env.SALT_ROUNDS) || 12,
  emailUser: required('EMAIL_USER'),
  emailPass: required('EMAIL_PASS'),
  googleClientId: required('GOOGLE_CLIENT_ID'),
  awsRegion: required('AWS_REGION'),
  awsBucket: required('AWS_BUCKET_NAME'),
  awsAccessKeyId: required('AWS_ACCESS_KEY_ID'),
  awsSecretAccessKey: required('AWS_SECRET_ACCESS_KEY'),
} as const;
