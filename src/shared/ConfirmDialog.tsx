import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useConfirmStore } from "@/stores/use-confirm-store"

export function ConfirmDialog() {
  const { state, confirm } = useConfirmStore()
  const Icon = state.icon

  return (
    <Dialog open={state.open} onOpenChange={(open) => {
      if (!open && !state.loading) {
        useConfirmStore.setState({ state: { ...state, open: false } })
      }
    }}>
      <DialogContent className="sm:umm-max-w-md">
        <DialogHeader className="umm-flex umm-flex-row umm-items-center umm-gap-3">
          {Icon && <Icon className="umm-h-6 umm-w-6 umm-text-destructive" />}
          <div>
            <DialogTitle>{state.title}</DialogTitle>
            {state.description && (
              <DialogDescription>{state.description}</DialogDescription>
            )}
          </div>
        </DialogHeader>
        {state.warning && (
          <p className="umm-text-sm umm-text-amber-600 dark:umm-text-amber-400">{state.warning}</p>
        )}
        {state.details && (
          <p className="umm-text-sm umm-text-muted-foreground">{state.details}</p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => useConfirmStore.setState({ state: { ...state, open: false } })}
            disabled={state.loading}
          >
            取消
          </Button>
          <Button
            variant="default"
            onClick={confirm}
            disabled={state.loading}
          >
            {state.loading ? '处理中...' : (state.confirmText || '确认')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
