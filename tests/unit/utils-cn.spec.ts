import { test, expect } from '@playwright/test';
import { cn } from '@/libraries/utils/cn';

/**
 * cn — clsx + tailwind-merge composition (`@/libraries/utils/cn`).
 * Contracts pinned:
 * 1. clsx conditioning: false/undefined/null/'' args are dropped, arrays
 *    flatten, objects include only truthy keys;
 * 2. tailwind conflict resolution: the LAST declaration of a utility group
 *    wins ('p-2 p-4' → 'p-4', 'px-2 px-4' → 'px-4');
 * 3. `umm:`-prefixed utilities behave as VARIANTS in tailwind-merge v3:
 *    identical utility+prefix pairs conflict (later wins) but a prefixed class
 *    never collides with its bare twin — conflict handling is per-variant;
 * 4. merge works across separately-passed args, not just within one string.
 */

test.describe('cn', () => {
  test('clsx conditioning drops falsy args and flattens arrays/objects', () => {
    expect(cn('a', false, undefined, null, '', 'b')).toBe('a b');
    expect(cn(['p-2', 'text-sm'], { 'text-red': true, hidden: false })).toBe(
      'p-2 text-sm text-red',
    );
    const disabled = false;
    expect(cn(disabled && 'gone', disabled ? 'x' : undefined)).toBe('');
  });

  test('tailwind conflicts: later utility wins within one string', () => {
    expect(cn('p-2 p-4')).toBe('p-4');
    expect(cn('text-sm text-lg')).toBe('text-lg');
  });

  test('tailwind conflicts resolve across separately-passed args too', () => {
    expect(cn('px-2 py-2', 'px-4')).toBe('py-2 px-4');
    expect(cn('bg-white', false, 'bg-black')).toBe('bg-black');
  });

  test('umm:-prefixed utilities merge like variants (later same-utility wins)', () => {
    // twMerge v3 parses `umm:` as a variant: identical utility+variant pairs
    // DO conflict (later wins), different utilities both survive.
    expect(cn('umm:p-2 umm:p-4')).toBe('umm:p-4');
    expect(cn('umm:rounded-lg umm:border')).toBe('umm:rounded-lg umm:border');
    expect(cn('umm:p-2', 'umm:p-8')).toBe('umm:p-8');
    // Variant-vs-bare do NOT conflict — both remain.
    expect(cn('p-2 umm:p-2')).toBe('p-2 umm:p-2');
  });

  test('unknown non-tailwind classes are preserved untouched', () => {
    expect(cn('my-widget', 'p-2', 'is-active')).toBe('my-widget p-2 is-active');
  });
});
