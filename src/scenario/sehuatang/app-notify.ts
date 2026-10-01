/**
 * Once-per-page gate for the "background unreachable" feedback.
 *
 * A failed stats read re-runs the whole retry ladder on every header refresh;
 * repeated toasts are noise, but full silence equals no signal (this page's
 * dash only means "unread", not a verdict). Therefore: report the first ladder
 * failure once per page, stay silent afterwards, reset at mount.
 *
 * The presentation sink is injectable: `FloatingToast` caches its container on
 * whichever module first assigns `document` to the global inside this worker,
 * and asserting on its DOM across specs misbehaves with the shared worker
 * depending on file dispatch order (this repo has been bitten once on the
 * sht-header case). Tests therefore assert "how many times, with what" instead
 * of counting someone else's DOM.
 */
import { FloatingToast } from '@/entrypoints/content/utils/toast';
import { t } from '@/entrypoints/content/i18n';

type ErrorNotifier = (message: string, detail: string) => void;

const productionNotifier: ErrorNotifier = (message, error) => {
  FloatingToast.error(message, error);
};

let notifier: ErrorNotifier = productionNotifier;
let reportedForPage = false;

/** Test injection seam (precedents: `__bindSettingsAreaForTests`,
 *  `__bindRecordEventSinkForTests`). */
export function __bindErrorNotifierForTests(custom?: ErrorNotifier): void {
  notifier = custom ?? productionNotifier;
}

/** Called once per mount: a new page may report again. */
export function resetStatsUnreachableGate(): void {
  reportedForPage = false;
}

/** Ladder exhausted without an answer → report once per page. Returns whether
 *  it actually reported (handy for tests and logs). */
export function reportStatsUnreachable(detail: string): boolean {
  if (reportedForPage) return false;
  reportedForPage = true;
  notifier(t('neodb.comm_failed'), detail);
  return true;
}

/** Whether this page has already reported (read-only observation, no behavior
 *  change). */
export function statsUnreachableReported(): boolean {
  return reportedForPage;
}
