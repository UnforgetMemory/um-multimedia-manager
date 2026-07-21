import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import type { CelebritiesPageData } from './celebrities-data'

interface PageProps {
  data: CelebritiesPageData
}

export default function App({ data }: PageProps) {
  return (
    <UmmPageLayout type="movie">
      <div className="umm-page-root">
        <h2 className="umm-section-title">{data.title}</h2>
        {data.groups.map((g: any, gi: number) => (
          <div key={gi} className="umm-section">
            <h3 className="umm-subsection-title">{g.heading}</h3>
            <div className="umm-grid">
              {g.celebrities.map((c: any, ci: number) => (
                <a key={ci} href={c.personageUrl} target="_blank" rel="noopener noreferrer" className="umm-card umm-card--sm">
                  <UmmImageWrapper src={c.avatar} alt={c.name} aspectRatio={ASPECT_RATIO.SQUARE} />
                  <span className="umm-card-title">{c.name}</span>
                  <span className="umm-card-subtitle">{c.role}</span>
                  {c.works.length > 0 && (
                    <span className="umm-card-desc">
                      {c.works.map((w: any) => w.title).join(' / ')}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </UmmPageLayout>
  )
}
