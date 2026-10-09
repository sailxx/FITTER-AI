// Шапки README на разных языках в шрифте JetBrains Mono.
// Шрифт (OFL-1.1, github.com/JetBrains/JetBrainsMono) положить в tools/readme/.font/JetBrainsMono-Var.woff2
// Запуск: node tools/readme/build.mjs
import fs from "node:fs";
const dir = "tools/readme/";
const font = fs.readFileSync(dir + ".font/JetBrainsMono-Var.woff2").toString("base64");
const face = `@font-face{font-family:"JBM";src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 800}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k === "FONT" ? face : esc(vars[k] ?? "")));
const out = "assets/readme/";
fs.mkdirSync(out, { recursive: true });

const hero = fs.readFileSync(dir + "hero.svg", "utf8");
for (const [lang, s] of Object.entries(JSON.parse(fs.readFileSync(dir + "strings.json", "utf8")))) {
  fs.writeFileSync(`${out}hero-${lang}.svg`, fill(hero, s));
}
// Кнопки без слов на конкретном языке
const cta = fs.readFileSync(dir + "cta.svg", "utf8");
const btn = (name, label, bg, fg, edge) => {
  const w = Math.round(label.length * 9 + 48);
  fs.writeFileSync(out + name, fill(cta, { label, bg, fg, edge, w, w1: w - 1, cx: w / 2 }));
};
btn("cta-bot.svg", "▶ @FitterFoodBot", "#c9f36b", "#171916", "#c9f36b");
btn("cta-site.svg", "↗ sailxx.github.io/FITTER-AI", "#171916", "#eef1ea", "#3a3f36");
console.log(fs.readdirSync(out).join("\n"));

// ── Плашка «О проекте» и экраны: моноширинный шрифт, поэтому перенос считаем по числу знаков ──
const wrap = (text, max) => {
  const lines = [];
  let cur = "";
  for (const w of String(text).split(" ")) {
    if (cur && (cur + " " + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
};
const ICONS = [
  '<path d="M2 7h4l2-3h8l2 3h4v13H2z"/><circle cx="12" cy="13" r="4"/>',
  '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S10 9 12 9zM12 9c2-4 6-4 6-1.5S14 9 12 9z"/>',
];
const screens = fs.readFileSync(dir + "screens.svg", "utf8");
for (const [lang, a] of Object.entries(JSON.parse(fs.readFileSync(dir + "about.json", "utf8")))) {
  fs.writeFileSync(`${out}screens-${lang}.svg`, fill(screens, a));

  const W = 880, P = 44, TW = (W - 2 * P - 36) / 4;
  const text = wrap(a.text, 86);
  const ty = 96 + (text.length - 1) * 25 + 34;
  const tiles = a.tiles.map(([t, d]) => ({ t: wrap(t, 18), d: wrap(d, 21) }));
  const th = Math.max(...tiles.map((x) => 16 + 24 + 22 + x.t.length * 18 + 6 + x.d.length * 17 + 10));
  const H = ty + th + 40;
  const tile = (x, i) => {
    const X = P + i * (TW + 12);
    let y = ty + 16 + 24 + 26;
    const t = x.t.map((l) => `<text x="${X + 16}" y="${(y += 18) - 18}" class="tt">${esc(l)}</text>`).join("");
    y += 4;
    const d = x.d.map((l) => `<text x="${X + 16}" y="${(y += 17) - 17}" class="td">${esc(l)}</text>`).join("");
    return `<g class="r" style="animation-delay:${0.35 + i * 0.12}s"><rect x="${X}" y="${ty}" width="${TW}" height="${th}" rx="14" fill="#ffffff" fill-opacity=".04" stroke="#ffffff" stroke-opacity=".08"/>` +
      `<g transform="translate(${X + 16} ${ty + 16})" fill="none" stroke="#c9f36b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[i]}</g>${t}${d}</g>`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(a.text)}">
<style>
${face}
text{font-family:"JBM",ui-monospace,Consolas,monospace}
.tt{font-size:14px;font-weight:700;fill:#eef1ea}
.td{font-size:12px;fill:#a5ac9e}
.r{animation:in .7s ease-out backwards}
@keyframes in{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.r{animation:none}}
</style>
<defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" fill="#c9f36b" fill-opacity=".07"/></pattern>
<radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 0) scale(420 300)"><stop offset="0" stop-color="#c9f36b" stop-opacity=".12"/><stop offset="1" stop-color="#c9f36b" stop-opacity="0"/></radialGradient>
<clipPath id="card"><rect width="${W}" height="${H}" rx="22"/></clipPath></defs>
<g clip-path="url(#card)"><rect width="${W}" height="${H}" fill="#171916"/><rect width="${W}" height="${H}" fill="url(#dots)"/><rect width="${W}" height="${H}" fill="url(#glow)"/></g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="21.5" fill="none" stroke="#ffffff" stroke-opacity=".07"/>
<g class="r"><rect x="${P}" y="49" width="9" height="9" rx="2" fill="#c9f36b"/><text x="${P + 18}" y="58" font-size="11" font-weight="600" letter-spacing="2.4" fill="#8d9488">${esc(a.label)}</text></g>
<g class="r" style="animation-delay:.15s">${text.map((l, i) => `<text x="${P}" y="${96 + i * 25}" font-size="15" fill="${i ? "#c9cfc2" : "#eef1ea"}">${esc(l)}</text>`).join("")}</g>
${tiles.map(tile).join("\n")}
</svg>`;
  fs.writeFileSync(`${out}about-${lang}.svg`, svg);
}
console.log("about + screens ok");
