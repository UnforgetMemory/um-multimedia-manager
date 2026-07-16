export const PLATFORMS = ['douban', 'imdb', 'neodb', 'tmdb'] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function requirePlatform(value: string): Platform {
  if (!isPlatform(value)) throw new Error(`Invalid platform: ${value}`);
  return value;
}

export function platformDisplayName(platform: Platform): string {
  const names: Record<Platform, string> = {
    douban: '豆瓣',
    imdb: 'IMDb',
    neodb: 'NeoDB',
    tmdb: 'TMDB',
  };
  return names[platform];
}
