import { activeSession } from './account-storage.js';

// Strongly consistent diary changes, shared by bot, app and scheduled jobs.
export function mergeDayChanges(current, base, next) {
  const out = structuredClone(current);
  const previous = new Map((base.meals || []).map(m => [m.id, m]));
  const wanted = new Map((next.meals || []).map(m => [m.id, m]));
  const meals = new Map((out.meals || []).map(m => [m.id, m]));
  for (const id of previous.keys()) if (!wanted.has(id)) meals.delete(id);
  for (const [id, meal] of wanted) {
    if (JSON.stringify(meal) !== JSON.stringify(previous.get(id))) meals.set(id, meal);
  }
  out.meals = [...meals.values()];
  const delta = (next.water || 0) - (base.water || 0);
  if (delta) out.water = Math.min(10000, Math.max(0, (out.water || 0) + delta));
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (key === 'meals' || key === 'water') continue;
    if (key === 'pills') {
      out.pills = { ...(out.pills || {}) };
      for (const dose of new Set([...Object.keys(base.pills || {}), ...Object.keys(next.pills || {})])) {
        if (JSON.stringify(base.pills?.[dose]) === JSON.stringify(next.pills?.[dose])) continue;
        if (next.pills?.[dose] === undefined) delete out.pills[dose];
        else out.pills[dose] = next.pills[dose];
      }
    } else if (JSON.stringify(base[key]) !== JSON.stringify(next[key])) {
      if (next[key] === undefined) delete out[key]; else out[key] = next[key];
    }
  }
  return out;
}

async function isActive(tx, epoch) {
  const account = (await tx.get('account')) || { epoch: 0 };
  return !account.deleting && account.epoch === epoch;
}

async function readDays(storage, db, id, dates, epoch) {
  const keys = dates.map(date => `day:${date}`);
  const current = await storage.transaction(async tx => await isActive(tx, epoch) ? tx.get(keys) : null);
  if (current === null) return null;
  const missing = dates.filter(date => !current.has(`day:${date}`));
  if (!missing.length || epoch > 0) return keys.map(key => current.get(key) || { meals: [] });
  const legacy = await db.get(missing.map(date => `d:${id}:${date}`), 'json');
  return storage.transaction(async tx => {
    if (!await isActive(tx, epoch)) return null;
    const latest = await tx.get(keys);
    const days = [];
    for (const date of dates) {
      const key = `day:${date}`;
      const saved = latest.get(key);
      const old = legacy.get(`d:${id}:${date}`);
      if (saved) days.push(saved);
      else if (Array.isArray(old?.meals)) { await tx.put(key, old); days.push(old); }
      else days.push({ meals: [] });
    }
    return days;
  });
}

export async function diaryRequest(ctx, env, request) {
  const url = new URL(request.url);
  if (url.pathname === '/erase-days' && request.method === 'POST') {
    const keys = [...(await ctx.storage.list({ prefix: 'day:' })).keys()];
    for (let i = 0; i < keys.length; i += 100) await ctx.storage.delete(keys.slice(i, i + 100));
    return new Response('ok');
  }
  const date = url.searchParams.get('date');
  const id = url.searchParams.get('uid');
  const epoch = Number(url.searchParams.get('epoch') || 0);
  if (url.pathname === '/days' && request.method === 'GET') {
    const dates = (url.searchParams.get('dates') || '').split(',');
    if (!/^\d+$/.test(id || '') || dates.length > 60 || dates.some(value => !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
      return new Response('invalid diary keys', { status: 400 });
    }
    const days = await readDays(ctx.storage, env.DB, id, dates, epoch);
    return days ? Response.json(days) : new Response('inactive account', { status: 409 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d+$/.test(id || ''))
    return new Response('invalid diary key', { status: 400 });
  const key = `day:${date}`;
  if (request.method === 'GET') {
    const days = await readDays(ctx.storage, env.DB, id, [date], epoch);
    return days ? Response.json(days[0]) : new Response('inactive account', { status: 409 });
  }
  if (request.method === 'POST') {
    const { base, day, session } = await request.json();
    const merged = await ctx.storage.transaction(async tx => {
      if (!await isActive(tx, epoch) || !await activeSession(tx, session)) return null;
      const current = (await tx.get(key)) || { meals: [] };
      const next = mergeDayChanges(current, base, day);
      await tx.put(key, next);
      return next;
    });
    if (!merged) return new Response('inactive account', { status: 409 });
    const indexKey = `d:${id}:${date}`;
    try {
      if (merged.meals.length || merged.water || Object.keys(merged.pills || {}).length) await env.DB.put(indexKey, '1');
      else await env.DB.delete(indexKey);
    } catch { console.error('Diary activity index update failed'); }
    return Response.json(merged);
  }
  return new Response('method not allowed', { status: 405 });
}
