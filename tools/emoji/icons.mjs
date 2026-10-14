// Иконки набора FITTER FUN: цветные, весёлые, в одном стиле — объёмный градиент сверху вниз, белый блик, мягкая тень снизу.
// Кадр 100×100 (так требует Telegram для custom emoji). Каждая иконка — функция, которая возвращает SVG без обёртки.

// Палитра: [светлый верх, насыщенный низ]
export const C = {
  green: ["#8AF5A4", "#1FAE48"], blue: ["#86CEFF", "#1C76EE"], orange: ["#FFCB70", "#FF8200"], red: ["#FF9A8F", "#E5302A"],
  yellow: ["#FFEA80", "#FFBE00"], purple: ["#DDAEFF", "#9446E6"], pink: ["#FFA3C4", "#EE3A78"], teal: ["#8FF2EE", "#10B2C4"],
  gray: ["#FFFFFF", "#D2D2DA"], brown: ["#F0BC85", "#B0672A"], dark: ["#6A6A78", "#2A2A33"], mint: ["#C9FFD8", "#7BE59A"],
  skin: ["#FFE7A8", "#FFC34D"], sky: ["#B9E4FF", "#5AB2FF"],
};
const INK = "#1E2235"; // тёмные детали: глаза, цифры

let n = 0;
/** Набор градиентов для одной иконки */
export function kit() {
  const defs = [];
  const g = (col) => {
    const id = "g" + n++;
    const [a, b] = C[col] || col;
    defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`);
    return `url(#${id})`;
  };
  return { g, defs };
}
// Белый блик
const hl = (x, y, rx, ry, rot = -30, o = 0.6) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" fill-opacity="${o}" transform="rotate(${rot} ${x} ${y})"/>`;
const circ = (x, y, r, f, extra = "") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}"${extra}/>`;
const rect = (x, y, w, h, r, f, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}"${extra}/>`;
const path = (d, f, extra = "") => `<path d="${d}" fill="${f}"${extra}/>`;
const line = (d, c, w, extra = "") => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

// Мордочка: глаза и улыбка (для смайликов и героев)
const eyes = (y = 44, dx = 11, r = 5, cx = 50) => circ(cx - dx, y, r, INK) + circ(cx + dx, y, r, INK) + circ(cx - dx + 1.6, y - 1.8, r * 0.35, "#fff") + circ(cx + dx + 1.6, y - 1.8, r * 0.35, "#fff");
const cheeks = (y = 58, dx = 22) => circ(50 - dx, y, 5.5, "#FF6B8A", ` fill-opacity=".45"`) + circ(50 + dx, y, 5.5, "#FF6B8A", ` fill-opacity=".45"`);
const face = (k, col = "yellow") => circ(50, 52, 42, k.g(col)) + hl(34, 30, 14, 8);

// Цифра в кружке
const num = (k, d, col) => circ(50, 50, 44, k.g(col)) + hl(33, 27, 15, 8) +
  `<text x="50" y="69" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="54" fill="#fff">${d}</text>`;
// Квадратик шкалы
const sq = (k, col) => rect(8, 8, 84, 84, 22, k.g(col)) + hl(30, 24, 16, 7, -20, 0.5);

