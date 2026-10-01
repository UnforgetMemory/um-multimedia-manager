/**
 * WebDAV provider — public surface.
 * Transport (fetch/protocol) + pure mapping seam, re-exported as one stable
 * import path. Existing consumers keep using `./api` (transport) directly.
 */

export * from './api';
export {
  hashKeyToFilename,
  normalizeRemoteMetaPayload,
  normalizeUrl,
  stripUrlCredentials,
} from './mapping';
