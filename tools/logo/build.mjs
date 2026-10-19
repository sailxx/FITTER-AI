// Логотип FITTER из tools/logo/logo.mjs: docs/logo.svg, иконки сайта docs/icon-*.png, большие PNG в assets/logo/,
// значок и адаптивные иконки Android (зелёная и тёмная) (android/app/src/main/res). PNG рендерит Chrome.
// Запуск из корня: node tools/logo/build.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CROP, FACE, FG_LEAF, FG_SCALE, LEAF, botAvatar, launcherBg, launcherDarkBg, launcherDarkFg, launcherFg, logoSvg } from "./logo.mjs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const root = path.resolve(import.meta.dirname, "../..");
const RES = "android/app/src/main/res";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fitter-logo-"));
fs.mkdirSync(path.join(root, "assets/logo"), { recursive: true });

// Мелкий значок: кадр без полей и без свечения; большой — целиком, со свечением
const small = logoSvg({ viewBox: CROP, size: 512, shadow: false });
const full = logoSvg();
fs.writeFileSync(path.join(root, "docs/logo.svg"), small);
fs.writeFileSync(path.join(root, "assets/logo/fitter-logo.svg"), full);

// [файл, svg, размер, фон]; apple-touch-icon — на непрозрачном чёрном фоне сайта
const PNG = [
  ["docs/icon-32.png", small, 32, "transparent"],
  ["docs/icon-120.png", small, 120, "transparent"],
  ["docs/icon-180.png", small, 180, "#000"],
  ["assets/logo/fitter-logo-1024.png", full, 1024, "transparent"],
  ["assets/logo/fitter-avatar-640.png", botAvatar(), 640, "transparent"],
  // Android: значок экрана входа (120 dp) и виджета, слои адаптивной иконки (108 dp × xxxhdpi)
  [`${RES}/drawable-nodpi/ic_logo.png`, small, 480, "transparent"],
  [`${RES}/drawable-nodpi/ic_launcher_background.png`, launcherBg(), 432, "transparent"],
  [`${RES}/drawable-nodpi/ic_launcher_foreground.png`, launcherFg(), 432, "transparent"],
  // Тёмная иконка: логотип целиком на чёрном фоне (Настройки → Оформление → Иконка)
  [`${RES}/drawable-nodpi/ic_launcher_dark_background.png`, launcherDarkBg(), 432, "transparent"],
  [`${RES}/drawable-nodpi/ic_launcher_dark_foreground.png`, launcherDarkFg(), 432, "transparent"],
];

// Монохромная иконка Android 13+: силуэт объективов, вспышки и листика (vector, 108 dp)
const k = 108 / 1024, n = v => +v.toFixed(2);
const at = v => 512 + (v - 512) * FG_SCALE;
const disc = (cx, cy, r) => `M${n(cx - r)},${n(cy)}a${n(r)},${n(r)} 0,1 0,${n(2 * r)},0a${n(r)},${n(r)} 0,1 0,${n(-2 * r)},0z`;
const R = FACE.r * FG_SCALE * k;
const lensPath = FACE.lenses.map(([x, y]) => {
  const cx = at(x) * k, cy = at(y) * k, d = 10 * FG_SCALE * k;
  return disc(cx, cy, R) + disc(cx + d, cy + d, R * 0.64) + disc(cx + d, cy + d, R * 0.23);
}).join("");
// SVG-путь в формат pathData: пробелы между числами → запятые
const pd = s => s.replace(/(-?\d)\s+(-?\d)/g, "$1,$2");
fs.writeFileSync(path.join(root, RES, "drawable/ic_launcher_monochrome.xml"), `<?xml version="1.0" encoding="utf-8"?>
<!-- Генерирует tools/logo/build.mjs: силуэт логотипа для тематических иконок Android 13+ -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillType="evenOdd" android:fillColor="#FFFFFFFF" android:pathData="${lensPath}" />
    <path android:fillColor="#FFFFFFFF" android:pathData="${disc(at(FACE.flash[0]) * k, at(FACE.flash[1]) * k, 32 * FG_SCALE * k)}" />
    <group android:translateX="${n(FG_LEAF.x * k)}" android:translateY="${n(FG_LEAF.y * k)}" android:scaleX="${n(FG_LEAF.s * k * 1000) / 1000}" android:scaleY="${n(FG_LEAF.s * k * 1000) / 1000}">
        <path android:strokeColor="#FFFFFFFF" android:strokeWidth="30" android:strokeLineCap="round" android:pathData="${pd(LEAF.stem)}" />
        <path android:fillColor="#FFFFFFFF" android:pathData="${pd(LEAF.leaf)}" />
    </group>
</vector>
`);
for (const [file, svg, size, bg] of PNG) {
  const html = path.join(tmp, "i.html");
  fs.writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:${bg}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  const shot = path.join(tmp, "i.png");
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--default-background-color=00000000", `--window-size=${size},${size}`, `--screenshot=${shot}`, "file:///" + html.replace(/\\/g, "/")], { stdio: "ignore" });
  fs.copyFileSync(shot, path.join(root, file));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`logo.svg и ${PNG.length} PNG готовы`);
