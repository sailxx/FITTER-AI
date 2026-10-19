// Логотип FITTER: зелёная плитка-яблоко с листиком, глаза-объективы и вспышка камеры, зерно.
// Рисуется в системе координат 1024×1024. Используют tools/readme/build.mjs и tools/logo/build.mjs.

// Кадр без пустых полей — для мелких значков (README, сайт, фавиконки)
export const CROP = '48 36 928 928';

const TILE = '<rect x="96" y="170" width="832" height="780" rx="232"/>';

// Общие градиенты и фильтры; $имя заменяется на id с префиксом
const DEFS = `<defs>
  <radialGradient id="$body" gradientUnits="userSpaceOnUse" cx="330" cy="230" r="950">
    <stop offset="0" stop-color="#8CFF6A"/><stop offset=".35" stop-color="#3EEB6C"/><stop offset=".7" stop-color="#1FD08A"/><stop offset="1" stop-color="#18B9A6"/>
  </radialGradient>
  <linearGradient id="$gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="$eye" cx="45%" cy="38%" r="70%"><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#CFF3DC"/></radialGradient>
  <radialGradient id="$pupil" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#1D5A40"/><stop offset="1" stop-color="#062A1C"/></radialGradient>
  <filter id="$shadow" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><feGaussianBlur stdDeviation="34"/></filter>
  <filter id="$soft" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><feGaussianBlur stdDeviation="22"/></filter>
  <filter id="$glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
  <filter id="$inner" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
    <feGaussianBlur in="SourceAlpha" stdDeviation="24" result="b"/>
    <feComposite in="b" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="e"/>
    <feFlood flood-color="#E6FFE9" flood-opacity=".75"/><feComposite in2="e" operator="in"/>
  </filter>
  <filter id="$grain" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
    <feTurbulence type="fractalNoise" baseFrequency="$freq" numOctaves="1" seed="7"/>
    <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  14 0 0 0 -9.4"/>
  </filter>
  <clipPath id="$tile">${TILE}</clipPath>
</defs>`;

// Черенок и листик; (x, y) — основание черенка, s — масштаб, c — цвета листа и прожилки
export const LEAF = { stem: 'M0 0 L18 -100', leaf: 'M36 -45 C88 -130 208 -140 278 -100 C228 -20 108 0 36 -45 Z', vein: 'M48 -50 C118 -80 188 -90 258 -95' };
const leaf = (x, y, s = 1, c = ['#7BF25A', '#3EC45A']) => `<g transform="translate(${x} ${y}) scale(${s})">
<path d="${LEAF.stem}" stroke="#0B3B2A" stroke-width="30" stroke-linecap="round"/>
<path d="${LEAF.leaf}" fill="${c[0]}"/>
<path d="${LEAF.vein}" stroke="${c[1]}" stroke-width="10" fill="none" stroke-linecap="round"/></g>`;

const flash = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="54" fill="#fff" opacity=".35" filter="url(#$glow)"/><circle cx="${cx}" cy="${cy}" r="32" fill="#fff" opacity=".92"/>`;

// Глаз-объектив
function lens(cx, cy, r) {
  return `<circle cx="${cx}" cy="${cy}" r="${r + 10}" fill="#fff" opacity=".5" filter="url(#$glow)"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#$eye)"/>
<circle cx="${cx + 10}" cy="${cy + 13}" r="82" fill="url(#$pupil)"/>
<circle cx="${cx + 10}" cy="${cy + 13}" r="55" fill="none" stroke="#2E7A5A" stroke-width="8.6" opacity=".8"/>
<circle cx="${cx + 10}" cy="${cy + 13}" r="29" fill="#041A11"/>
<ellipse cx="${cx - 19}" cy="${cy - 19}" rx="20" ry="29" fill="#fff" transform="rotate(-30 ${cx - 19} ${cy - 19})"/>
<circle cx="${cx + 45}" cy="${cy + 55}" r="8.6" fill="#fff" opacity=".7"/>`;
}

// Положение объективов и вспышки на плитке
export const FACE = { lenses: [[366, 590], [658, 590]], r: 128, flash: [790, 320] };
const face = () => flash(...FACE.flash) + FACE.lenses.map(([x, y]) => lens(x, y, FACE.r)).join('');

// Подстановка префикса id и частоты зерна
const fill = (s, p, freq = '.55') => s.replace(/\$freq/g, freq).replace(/\$(\w+)/g, `${p}-$1`);

// Содержимое логотипа; p — префикс id, чтобы несколько копий не конфликтовали в одном SVG.
// shadow: false — без зелёного свечения под плиткой (для мелких значков)
export function logoBody(p = 'fl', { shadow = true } = {}) {
  return fill(`${DEFS}
