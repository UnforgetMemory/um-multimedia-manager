/**
 * Read the (title, subjectId) pairs the HOST page itself advertises, so an
 * overlay's extraction output can be compared against something that does not
 * come from the code under test.
 *
 * Douban card markup is not one shape (`li[data-title]`, `.subject-card-item`,
 * `img[alt]`, anchor `title=`…), so the label is resolved through every
 * attribute the page uses to name its own links.
 */

import type { Page } from '@playwright/test';

export interface HostSubject {
  title: string;
  id: string;
  href: string;
}

export async function readHostSubjects(page: Page): Promise<HostSubject[]> {
  return page.evaluate(() => {
    const out: HostSubject[] = [];
    const seen = new Set<string>();
    for (const a of document.querySelectorAll('a[href*="/subject/"]')) {
      const href = a.getAttribute('href') ?? '';
      const m = /\/subject\/(\d+)\/?.*/.exec(href);
      if (!m?.[1] || seen.has(m[1])) continue;
      const title =
        a.getAttribute('title') ||
        a.querySelector('img[alt]')?.getAttribute('alt') ||
        a.querySelector('.subject-card-item-title-text')?.textContent ||
        a.closest('[data-title]')?.getAttribute('data-title') ||
        a.textContent ||
        '';
      const clean = title.trim();
      if (clean.length < 2) continue;
      seen.add(m[1]);
      out.push({ title: clean, id: m[1], href });
    }
    return out;
  });
}
