/**
 * M-Team 行匹配纯函数（无 DOM / DB 依赖，便于单元测试）。
 *
 * 职责：把「一行是否命中已看集合」以及「处理后是否标记 resolved」的
 * 决策从 MTeamHandler 中抽离为纯函数。processMTeamRows 消费本模块，
 * tests/unit/pt-mteam.spec.ts 对两个函数做行为锁定。
 */

export interface MTeamRowIds {
  movieDoubanId: string | null
  musicDoubanId: string | null
  imdbId: string | null
}

/**
 * 行匹配决策：电影豆瓣 / 音乐豆瓣 / IMDb 任一命中已看集合即为匹配。
 * 匹配 → 淡化（dim）；未匹配 → 交由 applyCacheFallback 走 pt_id_cache 兜底。
 * 语义与修复前 processMTeamRows 内联逻辑完全一致（行为锁定）。
 */
export function isMTeamRowMatched(
  ids: MTeamRowIds,
  movieDoubanIds: Set<string>,
  musicDoubanIds: Set<string>,
  imdbIds: Set<string>,
): boolean {
  const hasMovie = !!ids.movieDoubanId && movieDoubanIds.has(ids.movieDoubanId)
  const hasMusic = !!ids.musicDoubanId && musicDoubanIds.has(ids.musicDoubanId)
  const hasImdb = !!ids.imdbId && imdbIds.has(ids.imdbId)
  return hasMovie || hasMusic || hasImdb
}

export interface MTeamRowOutcome {
  /** 是否命中已看集合（决定是否淡化） */
  matched: boolean
  /**
   * 是否标记 data-umm-mteam-resolved。
   * 仅 matched 行标记 resolved；未匹配行必须保持 unresolved——
   * 否则 process() 中 unresolved 过滤恒为空，applyCacheFallback（pt_id_cache
   * 消费端）永不执行，扫描器写入的缓存数据在该站没有消费者（audit M3）。
   */
  resolved: boolean
}

/**
 * 单行处理决策：matched 与 resolved 同值。
 * 拆成两个字段是为让 resolved 契约可被单测锁定，未来若兜底逻辑
 * 需要「未命中也提前标记」的分支，只需改此处，processMTeamRows 不动。
 */
export function getMTeamRowOutcome(
  ids: MTeamRowIds,
  movieDoubanIds: Set<string>,
  musicDoubanIds: Set<string>,
  imdbIds: Set<string>,
): MTeamRowOutcome {
  const matched = isMTeamRowMatched(ids, movieDoubanIds, musicDoubanIds, imdbIds)
  return { matched, resolved: matched }
}