${leaf(500, 190)}
${shadow ? `<g fill="#22D98A" opacity=".5" filter="url(#$shadow)" transform="translate(0 40)">${TILE}</g>` : ''}
<g clip-path="url(#$tile)">
  <rect width="1024" height="1024" fill="url(#$body)"/>
  <g filter="url(#$inner)">${TILE}</g>
  <ellipse cx="560" cy="1000" rx="560" ry="230" fill="#0E9E8C" opacity=".35" filter="url(#$shadow)"/>
  <ellipse cx="430" cy="290" rx="300" ry="100" fill="url(#$gloss)" filter="url(#$soft)"/>
  <rect width="1024" height="1024" filter="url(#$grain)" opacity=".9"/>
</g>
${face()}`, p);
}

// Вложенный <svg> для вставки в другой SVG/HTML
export const logoAt = (x, y, size, p, opts) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${CROP}">${logoBody(p, opts)}</svg>`;

// Отдельный файл SVG
export const logoSvg = ({ viewBox = '0 0 1024 1024', size = 1024, ...opts } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${logoBody('fl', opts)}</svg>\n`;

// Адаптивная иконка Android: 1024 = 108 dp, безопасная зона — круг 66 dp (радиус 313) в центре.
// Лицо уменьшено до FG_SCALE вокруг центра, листик отдельно — у верхнего края безопасной зоны.
export const FG_SCALE = 0.82;
export const FG_LEAF = { x: 475, y: 315, s: 0.66 };
const svg1024 = body => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>\n`;

// Фон: градиент плитки, блик и зерно на весь квадрат (зерно крупнее — иконка рендерится мелко)
const bgBody = (freq = '.22') => fill(`${DEFS}
<rect width="1024" height="1024" fill="url(#$body)"/>
<ellipse cx="560" cy="1060" rx="640" ry="300" fill="#0E9E8C" opacity=".35" filter="url(#$shadow)"/>
<ellipse cx="460" cy="250" rx="320" ry="110" fill="url(#$gloss)" filter="url(#$soft)"/>
<rect width="1024" height="1024" filter="url(#$grain)" opacity=".9"/>`, 'ab', freq);

// Передний план: светлый листик (на зелёном фоне), вспышка и объективы
const fgBody = () => fill(`${DEFS}
${leaf(FG_LEAF.x, FG_LEAF.y, FG_LEAF.s, ['#E4FFCC', '#8FDB6E'])}
<g transform="translate(512 512) scale(${FG_SCALE}) translate(-512 -512)">${face()}</g>`, 'af');

export const launcherBg = () => svg1024(bgBody());
export const launcherFg = () => svg1024(fgBody());

// Аватар бота в Telegram: иконка приложения без полей, Telegram сам обрежет кругом
export const botAvatar = () => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="171 171 682 682">${bgBody('.35')}${fgBody()}</svg>\n`;

// Тёмная иконка Android (выбирается в настройках приложения): тот же логотип целиком — плитка с листиком —
// на чёрном фоне. DARK_SCALE подобран так, чтобы углы плитки и листик остались в безопасной зоне.
export const DARK_SCALE = 0.6;
const darkBgBody = () => `<defs><radialGradient id="db" cx="512" cy="560" r="560" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#0C2A1D"/><stop offset=".55" stop-color="#05110C"/><stop offset="1" stop-color="#000"/></radialGradient></defs>
<rect width="1024" height="1024" fill="url(#db)"/>`;
// Центр логотипа с листиком — около (512, 500): опускаем на 12, чтобы стоял по центру
const darkFgBody = () => `<g transform="translate(512 512) scale(${DARK_SCALE}) translate(-512 -500)">${logoBody('dk')}</g>`;

export const launcherDarkBg = () => svg1024(darkBgBody());
export const launcherDarkFg = () => svg1024(darkFgBody());
