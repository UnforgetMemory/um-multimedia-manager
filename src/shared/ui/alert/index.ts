import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Alert } from "./Alert.vue"
export { default as AlertDescription } from "./AlertDescription.vue"
export { default as AlertTitle } from "./AlertTitle.vue"

export const alertVariants = cva(
  "umm:relative umm:w-full umm:rounded-lg umm:border umm:p-4 umm:[&>svg~*]:pl-7 umm:[[&>svg+div]:translate-y-[-3px]>svg+div]:translate-y-[-3px] umm:[&>svg]:absolute umm:[&>svg]:left-4 umm:[&>svg]:top-4 umm:[&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "umm:bg-background umm:text-foreground",
        destructive:
          "umm:border-destructive/50 umm:text-destructive umm:dark:border-destructive umm:[&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export type AlertVariants = VariantProps<typeof alertVariants>
