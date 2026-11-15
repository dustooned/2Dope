/**
 * Copy in one 2Dope tab, paste in another (same site, same browser).
 *
 * Every Copy writes a small header to a dedicated IndexedDB database; a frame or layer copy also
 * writes its body (the drawing snapshots, layer JSON and caption fonts) once its pictures are
 * encoded. The system clipboard only ever holds the token text (`2Dope clipboard <uuid>`), never the
 * art itself, so nothing leaves this origin: IndexedDB and Web Locks are per-origin by design.
 *
 * Why IndexedDB rather than a BroadcastChannel request/answer: the copying tab does not have to be
 * awake when the other tab pastes. Browsers freeze background tabs (iPad Safari almost at once),
 * and a frozen or closed tab cannot answer a message, while a stored record can still be read.
 * The copying tab holds a Web Lock named after the copy until its body is written, so a pasting
 * tab can wait for it and tell "still encoding" (lock held: wait, then time out) from "closed
 * before it finished" (lock released, record still pending).
 *
 * Only the newest copy is kept (keys `head` and `body`); each new Copy replaces it, and a record
 * older than a day is removed the next time 2Dope opens.
 */

export type ShareKind = 'art' | 'keys' | 'frames' | 'layers';
export interface ShareHead { v: 1; id: string; token: string | null; tab: string; at: number; kind: ShareKind; state: 'pending' | 'ready' | 'failed' }
interface ShareBody { id: string; data: unknown }

export const TOKEN_PREFIX = '2Dope clipboard ';
export const isToken = (text: string): boolean => text.startsWith(TOKEN_PREFIX);
export const newToken = (): string => `${TOKEN_PREFIX}${crypto.randomUUID()}`;

/** This tab, for telling its own copies from other tabs'. */
export const TAB = crypto.randomUUID();
/** How long a paste waits for another tab still encoding its copy (fixtures shorten it). */
export const crossTab = { timeout: 20000 };

export const messages = {
  stale: 'That copy is out of date: something newer was copied in 2Dope since. Copy it again.',
  missing: 'That copy came from a 2Dope window this tab cannot reach (another browser or a private window). Copy it again here, or move it as a .2dope file.',
  closed: 'The 2Dope tab that made this copy was closed before the copy was ready. Copy it again.',
  timeout: 'The other 2Dope tab has not finished the copy yet. Bring that tab to the front for a moment, then paste again.',
  failed: 'That copy is too big to pass to another tab. Move it with My Assets or a .2dope file.',
  waiting: 'Getting the copy from the other 2Dope tab…',
};

const DB = '2dope-clipboard', STORE = 'copy', DAY = 24 * 3600 * 1000;
let db: Promise<IDBDatabase | null> | null = null;
let lastOwn = 0, lastOwnId = '';

function open(): Promise<IDBDatabase | null> {
  if (db) return db;
  db = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => { const d = req.result; d.onversionchange = () => { d.close(); db = null; }; resolve(d); };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return db;
}

const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('aborted')); });
const get = <T>(store: IDBObjectStore, key: string) => new Promise<T | undefined>((resolve, reject) => { const r = store.get(key); r.onsuccess = () => resolve(r.result as T | undefined); r.onerror = () => reject(r.error); });

async function read<T>(key: 'head' | 'body'): Promise<T | null> {
  const d = await open();
  if (!d) return null;
  try { return (await get<T>(d.transaction(STORE).objectStore(STORE), key)) ?? null; } catch { return null; }
}
export const readHead = (): Promise<ShareHead | null> => read<ShareHead>('head');

/** A promise that gives up (null) after `ms`, so a stuck database never blocks a paste. */
const within = <T>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

const lockName = (id: string) => `2dope-clipboard:${id}`;

/**
 * Offer a Copy made in this tab to other tabs. `body` (frames and layers) resolves to what the
 * other tab needs to paste; until it is written the header says pending.
 */
