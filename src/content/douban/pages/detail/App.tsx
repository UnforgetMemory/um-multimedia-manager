import { useEffect, useState } from 'react'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmStatusBadge } from '@/content/douban/components/UmmStatusBadge'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import { useInterest } from './hooks/useInterest'
import { onCrossPlatformSave } from './hooks/useCrossPlatformSync'
import type { DetailData } from './detail-data'

interface PageProps {
  detailData: DetailData
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
    interested.fetchInterest()
  }, [])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  return (
    <UmmPageLayout type={mediaType}>
      <div className="umm-detail-root">
        {/* Header */}
        <div className="umm-detail-header">
          <div className="umm-detail-poster">
            <UmmImageWrapper src={d.posterSrc} alt={d.posterAlt} aspectRatio={ASPECT_RATIO.POSTER} />
          </div>
          <div className="umm-detail-meta">
            <h1 className="umm-detail-title">{d.title}</h1>
            {d.originalTitle && d.originalTitle !== d.title && (
              <p className="umm-detail-original-title">{d.originalTitle}</p>
            )}
            <p className="umm-detail-year">{d.year}</p>
            {d.ratingNum && (
              <div className="umm-detail-rating">
                <span className="umm-detail-rating-num">{d.ratingNum}</span>
                {d.ratingPeople && <span className="umm-detail-rating-people">{d.ratingPeople}人评价</span>}
              </div>
            )}
            {d.metaRows.slice(0, 6).map((row: any, i: number) => (
              <p key={i} className="umm-detail-meta-row">
                <span className="umm-detail-meta-label">{row.label}: </span>
                <span>{row.html.replace(/<[^>]*>/g, '')}</span>
              </p>
            ))}
          </div>
        </div>

        {/* Interest Bar */}
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
                    stars: 0, comment: comment, newStatus: 3, newRating: selectedRating,
                  })
                }}
                disabled={interested.loading}
              >在看</button>
            )}
            <button
              className={'umm-interest-btn' + (interested.interestStatus === 'wish' ? ' umm-interest-btn--active' : '')}
              onClick={async () => {
                const tags = selectedTags.join(',')
                const ok = await interested.submitInterest('wish', selectedRating, tags, comment)
                if (ok) await onCrossPlatformSave({
                  identity: d.identity, interest: 'wish',
                  stars: 0, comment: comment, newStatus: 1, newRating: selectedRating,
                })
              }}
              disabled={interested.loading}
            >想看</button>
            <button
              className={'umm-interest-btn' + (interested.interestStatus === 'collect' ? ' umm-interest-btn--active' : '')}
              onClick={async () => {
                const tags = selectedTags.join(',')
                const ok = await interested.submitInterest('collect', selectedRating, tags, comment)
                if (ok) await onCrossPlatformSave({
                  identity: d.identity, interest: 'collect',
                  stars: 0, comment: comment, newStatus: 2, newRating: selectedRating,
                })
              }}
              disabled={interested.loading}
            >看过</button>
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

        {/* Synopsis */}
        {d.synopsisHtml && (
          <div className="umm-detail-section">
            <h2 className="umm-detail-section-title">{d.synopsisHeading || '剧情简介'}</h2>
            <p className="umm-detail-synopsis">{d.synopsisHtml.replace(/<[^>]*>/g, '')}</p>
          </div>
        )}

        {/* Awards */}
        {d.awardItems.length > 0 && (
          <div className="umm-detail-section">
            <h2 className="umm-detail-section-title">获奖</h2>
            {d.awardItems.map((a: any, i: number) => (
              <div key={i} className="umm-detail-award-item">
                <span>{a.festival} - {a.category}</span>
                {a.isNomination && <span> (提名)</span>}
              </div>
            ))}
          </div>
        )}

        {/* Recommendations */}
        {d.recItems.length > 0 && (
          <div className="umm-detail-section">
            <h2 className="umm-detail-section-title">推荐</h2>
            <div className="umm-detail-recs">
              {d.recItems.slice(0, 12).map((r: any, i: number) => (
                <a key={i} href={r.link} target="_blank" rel="noopener noreferrer" className="umm-detail-rec-item">
                  <UmmImageWrapper src={r.poster} alt={r.title} aspectRatio={ASPECT_RATIO.POSTER} />
                  <span className="umm-detail-rec-title">{r.title}</span>
                  <UmmRating score={r.rating || undefined} />
                  {r.recStatus > 0 && (
                    <UmmStatusBadge status={r.recStatus} rating={r.personalRating} variant="small" type={mediaType} />
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </UmmPageLayout>
  )
}