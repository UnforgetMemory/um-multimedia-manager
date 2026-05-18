/**
 * URL 解析工具 - 用于测试
 * 从 App.vue 中提取的 parseRatingInput 逻辑
 */

export type Domain = 'movie' | 'tv' | 'music';
export type Provider = 'douban' | 'imdb' | 'neodb' | 'tmdb';

export interface ParsedUrl {
  domain: Domain;
  provider: Provider;
  providerId: string;
  url: string;
}

/**
 * 解析评分输入(支持URL和ID)
 */
export function parseRatingInput(
  input: string,
  selectedPlatform: Provider = 'douban'
): ParsedUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  
  // 1. 检测豆瓣 URL (支持 movie/book/music)
  const doubanMatch = trimmed.match(/(?:movie|book|music)\.douban\.com\/subject\/(\d+)/);
  if (doubanMatch) {
    const detectedProvider: Provider = 'douban';
    const detectedDomain: Domain = trimmed.includes('movie') ? 'movie' : 
                                    trimmed.includes('book') ? 'movie' : 'music';
    return {
      domain: detectedDomain,
      provider: detectedProvider,
      providerId: doubanMatch[1],
      url: `https://${trimmed.includes('book') ? 'book' : trimmed.includes('music') ? 'music' : 'movie'}.douban.com/subject/${doubanMatch[1]}/`,
    };
  }
  
  // 2. 检测 IMDb URL
  const imdbMatch = trimmed.match(/imdb\.com\/title\/(tt\d+)/i);
  if (imdbMatch) {
    return {
      domain: 'movie',
      provider: 'imdb',
      providerId: imdbMatch[1].toLowerCase(),
      url: `https://www.imdb.com/title/${imdbMatch[1].toLowerCase()}/`,
    };
  }
  
  // 3. 检测 NeoDB URL
  const neodbMatch = trimmed.match(/neodb\.social\/(movie|tv|album)\/([\w-]+)/);
  if (neodbMatch) {
    const domainMap: Record<string, Domain> = { movie: 'movie', tv: 'tv', album: 'music' };
    return {
      domain: domainMap[neodbMatch[1]] || 'movie',
      provider: 'neodb',
      providerId: neodbMatch[2],
      url: `https://neodb.social/${neodbMatch[1]}/${neodbMatch[2]}/`,
    };
  }
  
  // 4. 检测 TMDB URL
  const tmdbMovieMatch = trimmed.match(/themoviedb\.org\/movie\/(\d+)/);
  if (tmdbMovieMatch) {
    return {
      domain: 'movie',
      provider: 'tmdb',
      providerId: tmdbMovieMatch[1],
      url: `https://www.themoviedb.org/movie/${tmdbMovieMatch[1]}/`,
    };
  }
  
  const tmdbTvMatch = trimmed.match(/themoviedb\.org\/tv\/(\d+)/);
  if (tmdbTvMatch) {
    return {
      domain: 'tv',
      provider: 'tmdb',
      providerId: tmdbTvMatch[1],
      url: `https://www.themoviedb.org/tv/${tmdbTvMatch[1]}/`,
    };
  }
  
  // 5. 如果是 IMDb ID (tt开头或纯数字)
  if (/^tt\d+$/i.test(trimmed)) {
    return {
      domain: 'movie',
      provider: 'imdb',
      providerId: trimmed.toLowerCase(),
      url: `https://www.imdb.com/title/${trimmed.toLowerCase()}/`,
    };
  }
  
  // 6. 如果是纯数字 ID,根据选择的平台处理
  if (/^\d+$/.test(trimmed)) {
    const provider = selectedPlatform;
    
    // 根据平台确定 domain
    let domain: Domain = 'movie';
    
    // 生成对应的 URL
    let url = '';
    if (provider === 'douban') {
      url = `https://movie.douban.com/subject/${trimmed}/`;
    } else if (provider === 'imdb') {
      url = `https://www.imdb.com/title/tt${trimmed}/`;
    } else if (provider === 'neodb') {
      url = `https://neodb.social/movie/${trimmed}/`;
    } else if (provider === 'tmdb') {
      url = `https://www.themoviedb.org/movie/${trimmed}/`;
    }
    
    return {
      domain,
      provider,
      providerId: trimmed,
      url,
    };
  }
  
  return null;
}
