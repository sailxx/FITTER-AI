// Логотип FITTER из tools/logo/logo.mjs: docs/logo.svg, иконки сайта docs/icon-*.png и большие PNG в assets/logo/
// PNG рендерит Chrome. Запуск из корня: node tools/logo/build.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CROP, logoSvg } from "./logo.mjs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const root = path.resolve(import.meta.dirname, "../..");
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
  ["assets/logo/fitter-avatar-640.png", full, 640, "#fff"],
];
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
