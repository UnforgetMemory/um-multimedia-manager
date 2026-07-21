import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/utils/cn"

interface PlatformData {
  name: string
  count: number
  color: string
}

interface PlatformDistributionProps {
  data: PlatformData[]
  className?: string
}

export function PlatformDistribution({ data, className }: PlatformDistributionProps) {
  const total = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data])
  const maxCount = useMemo(() => Math.max(...data.map(d => d.count), 1), [data])

  return (
    <Card className={cn("umm-w-full", className)}>
      <CardHeader>
        <CardTitle className="umm-text-lg">平台分布</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="umm-space-y-3">
          {data.map((item) => (
            <div key={item.name} className="umm-space-y-1">
              <div className="umm-flex umm-items-center umm-justify-between umm-text-sm">
                <span>{item.name}</span>
                <span className="umm-text-muted-foreground">
                  {item.count} ({total > 0 ? Math.round((item.count / total) * 100) : 0}%)
                </span>
              </div>
              <div className="umm-h-2 umm-w-full umm-rounded-full umm-bg-muted">
                <div
                  className="umm-h-full umm-rounded-full umm-transition-all"
                  style={{
                    width: `${(item.count / maxCount) * 100}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
