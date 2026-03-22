import webpush, { PushSubscription } from 'web-push';
import { config } from '../config/env';
import { logger } from './logger';

if (config.webPush.enabled) {
  webpush.setVapidDetails(
    config.webPush.subject,
    config.webPush.vapidPublicKey,
    config.webPush.vapidPrivateKey,
  );
}

export const sendWebPush = async (
  subscription: PushSubscription,
  payload: Record<string, unknown>,
): Promise<boolean> => {
  if (!config.webPush.enabled) return false;

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    logger.warn('Web push send failed', err);
    return false;
  }
};
