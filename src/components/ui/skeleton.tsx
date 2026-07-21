import { cn } from "@/utils/cn"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "umm-animate-pulse umm-rounded-md umm-bg-primary/10",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
