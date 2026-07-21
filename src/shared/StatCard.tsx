import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/utils/cn"

interface StatCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  className?: string
}

export function StatCard({ label, value, icon, className }: StatCardProps) {
  return (
    <Card className={cn("umm-w-full", className)}>
      <CardContent className="umm-flex umm-items-center umm-gap-4 umm-p-4">
        {icon && <div className="umm-shrink-0">{icon}</div>}
        <div className="umm-flex umm-flex-col">
          <span className="umm-text-2xl umm-font-bold">{value}</span>
          <span className="umm-text-sm umm-text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  )
}
