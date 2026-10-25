// Экраны приложения Fitter для Android, нарисованные по коду Compose (ui/Theme.kt, Kit.kt, TodayScreen.kt, MainActivity.kt).
// Все размеры в dp экрана 360×780, снаружи группа масштабируется. Цвета и скругления взяты из приложения.
export const SW = 360, SH = 780;

// Токены поверхности из Theme.kt
const TOK = {
  dark: { bg: '#000000', card: '#141417', text: '#F4F4F6', hint: '#9A9AA6', line: 'rgba(255,255,255,.08)', fill: 'rgba(255,255,255,.08)', track: 'rgba(255,255,255,.13)', dark: true },
  light: { bg: '#FFFFFF', card: '#F4F4F6', text: '#111114', hint: '#8A8A94', line: 'rgba(17,17,20,.08)', fill: 'rgba(17,17,20,.05)', track: 'rgba(19,32,26,.07)', dark: false },
};
const C = { p: '#EC6A6A', c: '#E3A35E', f: '#5C92E6', water: '#4FB3FF', waterInk: '#2A7BF0', pill: '#A98BFF', pillInk: '#7B5CF0', g1: '#2EE59D', g2: '#16B86A', g3: '#0E8F6E', ink: '#03301A' };

// Иконки приложения (res/drawable), 24×24
const I = {
  home: ['s', 'M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z', 2],
  tips: ['s', 'M12 3c.6 4.2 2.3 6.3 7 7.3-4.7 1-6.4 3.1-7 7.3-.6-4.2-2.3-6.3-7-7.3C9.7 9.3 11.4 7.2 12 3zM19 16.5v4M17 18.5h4', 2],
  camera: ['s', 'M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM15.6 13a3.6 3.6 0 1 1-7.2 0 3.6 3.6 0 1 1 7.2 0z', 2],
  dumbbell: ['s', 'M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11', 2.2],
  gear: ['s', 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z', 1.6],
  calendar: ['s', 'M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM4 10h16M9 3v4M15 3v4', 2],
  glass: ['s', 'M5.5 3h13l-1.6 17.1a1 1 0 0 1-1 .9H8.1a1 1 0 0 1-1-.9zM6.6 10.5c2-.9 3.6-.9 5.4 0s3.4.9 5.4 0', 2],
  pill: ['s', 'M10.6 4.6a4.95 4.95 0 0 1 7 7l-6 6a4.95 4.95 0 0 1-7-7zM7.6 7.6l7 7', 2],
  plus: ['s', 'M12 5v14M5 12h14', 2.4],
  scale: ['s', 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 9.5a4 4 0 0 1 8 0M12 9.5l1.6-1.8', 2],
  bolt: ['f', 'M13.5 2L4.5 13.5h6.2L9.8 22l9.2-12h-6.4z'],
  wheat: ['f', 'M11.2 22V9h1.6v13zM11.4 13.4c-3.2.2-5.5-1.8-5.7-4.8 3.1-.2 5.4 1.8 5.7 4.8zM12.6 13.4c3.2.2 5.5-1.8 5.7-4.8-3.1-.2-5.4 1.8-5.7 4.8zM11.4 18.6c-3.2.2-5.5-1.8-5.7-4.8 3.1-.2 5.4 1.8 5.7 4.8zM12.6 18.6c3.2.2 5.5-1.8 5.7-4.8-3.1-.2-5.4 1.8-5.7 4.8zM12 9.4c-1.9-1-2-4.1 0-6.2 2 2.1 1.9 5.2 0 6.2z'],
  drop: ['f', 'M12 2.5c-1.1 2-6.5 8.2-6.5 12.3a6.5 6.5 0 0 0 13 0C18.5 10.7 13.1 4.5 12 2.5z'],
  flame: ['f', 'M12.4 2.2c.7 3.6 4.9 5.5 4.9 10.6a5.3 5.3 0 0 1-10.6 0c0-2.2 1-3.6 2.2-4.8.1 1.9.9 2.9 1.9 3.2-.5-3.7-.2-6.2 1.6-9z'],
  check: ['s', 'M5.5 12.5l4.2 4.2L18.5 8', 2.6],
};

export function createPhones(K, lang = 'ru') {
  const tr = (ru, en) => (lang === 'ru' ? ru : en);
  const { T } = K;
  const tx = (x, y, s, { size = 14, w = 600, fill = '#fff', anchor, ls, op } = {}) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="${w}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}${ls ? ` letter-spacing="${ls}"` : ''}${op != null ? ` opacity="${op}"` : ''}>${T(s)}</text>`;
  const icon = (name, x, y, size, color, o = {}) => {
    const [kind, d, sw] = I[name];
    const a = kind === 's' ? `fill="none" stroke="${color}" stroke-width="${o.sw ?? sw}" stroke-linecap="round" stroke-linejoin="round"` : `fill="${color}"`;
    return `<g transform="translate(${x} ${y}) scale(${size / 24})" ${a}><path d="${d}"/></g>`;
  };
  const rect = (x, y, w, h, r, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
  const ring = (cx, cy, r, sw, pct, color, track) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${track}" stroke-width="${sw}"/>` +
    `<circle class="ring" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" pathLength="100" stroke-dasharray="${(pct * 100).toFixed(1)} 100" transform="rotate(-90 ${cx} ${cy})"/>`;

  const status = (t) =>
    tx(26, 22, '9:41', { size: 13, w: 600, fill: t.text }) +
    `<g fill="${t.text}"><rect x="296" y="14" width="3" height="8" rx="1" opacity=".5"/><rect x="301" y="12" width="3" height="10" rx="1" opacity=".75"/><rect x="306" y="10" width="3" height="12" rx="1"/>` +
    `<rect x="315" y="11" width="22" height="11" rx="3.4" fill="none" stroke="${t.text}" stroke-opacity=".6"/><rect x="317" y="13" width="14" height="7" rx="2"/></g>`;

  // ───── Блоки экрана «Сегодня» ─────
  function header(t, y, { sub, streak, week }) {
    let s = tx(20, y + 36, tr('Сегодня', 'Today'), { size: 34, w: 800, fill: t.text, ls: -0.8 }) + tx(20, y + 56, sub, { size: 14, w: 600, fill: t.hint });
    const chip = t.dark ? '#0F0F12' : t.card;
    s += rect(streak ? 232 : 304, y + 10, 40, 40, 20, week ? C.g1 : chip) + icon('calendar', (streak ? 232 : 304) + 10.5, y + 20.5, 19, week ? C.ink : t.text);
    if (streak) s += rect(280, y + 10, 60, 40, 20, chip) + icon('flame', 291, y + 21, 18, '#FF9F0A') + tx(313, y + 36, String(streak), { size: 16, w: 800, fill: t.text });
    return s;
  }

  function weekRow(t, y) {
    const wd = tr(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    const dots = ['g', 'g', 'o', 'sel', null, null, null];
    const w = 320 / 7;
    return wd.map((d, i) => {
      const x = 20 + i * w, sel = dots[i] === 'sel', future = i > 3;
      const dot = sel ? C.ink : dots[i] === 'g' ? C.g1 : dots[i] === 'o' ? '#D93A2F' : null;
      return (sel ? rect(x + 1, y, w - 2, 60, 14, C.g1) : '') +
        tx(x + w / 2, y + 17, d, { size: 12, w: 600, fill: sel ? 'rgba(3,48,26,.75)' : t.hint, anchor: 'middle', op: future ? 0.4 : 1 }) +
        tx(x + w / 2, y + 36, String(19 + i), { size: 17, w: 800, fill: sel ? C.ink : t.text, anchor: 'middle', op: future ? 0.4 : 1 }) +
        (dot ? `<circle cx="${x + w / 2}" cy="${y + 49}" r="3" fill="${dot}"/>` : '');
    }).join('');
  }

  /** Зелёная карточка калорий: градиент, блик, зерно, кольцо с огоньком. */
  function calorie(y, { left, eaten, goal, pct }) {
    const h = 158;
    let s = `<g filter="url(#ph-shadow)">${rect(20, y, 320, h, 24, 'url(#ph-cal)')}</g>`;
    s += `<g clip-path="url(#ph-calclip-${y})">${rect(20, y, 320, h, 24, 'url(#ph-calglow)')}${GRAIN.map(([gx, gy, a, r]) => `<circle cx="${(20 + gx * 320).toFixed(1)}" cy="${(y + gy * h).toFixed(1)}" r="${(r * 0.75).toFixed(2)}" fill="#fff" fill-opacity="${a.toFixed(2)}"/>`).join('')}</g>`;
    s += tx(44, y + 72, left, { size: 50, w: 800, ls: -1.8 });
    s += tx(44, y + 96, tr('Ккал осталось', 'Kcal left'), { size: 15, w: 700, fill: 'rgba(255,255,255,.95)' });
    s += tx(44, y + 117, tr(`${eaten} из ${goal} съедено`, `${eaten} of ${goal} eaten`), { size: 13, w: 600, fill: 'rgba(255,255,255,.78)' });
    s += ring(263, y + h / 2, 51.5, 15, pct, '#fff', 'rgba(255,255,255,.28)');
    s += `<circle cx="263" cy="${y + h / 2}" r="21" fill="rgba(255,255,255,.24)"/>` + icon('flame', 252, y + h / 2 - 11, 22, '#fff');
    return { s, h, defs: `<clipPath id="ph-calclip-${y}"><rect x="20" y="${y}" width="320" height="${h}" rx="24"/></clipPath>` };
  }

  /** Три плитки БЖУ: тонированы цветом нутриента. */
  function macros(t, y, items) {
    const w = (320 - 24) / 3, h = 154;
    return items.map(([ic, val, lab, pct, col], i) => {
      const x = 20 + i * (w + 12);
      return rect(x, y, w, h, 24, t.card) + rect(x, y, w, h, 24, col, `fill-opacity="${t.dark ? 0.13 : 0.1}"`) +
        tx(x + 14, y + 38, val, { size: 20, w: 800, fill: t.text, ls: -0.3 }) +
        tx(x + 14, y + 57, lab, { size: 13, w: 600, fill: t.text, op: 0.8 }) +
        ring(x + w / 2, y + 107, 28.5, 9, pct, col, t.track) +
        `<circle cx="${x + w / 2}" cy="${y + 107}" r="14" fill="${col}" fill-opacity=".18"/>` + icon(ic, x + w / 2 - 7.5, y + 99.5, 15, col);
    }).join('');
  }

  function tip(t, y, text) {
    const ls = K.wrap(text, 236, 14, 500), h = 32 + ls.length * 19;
    return rect(20, y, 320, h, 24, t.card) + rect(36, y + h / 2 - 18, 36, 36, 12, 'url(#ph-tip)') + icon('tips', 44, y + h / 2 - 10, 20, '#fff') +
      K.lines(84, y + h / 2 - (ls.length - 1) * 9.5 + 5, ls, { size: 14, weight: 500, lh: 19, fill: t.text }) + `<!--h:${h}-->`;
  }
  const tipH = (text) => 32 + K.wrap(text, 236, 14, 500).length * 19;

  function water(t, y, { val, goal, cells, on }) {
    const h = 104;
    let s = rect(20, y, 320, h, 24, t.card) + `<circle cx="60" cy="${y + 40}" r="22" fill="${C.water}" fill-opacity=".16"/>` + icon('glass', 49, y + 29, 22, t.dark ? C.water : C.waterInk);
    s += `<text x="86" y="${y + 40}" font-size="24" font-weight="800" fill="${t.text}" letter-spacing="-.5">${T(val)}<tspan font-size="14" font-weight="600" fill="${t.hint}">${T(' / ' + goal + tr(' л', ' L'))}</tspan></text>`;
    s += tx(86, y + 58, tr('Вода · 5 из 9 стаканов', 'Water · 5 of 9 glasses'), { size: 12, w: 600, fill: t.hint });
    s += `<circle cx="296" cy="${y + 40}" r="22" fill="${C.water}"/>` + icon('plus', 286, y + 30, 20, '#04263F');
    const cw = (284 - (cells - 1) * 4) / cells;
    for (let i = 0; i < cells; i++) s += rect(38 + i * (cw + 4), y + 76, cw, 10, 5, i < on ? C.water : t.track);
    return { s, h };
  }

  function pills(t, y, rows) {
    const taken = rows.filter((r) => r.on).length, h = 18 + 44 + 24 + rows.length * 52 + 8;
    let s = rect(20, y, 320, h, 24, t.card) + `<circle cx="60" cy="${y + 40}" r="22" fill="${C.pill}" fill-opacity=".16"/>` + icon('pill', 49, y + 29, 22, t.dark ? C.pill : C.pillInk);
    s += tx(86, y + 38, tr('Таблетки', 'Pills'), { size: 18, w: 800, fill: t.text }) + tx(86, y + 56, tr(`${taken} из ${rows.length} принято`, `${taken} of ${rows.length} taken`), { size: 12, w: 600, fill: t.hint });
    s += rect(38, y + 76, 284, 6, 3, t.track) + rect(38, y + 76, 284 * taken / rows.length, 6, 3, C.pill);
    rows.forEach((r, i) => {
      const ry = y + 94 + i * 52;
      if (i) s += rect(78, ry - 0.5, 244, 1, 0, t.line);
      s += r.on ? `<circle cx="52" cy="${ry + 26}" r="14" fill="${C.pill}"/>` + icon('check', 44.5, ry + 18.5, 15, '#1A1033', { sw: 3 })
        : `<circle cx="52" cy="${ry + 26}" r="13" fill="none" stroke="${t.hint}" stroke-opacity=".45" stroke-width="2"/>`;
      s += tx(78, ry + 24, r.name, { size: 15, w: 700, fill: r.on ? t.hint : t.text }) + (r.on ? `<rect x="78" y="${ry + 19}" width="${r.name.length * 8}" height="1.4" fill="${t.hint}"/>` : '') +
        tx(78, ry + 41, r.dose, { size: 12, w: 500, fill: t.hint });
      s += rect(284, ry + 14, 38, 24, 10, t.fill) + tx(303, ry + 31, r.time, { size: 13, w: 700, fill: t.hint, anchor: 'middle' });
    });
    return { s, h };
  }

  function weight(t, y) {
    const h = 94, pts = [[0, 4], [.16, 12], [.3, 10], [.46, 24], [.62, 30], [.8, 38], [1, 44]];
    const X = 176, Wd = 142, top = y + 16, line = t.dark ? C.g1 : C.g2;
    const P = pts.map(([px, py]) => [X + px * Wd, top + py]);
    const d = P.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    return rect(20, y, 320, h, 24, t.card) + icon('scale', 36, y + 18, 16, t.hint) + tx(58, y + 31, tr('Вес', 'Weight'), { size: 14, w: 700, fill: t.hint }) +
      tx(36, y + 60, tr('78,4 кг', '172.8 lb'), { size: 26, w: 800, fill: t.text, ls: -0.5 }) + tx(36, y + 79, tr('−1,6 кг с 2 окт', '−3.5 lb since Oct 2'), { size: 13, w: 800, fill: t.dark ? C.g1 : C.g3 }) +
      `<path d="${d}L${X + Wd} ${y + 78}L${X} ${y + 78}z" fill="url(#ph-wfill-${t.dark ? 'd' : 'l'})"/>` +
      `<path d="${d}" fill="none" stroke="${line}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${P.at(-1)[0]}" cy="${P.at(-1)[1]}" r="4" fill="${line}"/>`;
  }

  /** Картинка блюда: цветная подложка и нарисованная тарелка (эмодзи в SVG на GitHub могут не отрисоваться). */
  function thumb(x, y, kind, size = 86) {
    const G = { oat: ['#FBE6BD', '#C08A45'], hot: ['#FFCBA0', '#C9592E'], green: ['#B9E39A', '#4F8F3E'] }[kind.g];
    const cx = x + size / 2, cy = y + size / 2;
    const id = `ph-th-${kind.g}`;
    let s = rect(x, y, size, size, 18, `url(#${id})`) + rect(x, y, size, size, 18, 'url(#ph-thgloss)');
    s += `<circle cx="${cx}" cy="${cy + 2}" r="${size * 0.35}" fill="#fff" fill-opacity=".92"/><circle cx="${cx}" cy="${cy + 2}" r="${size * 0.27}" fill="${kind.c}"/>`;
    s += kind.deco.map(([dx, dy, r, col]) => `<circle cx="${cx + dx}" cy="${cy + 2 + dy}" r="${r}" fill="${col}"/>`).join('');
    return { s, def: `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${G[0]}"/><stop offset="1" stop-color="${G[1]}"/></linearGradient>` };
  }
  const FOODS = {
    oat: { g: 'oat', c: '#E9C78F', deco: [[-8, -6, 7, '#FFE08A'], [6, -2, 6, '#FFF2C9'], [-2, 9, 5, '#8E5B2E'], [10, 8, 3.5, '#C94F4F']] },
    hot: { g: 'hot', c: '#FFF0DA', deco: [[-9, -5, 8, '#F4A25C'], [7, -8, 6, '#6FB35A'], [5, 8, 7, '#FFFFFF'], [-8, 8, 4, '#E85D3F']] },
    green: { g: 'green', c: '#7CC15E', deco: [[-8, -6, 6, '#E85D3F'], [6, -4, 5, '#F7F1D8'], [-4, 8, 6, '#2F7D3A'], [9, 8, 4, '#4A2C2A']] },
  };
  const thumbDefs = Object.keys(FOODS).map((k) => thumb(0, 0, FOODS[k]).def).join('') +
    '<linearGradient id="ph-thgloss" x1="0" y1="0" x2=".5" y2=".5"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>';

  function meal(t, y, m) {
    const h = 110;
    let s = rect(20, y, 320, h, 24, t.card) + thumb(32, y + 12, FOODS[m.k]).s;
    s += tx(132, y + 36, m.title, { size: 16, w: 800, fill: t.text });
    s += rect(292, y + 20, 38, 22, 10, t.fill) + tx(311, y + 35, m.time, { size: 12, w: 700, fill: t.hint, anchor: 'middle' });
    s += `<circle cx="141" cy="${y + 60}" r="9" fill="url(#ph-cal)"/>` + icon('flame', 135, y + 54, 12, '#fff') + tx(155, y + 66, `${m.kcal} ${tr('ккал', 'kcal')}`, { size: 17, w: 800, fill: t.text });
    [['bolt', C.p, m.p], ['wheat', C.c, m.c], ['drop', C.f, m.f]].forEach(([ic, col, g], i) =>
      s += icon(ic, 132 + i * 66, y + 79, 14, col) + tx(150 + i * 66, y + 91, `${g} ${tr('г', 'g')}`, { size: 13, w: 700, fill: t.hint }));
    return s;
  }

  function nav(t, active) {
    const y = 678, h = 68, bar = t.dark
      ? `<rect x="16" y="${y}" width="328" height="${h}" rx="34" fill="url(#ph-barD)"/>`
      : `<rect x="16" y="${y}" width="328" height="${h}" rx="34" fill="url(#ph-barL)"/>`;
    let s = `<g filter="url(#ph-barshadow)">${bar}</g><rect x="16.6" y="${y + .6}" width="326.8" height="${h - 1.2}" rx="33.4" fill="none" stroke="${t.dark ? 'url(#ph-rimD)' : 'url(#ph-rimL)'}" stroke-width="1.2"/>`;
    s += `<rect x="42" y="${y + 3}" width="164" height="13" rx="7" fill="#fff" fill-opacity="${t.dark ? 0.08 : 0.55}"/>`;
    const cy = y + h / 2, tab = (cx, name, on) =>
      (on ? `<circle cx="${cx}" cy="${cy}" r="25" fill="${t.dark ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.9)'}" stroke="${t.dark ? 'rgba(255,255,255,.28)' : '#fff'}"/>` : '') +
      icon(name, cx - 12, cy - 12, 24, t.text, { }).replace('<g ', `<g opacity="${on ? 1 : 0.55}" `);
    s += tab(50, 'home', active === 0) + tab(113, 'tips', active === 1) + tab(247, 'dumbbell', active === 3) + tab(310, 'gear', active === 4);
    s += `<g filter="url(#ph-camshadow)"><circle cx="180" cy="${cy}" r="29" fill="${t.dark ? 'url(#ph-camD)' : 'url(#ph-camL)'}"/></g><circle cx="180" cy="${cy}" r="28.5" fill="none" stroke="#fff" stroke-opacity=".22"/>` + icon('camera', 167, cy - 13, 26, '#fff');
    return s;
  }

  const bg = (t) => rect(0, 0, SW, SH, 0, t.bg) + (t.dark ? `<circle cx="306" cy="0" r="400" fill="url(#ph-purple)"/>` : '');

  // ───── Экраны ─────
  const extra = [];
  function screen(kind) {
    const t = kind === 'light' ? TOK.light : TOK.dark;
    let s = bg(t) + status(t), y;
    if (kind === 'today') {
      s += header(t, 38, { sub: tr('четверг, 22 октября', 'Thursday, October 22'), streak: 12 });
      let c = calorie(112, { left: '842', eaten: '1 398', goal: '2 240', pct: 0.624 }); extra.push(c.defs); s += c.s;
      s += macros(t, 282, [['bolt', tr('28 г', '28 g'), tr('Белков ост.', 'Protein left'), 0.8, C.p], ['wheat', tr('102 г', '102 g'), tr('Углев. ост.', 'Carbs left'), 0.59, C.c], ['drop', tr('18 г', '18 g'), tr('Жиров ост.', 'Fat left'), 0.74, C.f]]);
      const tt = tr('Сильнее всего не хватает углеводов: добери 102 г — например, порция каши, хлеб или фрукт.', 'Carbs are what you are short on: add 102 g, for example a bowl of porridge, bread or fruit.');
      s += tip(t, 448, tt).replace(/<!--h:\d+-->/, '');
      s += water(t, 448 + tipH(tt) + 12, { val: '1,25', goal: '2,1', cells: 9, on: 5 }).s;
      s += nav(t, 0);
    } else if (kind === 'light') {
      s += header(t, 38, { sub: tr('четверг, 22 октября', 'Thursday, October 22'), streak: 12, week: true });
      s += weekRow(t, 104);
      let c = calorie(178, { left: '842', eaten: '1 398', goal: '2 240', pct: 0.624 }); extra.push(c.defs); s += c.s;
      s += macros(t, 348, [['bolt', tr('28 г', '28 g'), tr('Белков ост.', 'Protein left'), 0.8, C.p], ['wheat', tr('102 г', '102 g'), tr('Углев. ост.', 'Carbs left'), 0.59, C.c], ['drop', tr('18 г', '18 g'), tr('Жиров ост.', 'Fat left'), 0.74, C.f]]);
      s += water(t, 514, { val: '1,25', goal: '2,1', cells: 9, on: 5 }).s;
      s += tx(22, 664, tr('Недавно добавлено', 'Recently added'), { size: 20, w: 800, fill: t.text, ls: -0.3 });
      s += nav(t, 0);
    } else {
      const p = pills(t, 46, [
        { name: tr('Витамин D', 'Vitamin D'), dose: tr('1 капсула', '1 capsule'), time: '08:00', on: true },
        { name: tr('Омега-3', 'Omega-3'), dose: tr('1 капсула', '1 capsule'), time: '13:00' },
        { name: tr('Магний B6', 'Magnesium B6'), dose: tr('1 таблетка', '1 tablet'), time: '21:00' },
      ]);
      s += p.s + weight(t, 46 + p.h + 12);
      const ty = 46 + p.h + 12 + 94 + 26;
      s += tx(22, ty + 20, tr('Недавно добавлено', 'Recently added'), { size: 20, w: 800, fill: t.text, ls: -0.3 }) + tx(338, ty + 19, tr('1 238 ккал', '1,238 kcal'), { size: 13, w: 600, fill: t.hint, anchor: 'end' });
      let my = ty + 38;
      for (const m of [
        { k: 'green', title: tr('Греческий салат', 'Greek salad'), time: '15:40', kcal: '240', p: 8, c: 12, f: 18 },
        { k: 'hot', title: tr('Курица с рисом', 'Chicken with rice'), time: '13:05', kcal: '586', p: 42, c: 61, f: 14 },
        { k: 'oat', title: tr('Овсянка с бананом', 'Oatmeal with banana'), time: '08:12', kcal: '412', p: 14, c: 68, f: 9 },
      ]) { s += meal(t, my, m); my += 122; }
      s += nav(t, 0);
    }
    return s;
  }

  const defs = `
<linearGradient id="ph-cal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5BEF5E"/><stop offset=".5" stop-color="#22D97A"/><stop offset="1" stop-color="#2CD3B4"/></linearGradient>
<radialGradient id="ph-calglow" cx=".18" cy=".05" r=".6"><stop offset="0" stop-color="#E9FFD8" stop-opacity=".4"/><stop offset="1" stop-color="#E9FFD8" stop-opacity="0"/></radialGradient>
<linearGradient id="ph-tip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.g1}"/><stop offset="1" stop-color="${C.g2}"/></linearGradient>
<radialGradient id="ph-purple" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#2E2A3A"/><stop offset="1" stop-color="#2E2A3A" stop-opacity="0"/></radialGradient>
<linearGradient id="ph-barD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2C2C33" stop-opacity=".92"/><stop offset="1" stop-color="#141418" stop-opacity=".96"/></linearGradient>
<linearGradient id="ph-barL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".97"/><stop offset="1" stop-color="#F2F4F7" stop-opacity=".95"/></linearGradient>
<linearGradient id="ph-rimD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity=".16"/></linearGradient>
<linearGradient id="ph-rimL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#fff"/></linearGradient>
<linearGradient id="ph-camD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#484852"/><stop offset="1" stop-color="#2A2A31"/></linearGradient>
<linearGradient id="ph-camL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2D35"/><stop offset="1" stop-color="#0A0B0E"/></linearGradient>
<linearGradient id="ph-wfill-d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.g1}" stop-opacity=".35"/><stop offset="1" stop-color="${C.g1}" stop-opacity="0"/></linearGradient>
<linearGradient id="ph-wfill-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.g2}" stop-opacity=".35"/><stop offset="1" stop-color="${C.g2}" stop-opacity="0"/></linearGradient>
<filter id="ph-shadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#1ED38A" flood-opacity=".4"/></filter>
<filter id="ph-barshadow" x="-10%" y="-40%" width="120%" height="200%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity=".45"/></filter>
<filter id="ph-camshadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity=".5"/></filter>
<clipPath id="ph-scr"><rect width="${SW}" height="${SH}" rx="40"/></clipPath>
${thumbDefs}`;

  /** Телефон: рамка с «дыркой» камеры и экран, масштаб s, левый верхний угол рамки в (x, y). */
  function phone(x, y, kind, s, delayCss) {
    const pad = 9, w = SW * s + pad * 2, h = SH * s + pad * 2;
    const body = `<g transform="translate(${x} ${y})"><g class="r" ${delayCss}>
<rect x="0" y="0" width="${w}" height="${h}" rx="${(40 * s + pad).toFixed(1)}" fill="#050505" stroke="#fff" stroke-opacity=".14" stroke-width="1.4"/>
<rect x=".7" y=".7" width="${w - 1.4}" height="${h - 1.4}" rx="${(40 * s + pad - .7).toFixed(1)}" fill="none" stroke="#fff" stroke-opacity=".06"/>
<g transform="translate(${pad} ${pad}) scale(${s})"><g clip-path="url(#ph-scr)">${screen(kind)}<circle cx="180" cy="16" r="7" fill="#000"/><circle cx="180" cy="16" r="7" fill="none" stroke="#fff" stroke-opacity=".12"/></g></g>
</g></g>`;
    return { body, w, h };
  }

  return { phone, defs: () => defs + extra.join(''), css: '.ring{animation:ringin 1.5s cubic-bezier(.2,.8,.2,1) .5s backwards}@keyframes ringin{from{stroke-dasharray:0 100}}@media (prefers-reduced-motion:reduce){.ring{animation:none}}' };
}

// Зерно на зелёной карточке: одни и те же точки при каждой сборке
const GRAIN = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 90 }, () => [rnd(), rnd(), 0.08 + rnd() * 0.16, 0.4 + rnd() * 0.6]);
})();
