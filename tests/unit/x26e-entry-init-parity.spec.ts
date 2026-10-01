import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initFileSandbox } from './helpers/global-sandbox';
import {
  analyzeEntry,
  contentEntries,
  findViolations,
  makeDiskReader,
  registerEntryDetectorSelfSeeds,
  type Verdict,
} from './helpers/entry-graph';

initFileSandbox();

/**
 * 「入口装配了样式/日志消费方，却从不装配其前置初始化」守卫。
 *
 * 缺陷形态与 i18n-init-wiring 同一类，只是换了两个初始化器：
 *  1. 主题：legacy 注入的 `content/styles/global.ts` 暗色表全部锚在
 *     `html[data-umm-theme="dark"]`（THEME_VARS_DARK + GLOW_VARS）。写这个属性的是
 *     `scenario/douban/overlay/theme-sync.ts` 的 startThemeAttrSync/subscribeTheme，
 *     只有 Douban 主入口和色花堂早期入口调它 —— legacy 站点（IMDb/NeoDB/Bangumi/
 *     TMDB/PT/JavDB/Mukaku）上的暗色用户因此永远拿到亮色调色板。
 *  2. 日志：logger 的默认值是 `import.meta.env.DEV`，production 里恒关。只有
 *     background 和 legacy content 把 Options 的「调试日志」读进 configureLogging，
 *     三个视频入口（bilibili / bilibili-homepage / youtube）从没读过 —— 用户开了
 *     开关、选级别，这些上下文照样一行不打，线上无法取证。
 *
 * 两道规则：
 *  1. 日志（逐上下文的义务）——入口**自己文件里**必须出现初始化调用点。只按导入图
 *     判定会被「import 了 bootstrapLogging 却不调用」的入口骗过：那个模块内部正好
 *     调着 configureLogging（反向验证实测到这个洞）。
 *  2. 主题（整份文档的状态）——入口图里存在 `injectGlobalStyles` 调用点，就必须也能
 *     走到 startThemeAttrSync/subscribeTheme（Douban 那侧经 scenario/douban/main.ts
 *     转手，是合法形态，故这条按可达性判）。
 *
 * 棘轮：`LOGGING_GAPS` / `THEME_GAPS` 登记并行 agent 正在处理的入口缺口，
 * 只能缩小；补好了不删基线也判红（同 i18n-init-wiring 约定）。
 *
 * 探测器与 6 条自检种子已并入 `helpers/entry-graph.ts`（与 i18n-init-wiring 共用
 * 唯一实现，保留剥注释语义）；本文件只保留真实仓判据与基线，种子经
 * `registerEntryDetectorSelfSeeds()` 仍在本 spec 自证。
 */

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const diskReader = makeDiskReader(REPO);

// 已知缺口基线（只能缩小；补好却不删基线同样判红）。
// 日志：douban-main 与 sehuatang-main 曾登记在此——X103 给两个主入口接上
//   `await bootstrapLogging()`（先于任何路由判断），两条缺口一并闭合，基线清空。
// sehuatang-main 的主题缺口是静态可达性的保守高估——同页的 sehuatang-early.content
//   确实调了 subscribeTheme，属性由那一支落；登记在此是因为 main 自身注入 global.ts
//   样式却不自带同步（若改成 early 专属，请把这条基线删掉）。
const LOGGING_GAPS: string[] = [];
const THEME_GAPS = ['src/entrypoints/sehuatang-main.content/index.ts'];

const verdicts: Verdict[] = contentEntries(diskReader, REPO).map((e) =>
  analyzeEntry(diskReader, e),
);
const violations = findViolations(verdicts);

function keepFresh(list: string[], baseline: string[]): string[] {
  return list.filter((v) => !baseline.some((g) => v.startsWith(`${g}:`)));
}

test.describe('内容入口初始化装配守卫（主题 + 日志）', () => {
  test('枚举与图遍历确实在跑（探针不空转）', () => {
    expect(verdicts.length, 'no content entries enumerated').toBeGreaterThanOrEqual(8);
    const legacy = verdicts.find((v) => v.entry === 'src/entrypoints/content.ts');
    expect(legacy, 'legacy content entry not enumerated').toBeDefined();
    expect(legacy?.graphSize).toBeGreaterThan(50);
    expect(legacy?.logConsumers).toBeGreaterThan(0);
    expect(legacy?.styleInjectors.length).toBeGreaterThan(0);
    // 两条规则各自至少命中一个真实消费方，否则整道规则会静默空转。
    expect(verdicts.filter((v) => v.logConsumers > 0).length).toBeGreaterThanOrEqual(4);
    expect(verdicts.filter((v) => v.styleInjectors.length > 0).length).toBeGreaterThanOrEqual(1);
  });

  test('日志：每个打日志的入口都能走到日志初始化（无未登记缺口）', () => {
    const fresh = keepFresh(violations.logging, LOGGING_GAPS);
    expect(fresh, `未登记的日志初始化缺口：\n${fresh.join('\n')}`).toEqual([]);
  });

  test('主题：每个注入 global.ts 的入口都能走到主题属性同步', () => {
    const fresh = keepFresh(violations.theme, THEME_GAPS);
    expect(fresh, `未登记的主题同步缺口：\n${fresh.join('\n')}`).toEqual([]);
  });

  test('基线棘轮：登记过的缺口必须仍然存在（补好了就删基线，不许空转）', () => {
    for (const gap of LOGGING_GAPS) {
      expect(
        violations.logging.some((v) => v.startsWith(`${gap}: `)),
        `${gap} 已能走到日志初始化，请把它从 LOGGING_GAPS 删掉`,
      ).toBe(true);
    }
    for (const gap of THEME_GAPS) {
      expect(
        violations.theme.some((v) => v.startsWith(`${gap}: `)),
        `${gap} 已能走到主题同步，请把它从 THEME_GAPS 删掉`,
      ).toBe(true);
    }
  });

  test('事故本体逐条钉死：legacy、三个视频入口、豆瓣与色花堂主入口', () => {
    const watched = [
      'src/entrypoints/content.ts',
      'src/entrypoints/bilibili.content/index.ts',
      'src/entrypoints/bilibili-homepage.content/index.ts',
      'src/entrypoints/youtube-homepage.content/index.ts',
      // X103：这两个主入口此前只在基线里"被容忍"，现在点名——基线清空只证明
      // 没有未登记缺口，点名才证明装配是真的在位（改名/删调用会立刻红）。
      'src/entrypoints/douban-main.content/index.ts',
      'src/entrypoints/sehuatang-main.content/index.ts',
    ];
    for (const entry of watched) {
      const v = verdicts.find((x) => x.entry === entry);
      expect(v, `${entry} 未被枚举`).toBeDefined();
      expect(v?.logConsumers, `${entry} 消费 logger 却无初始化`).toBeGreaterThan(0);
      expect(v?.hasLoggingInit, `${entry} 走不到日志初始化`).toBe(true);
    }
    const legacy = verdicts.find((v) => v.entry === 'src/entrypoints/content.ts');
    expect(legacy?.styleInjectors.length, 'legacy 注入 global.ts 样式').toBeGreaterThan(0);
    expect(legacy?.hasThemeSync, 'legacy 走不到主题属性同步').toBe(true);
  });
});

// 6 条自检种子：合成图上三种情形必须判对（实现已迁入 helpers/entry-graph.ts）。
registerEntryDetectorSelfSeeds();
