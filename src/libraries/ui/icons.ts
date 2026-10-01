/**
 * Minimal inline lucide icons (ISC, lucide-vue-next v1.0.0 node data).
 *
 * WHY not lucide-vue-next: the Vue wrapper + createLucideIcon runtime is pulled
 * into every consumer bundle. UmmPaginator alone dragged it into douban-main.js
 * (content-script IIFE). These are the same 24x24 stroke paths as functional
 * SVG components — no package runtime. Each createIcon call is marked with a
 * PURE annotation so bundlers can drop unused named exports.
 */
import { h, type FunctionalComponent, type SVGAttributes } from 'vue';

type IconNode = readonly (readonly [string, Record<string, string>])[];

function createIcon(name: string, nodes: IconNode): FunctionalComponent<SVGAttributes> {
  const Comp: FunctionalComponent<SVGAttributes> = (props, { attrs }) =>
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: 24,
        height: 24,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        ...attrs,
        ...props,
      },
      nodes.map(([tag, a]) => h(tag, a)),
    );
  Comp.displayName = name;
  return Comp;
}

export const Sun = /*#__PURE__*/ createIcon('Sun', [
  ['circle', { cx: '12', cy: '12', r: '4', key: '4exip2' }],
  ['path', { d: 'M12 2v2', key: 'tus03m' }],
  ['path', { d: 'M12 20v2', key: '1lh1kg' }],
  ['path', { d: 'm4.93 4.93 1.41 1.41', key: '149t6j' }],
  ['path', { d: 'm17.66 17.66 1.41 1.41', key: 'ptbguv' }],
  ['path', { d: 'M2 12h2', key: '1t8f8n' }],
  ['path', { d: 'M20 12h2', key: '1q8mjw' }],
  ['path', { d: 'm6.34 17.66-1.41 1.41', key: '1m8zz5' }],
  ['path', { d: 'm19.07 4.93-1.41 1.41', key: '1shlcs' }],
]);
export const Moon = /*#__PURE__*/ createIcon('Moon', [
  [
    'path',
    {
      d: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401',
      key: 'kfwtm',
    },
  ],
]);
export const Monitor = /*#__PURE__*/ createIcon('Monitor', [
  ['rect', { width: '20', height: '14', x: '2', y: '3', rx: '2', key: '48i651' }],
  ['line', { x1: '8', x2: '16', y1: '21', y2: '21', key: '1svkeh' }],
  ['line', { x1: '12', x2: '12', y1: '17', y2: '21', key: 'vw1qmm' }],
]);
export const Globe = /*#__PURE__*/ createIcon('Globe', [
  ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
  ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', key: '13o1zl' }],
  ['path', { d: 'M2 12h20', key: '9i4pu4' }],
]);
export const AlertCircle = /*#__PURE__*/ createIcon('AlertCircle', [
  ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
  ['line', { x1: '12', x2: '12', y1: '8', y2: '12', key: '1pkeuh' }],
  ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16', key: '4dfq90' }],
]);
export const RefreshCw = /*#__PURE__*/ createIcon('RefreshCw', [
  ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', key: 'v9h5vc' }],
  ['path', { d: 'M21 3v5h-5', key: '1q7to0' }],
  ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', key: '3uifl3' }],
  ['path', { d: 'M8 16H3v5', key: '1cv678' }],
]);
export const Star = /*#__PURE__*/ createIcon('Star', [
  [
    'path',
    {
      d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
      key: 'r04s7s',
    },
  ],
]);
export const CheckCircle2 = /*#__PURE__*/ createIcon('CheckCircle2', [
  ['path', { d: 'M21.801 10A10 10 0 1 1 17 3.335', key: 'yps3ct' }],
  ['path', { d: 'm9 11 3 3L22 4', key: '1pflzl' }],
]);
export const XCircle = /*#__PURE__*/ createIcon('XCircle', [
  ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
  ['path', { d: 'm15 9-6 6', key: '1uzhvr' }],
  ['path', { d: 'm9 9 6 6', key: 'z0biqf' }],
]);
export const Database = /*#__PURE__*/ createIcon('Database', [
  ['ellipse', { cx: '12', cy: '5', rx: '9', ry: '3', key: 'msslwz' }],
  ['path', { d: 'M3 5V19A9 3 0 0 0 21 19V5', key: '1wlel7' }],
  ['path', { d: 'M3 12A9 3 0 0 0 21 12', key: 'mv7ke4' }],
]);
export const ChevronLeft = /*#__PURE__*/ createIcon('ChevronLeft', [
  ['path', { d: 'm15 18-6-6 6-6', key: '1wnfg3' }],
]);
export const ChevronRight = /*#__PURE__*/ createIcon('ChevronRight', [
  ['path', { d: 'm9 18 6-6-6-6', key: 'mthhwq' }],
]);
export const ChevronUp = /*#__PURE__*/ createIcon('ChevronUp', [
  ['path', { d: 'm18 15-6-6-6 6', key: '153udz' }],
]);
export const ChevronDown = /*#__PURE__*/ createIcon('ChevronDown', [
  ['path', { d: 'm6 9 6 6 6-6', key: 'qrunsl' }],
]);
export const Download = /*#__PURE__*/ createIcon('Download', [
  ['path', { d: 'M12 15V3', key: 'm9g1x1' }],
  ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', key: 'ih7n3h' }],
  ['path', { d: 'm7 10 5 5 5-5', key: 'brsn70' }],
]);
export const Upload = /*#__PURE__*/ createIcon('Upload', [
  ['path', { d: 'M12 3v12', key: '1x0j5s' }],
  ['path', { d: 'm17 8-5-5-5 5', key: '7q97r8' }],
  ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', key: 'ih7n3h' }],
]);
export const CheckCircle = /*#__PURE__*/ createIcon('CheckCircle', [
  ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
  ['path', { d: 'm9 12 2 2 4-4', key: 'dzmm74' }],
]);
export const Info = /*#__PURE__*/ createIcon('Info', [
  ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
  ['path', { d: 'M12 16v-4', key: '1dtifu' }],
  ['path', { d: 'M12 8h.01', key: 'e9boi3' }],
]);
export const Loader2 = /*#__PURE__*/ createIcon('Loader2', [
  ['path', { d: 'M21 12a9 9 0 1 1-6.219-8.56', key: '13zald' }],
]);
export const X = /*#__PURE__*/ createIcon('X', [
  ['path', { d: 'M18 6 6 18', key: '1bl5f8' }],
  ['path', { d: 'm6 6 12 12', key: 'd8bk6v' }],
]);
export const Film = /*#__PURE__*/ createIcon('Film', [
  ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', key: 'afitv7' }],
  ['path', { d: 'M7 3v18', key: 'bbkbws' }],
  ['path', { d: 'M3 7.5h4', key: 'zfgn84' }],
  ['path', { d: 'M3 12h18', key: '1i2n21' }],
  ['path', { d: 'M3 16.5h4', key: '1230mu' }],
  ['path', { d: 'M17 3v18', key: 'in4fa5' }],
  ['path', { d: 'M17 7.5h4', key: 'myr1c1' }],
  ['path', { d: 'M17 16.5h4', key: 'go4c1d' }],
]);
export const Tv = /*#__PURE__*/ createIcon('Tv', [
  ['path', { d: 'm17 2-5 5-5-5', key: '16satq' }],
  ['rect', { width: '20', height: '15', x: '2', y: '7', rx: '2', key: '1e6viu' }],
]);
export const Music = /*#__PURE__*/ createIcon('Music', [
  ['path', { d: 'M9 18V5l12-2v13', key: '1jmyc2' }],
  ['circle', { cx: '6', cy: '18', r: '3', key: 'fqmcym' }],
  ['circle', { cx: '18', cy: '16', r: '3', key: '1hluhg' }],
]);
export const Book = /*#__PURE__*/ createIcon('Book', [
  [
    'path',
    {
      d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20',
      key: 'k3hazp',
    },
  ],
]);
export const Gamepad2 = /*#__PURE__*/ createIcon('Gamepad2', [
  ['line', { x1: '6', x2: '10', y1: '11', y2: '11', key: '1gktln' }],
  ['line', { x1: '8', x2: '8', y1: '9', y2: '13', key: 'qnk9ow' }],
  ['line', { x1: '15', x2: '15.01', y1: '12', y2: '12', key: 'krot7o' }],
  ['line', { x1: '18', x2: '18.01', y1: '10', y2: '10', key: '1lcuu1' }],
  [
    'path',
    {
      d: 'M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z',
      key: 'mfqc10',
    },
  ],
]);
export const ShieldAlert = /*#__PURE__*/ createIcon('ShieldAlert', [
  [
    'path',
    {
      d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      key: 'oel41y',
    },
  ],
  ['path', { d: 'M12 8v4', key: '1got3b' }],
  ['path', { d: 'M12 16h.01', key: '1drbdi' }],
]);
export const Play = /*#__PURE__*/ createIcon('Play', [
  [
    'path',
    {
      d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z',
      key: '10ikf1',
    },
  ],
]);
export const Link = /*#__PURE__*/ createIcon('Link', [
  ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', key: '1cjeqo' }],
  ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71', key: '19qd67' }],
]);
export const Settings = /*#__PURE__*/ createIcon('Settings', [
  [
    'path',
    {
      d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
      key: '1i5ecw',
    },
  ],
  ['circle', { cx: '12', cy: '12', r: '3', key: '1v7zrd' }],
]);
export const Palette = /*#__PURE__*/ createIcon('Palette', [
  [
    'path',
    {
      d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z',
      key: 'e79jfc',
    },
  ],
  ['circle', { cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor', key: '1okk4w' }],
  ['circle', { cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor', key: 'f64h9f' }],
  ['circle', { cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor', key: 'qy21gx' }],
  ['circle', { cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor', key: 'fotxhn' }],
]);
export const Menu = /*#__PURE__*/ createIcon('Menu', [
  ['path', { d: 'M4 5h16', key: '1tepv9' }],
  ['path', { d: 'M4 12h16', key: '1lakjw' }],
  ['path', { d: 'M4 19h16', key: '1djgab' }],
]);
export const Check = /*#__PURE__*/ createIcon('Check', [
  ['path', { d: 'M20 6 9 17l-5-5', key: '1gmf2c' }],
]);
export const ArrowUpRight = /*#__PURE__*/ createIcon('ArrowUpRight', [
  ['path', { d: 'M7 7h10v10', key: '1tivn9' }],
  ['path', { d: 'M7 17 17 7', key: '1vkiza' }],
]);

// ChevronLeft/Right: UmmPaginator uses local inlined copies (content-script
// bundle), these exports stay for SPA consumers (Select uses Up/Down).
