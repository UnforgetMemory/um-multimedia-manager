import * as Store from './api'
export { Store }
/**
 * Content/SPA may only see the message facade + store name map.
 * The IndexedDB singleton (`mediaDB`) stays on the deep path
 * `@/features/database/models` for background handlers only.
 */
export { STORE_NAMES } from './models'
