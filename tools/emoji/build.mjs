// Рисует набор иконок FITTER: icons/fun/<имя>.svg и .png 100×100 (PNG рендерит Chrome, фон прозрачный)
// Запуск из корня: node tools/emoji/build.mjs — затем владелец бота отправляет /makeemoji
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ICONS, svgOf } from "./icons.mjs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "icons/fun");
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fitter-emoji-"));

for (const name of Object.keys(ICONS)) {
  const svg = svgOf(name);
  fs.writeFileSync(path.join(out, name + ".svg"), svg);
  const html = path.join(tmp, "i.html");
  fs.writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
  const shot = path.join(tmp, "i.png");
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--default-background-color=00000000", "--window-size=100,100", `--screenshot=${shot}`, "file:///" + html.replace(/\\/g, "/")], { stdio: "ignore" });
  fs.copyFileSync(shot, path.join(out, name + ".png"));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${Object.keys(ICONS).length} иконок в icons/fun/`);
