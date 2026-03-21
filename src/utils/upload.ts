import multer from 'multer';
import streamifier from 'streamifier';
import { cloudinary } from '../config/cloudinary';
import { UploadedFile } from '../types';
import { BadRequestError } from './errors';

// Use memory storage — stream directly to Cloudinary (no local disk I/O)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
  },
  fileFilter(_req, file, cb) {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError(`File type not allowed: ${file.mimetype}`));
    }
  },
});

/**
 * Upload a buffer to Cloudinary and return standardised metadata.
 */
export const uploadToCloudinary = (
  buffer: Buffer,
  folder: string,
  mimeType: string,
  originalName: string,
): Promise<UploadedFile> => {
  return new Promise((resolve, reject) => {
    const resourceType: 'image' | 'video' | 'raw' = mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('video/') || mimeType.startsWith('audio/')
        ? 'video'
        : 'raw';

    const fileType: UploadedFile['fileType'] = mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('video/')
        ? 'video'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : 'document';

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          fileType,
          mimeType,
          size: result.bytes,
          name: originalName,
        });
      },
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

/** Delete a file from Cloudinary by public_id */
export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId);
};
