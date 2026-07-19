// ─── Mukaku 模块入口 ──────────────────────────────────

import { MukakuHandler } from './handler'
import { MUKAKU_CONFIG, NETWORK_CONFIG } from './config'

const handler = new MukakuHandler()

export async function handleMukakuDetailPage(): Promise<void> {
  await handler.handleDetailPage()
}

export async function handleMukakuListPage(): Promise<void> {
  await handler.handleListPage()
}

export function cleanupMukaku(): void {
  handler.cleanup()
}

// Re-export config for potential external use
export { MUKAKU_CONFIG, NETWORK_CONFIG }