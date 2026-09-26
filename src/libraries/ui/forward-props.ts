import { camelize, computed, toHandlerKey } from 'vue'
import type { ComputedRef } from 'vue'

/**
 * Vapor-safe replacements for reka-ui's `useForwardProps` / `useForwardPropsEmits`.
 *
 * WHY THIS EXISTS
 * reka-ui resolves the current component instance through Vue's VDOM
 * `getCurrentInstance()`. Inside a Vapor component's `setup()` that call
 * returns `null`, so both reka-ui helpers silently degrade to an empty object:
 *
 *   useForwardProps(props)        -> {}  (reads vm.type.props / vm.vnode.props)
 *   useForwardPropsEmits(p, emit) -> {}  (useEmitAsProps reads vm.type.emits)
 *
 * The wrapper then forwards nothing: props never reach the wrapped primitive,
 * and `v-model` / `update:*` never propagate back to the caller — a silent
 * functional regression, not a crash. The helpers below derive everything from
 * the values handed to them, so they behave identically under either renderer.
 */

/** Emit declaration map shape, as accepted by `defineEmits`. */
type EmitMap = Record<string, unknown[]>

/** Constructor-name union of an emit map, e.g. `'update:open'`. */
export type EmitName<Emits extends EmitMap> = Extract<keyof Emits, string>

/**
 * `defineEmits<Emits>()` yields an INTERSECTION of one-argument-per-event
 * functions; this union form accepts that intersection while still binding the
 * handler to the same emit map.
 */
type EmitFnOf<Emits extends EmitMap> = {
  [K in EmitName<Emits>]: (name: K, ...args: Emits[K]) => void
}[EmitName<Emits>]

/** Declared props as a plain object.
 *
 *  Keys with `undefined` values are dropped so the wrapped primitive's own
 *  prop defaults still apply; `omitted` keys (typically `class`, which the
 *  wrappers bind explicitly) are dropped as well. */
export function forwardProps<P extends Record<string, unknown>>(
  props: P,
  omitted: readonly string[] = [],
): ComputedRef<P> {
  return computed(() => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || omitted.includes(key)) continue
      out[key] = value
    }
    return out as P
  })
}

/**
 * Declared emits as `onXxx` handler props.
 *
 * `names` is checked against the emit map type, so a name the wrapped
 * primitive does not declare fails `type-check` instead of silently dropping
 * the listener.
 */
export function forwardEmits<Emits extends EmitMap>(
  emit: EmitFnOf<Emits>,
  names: readonly EmitName<Emits>[],
): Record<string, (payload: unknown) => void> {
  const out: Record<string, (payload: unknown) => void> = {}
  for (const name of names) {
    out[toHandlerKey(camelize(name))] = (payload: unknown) => {
      // Single bridge assertion: TypeScript cannot call a member of an
      // emit-function union selected by a runtime name, so the signature is
      // narrowed once here rather than at every wrapper.
      const call = emit as unknown as (name: EmitName<Emits>, payload: unknown) => void
      call(name, payload)
    }
  }
  return out
}
