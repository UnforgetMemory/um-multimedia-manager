/**
 * Local mock of an IMDb title detail page (X13 e2e).
 *
 * DOM contract mirrors exactly what the legacy pipeline parses:
 *  - src/entrypoints/content/router.ts matches `www.imdb.com/title/tt`
 *  - create-detail-handler waits for titleSelector
 *    `[data-testid="hero__pageTitle"]` (src/entrypoints/content/handlers/imdb.ts)
 *  - scanIMDbPageStatus reads `[data-testid="hero-rating-bar__user-rating"] button`
 *    (rated ⇔ the `…__unrated` child span is absent; score from aria-label) and
 *    `[data-testid^="watched-button-"]` (watched ⇔ aria-pressed=true or a
 *    non-CTA "Watched" label).
 *  - renderIMDbStatusChip inserts the chip after the h1's
 *    `ul.ipc-inline-list` sibling.
 *
 * Self-contained: no subresources, no scripts — IMDb hydration is simulated
 * by the spec mutating exactly the nodes IMDb's own JS would touch.
 */

export interface ImdbTitleFixture {
  titleId: string;
  title: string;
  watched: boolean;
  /** 0-10 user rating; omit → the page renders the unrated CTA. */
  userRating?: number;
}

export function imdbTitlePageHtml(f: ImdbTitleFixture): string {
  const rated = f.userRating !== undefined;
  const ratingInner = rated
    ? `<span>${String(f.userRating)}/10</span>`
    : '<span data-testid="hero-rating-bar__user-rating__unrated">Click to rate</span>';
  const watchedLabel = f.watched ? 'Watched' : 'Mark as watched';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${f.title} (E2E Mock)</title>
  <link rel="icon" href="data:,">
  <style>body{font-family:sans-serif;margin:0}</style>
</head>
<body>
  <main>
    <section class="title-hero">
      <h1 data-testid="hero__pageTitle">${f.title} (2024)</h1>
      <ul class="ipc-inline-list"><li>TV-14</li><li>1h 20m</li></ul>
      <div data-testid="hero-rating-bar__user-rating" class="rating-bar">
        <button aria-label="${rated ? `${String(f.userRating)}/10` : 'Rate this title'}">${ratingInner}</button>
      </div>
      <div class="actions">
        <button data-testid="watched-button-${f.titleId}" aria-pressed="${f.watched ? 'true' : 'false'}" aria-label="${watchedLabel}">${watchedLabel}</button>
      </div>
    </section>
  </main>
</body>
</html>`;
}
