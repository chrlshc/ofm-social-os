import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';
import { loggers } from './logger';
import { withSpan } from './otel';
import { createHash } from 'crypto';

const logger = loggers.s3;

export interface S3Config {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string; // For local development with MinIO
}

export interface PresignedUploadUrl {
  url: string;
  fields: Record<string, string>;
  key: string;
  uploadId?: string; // For multipart uploads
}

export interface MultipartUploadSession {
  uploadId: string;
  key: string;
  bucket: string;
}

export interface UploadPartInfo {
  partNumber: number;
  etag: string;
  size: number;
}

class S3Manager {
  private client: S3Client;
  private config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
    this.client = new S3Client({
      region: config.region,
      credentials: config.accessKeyId && config.secretAccessKey ? {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      } : undefined,
      endpoint: config.endpoint,
      forcePathStyle: !!config.endpoint // Required for MinIO
    });
  }

  // =============================================
  // Presigned URLs for direct client uploads
  // =============================================

  async generatePresignedPutUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600, // 1 hour
    metadata?: Record<string, string>
  ): Promise<string> {
    return withSpan('s3.generate_presigned_put_url', {
      's3.key': key,
      's3.content_type': contentType,
      's3.expires_in': expiresIn
    }, async () => {
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
        Metadata: metadata,
        ServerSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION || 'AES256'
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      
      logger.info({
        key,
        contentType,
        expiresIn,
        hasMetadata: !!metadata
      }, 'Generated presigned PUT URL');

      return url;
    });
  }

  // =============================================
  // Multipart Upload Management
  // =============================================

  async initiateMultipartUpload(
    key: string,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<MultipartUploadSession> {
    return withSpan('s3.initiate_multipart_upload', {
      's3.key': key,
      's3.content_type': contentType
    }, async () => {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
        Metadata: metadata,
        ServerSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION || 'AES256'
      });

      const response = await this.client.send(command);
      
      if (!response.UploadId) {
        throw new Error('Failed to initiate multipart upload: no upload ID returned');
      }

      const session: MultipartUploadSession = {
        uploadId: response.UploadId,
        key,
        bucket: this.config.bucket
      };

      logger.info({
        key,
        uploadId: response.UploadId,
        contentType
      }, 'Initiated multipart upload');

      return session;
    });
  }

  async generatePresignedUploadPartUrl(
    session: MultipartUploadSession,
    partNumber: number,
    expiresIn: number = 3600
  ): Promise<string> {
    return withSpan('s3.generate_presigned_upload_part_url', {
      's3.key': session.key,
      's3.upload_id': session.uploadId,
      's3.part_number': partNumber
    }, async () => {
      const command = new UploadPartCommand({
        Bucket: session.bucket,
        Key: session.key,
        UploadId: session.uploadId,
        PartNumber: partNumber
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      
      logger.debug({
        key: session.key,
        uploadId: session.uploadId,
        partNumber,
        expiresIn
      }, 'Generated presigned upload part URL');

      return url;
    });
  }

  async completeMultipartUpload(
    session: MultipartUploadSession,
    parts: UploadPartInfo[]
  ): Promise<{ location: string; etag: string; bucket: string; key: string }> {
    return withSpan('s3.complete_multipart_upload', {
      's3.key': session.key,
      's3.upload_id': session.uploadId,
      's3.parts_count': parts.length
    }, async () => {
      // Sort parts by part number
      const sortedParts = parts.sort((a, b) => a.partNumber - b.partNumber);
      
      // Validate parts sequence
      for (let i = 0; i < sortedParts.length; i++) {
        if (sortedParts[i].partNumber !== i + 1) {
          throw new Error(`Missing part ${i + 1} in multipart upload`);
        }
      }

      const command = new CompleteMultipartUploadCommand({
        Bucket: session.bucket,
        Key: session.key,
        UploadId: session.uploadId,
        MultipartUpload: {
          Parts: sortedParts.map(part => ({
            ETag: part.etag,
            PartNumber: part.partNumber
          }))
        }
      });

      const response = await this.client.send(command);
      
      if (!response.Location || !response.ETag) {
        throw new Error('Failed to complete multipart upload: missing location or ETag');
      }

      logger.info({
        key: session.key,
        uploadId: session.uploadId,
        partsCount: parts.length,
        totalSize: parts.reduce((sum, part) => sum + part.size, 0),
        location: response.Location,
        etag: response.ETag
      }, 'Completed multipart upload');

      return {
        location: response.Location,
        etag: response.ETag,
        bucket: session.bucket,
        key: session.key
      };
    });
  }

  async abortMultipartUpload(session: MultipartUploadSession): Promise<void> {
    return withSpan('s3.abort_multipart_upload', {
      's3.key': session.key,
      's3.upload_id': session.uploadId
    }, async () => {
      const command = new AbortMultipartUploadCommand({
        Bucket: session.bucket,
        Key: session.key,
        UploadId: session.uploadId
      });

      await this.client.send(command);
      
      logger.info({
        key: session.key,
        uploadId: session.uploadId
      }, 'Aborted multipart upload');
    });
  }

  // =============================================
  // Object Operations
  // =============================================

  async getObject(key: string): Promise<ReadableStream<Uint8Array> | undefined> {
    return withSpan('s3.get_object', {
      's3.key': key
    }, async () => {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });

      const response = await this.client.send(command);
      return response.Body?.transformToWebStream();
    });
  }

  async putObject(
    key: string,
    body: Uint8Array | string,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<{ etag: string; location: string }> {
    return withSpan('s3.put_object', {
      's3.key': key,
      's3.content_type': contentType,
      's3.size': typeof body === 'string' ? body.length : body.length
    }, async () => {
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
        ServerSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION || 'AES256'
      });

      const response = await this.client.send(command);
      
      if (!response.ETag) {
        throw new Error('Failed to put object: no ETag returned');
      }

      const location = `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;

      logger.info({
        key,
        contentType,
        size: typeof body === 'string' ? body.length : body.length,
        etag: response.ETag
      }, 'Put object to S3');

      return {
        etag: response.ETag,
        location
      };
    });
  }

  async headObject(key: string): Promise<{
    contentLength: number;
    contentType: string;
    etag: string;
    lastModified: Date;
    metadata: Record<string, string>;
  }> {
    return withSpan('s3.head_object', {
      's3.key': key
    }, async () => {
      const command = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });

      const response = await this.client.send(command);
      
      return {
        contentLength: response.ContentLength || 0,
        contentType: response.ContentType || '',
        etag: response.ETag || '',
        lastModified: response.LastModified || new Date(),
        metadata: response.Metadata || {}
      };
    });
  }

  async deleteObject(key: string): Promise<void> {
    return withSpan('s3.delete_object', {
      's3.key': key
    }, async () => {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });

      await this.client.send(command);
      
      logger.info({ key }, 'Deleted object from S3');
    });
  }

  async listObjects(
    prefix?: string,
    maxKeys: number = 1000
  ): Promise<Array<{ key: string; size: number; lastModified: Date; etag: string }>> {
    return withSpan('s3.list_objects', {
      's3.prefix': prefix || '',
      's3.max_keys': maxKeys
    }, async () => {
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys
      });

      const response = await this.client.send(command);
      
      return (response.Contents || []).map(obj => ({
        key: obj.Key || '',
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        etag: obj.ETag || ''
      }));
    });
  }

  // =============================================
  // Utility Methods
  // =============================================

  generateObjectKey(
    creatorId: string,
    filename: string,
    contentHash?: string
  ): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    // Clean filename
    const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    // Include content hash in key for deduplication
    const hashSuffix = contentHash ? `_${contentHash.substring(0, 8)}` : '';
    
    return `creators/${creatorId}/${year}/${month}/${day}/${Date.now()}_${cleanFilename}${hashSuffix}`;
  }

  generateVariantKey(originalKey: string, profile: string, extension: string): string {
    const basePath = originalKey.replace(/\.[^/.]+$/, ''); // Remove original extension
    return `${basePath}_${profile}.${extension}`;
  }

  calculateContentHash(content: Uint8Array | string): string {
    return createHash('sha256')
      .update(content)
      .digest('hex');
  }

  // =============================================
  // CORS Configuration Helpers
  // =============================================

  getCORSHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': env.FRONTEND_URL,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Content-Length, Authorization, X-Amz-Date, X-Amz-Security-Token, X-Amz-User-Agent',
      'Access-Control-Expose-Headers': 'ETag, Content-Length, Content-Type',
      'Access-Control-Max-Age': '3600'
    };
  }

  // =============================================
  // Health Check
  // =============================================

  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Simple head bucket operation
      await this.listObjects('', 1);
      
      return {
        healthy: true,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// Default S3 manager instance
export const s3Manager = new S3Manager({
  region: env.AWS_REGION,
  bucket: env.S3_BUCKET || '',
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  endpoint: env.S3_ENDPOINT // For local development
});

export { S3Manager };