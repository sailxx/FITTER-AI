// Плашки README в стиле Okto Calc: чёрный фон, свечения и зелёный акцент, шрифты Golos Text и JetBrains Mono
// (урезаются под каждый язык). Тексты — strings.json (шапка) и about.json (о проекте, подписи экранов).
// Шрифты (OFL-1.1) положить в tools/readme/.font/: golos.ttf (Golos Text) и jbmono.ttf (JetBrains Mono).
// Запуск: cd tools/readme && npm install && node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKit, ICONS } from './kit.mjs';
import { logoAt } from '../logo/logo.mjs';
import { createPhones } from './phones.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(DIR, '../../assets/readme');
const STR = JSON.parse(fs.readFileSync(path.join(DIR, 'strings.json'), 'utf8'));
const ABOUT = JSON.parse(fs.readFileSync(path.join(DIR, 'about.json'), 'utf8'));
const FEAT = JSON.parse(fs.readFileSync(path.join(DIR, 'features.json'), 'utf8'));

const G = '#30D158';
const K = createKit({
  golos: path.join(DIR, '.font/golos.ttf'),
  mono: path.join(DIR, '.font/jbmono.ttf'),
  accent: { hi: G, grad: ['#9CF5AE', '#30D158'], on: '#03210C', glow: G, glow2: '#A6F23A', btn: ['#5EE387', '#27B54A'] },
});
const { P, T, card, chip, sectionHead, badge, iconBox, lines, wrap, one, fitSize, fitText, delay, svg } = K;

// Значок FITTER: плитка-яблоко с глазами-объективами (tools/logo/logo.mjs)
const logo = (x, y) => logoAt(x - 4, y - 6, 44, 'lg', { shadow: false });

const RING = '.ring{animation:ringin 1.6s cubic-bezier(.2,.8,.2,1) .5s backwards}@keyframes ringin{from{stroke-dasharray:0 100}}@media (prefers-reduced-motion:reduce){.ring{animation:none}}.arc{stroke-dasharray:440;stroke-dashoffset:150;animation:fill 1.8s cubic-bezier(.2,.8,.2,1) .4s backwards}@keyframes fill{from{stroke-dashoffset:440}}@media (prefers-reduced-motion:reduce){.arc{animation:none}}';

// ---------- HERO ----------
const HERO_DEFS = '<linearGradient id="hcal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5BEF5E"/><stop offset=".5" stop-color="#22D97A"/><stop offset="1" stop-color="#2CD3B4"/></linearGradient>' +
  '<radialGradient id="hglow" cx=".18" cy=".05" r=".6"><stop offset="0" stop-color="#E9FFD8" stop-opacity=".4"/><stop offset="1" stop-color="#E9FFD8" stop-opacity="0"/></radialGradient>' +
  '<filter id="hshadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#1ED38A" flood-opacity=".35"/></filter>';
