import { DEFAULT_AVATAR } from '@/constants/avatars';

export const DEFAULT_AVATAR_URL = DEFAULT_AVATAR.url;

export function getValidImageUri(uri?: string | null | undefined, fallbackUri: string = DEFAULT_AVATAR_URL): string {
  if (!uri || typeof uri !== 'string' || uri.trim().length === 0) {
    return fallbackUri;
  }
  return uri.trim();
}
