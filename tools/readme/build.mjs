// Плашки README в стиле Okto Calc: чёрный фон, свечения и зелёный акцент, шрифты Golos Text и JetBrains Mono
// (урезаются под каждый язык). Тексты — strings.json (шапка) и about.json (о проекте, подписи экранов).
// Шрифты (OFL-1.1) положить в tools/readme/.font/: golos.ttf (Golos Text) и jbmono.ttf (JetBrains Mono).
// Запуск: cd tools/readme && npm install && node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKit, ICONS } from './kit.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(DIR, '../../assets/readme');
const STR = JSON.parse(fs.readFileSync(path.join(DIR, 'strings.json'), 'utf8'));
const ABOUT = JSON.parse(fs.readFileSync(path.join(DIR, 'about.json'), 'utf8'));

const G = '#30D158';
const K = createKit({
  golos: path.join(DIR, '.font/golos.ttf'),
  mono: path.join(DIR, '.font/jbmono.ttf'),
  accent: { hi: G, grad: ['#9CF5AE', '#30D158'], on: '#03210C', glow: G, glow2: '#A6F23A', btn: ['#5EE387', '#27B54A'] },
});
const { P, T, card, chip, sectionHead, badge, iconBox, lines, wrap, one, fitSize, fitText, delay, svg } = K;

// Значок FITTER: рамка видоискателя и яблоко
const MARK = '<path d="M3.5 8V6.5a3 3 0 0 1 3-3H8"/><path d="M16 3.5h1.5a3 3 0 0 1 3 3V8"/><path d="M20.5 16v1.5a3 3 0 0 1-3 3H16"/><path d="M8 20.5H6.5a3 3 0 0 1-3-3V16"/><path d="M12 9.3c-1.2-.9-3.9-1.1-4.4 1.9-.4 2.4 1.2 5.4 2.9 5.4.6 0 1-.3 1.5-.3s.9.3 1.5.3c1.7 0 3.3-3 2.9-5.4-.5-3-3.2-2.8-4.4-1.9z"/><path d="M12 9.3c0-1.3.6-2.2 1.7-2.6"/>';
const logo = (x, y) => `<rect x="${x}" y="${y}" width="36" height="36" rx="10" fill="${G}"/><g transform="translate(${x + 6} ${y + 6})" fill="none" stroke="#03210C" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${MARK}</g>`;

const RING = '.arc{stroke-dasharray:440;stroke-dashoffset:150;animation:fill 1.8s cubic-bezier(.2,.8,.2,1) .4s backwards}@keyframes fill{from{stroke-dashoffset:440}}@media (prefers-reduced-motion:reduce){.arc{animation:none}}';

// ---------- HERO ----------
function hero(s) {
  const W = 880;
  let b = `<g class="r">${logo(40, 36)}<text x="88" y="62" font-size="24" font-weight="800" letter-spacing="-.4">${T('FITTER')}</text></g>`;
  b += `<g class="r" ${delay(1)}>${chip(196, 39, s.tag).s}</g>`;
  const ts = fitSize([s.l1, s.l2], 560, 40, 800);
  b += `<g class="r" ${delay(2)}>${lines(40, 146, [one(s.l1), one('*' + s.l2 + '*')], { size: ts, weight: 800, lh: 48, spacing: '-1' })}</g>`;
  const sub = wrap(s.sub, 600, 16, 500);
  b += `<g class="r" ${delay(3)}>${lines(40, 234, sub, { size: 16, weight: 500, lh: 24, fill: P.muted })}</g>`;
  // кольцо калорий
  b += `<g class="r" ${delay(3)}><ellipse cx="740" cy="170" rx="150" ry="140" fill="url(#g1)"/><g transform="translate(740 168)">
<circle r="78" fill="none" stroke="#1d1d1d" stroke-width="16"/><g transform="rotate(-90)"><circle class="arc" r="78" fill="none" stroke="url(#tg)" stroke-width="16" stroke-linecap="round"/></g>
<circle r="56" fill="url(#cg)" stroke="${P.stroke}"/>
<text class="m" y="2" text-anchor="middle" font-size="26" font-weight="700" letter-spacing="-1">${T('1 240')}</text>
<text class="m" y="22" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="1.6" fill="${P.dim}">${T(s.kcal)}</text></g></g>`;
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
  return svg(W, H, `FITTER — ${s.l1} ${s.l2} ${s.sub}`, b + `<style>${RING}</style>`);
}

