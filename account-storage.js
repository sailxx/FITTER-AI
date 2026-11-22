const SESSION_MS = 30 * 86400000;
const DEVICE_LIMIT = 5;

export async function activeSession(storage, hash, now = Date.now()) {
  if (!hash) return true;
  const sessions = (await storage.get('sessions')) || [];
  return sessions.some((session) => session.hash === hash && session.expires > now);
}

export async function accountRequest(ctx, env, request) {
  const path = new URL(request.url).pathname;
  const input = await request.json();
  const now = Date.now();
  if (path === '/account/write') {
    const state = (await ctx.storage.get('account')) || { epoch: 0 };
    if (state.deleting || state.epoch !== input.epoch || !await activeSession(ctx.storage, input.session, now)) return Response.json(null, { status: 409 });
    const index = `kv:${input.key}`;
    if (input.value === null) {
      await env.DB.delete(input.key);
      await ctx.storage.delete([index]);
    } else {
      if (!await ctx.storage.get(index)) await ctx.storage.put(index, true);
      await env.DB.put(input.key, input.value, input.expirationTtl ? { expirationTtl: input.expirationTtl } : undefined);
    }
    return Response.json(true);
  }
  return ctx.storage.transaction(async (tx) => {
    if (path === '/rate') {
      const bucket = await tx.get('rate');
      const current = bucket?.until > now ? bucket : { until: now + 60000, count: 0 };
      if (current.count >= input.limit) return Response.json(false, { status: 429 });
      await tx.put('rate', { ...current, count: current.count + 1 });
      return Response.json(true);
    }
    if (path === '/account/update') {
      const ids = (await tx.get('updates')) || [];
      if (ids.includes(input.id)) return Response.json(false);
      await tx.put('updates', [...ids.slice(-127), input.id]);
      return Response.json(true);
    }
    if (path === '/link/approve') {
      if (await tx.get('link')) return Response.json(null, { status: 409 });
      await tx.put('link', input);
      return Response.json(true);
    }
    if (path === '/link/redeem') {
      const link = await tx.get('link');
      if (!link) return Response.json({ status: 'wait' });
      if (!link.uid || link.used || link.attempts >= 5) return Response.json(null, { status: 403 });
      if (!input.pin) return Response.json({ status: 'pin_required' });
      if (link.pin !== input.pin) {
        await tx.put('link', { ...link, attempts: (link.attempts || 0) + 1 });
        return Response.json({ status: 'bad_pin' });
      }
      await tx.put('link', { used: true });
      return Response.json({ uid: link.uid, epoch: link.epoch });
    }
    const state = (await tx.get('account')) || { epoch: 0, deletedAt: 0 };
    if (path === '/account/state') return Response.json(state);
    if (state.deleting || (input.epoch !== undefined && state.epoch !== input.epoch) || !await activeSession(tx, input.session, now)) {
      return Response.json(null, { status: 409 });
    }
    if (path === '/account/quota') {
      const ai = await tx.get('ai');
      const count = ai?.date === input.date ? ai.count : input.previous;
      if (count >= input.limit) return Response.json(false);
      await tx.put('ai', { date: input.date, count: count + 1 });
      return Response.json(true);
    }
    const sessions = ((await tx.get('sessions')) || []).filter((s) => s.expires > now);
    if (path === '/account/session') return Response.json(sessions.find((s) => s.hash === input.hash) || null);
    if (path === '/account/devices') return Response.json(sessions);
    if (path === '/account/add-session') {
      sessions.push({ hash: input.hash, device: input.device, at: now, expires: now + SESSION_MS });
      await tx.put('sessions', sessions.slice(-DEVICE_LIMIT));
      return Response.json(true);
    }
    if (path === '/account/revoke') {
      await tx.put('sessions', sessions.filter((s) => s.hash !== input.hash && s.hash.slice(0, 32) !== input.deviceId));
      return Response.json(true);
    }
    return Response.json(null, { status: 404 });
  });
}
