export interface SerialRunner {
  run(task: () => Promise<void>): void
  idle(): boolean
}

/**
 * Serial runner with coalescing semantics: N run() calls while a run is
 * active collapse into exactly ONE queued re-run, executed after the active
 * run settles. Rejections (and sync throws) are swallowed — the loop keeps
 * draining pending work. Pure async state machine: no timers, no DOM, no
 * chrome APIs.
 */
export function createSerialRunner(): SerialRunner {
  let active: Promise<void> | null = null
  let pending: (() => Promise<void>) | null = null

  const start = (task: () => Promise<void>): void => {
    try {
      active = Promise.resolve(task()).then(settle, settle)
    } catch {
      settle() // synchronous throw from task(): behave like a rejected run
    }
  }

  const settle = (): void => {
    active = null
    if (pending !== null) {
      const task = pending
      pending = null
      start(task)
    }
  }

  return {
    run(task: () => Promise<void>): void {
      if (active !== null) {
        pending = task // coalesced: overwritten by every call while active
      } else {
        start(task)
      }
    },
    idle(): boolean {
      return active === null && pending === null
    },
  }
}
