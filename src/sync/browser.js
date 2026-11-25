/**
 * Generic browser snapshot-sync SDK.
 *
 * It is deliberately business-agnostic: the host application supplies three
 * functions and the SDK takes care of enrollment, token/session persistence,
 * pull → merge → import → push, conflict retries, and scheduling.
 *
 *   exportAll()            -> Promise<snapshot>
 *   importAll(snapshot)    -> Promise<void>
 *   merge(local, remote)   -> merged snapshot   (optional; a policy-based
 *                                                 default lives in merge.js)
 *
 * The SDK never inspects what is inside a snapshot and never writes to it.
 *
 * Typical wiring:
 *
 *   const sync = createSnapshotSync({
 *     baseUrl: '/sync',
 *     exportAll: () => adapter.exportAll(),
 *     importAll: (snapshot) => adapter.importAll(snapshot),
 *     policies: {
 *       attempts: { mode: 'union' },
 *       wordStates: { mode: 'lww', key: 'wordId' },
 *       words: { mode: 'content' },
 *     },
 *   });
 *   await sync.init();
 *   sync.start();                       // 30s interval + online/visibility
 *   sync.markDirty();                   // after a local write
 */

import { createSyncClient, SyncHttpError } from './client.js';
import { mergeSnapshots as mergeByPolicy } from './merge.js';

export { SyncHttpError };
export { mergeSnapshots, unionRecords, latestWins, defaultRevisionOf } from './merge.js';

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_DEBOUNCE_MS = 800;

/**
 * In-memory Storage-compatible object. Useful for tests, workers, and
 * environments where localStorage is unavailable.
 */
export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
  };
}

function defaultStorage() {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // Access can throw in private mode or sandboxed iframes.
  }
  return createMemoryStorage();
}

function withTimeout(fetchImpl, timeoutMs) {
  if (!(timeoutMs > 0)) return fetchImpl;
  return async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof timer?.unref === 'function') timer.unref();
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

