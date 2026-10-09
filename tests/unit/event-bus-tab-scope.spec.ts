/**
 * Broadcast tab-selection cost.
 *
 * Contract pinned (perf side of ADR-015): a bulk write broadcasts one message
 * per write, so an unfiltered fan-out makes delivery scale with every open tab.
 * The broadcast may skip tabs it POSITIVELY knows cannot host a content script
 * (host outside the injection table, discarded tabs), and must never lose a
 * delivery when it cannot tell.
 *
 * Why the gate is in JS and not `tabs.query({ url })`: that shape was tried and
 * measured in the real extension. Without the `tabs` permission Chrome cannot
 * match on tab.url at all, so the filtered query answered with an EMPTY list,
 * the tabs leg went silently empty, and three live-refresh e2e specs turned red
 * (badges never flipped, dimming never updated). Letting Chrome filter needs a
 * manifest permission change — a user call — so this gate stays conservative:
 * an unreadable url is always delivered to.
 */
import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { broadcast } from '@/libraries/utils/event-bus';

type Tab = { id?: number; url?: string; discarded?: boolean };
type QueryArg = Record<string, unknown> | undefined;

/** Host patterns a real manifest reports for the douban content script. */
const SCRIPT_MATCHES = ['*://movie.douban.com/*', '*://*.m-team.cc/*', '*://javdb.com/*'];

function installChrome(opts: {
  scriptMatches?: string[] | null;
  hostPermissions?: string[] | null;
  tabs?: Tab[];
}) {
  const calls: { queryArgs: QueryArg[]; sends: number[] } = { queryArgs: [], sends: [] };
  const query = async (arg?: QueryArg): Promise<Tab[]> => {
    calls.queryArgs.push(arg);
    return opts.tabs ?? [];
  };
  const manifest: Record<string, unknown> = { version: '0' };
  if (opts.scriptMatches) {
    manifest.content_scripts = opts.scriptMatches.map((m) => ({ matches: [m] }));
  }
  if (opts.hostPermissions) manifest.host_permissions = opts.hostPermissions;

  defineGlobal('chrome', {
    runtime: {
      id: 'test-ext',
      lastError: undefined,
      getManifest: () => manifest as unknown as chrome.runtime.Manifest,
      sendMessage: () => {},
      onMessage: { addListener: () => {}, removeListener: () => {}, hasListener: () => false },
    },
    tabs: { query, sendMessage: (tabId: number) => calls.sends.push(tabId) },
  } as unknown as typeof chrome);
  return calls;
}

async function settle(): Promise<void> {
  // broadcast() fires the tabs leg without awaiting; drain the microtask chain.
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

test.describe('broadcast 的 tab 选取：只跳过「确知无关」的 tab', () => {
  test('查询始终无过滤；JS 侧只筛可读且已知无关的 tab，读不到 url 的一律投递', async () => {
    const calls = installChrome({
      scriptMatches: SCRIPT_MATCHES,
      tabs: [
        { id: 1, url: 'https://movie.douban.com/subject/1/' },
        { id: 2, url: 'https://www.m-team.cc/torrents' }, // wildcard subdomain
        { id: 3, url: 'https://mail.google.com/' }, // positively irrelevant → skipped
        { id: 4, url: 'https://javdb.com/t', discarded: true }, // no live script
        { id: 5 }, // url not exposed without `tabs` ⇒ must still be delivered
      ],
    });
    broadcast('record:updated', { key: 'movie::1' });
    await settle();

    expect(calls.queryArgs, 'never tabs.query({ url }) — it silently empties').toEqual([{}]);
    expect(calls.sends).toEqual([1, 2, 5]);
  });

  test('过滤源是 content_scripts 的 matches，不是 host_permissions', async () => {
    // host_permissions also lists WebDAV provider origins the extension only
    // ever fetches from the background; a tab there has no receiver, and using
    // that list as the injection table would wrongly deliver to it.
    const calls = installChrome({
      scriptMatches: ['*://movie.douban.com/*'],
      hostPermissions: ['*://dav.jianguoyun.com/*'],
      tabs: [{ id: 6, url: 'https://dav.jianguoyun.com/dav/' }],
    });
    broadcast('record:updated', { key: 'movie::2' });
    await settle();
    expect(calls.sends, 'WebDAV 主机不是注入目标').toEqual([]);
  });

  test('manifest 报不出注入主机表时不过滤，全部投递（宁多发不误丢）', async () => {
    const calls = installChrome({
      scriptMatches: null,
      hostPermissions: null,
      tabs: [{ id: 7, url: 'https://example.com/' }],
    });
    broadcast('record:deleted', { key: 'tv::3' });
    await settle();
    expect(calls.queryArgs).toEqual([{}]);
    expect(calls.sends).toEqual([7]);
  });

  test('出现不认识的匹配模式形状时整体放弃过滤，而不是按半条规则猜', async () => {
    // A partial matcher is worse than none: one unparsed entry must not become
    // the reason a real tab silently stops receiving refreshes.
    const calls = installChrome({
      scriptMatches: ['*://ok.example/*', 'file://nope/*'],
      tabs: [{ id: 8, url: 'https://elsewhere.test/' }],
    });
    broadcast('record:updated', { key: 'movie::4' });
    await settle();
    expect(calls.sends).toEqual([8]);
  });

  test('精确主机不覆盖子域；后缀伪装域名与 chrome:// 永不命中', async () => {
    const calls = installChrome({
      scriptMatches: SCRIPT_MATCHES,
      tabs: [
        { id: 9, url: 'https://sub.javdb.com/t' },
        { id: 10, url: 'https://movie.douban.com.evil.test/' },
        { id: 11, url: 'chrome://extensions/' },
        { id: 12, url: 'https://javdb.com/t' },
      ],
    });
    broadcast('record:updated', { key: 'movie::5' });
    await settle();
    expect(calls.sends).toEqual([12]);
  });

  test('无 id 的 tab 被跳过（不得向 undefined tabId 发送）', async () => {
    const calls = installChrome({
      scriptMatches: SCRIPT_MATCHES,
      tabs: [
        { id: undefined, url: 'https://movie.douban.com/x' },
        { id: 13, url: 'https://movie.douban.com/y' },
      ],
    });
    broadcast('record:updated', { key: 'movie::6' });
    await settle();
    expect(calls.sends).toEqual([13]);
  });

  test('自检种子：同一 URL 在有主机表时被跳过、在无主机表时必须被投递', async () => {
    // If the probe cannot tell these two apart, every assertion above is vacuous.
    const skipping = installChrome({
      scriptMatches: ['*://movie.douban.com/*'],
      tabs: [{ id: 14, url: 'https://example.com/x' }],
    });
    broadcast('record:updated', { key: 'movie::7' });
    await settle();
    expect(skipping.sends, 'host table present ⇒ skipped').toEqual([]);

    const delivering = installChrome({
      scriptMatches: null,
      tabs: [{ id: 15, url: 'https://example.com/x' }],
    });
    broadcast('record:updated', { key: 'movie::8' });
    await settle();
    expect(delivering.sends, 'no host table ⇒ no matcher, still delivered').toEqual([15]);
  });
});
