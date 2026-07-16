/**
 * CSS chunk registry for Douban Shadow DOM injection.
 *
 * Collects all ?raw CSS imports into a single lookup table used by
 * `composeStylesForPage()` to compose per-page style bundles.
 *
 * Extracted from main.ts to avoid circular imports between the
 * mount factory and page-specific mount configurations.
 */

import designTokensCss from './styles/design-tokens.css?raw'
import themeCss from './styles/theme.css?raw'
import baseCss from './styles/base.css?raw'
import breakpointsCss from './styles/breakpoints.css?raw'
import homepageCss from './styles/homepage.css?raw'
import musicHomepageCss from './styles/music-homepage.css?raw'
import bookHomepageCss from './styles/book-homepage.css?raw'
import bookProfileCss from './styles/book-profile.css?raw'
import genreCss from './styles/genre.css?raw'
import artistsOverviewCss from './styles/artists-overview.css?raw'
import searchCss from './styles/search.css?raw'
import detailCss from './styles/detail.css?raw'
import photosCss from './styles/photos.css?raw'
import trailerCss from './styles/trailer.css?raw'
import celebritiesCss from './styles/celebrities.css?raw'
import personageCss from './styles/personage.css?raw'
import userProfileCss from './styles/user-profile.css?raw'
import movieProfileCss from './styles/movie-profile.css?raw'
import doulistsCss from './styles/doulists.css?raw'
import doulistDetailCss from './styles/doulist-detail.css?raw'
import userMediaCss from './styles/user-media.css?raw'
import userCelebritiesCss from './styles/user-celebrities.css?raw'
import userReviewsCss from './styles/user-reviews.css?raw'
import bookReviewsCss from './styles/book-reviews.css?raw'
import reviewDetailCss from './styles/review-detail.css?raw'
import bookReviewDetailCss from './styles/book-review-detail.css?raw'
import bookCollectCss from './styles/book-collect.css?raw'
import bookAuthorsCss from './styles/book-authors.css?raw'
import userbarCss from './styles/userbar.css?raw'
import paginatorCss from './styles/paginator.css?raw'
import albumsCss from './styles/albums.css?raw'
import gameCollectCss from './styles/game-collect.css?raw'
import gameDetailCss from './styles/game-detail.css?raw'
import gameExploreCss from './styles/game-explore.css?raw'
import pageLayoutCss from './styles/page-layout.css?raw'
import interestCss from './styles/interest.css?raw'

export {
  designTokensCss,
  themeCss,
  baseCss,
  breakpointsCss,
  homepageCss,
  musicHomepageCss,
  bookHomepageCss,
  bookProfileCss,
  genreCss,
  artistsOverviewCss,
  searchCss,
  detailCss,
  photosCss,
  trailerCss,
  celebritiesCss,
  personageCss,
  userProfileCss,
  movieProfileCss,
  doulistsCss,
  doulistDetailCss,
  userMediaCss,
  userCelebritiesCss,
  userReviewsCss,
  bookReviewsCss,
  reviewDetailCss,
  bookReviewDetailCss,
  bookCollectCss,
  paginatorCss,
  bookAuthorsCss,
  userbarCss,
  albumsCss,
  gameCollectCss,
  gameDetailCss,
  gameExploreCss,
  pageLayoutCss,
  interestCss,
}

/**
 * CSS chunk lookup table — maps preset names (used in css-composer.ts presets)
 * to their raw CSS string values from ?raw imports.
 */
export const cssMap: Record<string, string> = {
  'design-tokens': designTokensCss,
  theme: themeCss,
  base: baseCss,
  breakpoints: breakpointsCss,
  'page-layout': pageLayoutCss,
  homepage: homepageCss,
  'music-homepage': musicHomepageCss,
  'book-homepage': bookHomepageCss,
  'book-profile': bookProfileCss,
  genre: genreCss,
  'artists-overview': artistsOverviewCss,
  search: searchCss,
  detail: detailCss,
  photos: photosCss,
  trailer: trailerCss,
  celebrities: celebritiesCss,
  personage: personageCss,
  'user-profile': userProfileCss,
  'movie-profile': movieProfileCss,
  doulists: doulistsCss,
  'doulist-detail': doulistDetailCss,
  'user-media': userMediaCss,
  'user-celebrities': userCelebritiesCss,
  'user-reviews': userReviewsCss,
  'book-reviews': bookReviewsCss,
  userbar: userbarCss,
  'review-detail': reviewDetailCss,
  'book-review-detail': bookReviewDetailCss,
  'book-collect': bookCollectCss,
  paginator: paginatorCss,
  'book-authors': bookAuthorsCss,
  albums: albumsCss,
  'game-collect': gameCollectCss,
  'game-detail': gameDetailCss,
  'game-explore': gameExploreCss,
  interest: interestCss,
}
