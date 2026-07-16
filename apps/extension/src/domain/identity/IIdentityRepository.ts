/**
 * IIdentityRepository
 *
 * Repository interface for persisting and retrieving Identity aggregates.
 * Implementations are responsible for storage (IndexedDB, in-memory, etc.)
 * and live in the infrastructure layer.
 *
 * @remarks
 * This interface is written in terms of domain primitives only — no
 * storage-specific types leak through.
 */
import type { Identity } from '@/domain/identity/Identity';

export interface IIdentityRepository {
  /**
   * Find an identity by its composite store key.
   * Returns null when no identity exists for the given key.
   */
  findByKey(storeKey: string): Promise<Identity | null>;

  /**
   * Find an identity by its canonical URL.
   * Returns null when no identity is found.
   */
  findByUrl(url: string): Promise<Identity | null>;

  /**
   * Find an identity by its raw components (platform + type + ID).
   * Returns null when not found.
   */
  findByComponents(platform: string, type: string, providerId: string): Promise<Identity | null>;

  /**
   * Persist an identity.
   * Overwrites any existing entry for the same store key.
   */
  save(identity: Identity): Promise<void>;

  /**
   * Remove an identity from storage.
   * No-op if the identity does not exist.
   */
  delete(identity: Identity): Promise<void>;

  /**
   * Find all identities that share the same providerId across platforms.
   * For example, a movie that exists on both Douban and IMDb.
   */
  findLinked(identity: Identity): Promise<Identity[]>;

  /**
   * List all identities for a given platform.
   */
  findByPlatform(platform: string): Promise<Identity[]>;

  /**
   * List all identities for a given media type.
   */
  findByType(type: string): Promise<Identity[]>;

  /**
   * Count identities. Optionally filtered by platform and/or type.
   */
  count(platform?: string, type?: string): Promise<number>;

  /**
   * Remove all identities from storage.
   */
  clear(): Promise<void>;
}
