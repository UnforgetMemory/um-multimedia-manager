import { test, expect } from '@playwright/test';
import {
  CURRENT_DATASET_VERSION,
  MIN_SUPPORTED_DATASET_VERSION,
  MigrationError,
  validateDatasetVersion,
} from '@/engine/migration/models';
import { packageDataset, unpackageDataset } from '@/libraries/utils/zip-utils';

/**
 * Dataset (backup ZIP) versioning — T1 contract.
 *
 * Locks: CURRENT_DATASET_VERSION / MIN_SUPPORTED_DATASET_VERSION semantics,
 * validateDatasetVersion error codes, and the packageDataset → unpackageDataset
 * round-trip (dataVersion stamped on package).
 *
 * 分层契约（2026-09-25，架构守卫规则 C 修复后）：
 * `utils/zip-utils` 是 libraries 层，**只负责打包与解析**，不再校验版本；
 * 版本兼容策略归调用方（WebDAV 导入链路显式调用 `validateDatasetVersion`）。
 * 常量唯一事实源 = `src/libraries/utils/dataset-version.ts`，
 * `@/engine/migration/models` 再导出以保持既有导入路径。
 * 末节「版本校验职责分离」用例锁定该契约。
 */

/** Capture the MigrationError thrown by fn (expects exactly one). */
function captureMigrationError(fn: () => unknown): MigrationError {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught, 'expected validateDatasetVersion to throw').toBeInstanceOf(MigrationError);
  return caught as MigrationError;
}

test.describe('validateDatasetVersion', () => {
  test('CURRENT_DATASET_VERSION passes', () => {
    expect(validateDatasetVersion(CURRENT_DATASET_VERSION)).toBe(true);
  });

  test('below MIN_SUPPORTED_DATASET_VERSION throws MigrationError with IMPORT_INCOMPATIBLE', () => {
    const err = captureMigrationError(() =>
      validateDatasetVersion(MIN_SUPPORTED_DATASET_VERSION - 1),
    );
    expect(err.code).toBe('IMPORT_INCOMPATIBLE');
  });

  test('CURRENT_DATASET_VERSION + 1 throws MigrationError with VERSION_TOO_NEW', () => {
    const err = captureMigrationError(() => validateDatasetVersion(CURRENT_DATASET_VERSION + 1));
    expect(err.code).toBe('VERSION_TOO_NEW');
  });
});

test.describe('dataset ZIP round-trip (packageDataset → unpackageDataset)', () => {
  function record(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      url: 'https://example.com/subject/1',
      status: 0,
      rating: 0,
      updatedAt: '2026-08-04T00:00:00.000Z',
      linkedIds: {},
      schemaVersion: 2,
      recordVersion: 1,
      ...overrides,
    };
  }

  test('round-trip preserves data and stamps dataVersion = CURRENT_DATASET_VERSION', async () => {
    const entries = [
      { key: 'movie::1', record: record({ status: 1, rating: 4, comment: 'x' }) },
      { key: 'movie::2', record: record({ status: 2, rating: 8 }) },
    ];

    const { blob, meta } = await packageDataset('douban_records', entries);
    expect(meta.dataVersion).toBe(CURRENT_DATASET_VERSION);

    const { data, meta: unpackedMeta } = await unpackageDataset(blob);
    expect(unpackedMeta.dataVersion).toBe(CURRENT_DATASET_VERSION);
    expect(Object.keys(data).sort()).toEqual(['movie::1', 'movie::2']);
    // `!`：entries 为上方两元素内联夹具，索引必然存在（测试代码允许）。
    expect(data['movie::1']).toEqual(entries[0]!.record);
    expect(data['movie::2']).toEqual(entries[1]!.record);
  });
});

test.describe('版本校验职责分离（zip-utils 只解析，策略归调用方）', () => {
  test('unpackageDataset 原样返回 meta.dataVersion 供调用方判定', async () => {
    const { blob } = await packageDataset('douban_records', []);
    const { meta } = await unpackageDataset(blob);

    // 库不自行抛错：把版本原样交给调用方（WebDAV 导入链路会调用
    // validateDatasetVersion），保证「解析」与「策略」分离。
    expect(meta.dataVersion).toBe(CURRENT_DATASET_VERSION);
    expect(typeof meta.dataVersion).toBe('number');
  });

  test('调用方以 meta.dataVersion 判定：相容通过 / 未来版本抛 VERSION_TOO_NEW', async () => {
    const { blob } = await packageDataset('douban_records', []);
    const { meta } = await unpackageDataset(blob);

    // 调用方路径（与 handleWebDAVDownload / handleWebDAVSync 一致）
    expect(validateDatasetVersion(meta.dataVersion)).toBe(true);

    // 未来版本由策略层拦截 —— 而非由 unpackageDataset 拦截
    const err = captureMigrationError(() => validateDatasetVersion(meta.dataVersion + 1));
    expect(err.code).toBe('VERSION_TOO_NEW');
  });
});
