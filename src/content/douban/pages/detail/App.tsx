import { useEffect, useState, useMemo, useCallback } from 'react'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmMediaCard } from '@/content/douban/components/UmmMediaCard'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import { useInterest } from './hooks/useInterest'
import { onCrossPlatformSave, syncNeoDBOnLoad } from './hooks/useCrossPlatformSync'
import { Store } from '@/features/database'
import type { DetailData } from './detail-data'

interface PageProps {
  detailData: DetailData
}

/**
 * Convert meta row HTML to chip-wrapped HTML with /-separated chips,
 * target="_blank" on all links, and IMDb ID wrapping.
 * Mirrors the original Vue metaToChips() logic exactly.
 */
function metaToChips(html: string, label?: string): string {
  const leading = html.match(/^(<[^>]+>)+/)
  const trailing = html.match(/(<\/[^>]+>)+$/)
  const prefix = leading?.[0] ?? ''
  const suffix = trailing?.[0] ?? ''
  let core = html
  if (prefix) core = core.slice(prefix.length)
  if (suffix && core.endsWith(suffix)) core = core.slice(0, -suffix.length)

  let result = ''
  let inTag = false
  let i = 0
  while (i < core.length) {
    const ch = core[i]
    if (ch === '<') { inTag = true; result += ch; i++; continue }
    if (inTag) { result += ch; if (ch === '>') inTag = false; i++; continue }
    if (ch === '/' && i > 0 && i < core.length - 1 && /\s/.test(core[i - 1]) && /\s/.test(core[i + 1])) {
      result = result.replace(/\s+$/, '')
      let j = i + 2
      while (j < core.length && /\s/.test(core[j])) j++
      while (j < core.length && core[j] === '<') {
        const closeEnd = core.indexOf('>', j)
        if (closeEnd === -1) break
        const tag = core.slice(j, closeEnd + 1)
        if (tag.startsWith('</')) {
          result += tag
          j = closeEnd + 1
          while (j < core.length && /\s/.test(core[j])) j++
        } else {
          break
        }
      }
      result += '</span><span class="umm-meta-chip">'
      i = j
      continue
    }
    result += ch
    i++
  }
  result = result.replace(/<a(?=\s)(?![^>]*\btarget=)/g, '<a target="_blank" rel="noopener noreferrer"')
  const trimmed = result.trim()
  if (label === 'IMDb' && /^tt\d+$/.test(trimmed)) {
    result = `<a href="https://www.imdb.com/title/${trimmed}/" target="_blank" rel="noopener noreferrer">${trimmed}</a>`
  }
  return prefix + '<span class="umm-meta-chip">' + result + '</span>' + suffix
}

function ratingBarWidth(pct: string): string {
  return `${parseFloat(pct.replace('%', '')) || 0}%`
}

const INTEREST_LABELS: Record<string, { wish: string; do: string; collect: string }> = {
  movie: { wish: '想看', do: '在看', collect: '看过' },
  music: { wish: '想听', do: '在听', collect: '已听' },
  book: { wish: '想读', do: '在读', collect: '已读' },
}