export function share(kind: ShareKind, token: string | null, body?: Promise<unknown>): void {
  const id = crypto.randomUUID(), at = Math.max(Date.now(), lastOwn + 1);
  lastOwn = at; lastOwnId = id;
  const head: ShareHead = { v: 1, id, token, tab: TAB, at, kind, state: body ? 'pending' : 'ready' };
  const run = async () => {
    const d = await open();
    if (!d) return;
    try {
      const tx = d.transaction(STORE, 'readwrite'), s = tx.objectStore(STORE);
      s.put(head, 'head'); s.delete('body');
      await done(tx);
    } catch { return; }
    if (!body) return;
    let data: unknown, ok = true;
    try { data = await body; } catch { ok = false; }
    if (lastOwnId !== id) return; // this tab copied again meanwhile
    const finish = async (state: 'ready' | 'failed', withBody: boolean) => {
      const tx = d.transaction(STORE, 'readwrite'), s = tx.objectStore(STORE);
      const now = await get<ShareHead>(s, 'head');
      if (now?.id !== id) { tx.abort(); return; } // another tab copied meanwhile
      if (withBody) s.put({ id, data } satisfies ShareBody, 'body');
      s.put({ ...head, state }, 'head');
      await done(tx).catch(() => {});
    };
    try { await finish(ok ? 'ready' : 'failed', ok); } catch { try { await finish('failed', false); } catch { /* the database went away */ } }
  };
  if (navigator.locks) void navigator.locks.request(lockName(id), run).catch(() => {});
  else void run().catch(() => {});
}

/**
 * The newest copy, when it came from another tab after this tab's own last copy (for paste
 * commands that do not read the system clipboard, such as the X-sheet's Ctrl+V and the frame menu).
 */
export async function newerElsewhere(kind: ShareKind): Promise<ShareHead | null> {
  const h = await within(readHead(), 500);
  return h && h.tab !== TAB && h.at > lastOwn && h.kind === kind ? h : null;
}

/**
 * The copy that a clipboard token stands for: `head` when it is the newest copy (a copy from
 * another tab's X-sheet, which writes no token, counts when it is newer than this tab's own);
 * `stale` when something newer replaced it; `missing` when no copy is recorded at all.
 */
export async function headFor(token: string): Promise<ShareHead | 'stale' | 'missing'> {
  const h = await within(readHead(), 1000);
  if (!h) return 'missing';
  if (h.token === token || (h.token === null && h.tab !== TAB && h.at > lastOwn)) return h;
  return 'stale';
}

/** Wait until the copy's lock is free: true when it was released, false on timeout, null without Web Locks. */
async function waitLock(id: string, ms: number): Promise<boolean | null> {
  if (!navigator.locks) return null;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try { await navigator.locks.request(lockName(id), { signal: ctl.signal }, async () => {}); return true; } catch { return false; } finally { clearTimeout(timer); }
}

/** The body of another tab's copy, or a message saying why it cannot be pasted. */
export async function receive<T>(head: ShareHead, notice: (m: string) => void): Promise<{ body: T } | { message: string }> {
  let h: ShareHead | null = head;
  if (h.state === 'pending') {
    notice(messages.waiting);
    const released = await waitLock(h.id, crossTab.timeout);
    if (released === null) { // no Web Locks: watch the record instead
      const end = performance.now() + crossTab.timeout;
      for (;;) {
        const now = await readHead();
        if (now?.id !== head.id || now.state !== 'pending' || performance.now() >= end) break;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    h = await readHead();
    if (!h || h.id !== head.id) return { message: messages.stale };
    if (h.state === 'pending') return { message: released ? messages.closed : messages.timeout };
  }
  if (h.state === 'failed') return { message: messages.failed };
  const body = await read<ShareBody>('body');
  if (!body || body.id !== h.id) return { message: messages.stale };
  return { body: body.data as T };
}

/** Drop a copy older than a day (called once when 2Dope opens). */
export async function sweep(): Promise<void> {
  const h = await within(readHead(), 1000), d = await open();
  if (!h || !d || Date.now() - h.at < DAY) return;
  try { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); await done(tx); } catch { /* ignore */ }
}
