import { v2 as cloudinary } from 'cloudinary';
import { config } from './env';
import { logger } from '../utils/logger';

/**
 * Initialise Cloudinary SDK.
 * Safe to call even when credentials are empty (upload will fail at runtime).
 */
export const initCloudinary = (): void => {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });

  if (config.cloudinary.cloudName) {
    logger.info('Cloudinary configured successfully');
  } else {
    logger.warn('Cloudinary credentials not set — file uploads will be unavailable');
  }
};

export { cloudinary };
