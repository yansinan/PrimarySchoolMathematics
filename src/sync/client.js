/**
 * Zero-dependency reference SDK for indexDB-snapshot-sync.
 *
 * It handles HTTP + enrollment/token plumbing only. Snapshot export, merge,
 * import, and token persistence belong to the host application.
 */

export class SyncHttpError extends Error {
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.name = 'SyncHttpError';
    this.status = status;
    this.body = body;
  }
}

/**
 * @param {{
 *   baseUrl: string,
 *   deviceToken?: string|null,
 *   fetchImpl?: typeof fetch,
 *   credentials?: RequestCredentials
 * }} options
 */
export function createSyncClient({
  baseUrl,
  deviceToken = null,
  fetchImpl = globalThis.fetch,
  credentials = 'same-origin',
}) {
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) throw new TypeError('baseUrl is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is not available');
  const base = baseUrl.replace(/\/+$/, '');
  let token = deviceToken;

  async function request(method, path, body) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      credentials,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { error: 'invalid_json_response' };
      }
    }
    if (!response.ok) throw new SyncHttpError(response.status, parsed);
    return parsed;
  }

  return {
    get deviceToken() {
      return token;
    },
    setDeviceToken(value) {
      token = value;
    },

    /**
     * Exactly one of bootstrapCode, projectId, or pairingCode.
     * On success the client stores the returned device token for later calls.
     */
    async enroll(input) {
      const data = await request('POST', '/v1/enroll', input);
      token = data.deviceToken;
      return data;
    },

    async me() {
      return request('GET', '/v1/me');
    },

    async createPairingCode({ ttlSeconds = 600 } = {}) {
      return request('POST', '/v1/pairing-codes', { ttlSeconds });
    },

    /** @returns {Promise<{revision:number,snapshot:object}|null>} */
    async pull() {
      try {
        return await request('GET', '/v1/snapshots');
      } catch (error) {
        if (error instanceof SyncHttpError && error.status === 404) return null;
        throw error;
      }
    },

    /**
     * @param {{baseRevision:number, snapshot:object}} input
     * @returns {Promise<{revision:number,hash:string,snapshot:object}>}
     */
    async push({ baseRevision, snapshot }) {
      return request('PUT', '/v1/snapshots', { baseRevision, snapshot });
    },
  };
}