/** A high-entropy idempotency key for bootstrap enrollment. */
export function createRequestId() {
  const random = globalThis.crypto?.randomUUID;
  if (typeof random === 'function') return random.call(globalThis.crypto);
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * @param {{
 *   baseUrl?: string|null,
 *   storage?: Storage|{getItem:Function,setItem:Function,removeItem:Function}|null,
 *   keyPrefix?: string,
 *   fetchImpl?: typeof fetch,
 *   credentials?: RequestCredentials,
 *   timeoutMs?: number,
 *   exportAll?: (() => Promise<any>)|null,
 *   importAll?: ((snapshot: any) => Promise<void>)|null,
 *   merge?: ((local: any, remote: any, context: any) => any|Promise<any>)|null,
 *   policies?: Record<string, import('./merge.js').Policy>,
 *   defaultPolicy?: import('./merge.js').Policy,
 *   preferRemoteOnFirstBind?: boolean,
 *   onChange?: ((status: object) => void)|null,
 *   autoSync?: {intervalMs?: number, debounceMs?: number}|null,
 *   syncLockName?: string|null,
 *   maxConflictRetries?: number,
 *   storeToken?: boolean,
 *   detectCookieSession?: boolean,
 * }} [options]
 */
export function createSnapshotSync({
  baseUrl = null,
  storage = null,
  keyPrefix = 'snapshotSync.',
  fetchImpl = globalThis.fetch,
  credentials = 'same-origin',
  timeoutMs = 8000,
  exportAll = null,
  importAll = null,
  merge = null,
  policies = {},
  defaultPolicy = undefined,
  preferRemoteOnFirstBind = true,
  onChange = null,
  autoSync = null,
  syncLockName = null,
  maxConflictRetries = 3,
  storeToken = true,
  detectCookieSession = true,
} = {}) {
  const store = storage ?? defaultStorage();
  const keys = {
    baseUrl: `${keyPrefix}baseUrl`,
    token: `${keyPrefix}deviceToken`,
    projectId: `${keyPrefix}projectId`,
    deviceId: `${keyPrefix}deviceId`,
    lastRevision: `${keyPrefix}lastRevision`,
    lastSyncAt: `${keyPrefix}lastSyncAt`,
    firstBind: `${keyPrefix}firstBind`,
    pending: `${keyPrefix}pending`,
    session: `${keyPrefix}session`,
  };

  const read = (key) => {
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    if (value === undefined || value === null || value === '') {
      try {
        store.removeItem(key);
      } catch {
        /* storage may be unavailable */
      }
      return;
    }
    try {
      store.setItem(key, String(value));
    } catch {
      /* quota or private mode: keep working, just without persistence */
    }
  };

  let base = String(baseUrl ?? read(keys.baseUrl) ?? '').replace(/\/+$/, '');
  if (base) write(keys.baseUrl, base);
  let sessionMode = read(keys.session) === 'cookie' ? 'cookie' : 'bearer';

  let status = {
    state: 'idle',
    error: null,
    revision: Number(read(keys.lastRevision) ?? 0) || 0,
    lastSyncAt: Number(read(keys.lastSyncAt) ?? 0) || null,
    pending: read(keys.pending) === '1',
  };
  let syncing = false;
  let retryTimer = null;
  let intervalTimer = null;
  let onlineHandler = null;
  let visibilityHandler = null;

  const client = () =>
    createSyncClient({
      baseUrl: base,
      deviceToken: storeToken ? read(keys.token) : null,
      fetchImpl: withTimeout(fetchImpl, timeoutMs),
      credentials,
    });

  const setStatus = (state, error = null) => {
    status = { ...status, state, error, pending: read(keys.pending) === '1' };
    if (state === 'synced') {
      status.lastSyncAt = Number(read(keys.lastSyncAt) ?? 0) || Date.now();
      status.revision = Number(read(keys.lastRevision) ?? 0) || 0;
    }
    try {
      onChange?.({ ...status });
    } catch (listenerError) {
      console.error('[snapshot-sync] onChange listener failed', listenerError);
    }
  };

  const markSynced = (revision) => {
    write(keys.lastRevision, revision);
    write(keys.lastSyncAt, Date.now());
    write(keys.pending, '');
    write(keys.firstBind, '');
  };

  async function withCrossTabLock(fn) {
    const locks = globalThis.navigator?.locks;
    if (!locks || typeof locks.request !== 'function') return fn();
    const name = syncLockName ?? `snapshot-sync:${keyPrefix}`;
    return locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return { state: 'locked', revision: null };
      return fn();
    });
  }

  async function runSync() {
    let lastError = null;
    for (let attempt = 0; attempt <= maxConflictRetries; attempt += 1) {
      try {
        const remote = await client().pull();
        const local = await exportAll();
        const context = {
          firstBind: read(keys.firstBind) === '1',
          baseRevision: remote?.revision ?? 0,
        };
        const merged = merge
          ? await merge(local, remote?.snapshot ?? null, context)
          : mergeByPolicy(local, remote?.snapshot ?? null, {
            policies,
            ...(defaultPolicy ? { defaultPolicy } : {}),
            preferRemote: preferRemoteOnFirstBind && context.firstBind,
          });
        await importAll(merged);
        const pushed = await client().push({
          baseRevision: remote?.revision ?? 0,
          snapshot: merged,
        });
        markSynced(pushed.revision);
        setStatus('synced');
        return { state: 'synced', revision: pushed.revision };
      } catch (error) {
        lastError = error;
        if (error instanceof SyncHttpError && error.status === 409 && attempt < maxConflictRetries) {
          continue;
        }
        throw error;
      }
    }
    throw lastError ?? new Error('sync failed');
  }

  const api = {
    get baseUrl() {
      return base;
    },
    get deviceToken() {
      return storeToken ? read(keys.token) : null;
    },
    get projectId() {
      return read(keys.projectId);
    },
    get sessionMode() {
      return sessionMode;
    },
    get lastRevision() {
      return Number(read(keys.lastRevision) ?? 0) || 0;
    },
    get lastSyncAt() {
      return Number(read(keys.lastSyncAt) ?? 0) || null;
    },
    get firstBind() {
      return read(keys.firstBind) === '1';
    },
    get pending() {
      return read(keys.pending) === '1';
    },
    get status() {
      return { ...status };
    },
    get configured() {
      return Boolean(base) && (Boolean(read(keys.token)) || sessionMode === 'cookie');
    },

    /**
     * Restore persisted state and, when no token is stored, detect an existing
     * HttpOnly session cookie. Never throws for connectivity problems.
     * @returns {Promise<object|null>} identity when already enrolled
     */
    async init() {
      if (!base) {
        setStatus('unconfigured');
        return null;
      }
      write(keys.baseUrl, base);
      if (!read(keys.token) && !detectCookieSession) {
        setStatus('unconfigured');
        return null;
      }
      try {
        const identity = await api.me();
        if (!read(keys.token)) {
          sessionMode = 'cookie';
          write(keys.session, 'cookie');
        }
        setStatus('idle');
        return identity;
      } catch (error) {
        if (error instanceof SyncHttpError && error.status === 401) {
          sessionMode = 'bearer';
          write(keys.session, '');
          write(keys.token, '');
          setStatus('unconfigured');
          return null;
        }
        setStatus('offline', String(error?.message ?? error));
        return null;
      }
    },

    /**
     * Enroll this browser. Exactly one of bootstrapCode / projectId /
     * pairingCode is required. Pass `requestId` with bootstrapCode to make
     * retries idempotent.
     */
    async enroll(input) {
      const result = await client().enroll(input);
      if (storeToken) write(keys.token, result.deviceToken);
      write(keys.projectId, result.projectId);
      write(keys.deviceId, result.device?.id);
      sessionMode = 'bearer';
      write(keys.session, 'bearer');
      if (input?.pairingCode) write(keys.firstBind, '1');
      else write(keys.firstBind, '');
      setStatus('idle');
      return result;
    },

    async me() {
      return client().me();
    },

    async createPairingCode({ ttlSeconds = 600 } = {}) {
      return client().createPairingCode({ ttlSeconds });
    },

    /** @returns {Promise<{revision:number,snapshot:object}|null>} */
    async pull() {
      return client().pull();
    },

    async push({ baseRevision, snapshot }) {
      return client().push({ baseRevision, snapshot });
    },

    /**
     * One full sync round: pull → merge → importAll → push.
     * Resolves with a state instead of throwing so callers can stay offline.
     * @returns {Promise<{state: string, revision: number|null, error?: string}>}
     */
    async syncNow() {
      if (typeof exportAll !== 'function' || typeof importAll !== 'function') {
        throw new TypeError('exportAll and importAll are required to sync');
      }
      if (!api.configured) {
        setStatus('unconfigured');
        return { state: 'unconfigured', revision: null };
      }
      if (syncing) return { state: 'busy', revision: null };
      syncing = true;
      setStatus('syncing');
      try {
        const outcome = await withCrossTabLock(runSync);
        if (outcome.state === 'locked') setStatus('idle');
        return outcome;
      } catch (error) {
        if (error instanceof SyncHttpError && error.status === 401) {
          setStatus('unauthorized', 'device token rejected');
          return { state: 'unauthorized', revision: null, error: 'device token rejected' };
        }
        if (error instanceof SyncHttpError) {
          const message = error.body?.error ?? error.message;
          setStatus('offline', message);
          return { state: 'offline', revision: null, error: message };
        }
        if (error?.name === 'AbortError') {
          setStatus('offline', 'request timeout');
          return { state: 'offline', revision: null, error: 'request timeout' };
        }
        if (error instanceof TypeError && /fetch|network/i.test(String(error.message))) {
          setStatus('offline', String(error.message));
          return { state: 'offline', revision: null, error: String(error.message) };
        }
        const message = String(error?.message ?? error);
        setStatus('error', message);
        return { state: 'error', revision: null, error: message };
      } finally {
        syncing = false;
      }
    },

    /** Debounced sync; safe to call after every local write. */
    requestSync(delayMs = DEFAULT_DEBOUNCE_MS) {
      if (!base) return;
      write(keys.pending, '1');
      status = { ...status, pending: true };
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void api.syncNow();
      }, Math.max(0, delayMs));
      if (typeof retryTimer?.unref === 'function') retryTimer.unref();
    },

    /** Mark local data as changed and schedule a sync. */
    markDirty(delayMs = DEFAULT_DEBOUNCE_MS) {
      api.requestSync(delayMs);
    },

    /** Periodic sync plus online / visibility recovery. */
    start({ intervalMs = autoSync?.intervalMs ?? DEFAULT_INTERVAL_MS } = {}) {
      api.stop();
      if (!api.configured) return false;
      intervalTimer = setInterval(() => {
        void api.syncNow();
      }, Math.max(5000, intervalMs));
      if (typeof intervalTimer?.unref === 'function') intervalTimer.unref();
      if (typeof globalThis.addEventListener === 'function') {
        onlineHandler = () => {
          void api.syncNow();
        };
        globalThis.addEventListener('online', onlineHandler);
        if (typeof document !== 'undefined' && document.addEventListener) {
          visibilityHandler = () => {
            if (document.visibilityState === 'visible') api.requestSync(0);
          };
          document.addEventListener('visibilitychange', visibilityHandler);
        }
      }
      api.requestSync(0);
      return true;
    },

    stop() {
      if (intervalTimer) clearInterval(intervalTimer);
      intervalTimer = null;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      if (onlineHandler && typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener('online', onlineHandler);
      }
      onlineHandler = null;
      if (visibilityHandler && typeof document !== 'undefined' && document.removeEventListener) {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
      visibilityHandler = null;
    },

    /** Forget local identity (does not touch server state). */
    reset() {
      api.stop();
      for (const key of Object.values(keys)) write(key, '');
      sessionMode = 'bearer';
      status = { state: 'idle', error: null, revision: 0, lastSyncAt: null, pending: false };
      onChange?.({ ...status });
    },
  };

  if (autoSync) {
    // Caller opted into automatic start; defer so the host can finish wiring.
    queueMicrotask(() => {
      api.start({ intervalMs: autoSync.intervalMs, debounceMs: autoSync.debounceMs });
    });
  }

  return api;
}