export const ICONS = {
  // ── Еда и БЖУ ──
  plate: (k) => circ(50, 54, 42, k.g("gray")) + circ(50, 54, 30, "#fff") + circ(50, 54, 30, "none", ` stroke="#E3E3EA" stroke-width="3"`) +
    circ(42, 50, 11, k.g("red")) + path("M50 56c6-10 18-10 20 0-4 8-16 8-20 0z", k.g("green")) + circ(47, 66, 8, k.g("yellow")) + hl(30, 30, 12, 6),
  protein: (k) => path("M30 70c-14-14-8-40 14-50 20-9 40 4 38 24-1 18-20 30-36 30z", k.g("brown")) + hl(48, 30, 14, 7) +
    rect(14, 66, 28, 12, 6, k.g("gray"), ` transform="rotate(-45 28 72)"`) + circ(14, 80, 8, k.g("gray")) + circ(20, 88, 7, k.g("gray")),
  fat: (k) => path("M12 58l20-22h56v26l-20 22H12z", k.g("yellow")) + path("M12 58h56v26H12z", k.g("orange")) + path("M68 58l20-22v26l-20 22z", "#E89A00") + hl(42, 42, 16, 5, -10),
  carbs: (k) => path("M18 50c0-18 14-30 32-30s32 12 32 30c0 6-4 9-8 10v20a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6V60c-4-1-8-4-8-10z", k.g("brown")) +
    path("M26 50c0-14 10-22 24-22s24 8 24 22v30H26z", k.g(["#FFF1D6", "#F7D9A4"])) + hl(36, 32, 12, 6),
  kcal: (k) => path("M52 4c2 18 32 28 32 56a34 34 0 0 1-68 0c0-16 8-26 16-32-2 12 2 20 10 24-4-20 2-38 10-48z", k.g(["#FFB04D", "#F2430F"])) +
    path("M50 46c4 10 18 16 18 32a18 18 0 0 1-36 0c0-10 6-16 10-22 2 6 4 8 8 10 0-8 0-14 0-20z", k.g("yellow")) + hl(32, 56, 5, 11, 15, 0.5),
  apple: (k) => path("M50 30c-8-6-34-8-36 18-2 22 12 42 26 42 4 0 6-2 10-2s6 2 10 2c14 0 28-20 26-42-2-26-28-24-36-18z", k.g("green")) +
    line("M50 30c0-8 3-14 9-18", "#7A4A1E", 5) + path("M56 20c6-12 20-12 26-8-4 10-16 14-26 8z", k.g(["#B5F5A0", "#3FB84A"])) + hl(30, 46, 9, 14, 20),
  salad: (k) => path("M8 48h84c0 22-18 40-42 40S8 70 8 48z", k.g("teal")) + circ(30, 42, 14, k.g("green")) + circ(50, 36, 16, k.g(["#B5F5A0", "#3FB84A"])) +
    circ(70, 42, 13, k.g("green")) + circ(40, 46, 7, k.g("red")) + circ(62, 47, 6, k.g("yellow")) + hl(30, 62, 12, 5, -10, 0.5),
  broccoli: (k) => path("M42 56h16l6 32H36z", k.g(["#C9F2A8", "#7DC95A"])) + circ(32, 44, 18, k.g("green")) + circ(68, 44, 18, k.g("green")) + circ(50, 30, 22, k.g(["#9AF0A0", "#24A844"])) + hl(40, 20, 10, 6),

  // ── Тело и активность ──
  scales: (k) => rect(8, 14, 84, 76, 24, k.g("teal")) + path("M24 42a26 26 0 0 1 52 0z", "#fff") + line("M50 42l10-14", INK, 5) + circ(50, 42, 5, INK) + hl(26, 24, 12, 6),
  sofa: (k) => rect(18, 26, 64, 34, 14, k.g("purple")) + rect(8, 46, 22, 32, 10, k.g("pink")) + rect(70, 46, 22, 32, 10, k.g("pink")) + rect(26, 54, 48, 22, 8, k.g(["#F0C8FF", "#C07AF0"])) + rect(14, 76, 8, 12, 3, "#7A4A9E") + rect(78, 76, 8, 12, 3, "#7A4A9E") + hl(36, 32, 14, 5, -5),
  walk: (k) => circ(56, 16, 10, k.g("orange")) + line("M54 30l-6 28M48 58l-12 30M48 58l14 14 4 16M52 36l-16 12M52 36l16 10", k.g("orange"), 12),
  run: (k) => circ(62, 14, 10, k.g("red")) + line("M58 28l-12 26M46 54l-20 6M46 54l12 12-6 22M56 34l-16 4-8 12M56 34l14 14 14-4", k.g("red"), 12) + line("M8 40h14M12 54h12", "#FFB3AD", 6),
  muscle: (k) => path("M14 82c-6-30 6-58 22-64 10-4 16 4 12 12-4 6-12 6-14 14 10-6 34-4 46 12 10 14 4 30-12 32-20 2-40-4-54-6z", k.g("skin")) + hl(30, 30, 6, 10, 20) + line("M44 50c6 6 14 6 20 2", "#E8A030", 4),
  lose: (k) => rect(8, 8, 84, 84, 22, k.g("gray")) + line("M20 28l20 20 14-10 26 28", k.g("green"), 10) + path("M66 70h18V52z", "#1FAE48") + hl(28, 20, 14, 5, -10, 0.8),
  ruler: (k) => rect(6, 34, 88, 32, 10, k.g("yellow"), ` transform="rotate(-30 50 50)"`) + line("M30 52l-6-10M42 45l-4-6M54 38l-6-10M66 31l-4-6", "#A06A00", 4) + hl(36, 40, 14, 4, -30, 0.6),
  cake: (k) => rect(14, 48, 72, 40, 12, k.g("pink")) + path("M14 58c8 8 16-6 24 2s16-6 24 2 16-6 24 2V54a8 8 0 0 0-8-6H22a8 8 0 0 0-8 6z", "#fff") +
    rect(44, 24, 12, 26, 4, k.g("sky")) + path("M50 8c6 6 6 14 0 16-6-2-6-10 0-16z", k.g("orange")) + hl(28, 66, 10, 4, -10, 0.5),
  man: (k) => path("M14 92c0-22 16-32 36-32s36 10 36 32z", k.g("blue")) + circ(50, 38, 22, k.g("skin")) + path("M28 34c0-16 10-22 22-22s22 6 22 22c-6-6-14-8-22-8s-16 2-22 8z", k.g("brown")) + eyes(40, 8, 3.2) + hl(40, 26, 6, 3),
  woman: (k) => path("M24 64c-6-36 4-54 26-54s32 18 26 54z", k.g("orange")) + path("M14 92c0-22 16-32 36-32s36 10 36 32z", k.g("pink")) + circ(50, 40, 21, k.g("skin")) + path("M30 36c4-12 12-16 20-16s16 4 20 16c-8-2-16-8-20-12-4 4-12 10-20 12z", k.g("orange")) + eyes(42, 8, 3.2) + hl(40, 28, 6, 3),

  // ── Вода, таблетки, напоминания ──
  water: (k) => path("M50 6C34 30 20 46 20 62a30 30 0 0 0 60 0C80 46 66 30 50 6z", k.g("blue")) + hl(36, 58, 8, 14, 15) + eyes(66, 10, 4) + path("M43 76q7 6 14 0", "none", ` stroke="${INK}" stroke-width="3.5" stroke-linecap="round"`),
  pill: (k) => `<g transform="rotate(-40 50 50)">` + rect(16, 32, 68, 36, 18, k.g("gray")) + path("M34 32h16v36H34a18 18 0 0 1 0-36z", k.g("red")) + rect(34, 32, 16, 36, 0, k.g("red")) + `</g>` + hl(30, 50, 10, 4, -40),
  alarm: (k) => circ(22, 20, 12, k.g("red")) + circ(78, 20, 12, k.g("red")) + circ(50, 54, 38, k.g("red")) + circ(50, 54, 29, "#fff") + line("M50 36v18l12 8", INK, 6) + line("M26 88l8-8M74 88l-8-8", "#C02420", 7) + hl(32, 34, 10, 5),
  bell: (k) => path("M50 10c-18 0-28 14-28 32v18l-10 14h76L78 60V42c0-18-10-32-28-32z", k.g("yellow")) + circ(50, 84, 10, k.g("orange")) + hl(36, 30, 7, 13, 20),
  bellOff: (k) => path("M50 10c-18 0-28 14-28 32v18l-10 14h76L78 60V42c0-18-10-32-28-32z", k.g("gray")) + circ(50, 84, 10, k.g(["#D6D6DE", "#9A9AA6"])) + line("M14 14l72 72", "#E5302A", 9) + hl(36, 30, 7, 13, 20),
  timer: (k) => rect(42, 4, 16, 10, 4, k.g("orange")) + circ(50, 56, 38, k.g("orange")) + circ(50, 56, 29, "#fff") + path("M50 56V27a29 29 0 0 1 25 14z", "#FFD9A0") + line("M50 56l14-14", INK, 6) + circ(50, 56, 5, INK) + hl(32, 36, 10, 5),

  // ── Итоги, время, награды ──
  chart: (k) => rect(8, 8, 84, 84, 22, k.g("gray")) + rect(20, 52, 14, 28, 5, k.g("blue")) + rect(43, 36, 14, 44, 5, k.g("green")) + rect(66, 22, 14, 58, 5, k.g("orange")) + hl(28, 20, 14, 5, -10, 0.8),
  calendar: (k) => rect(8, 14, 84, 78, 18, k.g("gray")) + path("M8 32a18 18 0 0 1 18-18h48a18 18 0 0 1 18 18v6H8z", k.g("red")) + rect(26, 4, 9, 20, 4, INK) + rect(65, 4, 9, 20, 4, INK) +
    `<text x="50" y="82" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="38" fill="${INK}">7</text>`,
  sunrise: (k) => rect(6, 6, 88, 88, 24, k.g(["#FFD7A8", "#FF7A6A"])) + circ(50, 66, 24, k.g("yellow")) + path("M6 66h88v4a24 24 0 0 1-24 24H30A24 24 0 0 1 6 70z", k.g(["#7FB5FF", "#3D6FE0"])) + line("M50 18v10M24 30l6 6M76 30l-6 6", "#fff", 5),
  moon: (k) => path("M60 8a42 42 0 1 0 32 66A34 34 0 0 1 60 8z", k.g(["#FFF3A8", "#FFC21A"])) + circ(34, 46, 5, "#F0B000", ` fill-opacity=".5"`) + circ(48, 70, 7, "#F0B000", ` fill-opacity=".5"`) + path("M78 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3z", "#fff") + hl(30, 30, 8, 12, 30),
  hundred: (k) => `<text x="50" y="66" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="46" fill="${k.g("red")}" transform="rotate(-8 50 50)">100</text>` + line("M14 80c22 6 50 6 72-4M20 90c20 4 40 4 56-2", "#E5302A", 6),
  trophy: (k) => line("M24 22H10c0 20 10 28 18 28M76 22h14c0 20-10 28-18 28", k.g("yellow"), 8) + path("M22 10h56v24c0 18-12 30-28 30S22 52 22 34z", k.g("yellow")) + rect(42, 62, 16, 14, 2, k.g("orange")) + rect(26, 76, 48, 14, 6, k.g("brown")) + hl(36, 22, 6, 12, 10),
  star: (k) => path("M50 6l13 27 30 4-22 21 5 30-26-14-26 14 5-30L7 37l30-4z", k.g("yellow")) + hl(40, 32, 8, 5, -20),
  goal: (k) => circ(50, 50, 44, k.g("red")) + circ(50, 50, 32, "#fff") + circ(50, 50, 20, k.g("red")) + circ(50, 50, 8, "#fff") + line("M50 50l34-34", INK, 5) + path("M84 16l-2 12 12-2-6-8z", INK) + hl(30, 24, 12, 6),

  // ── Разное ──
  barcode: (k) => path("M50 8l40 18v48L50 92 10 74V26z", k.g("brown")) + path("M50 8l40 18-40 18-40-18z", k.g(["#FFD9A8", "#E8A866"])) + path("M50 44v48L10 74V26z", "#C47A3A") + line("M30 18l40 18", "#fff", 5, ` stroke-opacity=".6"`) + hl(30, 50, 6, 10, 10, 0.4),
  diary: (k) => rect(20, 4, 60, 92, 16, k.g("dark")) + rect(26, 14, 48, 70, 8, k.g("mint")) + rect(32, 24, 36, 8, 4, "#1FAE48") + rect(32, 40, 26, 6, 3, "#fff") + rect(32, 52, 32, 6, 3, "#fff") + rect(32, 64, 20, 6, 3, "#fff") + hl(34, 18, 8, 3, -10, 0.4),
  book: (k) => rect(16, 8, 66, 84, 12, k.g("purple")) + rect(16, 8, 14, 84, 6, "#7A36C0") + rect(38, 26, 34, 18, 5, "#fff", ` fill-opacity=".9"`) + hl(48, 16, 14, 4, -5, 0.5),
  note: (k) => rect(14, 10, 62, 80, 14, k.g("gray")) + line("M26 32h38M26 46h38M26 60h24", "#9AA0B0", 6) + `<g transform="rotate(40 70 56)">` + rect(64, 18, 14, 60, 5, k.g("yellow")) + path("M64 78h14l-7 14z", "#FFD9A8") + `</g>`,
  brain: (k) => path("M30 20c-14 0-22 12-18 24-8 8-6 24 6 28 2 12 18 18 28 10 4 4 4 4 4 4s0 0 4-4c10 8 26 2 28-10 12-4 14-20 6-28 4-12-4-24-18-24-6-8-18-8-20 2-2-10-14-10-20-2z", k.g("pink")) + line("M50 24v56M34 36c6 2 8 8 6 14M66 36c-6 2-8 8-6 14M30 62c6-2 12 0 14 6M70 62c-6-2-12 0-14 6", "#C02A60", 4) + hl(30, 30, 10, 5),
  ask: (k) => path("M14 46c0-20 16-34 36-34s36 14 36 34-16 34-36 34c-6 0-10-1-14-3L18 86l4-14c-5-7-8-16-8-26z", k.g("blue")) + circ(34, 46, 5, "#fff") + circ(50, 46, 5, "#fff") + circ(66, 46, 5, "#fff") + hl(32, 26, 12, 5, -15),
  lock: (k) => line("M30 44V32a20 20 0 0 1 40 0v12", k.g("gray"), 10) + rect(16, 42, 68, 50, 16, k.g("yellow")) + circ(50, 62, 7, "#A06A00") + rect(47, 64, 6, 14, 3, "#A06A00") + hl(32, 52, 10, 4, -10),
  photo: (k) => rect(6, 24, 88, 64, 18, k.g("dark")) + rect(30, 14, 26, 16, 6, k.g("dark")) + circ(50, 56, 22, "#fff") + circ(50, 56, 15, k.g("blue")) + circ(44, 50, 5, "#fff", ` fill-opacity=".8"`) + circ(78, 38, 5, k.g("yellow")) + hl(24, 34, 10, 4, -10, 0.35),
  camera: (k) => rect(6, 24, 88, 64, 18, k.g("pink")) + rect(30, 14, 26, 16, 6, k.g("pink")) + circ(50, 56, 22, "#fff") + circ(50, 56, 15, k.g("purple")) + circ(44, 50, 5, "#fff", ` fill-opacity=".8"`) + path("M80 10l3 8 8 3-8 3-3 8-3-8-8-3 8-3z", k.g("yellow")) + hl(24, 34, 10, 4, -10, 0.45),
  search: (k) => line("M62 62l26 26", k.g("brown"), 14) + circ(42, 42, 32, k.g("teal")) + circ(42, 42, 23, k.g(["#E8FFFE", "#B0F0EC"])) + hl(32, 32, 9, 5),
  write: (k) => path("M14 86l6-22 50-50 16 16-50 50z", k.g("blue")) + path("M70 14l8-8 16 16-8 8z", k.g("pink")) + path("M14 86l6-22 16 16z", "#FFD9A8") + path("M14 86l3-10 7 7z", INK) + line("M30 72l46-46", "#fff", 4, ` stroke-opacity=".5"`),
  edit: (k) => rect(8, 8, 84, 84, 22, k.g("orange")) + path("M28 74l4-14 30-30 10 10-30 30z", "#fff") + path("M66 26l4-4 10 10-4 4z", "#fff", ` fill-opacity=".8"`) + hl(30, 20, 14, 5, -10, 0.5),
  trash: (k) => rect(14, 16, 72, 12, 6, k.g("red")) + rect(38, 6, 24, 12, 5, k.g("red")) + path("M20 32h60l-6 54a8 8 0 0 1-8 6H34a8 8 0 0 1-8-6z", k.g("red")) + line("M40 44v34M60 44v34", "#fff", 5, ` stroke-opacity=".7"`) + hl(32, 40, 4, 12, 0, 0.4),
  tip: (k) => path("M50 6a32 32 0 0 0-18 58c3 3 4 6 4 10h28c0-4 1-7 4-10A32 32 0 0 0 50 6z", k.g("yellow")) + rect(36, 76, 28, 8, 4, k.g("gray")) + rect(40, 86, 20, 8, 4, k.g("gray")) + line("M42 50l8 10 8-10", "#FF8200", 4) + hl(36, 24, 8, 12, 25),
  check: (k) => rect(8, 8, 84, 84, 26, k.g("green")) + line("M28 52l14 14 30-32", "#fff", 11) + hl(30, 22, 14, 5, -10, 0.5),
  cross: (k) => rect(8, 8, 84, 84, 26, k.g("red")) + line("M34 34l32 32M66 34L34 66", "#fff", 11) + hl(30, 22, 14, 5, -10, 0.5),
  plus: (k) => rect(8, 8, 84, 84, 26, k.g("blue")) + line("M50 28v44M28 50h44", "#fff", 11) + hl(30, 22, 14, 5, -10, 0.5),
  refresh: (k) => line("M78 42a30 30 0 0 0-54-12M22 58a30 30 0 0 0 54 12", k.g("teal"), 12) + path("M84 14v30H54z", "#10B2C4") + path("M16 86V56h30z", "#10B2C4"),
  undo: (k) => rect(8, 8, 84, 84, 26, k.g("purple")) + line("M36 40h26a14 14 0 0 1 0 28H40", "#fff", 9) + path("M24 40l16-14v28z", "#fff") + hl(30, 22, 14, 5, -10, 0.5),
  skip: (k) => rect(8, 8, 84, 84, 26, k.g("gray")) + path("M20 30l26 20-26 20zM46 30l26 20-26 20z", k.g("dark")) + rect(72, 30, 8, 40, 3, "#2A2A33") + hl(30, 22, 14, 5, -10, 0.8),
  sparkles: (k) => path("M40 10l8 22 22 8-22 8-8 22-8-22-22-8 22-8z", k.g("yellow")) + path("M76 52l5 12 12 5-12 5-5 12-5-12-12-5 12-5z", k.g("pink")) + path("M74 8l3 8 8 3-8 3-3 8-3-8-8-3 8-3z", k.g("blue")),
  keyboard: (k) => rect(4, 24, 92, 56, 16, k.g("gray")) + [16, 32, 48, 64, 80].map((x) => rect(x - 5, 36, 11, 10, 3, k.g("blue"))).join("") + [24, 40, 56, 72].map((x) => rect(x - 5, 50, 11, 10, 3, k.g("blue"))).join("") + rect(26, 64, 48, 8, 4, k.g("orange")),
  party: (k) => path("M10 90l18-56 38 38z", k.g("purple")) + line("M18 66l16 16M22 52l26 26", "#FFD84D", 6) + circ(70, 18, 6, k.g("pink")) + circ(86, 44, 6, k.g("yellow")) + circ(52, 12, 4, k.g("blue")) + line("M58 40c4-10 14-12 20-6M62 52c10 0 16-6 14-16", "#1FAE48", 5) + path("M84 64l3 7 7 3-7 3-3 7-3-7-7-3 7-3z", "#FF8200"),
  profile: (k) => circ(50, 50, 44, k.g("blue")) + circ(50, 40, 16, "#fff") + path("M22 80c4-16 14-22 28-22s24 6 28 22a42 42 0 0 1-56 0z", "#fff") + hl(30, 22, 12, 5, -20, 0.45),
  help: (k) => circ(50, 50, 44, k.g("purple")) + line("M36 38a14 14 0 1 1 20 12c-4 2-6 5-6 10", "#fff", 9) + circ(50, 76, 6, "#fff") + hl(30, 24, 12, 6),
  down: (k) => circ(50, 50, 44, k.g("orange")) + line("M50 24v46M30 52l20 20 20-20", "#fff", 10) + hl(30, 24, 12, 6),

  // ── Смайлики ──
  hello: (k) => face(k) + eyes(44) + cheeks() + path("M36 60q14 14 28 0", "none", ` stroke="${INK}" stroke-width="5" stroke-linecap="round"`) + line("M84 10c6 4 8 10 8 16M76 4c8 2 14 8 16 14", "#FFBE00", 4),
  think: (k) => face(k) + eyes(44) + line("M38 66h20", INK, 5) + line("M34 30l12-4", INK, 4) + `<text x="82" y="34" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34" fill="${k.g("purple")}">?</text>`,
  sad: (k) => face(k, "sky") + eyes(46) + path("M38 70q12-10 24 0", "none", ` stroke="${INK}" stroke-width="5" stroke-linecap="round"`) + path("M70 52c3 6 3 10 0 12-3-2-3-6 0-12z", "#1C76EE"),
  shrug: (k) => face(k) + eyes(44) + line("M38 64q12 -6 24 0", INK, 5) + line("M8 40l8-8M92 40l-8-8", "#FFBE00", 5),
  ok: (k) => face(k, "green") + path("M32 42q6-8 12 0M56 42q6-8 12 0", "none", ` stroke="${INK}" stroke-width="5" stroke-linecap="round"`) + path("M34 58q16 18 32 0z", INK) + cheeks(56, 24),
  heart: (k) => path("M50 88C14 62 6 46 6 32 6 18 18 8 30 8c9 0 16 5 20 12 4-7 11-12 20-12 12 0 24 10 24 24 0 14-8 30-44 56z", k.g("pink")) + hl(28, 28, 10, 6, -30),

  // ── Цифры и квадратики шкал ──
  num1: (k) => num(k, 1, "blue"), num2: (k) => num(k, 2, "green"), num3: (k) => num(k, 3, "orange"), num4: (k) => num(k, 4, "purple"),
  sq_green: (k) => sq(k, "green"), sq_blue: (k) => sq(k, "blue"), sq_red: (k) => sq(k, "red"), sq_empty: (k) => sq(k, ["#5A5A66", "#3A3A44"]),
};

// Мягкая тень под иконкой, чтобы рисунок был объёмным
export function svgOf(name) {
  n = 0;
  const k = kit();
  const art = ICONS[name](k);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs>${k.defs.join("")}` +
    `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="1.6" flood-color="#000" flood-opacity=".22"/></filter></defs>` +
    `<g filter="url(#sh)">${art}</g></svg>\n`;
}
