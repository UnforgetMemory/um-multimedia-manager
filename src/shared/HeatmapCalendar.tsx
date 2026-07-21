import { useMemo } from "react"
import { cn } from "@/utils/cn"

interface HeatmapCalendarProps {
  data: Record<string, number>
  className?: string
}

export function HeatmapCalendar({ data, className }: HeatmapCalendarProps) {
  const weeks = useMemo(() => {
    const today = new Date()
    const startOfYear = new Date(today.getFullYear(), 0, 1)
    const days: { date: string; count: number; dayOfWeek: number }[] = []

    for (let d = new Date(startOfYear); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]
      days.push({
        date: dateStr,
        count: data[dateStr] || 0,
        dayOfWeek: d.getDay(),
      })
    }

    const grouped: { week: number; days: typeof days }[] = []
    let currentWeek: typeof days = []

    days.forEach((day, i) => {
      if (i === 0) {
        // Pad start of year
        for (let j = 0; j < day.dayOfWeek; j++) {
          currentWeek.push({ date: '', count: 0, dayOfWeek: j })
        }
      }
      currentWeek.push(day)
      if (day.dayOfWeek === 6 || i === days.length - 1) {
        grouped.push({ week: grouped.length, days: currentWeek })
        currentWeek = []
      }
    })

    return grouped
  }, [data])

  const getColor = (count: number) => {
    if (count === 0) return 'umm-bg-muted'
    if (count <= 3) return 'umm-bg-green-200 dark:umm-bg-green-900'
    if (count <= 6) return 'umm-bg-green-400 dark:umm-bg-green-700'
    if (count <= 10) return 'umm-bg-green-600 dark:umm-bg-green-500'
    return 'umm-bg-green-800 dark:umm-bg-green-300'
  }

  return (
    <div className={cn("umm-overflow-x-auto", className)}>
      <div className="umm-flex umm-gap-0.5">
        {weeks.map((week) => (
          <div key={week.week} className="umm-flex umm-flex-col umm-gap-0.5">
            {week.days.map((day, i) => (
              <div
                key={`${week.week}-${i}`}
                className={cn(
                  "umm-h-3 umm-w-3 umm-rounded-sm",
                  day.date ? getColor(day.count) : 'umm-bg-transparent'
                )}
                title={day.date ? `${day.date}: ${day.count}` : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
