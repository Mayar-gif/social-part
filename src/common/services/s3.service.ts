import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config/config.service.js';
import { AppError } from '../utils/globalErrorHandling.js';

class S3Service {
  private readonly client = new S3Client({
    region: config.awsRegion,
    credentials: { accessKeyId: config.awsAccessKeyId, secretAccessKey: config.awsSecretAccessKey },
  });

  private readonly bucket = config.awsBucket;

  upload = async (file: Express.Multer.File, folder: string): Promise<string> => {
    const key = `${folder}/${randomUUID()}${path.extname(file.originalname).toLowerCase()}`;

    try {
      await new Upload({
        client: this.client,
        params: { Bucket: this.bucket, Key: key, Body: createReadStream(file.path), ContentType: file.mimetype },
        partSize: 5 * 1024 * 1024,
        queueSize: 4,
      }).done();
      return key;
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  };

  uploadMany = (files: Express.Multer.File[], folder: string) => Promise.all(files.map((file) => this.upload(file, folder)));

  discard = (files: Express.Multer.File[]) => Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));

  presignedUrl = (key: string, expiresIn = 300, downloadName?: string) =>
    getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(downloadName && { ResponseContentDisposition: `attachment; filename="${downloadName}"` }),
      }),
      { expiresIn },
    );

  getObject = async (key: string): Promise<GetObjectCommandOutput> => {
    try {
      return await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if ((error as Error).name === 'NoSuchKey') throw new AppError('File not found', 404);
      throw error;
    }
  };

  delete = (key: string) => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));

  deleteMany = async (keys: string[]) => {
    if (!keys.length) return;
    await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
  };
}

export const s3Service = new S3Service();
