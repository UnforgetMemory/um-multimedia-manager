export const PLATFORM_LABELS: Record<string, string> = {
  douban: '豆瓣', imdb: 'IMDb', neodb: 'NeoDB', tmdb: 'TMDB',
  javdb: 'JavDB', sehuatang: '色花堂', local: '本地',
}

export const PLATFORM_HUES: Record<string, number> = {
  douban: 142, imdb: 45, neodb: 217, tmdb: 271,
  javdb: 0, sehuatang: 25, local: 200,
}

export function usePlatformColor(hue: number) {
  const isDark = document.documentElement.classList.contains('dark')
  return {
    bar: `hsl(${hue}, 55%, ${isDark ? '50%' : '45%'})`,
    icon: `hsl(${hue}, 55%, ${isDark ? '45%' : '40%'})`,
    chipBg: isDark ? `hsl(${hue}, 30%, 15%)` : `hsl(${hue}, 40%, 95%)`,
    chipText: isDark ? `hsl(${hue}, 50%, 75%)` : `hsl(${hue}, 45%, 35%)`,
    chipBorder: isDark ? `hsl(${hue}, 25%, 25%)` : `hsl(${hue}, 35%, 80%)`,
  }
}
