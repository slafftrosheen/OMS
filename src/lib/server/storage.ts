import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { env } from '$env/dynamic/private';
import fs from 'fs/promises';
import path from 'path';

const isS3Configured = !!(env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);

const s3Client = isS3Configured ? new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
}) : null;

const BUCKET = env.S3_BUCKET;
const LOCAL_UPLOAD_DIR = env.UPLOAD_DIR || 'uploads';

export async function uploadFile(file: File | Buffer, filename: string, mimetype: string): Promise<string> {
  const key = `${Date.now()}-${filename}`;

  if (s3Client && BUCKET) {
    const parallelUploads3 = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET,
        Key: key,
        Body: file instanceof File ? Buffer.from(await file.arrayBuffer()) : file,
        ContentType: mimetype,
      },
    });

    await parallelUploads3.done();
    return key;
  } else {
    // Fallback to local storage
    const uploadPath = path.join(process.cwd(), LOCAL_UPLOAD_DIR);
    await fs.mkdir(uploadPath, { recursive: true });
    const fullPath = path.join(uploadPath, key);
    
    if (file instanceof File) {
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(fullPath, buffer);
    } else {
      await fs.writeFile(fullPath, file);
    }
    
    return key;
  }
}

export async function deleteFile(key: string): Promise<void> {
  if (s3Client && BUCKET) {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }));
  } else {
    const filePath = path.join(process.cwd(), LOCAL_UPLOAD_DIR, key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.error(`Failed to delete local file ${key}:`, err);
    }
  }
}

export async function getFileStream(key: string): Promise<ReadableStream | Buffer> {
  if (s3Client && BUCKET) {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }));
    return response.Body as ReadableStream;
  } else {
    const filePath = path.join(process.cwd(), LOCAL_UPLOAD_DIR, key);
    return await fs.readFile(filePath);
  }
}

export const storageService = {
  uploadFile,
  deleteFile,
  getFileStream
};
