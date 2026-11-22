import { Live } from '../worker.js';

// A storage adapter only: requests still execute the real Durable Object handler.
export function attachDiary(env) {
  const objects = new Map();
  const namespace = {
    idFromName: n => String(n),
    get(id) {
      if (!objects.has(id)) {
        const m = new Map();
        let tail = Promise.resolve();
        const storage = {
          get: async k => Array.isArray(k) ? new Map(k.filter(key => m.has(key)).map(key => [key, structuredClone(m.get(key))])) : structuredClone(m.get(k)),
          put: async (k,v) => { m.set(k,structuredClone(v)); },
          list: async ({prefix}) => new Map([...m].filter(([k]) => k.startsWith(prefix))),
          delete: async keys => { for (const k of keys) m.delete(k); },
          transaction(fn) { const result = tail.then(() => fn(storage)); tail = result.catch(() => {}); return result; },
        };
        const sockets = [];
        const live = new Live({ storage, getWebSockets: () => sockets }, env);
        objects.set(id, { m, sockets, fetch: (url, options) => live.fetch(url instanceof Request ? url : new Request(url, options)) });
      }
      return objects.get(id);
    },
  };
  const kvGet = env.DB.get.bind(env.DB), kvPut = env.DB.put.bind(env.DB), kvDelete = env.DB.delete.bind(env.DB);
  env.DB.get = async (key, type) => {
    if (Array.isArray(key)) return new Map(await Promise.all(key.map(async k => [k, await env.DB.get(k, type)])));
    const match = key.match(/^d:(\d+):(.+)$/);
    const day = match && namespace.get(match[1]).m.get(`day:${match[2]}`);
    if (match && day !== undefined) return type === 'json' ? structuredClone(day) : JSON.stringify(day);
    return kvGet(key,type);
  };
  env.DB.put = async (key,value) => {
    const match = key.match(/^d:(\d+):(.+)$/);
    if (match && value !== '1') namespace.get(match[1]).m.set(`day:${match[2]}`,JSON.parse(value));
    return kvPut(key,value);
  };
  env.DB.delete = async key => {
    const match = key.match(/^d:(\d+):(.+)$/);
    if (match) namespace.get(match[1]).m.delete(`day:${match[2]}`);
    return kvDelete(key);
  };
  env.LIVE = namespace;
  return namespace;
}
