export const MEDIA_TYPES = ['movie', 'tv', 'music', 'book', 'game'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export function isMediaType(value: string): value is MediaType {
  return (MEDIA_TYPES as readonly string[]).includes(value);
}

export function requireMediaType(value: string): MediaType {
  if (!isMediaType(value)) throw new Error(`Invalid media type: ${value}`);
  return value;
}

export function isVideo(type: MediaType): boolean {
  return type === 'movie' || type === 'tv';
}

export function isAudio(type: MediaType): boolean {
  return type === 'music';
}

export function isReadable(type: MediaType): boolean {
  return type === 'book';
}
