// Логотип FITTER: зелёная плитка-яблоко с листиком, глаза-объективы и вспышка камеры, зерно.
// Рисуется в системе координат 1024×1024. Используют tools/readme/build.mjs и tools/logo/build.mjs.

// Кадр без пустых полей — для мелких значков (README, сайт, фавиконки)
export const CROP = '48 36 928 928';

const TILE = '<rect x="96" y="170" width="832" height="780" rx="232"/>';

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

// Содержимое логотипа; p — префикс id, чтобы несколько копий не конфликтовали в одном SVG.
// shadow: false — без зелёного свечения под плиткой (для мелких значков)
export function logoBody(p = 'fl', { shadow = true } = {}) {
  const s = `
<defs>
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
    <feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="1" seed="7"/>
    <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  14 0 0 0 -9.4"/>
  </filter>
  <clipPath id="$tile">${TILE}</clipPath>
</defs>
<path d="M500 190 L518 90" stroke="#0B3B2A" stroke-width="30" stroke-linecap="round"/>
<path d="M536 145 C588 60 708 50 778 90 C728 170 608 190 536 145 Z" fill="#7BF25A"/>
<path d="M548 140 C618 110 688 100 758 95" stroke="#3EC45A" stroke-width="10" fill="none" stroke-linecap="round"/>
${shadow ? `<g fill="#22D98A" opacity=".5" filter="url(#$shadow)" transform="translate(0 40)">${TILE}</g>` : ''}
<g clip-path="url(#$tile)">
  <rect width="1024" height="1024" fill="url(#$body)"/>
  <g filter="url(#$inner)">${TILE}</g>
  <ellipse cx="560" cy="1000" rx="560" ry="230" fill="#0E9E8C" opacity=".35" filter="url(#$shadow)"/>
  <ellipse cx="430" cy="290" rx="300" ry="100" fill="url(#$gloss)" filter="url(#$soft)"/>
  <rect width="1024" height="1024" filter="url(#$grain)" opacity=".9"/>
</g>
<circle cx="790" cy="320" r="54" fill="#fff" opacity=".35" filter="url(#$glow)"/><circle cx="790" cy="320" r="32" fill="#fff" opacity=".92"/>
${lens(366, 590, 128)}
${lens(658, 590, 128)}`;
  return s.replace(/\$(\w+)/g, `${p}-$1`);
}

// Вложенный <svg> для вставки в другой SVG/HTML
export const logoAt = (x, y, size, p, opts) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${CROP}">${logoBody(p, opts)}</svg>`;

// Отдельный файл SVG
export const logoSvg = ({ viewBox = '0 0 1024 1024', size = 1024, ...opts } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${logoBody('fl', opts)}</svg>\n`;
