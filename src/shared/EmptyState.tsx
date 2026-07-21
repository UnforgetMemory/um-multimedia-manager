import React from 'react'
import { cn } from '@/utils/cn'

interface EmptyStateProps {
  icon?: React.ReactNode
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title = '暂无数据', description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('umm-flex umm-flex-col umm-items-center umm-justify-center umm-py-16 umm-px-4 umm-text-center', className)}>
      {icon && <div className="umm-mb-4 umm-text-muted-foreground/50">{icon}</div>}
      <h3 className="umm-text-base umm-font-medium umm-text-muted-foreground">{title}</h3>
      {description && <p className="umm-mt-1 umm-text-sm umm-text-muted-foreground/70">{description}</p>}
      {action && <div className="umm-mt-4">{action}</div>}
    </div>
  )
}