function hero(s) {
  const W = 880;
  let b = `<g class="r">${logo(40, 36)}<text x="88" y="62" font-size="24" font-weight="800" letter-spacing="-.4">${T('FITTER')}</text></g>`;
  b += `<g class="r" ${delay(1)}>${chip(196, 39, s.tag).s}</g>`;
  const ts = fitSize([s.l1, s.l2], 490, 40, 800);
  b += `<g class="r" ${delay(2)}>${lines(40, 146, [one(s.l1), one('*' + s.l2 + '*')], { size: ts, weight: 800, lh: 48, spacing: '-1' })}</g>`;
  const sub = wrap(s.sub, 480, 16, 500);
  b += `<g class="r" ${delay(3)}>${lines(40, 234, sub, { size: 16, weight: 500, lh: 24, fill: P.muted })}</g>`;
  // карточка калорий и плитки БЖУ — как на экране «Сегодня» в приложении
  b += `<g class="r" ${delay(3)}><ellipse cx="700" cy="170" rx="190" ry="150" fill="url(#g1)"/>
<g filter="url(#hshadow)"><rect x="560" y="32" width="280" height="140" rx="24" fill="url(#hcal)"/></g><rect x="560" y="32" width="280" height="140" rx="24" fill="url(#hglow)"/>
<text x="584" y="104" font-size="50" font-weight="800" letter-spacing="-1.8" fill="#fff">${T('842')}</text>
<text class="m" x="586" y="128" font-size="11" font-weight="700" letter-spacing="1.8" fill="#fff" fill-opacity=".85">${T(s.kcal)}</text>
<g transform="translate(784 102)"><circle r="36" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="12"/><g transform="rotate(-90)"><circle class="ring" r="36" fill="none" stroke="#fff" stroke-width="12" pathLength="100" stroke-dasharray="62 100"/></g>
<circle r="15" fill="#fff" fill-opacity=".24"/><path transform="translate(-8 -9) scale(.68)" d="M12.4 2.2c.7 3.6 4.9 5.5 4.9 10.6a5.3 5.3 0 0 1-10.6 0c0-2.2 1-3.6 2.2-4.8.1 1.9.9 2.9 1.9 3.2-.5-3.7-.2-6.2 1.6-9z" fill="#fff"/></g></g>`;
  const mw = (280 - 24) / 3;
  [['#EC6A6A', 112, 0.8, '<path d="M13.5 2L4.5 13.5h6.2L9.8 22l9.2-12h-6.4z" fill="#EC6A6A" stroke="none"/>'], ['#E3A35E', 148, 0.59, '<path d="M11.2 22V9h1.6v13zM11.4 13.4c-3.2.2-5.5-1.8-5.7-4.8 3.1-.2 5.4 1.8 5.7 4.8zM12.6 13.4c3.2.2 5.5-1.8 5.7-4.8-3.1-.2-5.4 1.8-5.7 4.8zM12 9.4c-1.9-1-2-4.1 0-6.2 2 2.1 1.9 5.2 0 6.2z" fill="#E3A35E" stroke="none"/>'], ['#5C92E6', 52, 0.74, '<path d="M12 2.5c-1.1 2-6.5 8.2-6.5 12.3a6.5 6.5 0 0 0 13 0C18.5 10.7 13.1 4.5 12 2.5z" fill="#5C92E6" stroke="none"/>']].forEach(([col, v, p, ic], i) => {
    const x = 560 + i * (mw + 12);
    b += `<g class="r" ${delay(4 + i)}><rect x="${x}" y="184" width="${mw}" height="88" rx="20" fill="url(#cg)" stroke="${P.stroke}"/><rect x="${x}" y="184" width="${mw}" height="88" rx="20" fill="${col}" fill-opacity=".13"/>
<g transform="translate(${x + 14} 198) scale(.75)">${ic}</g><text class="m" x="${x + 14}" y="244" font-size="20" font-weight="700" letter-spacing="-.5">${T(String(v))}</text>
<rect x="${x + 14}" y="254" width="${mw - 28}" height="6" rx="3" fill="#fff" fill-opacity=".1"/><rect x="${x + 14}" y="254" width="${((mw - 28) * p).toFixed(1)}" height="6" rx="3" fill="${col}"/></g>`;
  });
  // три шага
  const y = 300, cw = 252;
  [[s.s1, s.s1b], [s.s2, s.s2b], [s.s3, s.s3b]].forEach(([a, d], i) => {
    const x = 40 + i * (cw + 22);
    b += `<g class="r" ${delay(4 + i)}>${card(x, y, cw, 84)}${badge(x + 34, y + 42, i + 1, 14)}
${fitText(x + 60, y + 38, a, cw - 76, { size: 15, weight: 700 })}
${fitText(x + 60, y + 60, d, cw - 76, { size: 13, weight: 500, fill: P.muted })}</g>`;
    if (i < 2) b += `<path class="r" ${delay(4 + i)} d="M${x + cw + 6} ${y + 42}h10m-4-4 4 4-4 4" fill="none" stroke="${G}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  const H = y + 84 + 36;
  return svg(W, H, `FITTER — ${s.l1} ${s.l2} ${s.sub}`, b + `<style>${RING}</style>`, HERO_DEFS);
}

// ---------- О ПРОЕКТЕ ----------
const TILE_ICONS = [
  '<path d="M2 7h4l2-3h8l2 3h4v13H2z"/><circle cx="12" cy="13" r="4"/>',
  '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  '<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M11 18h2"/>',
  ICONS.send,
];
const TILE_COLORS = ['#30D158', '#E3A35E', '#4FB3FF', '#A98BFF'];
function about(a) {
  const W = 880;
  let b = `<g class="r">${chip(40, 34, a.label, { check: true }).s}</g>`;
  const text = wrap(a.text, 800, 16, 500);
  b += `<g class="r" ${delay(1)}>${lines(40, 100, text.map((l, i) => i ? l : l.map(([t]) => [t, false])), { size: 16, weight: 500, lh: 26, fill: P.muted })}</g>`;
  // первая строка — белая, остальные приглушённые
  b = b.replace(/(<text x="40" y="100\.0"[^>]*?) fill="#A3A3A3"/, '$1 fill="#FFFFFF"');
  const ty = 100 + (text.length - 1) * 26 + 32;
  const TW = (800 - 3 * 12) / 4;
  const tiles = a.tiles.map(([t, d]) => ({ t: wrap(t, TW - 32, 15, 700), d: wrap(d, TW - 32, 13, 500) }));
  const th = Math.max(...tiles.map((x) => 70 + x.t.length * 20 + 6 + x.d.length * 18 + 10));
  tiles.forEach((x, i) => {
    const X = 40 + i * (TW + 12);
    b += `<g class="r" ${delay(2 + i)}>${card(X, ty, TW, th, 18, TILE_COLORS[i])}${iconBox(X + 16, ty + 16, TILE_ICONS[i], 40, TILE_COLORS[i])}
${lines(X + 16, ty + 86, x.t, { size: 15, weight: 700, lh: 20 })}
${lines(X + 16, ty + 86 + x.t.length * 20 + 6, x.d, { size: 13, weight: 500, lh: 18, fill: P.muted })}</g>`;
  });
  return svg(W, ty + th + 36, a.text, b);
}

// ---------- ВОЗМОЖНОСТИ ----------
// Восемь карточек 2×4: иконка, заголовок и список. Тексты — features.json (порядок: еда, упаковки, цели, вода, ИИ, привычки, дневник, дизайн).
const FEAT_ICONS = [
  '<path d="M2 7h4l2-3h8l2 3h4v13H2z"/><circle cx="12" cy="13" r="4"/>',
  '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>',
  '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/>',
  '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4"/>',
  '<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M11 18h2"/>',
  '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.6-2.5H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
];
const FEAT_COLORS = ['#30D158', '#E3A35E', '#EC6A6A', '#4FB3FF', '#A98BFF', '#E3A35E', '#30D158', '#5C92E6'];
function features(items) {
  const W = 880, CW = 404, GAP = 12, PAD = 20, TXT = CW - PAD * 2 - 16;
  const cards = items.map(([t, bullets]) => {
    const title = wrap(t, CW - 40 - PAD * 2 - 12, 17, 700);
    const bl = bullets.map((x) => wrap(x, TXT, 14, 500));
    const head = Math.max(40, title.length * 22);
    const h = PAD + head + 14 + bl.reduce((a, l) => a + l.length * 20 + 6, 0) + PAD - 6;
    return { title, bl, head, h };
  });
  let b = '', y = 24;
  for (let r = 0; r < cards.length; r += 2) {
    const rh = Math.max(cards[r].h, cards[r + 1]?.h ?? 0);
    for (const c of [cards[r], cards[r + 1]]) {
      if (!c) continue;
      const i = cards.indexOf(c), x = 40 + (i % 2) * (CW + GAP);
      b += `<g class="r" ${delay(Math.min(i, 8))}>${card(x, y, CW, rh, 18, FEAT_COLORS[i])}${iconBox(x + PAD, y + PAD, FEAT_ICONS[i], 40, FEAT_COLORS[i])}`;
      b += lines(x + PAD + 40 + 12, y + PAD + (c.head - c.title.length * 22) / 2 + 17, c.title, { size: 17, weight: 700, lh: 22 });
      let by = y + PAD + c.head + 14;
      for (const l of c.bl) {
        b += `<circle cx="${x + PAD + 3}" cy="${by + 6}" r="2.6" fill="${FEAT_COLORS[i]}"/>` + lines(x + PAD + 16, by + 11, l, { size: 14, weight: 500, lh: 20, fill: P.muted });
        by += l.length * 20 + 6;
      }
      b += '</g>';
    }
    y += rh + GAP;
  }
  return svg(W, y - GAP + 24, items.map((x) => x[0]).join(', '), b);
}

// ---------- ЭКРАНЫ ----------
// Три экрана приложения Fitter для Android (phones.mjs, нарисованы по коду приложения), подписи — about.json (p1–p3).
function screens(a, lang) {
  const W = 880, S = 0.66, PH = createPhones(K, lang);
  const ph = [['light', 66, a.p1], ['today', 40, a.p2], ['pay', 66, a.p3]];
  const w = 360 * S + 18, gap = 14, x0 = (W - 3 * w - 2 * gap) / 2;
  let b = `<g class="r"><ellipse cx="440" cy="330" rx="400" ry="300" fill="url(#g1)"/></g>`, chips = '';
  ph.forEach(([kind, y, label], i) => {
    const x = x0 + i * (w + gap);
    b += PH.phone(x, y, kind === 'pay' ? 'pay' : kind, S, delay(i + 1)).body;
    const c = chip(0, 0, label, { check: i === 1 });
    chips += chip(x + w / 2 - c.w / 2, 624, label, { check: i === 1 }).s;
  });
  b += `<g class="r" ${delay(5)}>${chips}</g>`;
  let H = 624 + 30 + 36;
  if (a.note) { b += fitText(440, 624 + 56, a.note, 800, { size: 13, weight: 500, fill: P.dim, anchor: 'middle' }); H += 28; }
  return svg(W, H, `${a.p1} · ${a.p2} · ${a.p3}`, b + `<style>${PH.css}</style>`, PH.defs());
}

// ---------- сборка ----------
const langs = {};
for (const [lang, s] of Object.entries(STR)) {
  langs[lang] = () => ({
    [`hero-${lang}.svg`]: hero(s),
    [`about-${lang}.svg`]: about(ABOUT[lang]),
    [`screens-${lang}.svg`]: screens(ABOUT[lang], lang),
    [`features-${lang}.svg`]: features(FEAT[lang]),
    // кнопки одни на все языки — собираются вместе с русским набором
    ...(lang === 'ru' ? {
      'cta-app.svg': K.button('Fitter.apk', ICONS.download, true),
      'cta-bot.svg': K.button('@FitterFoodBot', ICONS.send, false),
      'cta-site.svg': K.button('sailxx.github.io/FITTER-AI', ICONS.web, false),
    } : {}),
  });
}
await K.build(OUT, langs, 'FITER');
