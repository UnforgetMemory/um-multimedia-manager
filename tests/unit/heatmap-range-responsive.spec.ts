import { test, expect } from '@playwright/test';
import {
  CELL_MIN_PX,
  GRID_PAD_PX,
  maxWeeksForDays,
  minGridWidthPx,
  pickRangeDaysForWidth,
  type HeatmapRangeId,
} from '@/libraries/utils/heatmap-range';

/**
 * Real-Chromium regression for smart day-range selection.
 * Verifies the pick matches actual grid overflow at the measured container width
 * (unit tests only lock the pure formula — this locks the CSS layout contract).
 */

const WIDTH_CASES = [0, 200, 263, 264, 400, 407, 408, 887, 888, 1200] as const;

function buildHarnessHtml(width: number, rangeId: HeatmapRangeId): string {
  const days = Number(rangeId);
  const weeks = maxWeeksForDays(days);
  const cells = Array.from(
    { length: weeks * 7 },
    (_, i) => `<div class="heatmap-cell" data-i="${i}"></div>`,
  ).join('');
  return `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; }
  .heatmap-scroll { overflow-x: auto; width: ${width}px; }
  .heatmap-grid {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 18px repeat(${weeks}, minmax(0, 1fr));
    grid-template-rows: 16px repeat(7, auto);
    gap: 4px;
    width: 100%;
    padding-inline: 8px;
    padding-bottom: 8px;
    min-width: calc(${weeks} * ${CELL_MIN_PX}px + ${GRID_PAD_PX}px);
    max-width: calc(${weeks} * 26px + 42px);
  }
  .heatmap-cell { width: 100%; aspect-ratio: 1 / 1; }
</style></head>
<body>
  <div class="heatmap-scroll" id="scroll">
    <div class="heatmap-grid" id="grid">${cells}</div>
  </div>
</body></html>`;
}

test.describe('heatmap smart range — real Chromium overflow contract', () => {
  for (const width of WIDTH_CASES) {
    test(`width=${width}px picks a tier that fits without horizontal scroll`, async ({ page }) => {
      const picked = pickRangeDaysForWidth(width);
      await page.setContent(buildHarnessHtml(width, picked), { waitUntil: 'domcontentloaded' });

      const metrics = await page.evaluate(() => {
        const scroll = document.getElementById('scroll')!;
        const grid = document.getElementById('grid')!;
        return {
          clientWidth: scroll.clientWidth,
          scrollWidth: scroll.scrollWidth,
          gridMinWidth: getComputedStyle(grid).minWidth,
          overflows: scroll.scrollWidth > scroll.clientWidth,
        };
      });

      const days = Number(picked) as 90 | 150 | 365;
      expect(metrics.gridMinWidth).toBe(`${minGridWidthPx(days)}px`);

      // Fits without scroll only when the container meets the tier floor.
      // Below the 90-day floor the smallest tier is still chosen and scrolls (by design).
      const fitsFloor = width >= minGridWidthPx(days);
      if (fitsFloor) {
        expect(metrics.overflows, `picked=${picked} at ${width}px should not scroll`).toBe(false);
      } else {
        expect(width).toBeLessThan(minGridWidthPx(90));
      }

      // One step larger must overflow (proves the tier boundary is real)
      const next = picked === '90' ? '150' : picked === '150' ? '365' : null;
      if (next && fitsFloor) {
        await page.setContent(buildHarnessHtml(width, next as HeatmapRangeId), {
          waitUntil: 'domcontentloaded',
        });
        const overflowNext = await page.evaluate(() => {
          const scroll = document.getElementById('scroll')!;
          return scroll.scrollWidth > scroll.clientWidth;
        });
        expect(overflowNext, `next tier ${next} at ${width}px should scroll`).toBe(true);
      }
    });
  }

  test('segmented active id comes from the production picker applied to measured width', async ({
    page,
  }) => {
    // HeatmapCalendar.applySmartDefaultRange measures clientWidth at mount and
    // feeds it to pickRangeDaysForWidth. Here the page does both the measuring
    // and the picking, so a stale measurement or an ignored argument shows up
    // as a diff instead of being echoed back from node.
    await page.exposeFunction('__ummPickRangeDays', pickRangeDaysForWidth);
    const picked: HeatmapRangeId[] = [];
    for (const width of [300, 500, 1000]) {
      await page.setContent(
        `<!DOCTYPE html><html><body>
          <div id="scroll" style="width:${width}px;overflow-x:auto"></div>
          <div id="seg"></div>
        </body></html>`,
        { waitUntil: 'domcontentloaded' },
      );
      const result = await page.evaluate(async () => {
        const pick = (
          window as unknown as { __ummPickRangeDays: (w: number) => Promise<HeatmapRangeId> }
        ).__ummPickRangeDays;
        const measured = document.getElementById('scroll')!.clientWidth;
        const id = await pick(measured);
        const seg = document.getElementById('seg')!;
        seg.innerHTML = '';
        for (const opt of ['90', '150', '365']) {
          const b = document.createElement('button');
          b.dataset.id = opt;
          if (opt === id) b.className = 'active';
          seg.appendChild(b);
        }
        return { measured, id };
      });
      expect(result.measured, `clientWidth at css width ${width}px`).toBe(width);
      expect(await page.locator('#seg .active').getAttribute('data-id')).toBe(result.id);
      picked.push(result.id);
    }
    // Three distinct tiers: a picker that ignored its argument would satisfy
    // every per-case assertion above while still being broken.
    expect(picked).toEqual(['90', '150', '365']);
  });
});