export default function App({ detailData }: PageProps) {
  const d = detailData
  const mediaType = d.isBook ? 'book' : d.isMusic ? 'music' : 'movie' as const
  const interested = useInterest(
    () => d.identity.providerId,
    d.record?.status === 1 ? 'wish' : d.record?.status === 3 ? 'do' : d.record?.status === 2 ? 'collect' : null,
    d.record?.status && d.record?.rating ? d.record.rating : 0,
  )
  const [selectedRating, setSelectedRating] = useState(interested.currentRating)
  const [comment, setComment] = useState(interested.currentComment)
  const [selectedTags, setSelectedTags] = useState<string[]>(interested.savedTags)

  useEffect(() => {
    interested.fetchInterest().then(() => {
      if (interested.interestStatus === 'collect') {
        import('@/entrypoints/content/neodb-push').then(({ injectNeoDBPushButtons: inject }) => {
          Store.dbGet('douban_records', `${d.identity.type}::${d.identity.providerId}`).then(rec => {
            inject(
              { provider: 'douban', type: d.identity.type, providerId: d.identity.providerId, url: window.location.href },
              rec,
            )
          })
        })
      }
      const identity = { provider: 'douban' as const, type: d.identity.type, providerId: d.identity.providerId, url: window.location.href }
      syncNeoDBOnLoad(identity, d.record).catch(e =>
        console.warn('[UMM] NeoDB on-load check failed:', e)
      )
    })
  }, [])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  // Sorted awards: nominations last
  const sortedAwards = useMemo(() => {
    return [...d.awardItems].sort((a, b) => {
      if (a.isNomination === b.isNomination) return 0
      return a.isNomination ? 1 : -1
    })
  }, [d.awardItems])

  // Artist name for music pages
  const artistName = useMemo(() => {
    if (!d.isMusic) return ''
    const performerRow = d.metaRows.find(r => r.label === '表演者')
    if (!performerRow) return ''
    const div = document.createElement('div')
    div.innerHTML = performerRow.html
    return div.textContent?.replace(/\s*\/\s*/g, ' / ').trim() || ''
  }, [d.isMusic, d.metaRows])

  const bigstarClass = d.bigstarNum ? `bigstar bigstar${d.bigstarNum}` : ''
  const interestLabels = INTEREST_LABELS[mediaType] || INTEREST_LABELS.movie
  const posterAspect = mediaType === 'book' ? ASPECT_RATIO.POSTER : mediaType === 'music' ? ASPECT_RATIO.SQUARE : ASPECT_RATIO.POSTER

  const openLink = useCallback((url: string) => {
    window.open(url, '_blank')
  }, [])

  return (
    <UmmPageLayout type={mediaType}>
      <div className="umm-detail-root">
        {/* ===== HEADER ===== */}
        <div className="umm-detail-title-block">
          <div className="umm-detail-title-row">
            <h1 className="umm-detail-title">{d.title}</h1>
            {d.originalTitle && d.originalTitle !== d.title && (
              <span className="umm-detail-original">{d.originalTitle}</span>
            )}
            {d.year && <span className="umm-detail-year">{d.year}</span>}
          </div>
          {artistName && <span className="umm-detail-artist">{artistName}</span>}
        </div>

        {/* ===== GRID: Left (poster + rating) + Right (meta + actions) ===== */}
        <div className="umm-detail-grid">

          {/* --- LEFT COLUMN --- */}
          <div className="umm-detail-left">

            {/* Poster */}
            {d.posterSrc && (
              <div className="umm-poster">
                {d.posterLink ? (
                  <a href={d.posterLink} target="_blank" rel="noopener noreferrer">
                    <UmmImageWrapper
                      src={d.posterSrc}
                      alt={d.posterAlt}
                      aspectRatio={posterAspect}
                      eager
                    />
                  </a>
                ) : (
                  <UmmImageWrapper
                    src={d.posterSrc}
                    alt={d.posterAlt}
                    aspectRatio={posterAspect}
                    eager
                  />
                )}
              </div>
            )}

            {/* Rating card */}
            {d.ratingNum && (
              <div className="umm-rating-card">
                <div className="umm-rating-score-section">
                  <span className="umm-rating-score">{d.ratingNum}</span>
                  <div className="umm-rating-meta">
                    <span className="umm-rating-stars">
                      {bigstarClass && <span className={bigstarClass} />}
                    </span>
                    {d.ratingPeople && (
                      <span className="umm-rating-people">{d.ratingPeople}人评价</span>
                    )}
                  </div>
                </div>
                {d.betterThan.length > 0 && (
                  <div className="umm-rating-better">
                    <span className="umm-better-label">好于</span>
                    {d.betterThan.map((t: string, i: number) => (
                      <span key={i} className="umm-better-chip">{t}</span>
                    ))}
                  </div>
                )}
                {d.ratingBars.length > 0 && (
                  <div className="umm-rating-bars">
                    {d.ratingBars.map((bar: any, i: number) => (
                      <div key={i} className="umm-bar-row">
                        <span className="umm-bar-label">{bar.label.replace(/星/g, '')}星</span>
                        <div className="umm-bar-track">
                          <div className="umm-bar-fill" style={{ width: ratingBarWidth(bar.pct) }} />
                        </div>
                        <span className="umm-bar-pct">{bar.pct}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Interest bar (existing) */}
            <div className="umm-detail-interest">
              <div className="umm-interest-buttons">
                {interested.hasDo && (
                  <button
                    className={'umm-interest-btn' + (interested.interestStatus === 'do' ? ' umm-interest-btn--active' : '')}
                    onClick={async () => {
                      const tags = selectedTags.join(',')
                      const ok = await interested.submitInterest('do', selectedRating, tags, comment)
                      if (ok) await onCrossPlatformSave({
                        identity: d.identity, interest: 'do',
                        stars: selectedRating, comment: comment, newStatus: 3, newRating: selectedRating,
                      })
                    }}
                    disabled={interested.loading}
                  >{interestLabels.do}</button>
                )}
                <button
                  className={'umm-interest-btn' + (interested.interestStatus === 'wish' ? ' umm-interest-btn--active' : '')}
                  onClick={async () => {
                    const tags = selectedTags.join(',')
                    const ok = await interested.submitInterest('wish', selectedRating, tags, comment)
                    if (ok) await onCrossPlatformSave({
                      identity: d.identity, interest: 'wish',
                      stars: selectedRating, comment: comment, newStatus: 1, newRating: selectedRating,
                    })
                  }}
                  disabled={interested.loading}
                >{interestLabels.wish}</button>
                <button
                  className={'umm-interest-btn' + (interested.interestStatus === 'collect' ? ' umm-interest-btn--active' : '')}
                  onClick={async () => {
                    const tags = selectedTags.join(',')
                    const ok = await interested.submitInterest('collect', selectedRating, tags, comment)
                    if (ok) await onCrossPlatformSave({
                      identity: d.identity, interest: 'collect',
                      stars: selectedRating, comment: comment, newStatus: 2, newRating: selectedRating,
                    })
                  }}
                  disabled={interested.loading}
                >{interestLabels.collect}</button>
              </div>

              {/* Rating selector: 1-10 scale (0.5 step) */}
              <div className="umm-interest-rating">
                <span className="umm-interest-label">评分: </span>
                <div className="umm-stars">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                    <button
                      key={star}
                      className={'umm-star-btn' + (selectedRating >= star ? ' umm-star-btn--active' : '')}
                      onClick={() => setSelectedRating(selectedRating === star ? 0 : star)}
                      title={String(star / 2)}
                    >★</button>
                  ))}
                  {selectedRating > 0 && (
                    <span className="umm-rating-text">{selectedRating / 2} 分</span>
                  )}
                  {selectedRating > 0 && (
                    <button className="umm-rating-clear" onClick={() => setSelectedRating(0)}>清除</button>
                  )}
                </div>
              </div>

              {/* Tags - clickable */}
              {interested.myTags.length > 0 && (
                <div className="umm-interest-tags">
                  <span className="umm-interest-label">标签: </span>
                  {interested.myTags.map((tag: any, i: number) => (
                    <span
                      key={i}
                      className={'umm-interest-tag' + (selectedTags.includes(tag) ? ' umm-interest-tag--active' : '')}
                      onClick={() => toggleTag(tag)}
                    >{tag}</span>
                  ))}
                </div>
              )}

              {/* Comment input */}
              <div className="umm-interest-comment">
                <input
                  type="text"
                  className="umm-interest-input"
                  placeholder="添加评论..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>

              {interested.loading && <span className="umm-interest-loading">保存中...</span>}
              {interested.error && <span className="umm-interest-error">{interested.error}</span>}
            </div>

            {/* My comment */}
            {interested.currentComment && (
              <div className="umm-my-comment">
                <span className="umm-my-comment-label">我的短评：</span>
                <span className="umm-my-comment-text">{interested.currentComment}</span>
              </div>
            )}
          </div>

          {/* --- RIGHT COLUMN (body) --- */}
          <div className="umm-detail-body">

            {/* Meta chips */}
            {d.metaRows.length > 0 && (
              <div className="umm-meta-card">
                {d.metaRows.map((row: any, i: number) => (
                  <div key={i} className="umm-meta-row">
                    <span className="umm-meta-label">{row.label}</span>
                    <span
                      className="umm-meta-value"
                      dangerouslySetInnerHTML={{ __html: metaToChips(row.html, row.label) }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Rank card */}
            {(d.rankNo || d.rankText) && (
              <div className="umm-meta-card">
                <div className="umm-meta-row">
                  <span className="umm-meta-label">排行榜</span>
                  <span className="umm-meta-value">
                    {d.rankHref ? (
                      <a
                        href={d.rankHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="umm-link"
                      >{d.rankNo} {d.rankText}</a>
                    ) : (
                      <>{d.rankNo} {d.rankText}</>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Synopsis */}
            {d.synopsisHtml && (
              <div className="umm-synopsis-card">
                <h3 className="umm-synopsis-heading">{d.synopsisHeading}</h3>
                <div
                  className="umm-synopsis-text"
                  dangerouslySetInnerHTML={{ __html: d.synopsisHtml }}
                />
              </div>
            )}

            {/* NeoDB actions + doulist button */}
            <div className="umm-actions">
              <div id="umm-neodb-actions" />
              <button
                className="umm-dl-trigger"
                onClick={() => {
                  const btn = document.querySelector('#interest_sect_level .collect_btn, [name*="collect"]') as HTMLElement | null
                  btn?.click()
                }}
              >{mediaType === 'book' ? '+ 添加到书单' : '+ 添加到片单'}</button>
            </div>

          </div>
        </div>

        {/* ===== TRACK LIST (music) ===== */}
        {d.trackItems.length > 0 && (
          <div className="umm-track-card">
            <h3 className="umm-track-heading">曲目</h3>
            <ol className="umm-track-list">
              {d.trackItems.map((track: string, i: number) => (
                <li key={i} className="umm-track-item">{track}</li>
              ))}
            </ol>
          </div>
        )}

        {/* ===== AWARDS ===== */}
        {sortedAwards.length > 0 && (
          <div className="umm-award-card">
            <h3 className="umm-award-heading">获奖情况</h3>
            <div className="umm-award-list">
              {sortedAwards.map((a: any, i: number) => (
                <div key={i} className="umm-award-item">
                  <div className={'umm-award-badge' + (a.isNomination ? ' umm-award-badge--nom' : '')}>
                    {a.isNomination ? '提名' : '获奖'}
                  </div>
                  <div className="umm-award-info">
                    <span className="umm-award-festival">{a.festival}</span>
                    <span className="umm-award-category">{a.category}</span>
                    {a.nominee && (
                      <span className="umm-award-nominee">
                        {a.nomineeLink ? (
                          <a href={a.nomineeLink} target="_blank" rel="noopener noreferrer">{a.nominee}</a>
                        ) : (
                          <>{a.nominee}</>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== CELEBRITIES ===== */}
        {d.celebItems.length > 0 && (
          <div className="umm-celeb-card">
            <h3 className="umm-celeb-heading">
              {d.celebHeading}
              {d.celebCount && (
                <span className="umm-section-link">
                  (<span
                    style={{ cursor: 'pointer' }}
                    onClick={() => openLink(`/subject/${d.identity.providerId}/celebrities`)}
                  >{d.celebCount}</span>)
                </span>
              )}
            </h3>
            <div className="umm-celeb-grid">
              {d.celebItems.map((c: any, i: number) => (
                <a
                  key={i}
                  href={c.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="umm-celeb-item"
                >
                  <UmmImageWrapper
                    src={c.avatar}
                    alt={c.name}
                    aspectRatio={ASPECT_RATIO.POSTER}
                  />
                  <div className="umm-celeb-info">
                    <span className="umm-celeb-name">{c.name}</span>
                    <span className="umm-celeb-role">{c.role}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ===== BOOK SECTIONS ===== */}
        {d.authorBioHtml && (
          <div className="umm-author-bio-card">
            <h3 className="umm-synopsis-heading">作者简介</h3>
            <div
              className="umm-synopsis-text"
              dangerouslySetInnerHTML={{ __html: d.authorBioHtml }}
            />
          </div>
        )}

        {d.tocItems.length > 0 && (
          <div className="umm-toc-card">
            <h3 className="umm-toc-heading">目录</h3>
            <div className="umm-toc-list">
              {d.tocItems.map((item: string, i: number) => (
                <div key={i} className="umm-toc-item">{item}</div>
              ))}
            </div>
          </div>
        )}

        {d.blockquoteItems.length > 0 && (
          <div className="umm-blockquote-card">
            <h3 className="umm-blockquote-heading">原文摘录</h3>
            <div className="umm-blockquote-list">
              {d.blockquoteItems.map((bq: any, i: number) => (
                <div key={i} className="umm-blockquote-item">
                  <div className="umm-blockquote-text">{bq.text}</div>
                  {(bq.source || bq.user) && (
                    <div className="umm-blockquote-meta">
                      {bq.source && <span className="umm-blockquote-source">—— 引自 {bq.source}</span>}
                      {bq.user && <span className="umm-blockquote-user">— {bq.user}</span>}
                      {bq.votes > 0 && <span className="umm-blockquote-votes">{bq.votes}赞</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {d.editionItems.length > 0 && (
          <div className="umm-edition-card">
            <h3 className="umm-edition-heading">其他版本</h3>
            <div className="umm-edition-list">
              {d.editionItems.map((ed: any, i: number) => (
                <div key={i} className="umm-edition-item">
                  <a href={ed.link} target="_blank" rel="noopener noreferrer" className="umm-edition-link">{ed.title}</a>
                  <span className="umm-edition-meta">{ed.rating} {ed.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== PHOTOS GALLERY ===== */}
        {d.photoItems.length > 0 && (
          <div className="umm-photo-card">
            <h3 className="umm-photo-heading">
              剧照
              <span className="umm-section-link">(
                {d.trailerCount && (
                  <span
                    style={{ cursor: 'pointer' }}
                    onClick={() => openLink(`/subject/${d.identity.providerId}/trailer#trailer`)}
                  >预告片{d.trailerCount}</span>
                )}
                {d.trailerCount && d.photoCount && <>&nbsp;|&nbsp;</>}
                {d.photoCount && (
                  <span
                    style={{ cursor: 'pointer' }}
                    onClick={() => openLink(`/subject/${d.identity.providerId}/all_photos`)}
                  >图片{d.photoCount}</span>
                )}
              )</span>
            </h3>
            <div className="umm-photo-grid">
              {d.photoItems.map((p: any, i: number) => (
                <a
                  key={i}
                  href={p.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="umm-photo-item"
                >
                  <UmmImageWrapper
                    src={p.src}
                    alt={p.isVideo ? '预告片' : '剧照'}
                    aspectRatio={ASPECT_RATIO.WIDE}
                  />
                  {p.isVideo && <span className="umm-photo-badge">预告片</span>}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ===== SHORT COMMENTS ===== */}
        {d.shortComments.length > 0 && (
          <div className="umm-comment-card">
            <h3 className="umm-comment-heading">热门短评</h3>
            <div className="umm-comment-list">
              {d.shortComments.map((c: any, i: number) => (
                <div key={i} className="umm-comment-item">
                  <div className="umm-comment-meta">
                    <span
                      style={{ cursor: 'pointer' }}
                      className="umm-comment-user"
                      onClick={() => openLink(c.userLink)}
                    >{c.user}</span>
                    <span className="umm-comment-stars">
                      {[1, 2, 3, 4, 5].map(s => (
                        <span
                          key={s}
                          className={'umm-comment-star' + (s <= c.rating ? ' umm-comment-star--on' : '')}
                        >★</span>
                      ))}
                    </span>
                    <span className="umm-comment-up">{c.votes > 0 ? c.votes + ' 有用' : ''}</span>
                  </div>
                  <p className="umm-comment-text">{c.content}</p>
                  <span className="umm-comment-time">{c.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== RECOMMENDATIONS ===== */}
        {d.recItems.length > 0 && (
          <div className="umm-rec-card">
            <h3 className="umm-rec-heading">推荐</h3>
            <div className="umm-rec-grid">
              {d.recItems.map((r: any, i: number) => (
                <UmmMediaCard
                  key={`${r.subjectId}-${r.recStatus}-${r.personalRating ?? Number(r.rating) ?? 0}-${i}`}
                  mode="grid"
                  posterUrl={r.poster}
                  title={r.title}
                  href={r.link}
                  badgeStatus={r.recStatus}
                  badgeRating={r.personalRating ?? Number(r.rating)}
                  rating={r.rating || ''}
                  type={mediaType}
                />
              ))}
            </div>
          </div>
        )}

      </div>
    </UmmPageLayout>
  )
}