// ---------- О ПРОЕКТЕ ----------
const TILE_ICONS = [
  '<path d="M2 7h4l2-3h8l2 3h4v13H2z"/><circle cx="12" cy="13" r="4"/>',
  '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S10 9 12 9zM12 9c2-4 6-4 6-1.5S14 9 12 9z"/>',
];
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
    b += `<g class="r" ${delay(2 + i)}>${card(X, ty, TW, th)}${iconBox(X + 16, ty + 16, TILE_ICONS[i])}
${lines(X + 16, ty + 86, x.t, { size: 15, weight: 700, lh: 20 })}
${lines(X + 16, ty + 86 + x.t.length * 20 + 6, x.d, { size: 13, weight: 500, lh: 18, fill: P.muted })}</g>`;
  });
  return svg(W, ty + th + 36, a.text, b);
}

// ---------- ЭКРАНЫ ----------
// Сами телефоны — из screens.svg (интерфейс бота на русском), подписи — из about.json.
const SCREENS = fs.readFileSync(path.join(DIR, 'screens.svg'), 'utf8');
const phones = SCREENS.match(/<!-- ═════ Чат с ботом ═════ -->[\s\S]*?<\/g><\/g>\s*<!-- ═════ Дневник[\s\S]*?<\/g><\/g>/)[0];
const phoneDefs = SCREENS.match(/<linearGradient id="hero"[\s\S]*?<clipPath id="pic">.*?<\/clipPath>/)[0].replace(/\s*<clipPath id="card">.*?<\/clipPath>/, '');
const phoneCss = '.w{fill:#ffffff}.mu{fill:#8fa1b3}.b{font-weight:700}.ink{fill:#03301a}.sub{fill:#2f5c43}.g{fill:#6b7570}' +
  '.arc2{stroke-dasharray:352;stroke-dashoffset:238;animation:fill2 1.6s cubic-bezier(.2,.8,.2,1) .6s backwards}@keyframes fill2{from{stroke-dashoffset:352}}@media (prefers-reduced-motion:reduce){.arc2{animation:none}}';
const phoneText = [...phones.matchAll(/>([^<>]+)</g)].map((m) => m[1]).join('');
function screens(a) {
  const W = 880;
  const body = phones.replace(/class="m"/g, 'class="mu"').replace(/class="m b"/g, 'class="mu b"').replace(/class="arc"/g, 'class="arc2"')
    .replace(/class="r d1"/, 'class="r" ' + delay(1)).replace(/class="r d2"/, 'class="r" ' + delay(3))
    .replace('translate(100 40)', 'translate(100 46)').replace('translate(480 40)', 'translate(480 46)');
  let b = `<g class="r"><ellipse cx="630" cy="380" rx="230" ry="330" fill="url(#g1)"/></g>${body}`;
  const c1 = chip(0, 0, a.c1), c2 = chip(0, 0, a.c2, { check: true });
  b += `<g class="r" ${delay(5)}>${chip(250 - c1.w / 2, 712, a.c1).s}${chip(630 - c2.w / 2, 712, a.c2, { check: true }).s}</g>`;
  let H = 772;
  if (a.note) { b += fitText(440, 776, a.note, 800, { size: 13, weight: 500, fill: P.dim, anchor: 'middle' }); H = 806; }
  return svg(W, H, `${a.c1} · ${a.c2}`, b + `<style>${phoneCss}</style>`, phoneDefs);
}

// ---------- сборка ----------
const langs = {};
for (const [lang, s] of Object.entries(STR)) {
  langs[lang] = () => ({
    [`hero-${lang}.svg`]: hero(s),
    [`about-${lang}.svg`]: about(ABOUT[lang]),
    [`screens-${lang}.svg`]: screens(ABOUT[lang]),
    // кнопки одни на все языки — собираются вместе с русским набором
    ...(lang === 'ru' ? {
      'cta-bot.svg': K.button('@FitterFoodBot', ICONS.send, true),
      'cta-site.svg': K.button('sailxx.github.io/FITTER-AI', ICONS.web, false),
    } : {}),
  });
}
await K.build(OUT, langs, phoneText + 'FITER');
