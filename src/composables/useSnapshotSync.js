/**
 * 多设备同步编排（C 层）
 *
 * 把 indexDB-snapshot-sync 的 browser SDK 收口成一个应用内单例：
 *  - 注册 / 配对 / 手动同步 / 解绑
 *  - 状态透出（同步中 / 已同步 / 离线 / 需重新配对）
 *  - 凭据丢失保护：本机曾绑定过但 cookie 失效时，不自动重新注册
 *    （用 projectId 再注册会在服务端建出一个新的空用户，看起来像「数据全丢了」）
 *
 * 阶段一约定（见 designDocs/15-PLAN-snapshot-sync.md）：
 *  - 只增不删：同步不会删除本地记录；
 *  - 首台设备用预置 projectId + 用户名自动注册，后续设备用一次性配对码加入同一用户；
 *  - 凭据存 HttpOnly cookie（storeToken:false），token 不落 JS。
 */
import { ref } from 'vue'
import { createSnapshotSync, createRequestId } from '@/sync/browser.js'
import { SYNC_BASE_URL, SYNC_PROJECT_ID, SYNC_USER_NAME } from '@/sync/config.js'
import { exportSnapshot, importSnapshot, SNAPSHOT_POLICIES } from '@/services/snapshot.js'

const KEY_PREFIX = 'psm.snapshotSync.'
/** 本机曾绑定过的用户 id：只用于判断「从未启用」还是「凭据失效」 */
const USER_ID_KEY = `${KEY_PREFIX}boundUserId`
/** 自动同步间隔：整库快照，没必要像 SDK 默认那样 30s 一次 */
const SYNC_INTERVAL_MS = 120_000

/**
 * 当前部署是否提供同步服务。
 * GitHub Pages 等纯静态部署没有 /sync 反代，构建时用 VITE_SYNC_ENABLED=0 关掉入口，
 * 避免出现一个点了必然失败的「启用同步」按钮。
 */
const syncAvailable = import.meta.env.VITE_SYNC_ENABLED !== '0'

/** 模块级单例：同一页面只允许一个调度，否则会重复 push */
let sdk = null
/** 自动同步是否已启动（避免重复 start） */
let autoStarted = false

const status = ref({
  state: 'unconfigured',
  error: null,
  revision: 0,
  lastSyncAt: null,
  pending: false,
})
const identity = ref(null)
const configured = ref(false)
const busy = ref(false)
const initialized = ref(false)
/** 最近一次快照的字节数（粗略，用于容量提示） */
const snapshotBytes = ref(0)

function readLocal(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeLocal(key, value) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch { /* 隐私模式忽略 */ }
}

/** 本机是否曾经绑定过（用于避免误建新账号） */
function hasBoundBefore() {
  return !!readLocal(USER_ID_KEY)
}

/** 设备名（服务端在配对/管理面板里用来区分设备） */
function deviceName() {
  const ua = globalThis.navigator?.userAgent || ''
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
      : /Windows/i.test(ua) ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
          : /Linux/i.test(ua) ? 'Linux'
            : '浏览器'
  return `PSM · ${os}`
}

/** 包装 exportSnapshot：顺手记录快照大小，供面板显示数据量 */
async function exportAllForSync() {
  const snapshot = await exportSnapshot()
  try {
    snapshotBytes.value = JSON.stringify(snapshot).length
  } catch {
    snapshotBytes.value = 0
  }
  return snapshot
}

function ensureSdk() {
  if (sdk) return sdk
  sdk = createSnapshotSync({
    baseUrl: SYNC_BASE_URL,
    keyPrefix: KEY_PREFIX,
    // cookie 模式：服务端 Set-Cookie(HttpOnly)，SDK 不把 token 写进 localStorage
    storeToken: false,
    exportAll: exportAllForSync,
    importAll: importSnapshot,
    policies: SNAPSHOT_POLICIES,
    // 新配对的设备首次同步采用云端数据，而不是把本机旧数据推上去
    preferRemoteOnFirstBind: true,
    onChange: (next) => { status.value = next },
  })
  return sdk
}

function refreshConfigured() {
  configured.value = !!sdk?.configured
  if (sdk) status.value = sdk.status
}

/**
 * 已绑定就开启自动同步（定时 + 在线/可见恢复）。
 * start() 内部会先 stop()，所以重复调用安全；这里再用 autoStarted 避免每次 init 都立刻触发一轮。
 */
function maybeAutoStart() {
  if (!configured.value || autoStarted) return
  autoStarted = ensureSdk().start({ intervalMs: SYNC_INTERVAL_MS })
}

/**
 * 本地写入后标记待同步（防抖）。
 * 未绑定过的机器直接 no-op —— 不创建 SDK、不写 storage、不留定时器。
 * @param {number} [delayMs] 防抖毫秒；答题连发时会被后续调用重置
 */
function markDirty(delayMs = 2000) {
  if (!syncAvailable) return
  if (!configured.value && !hasBoundBefore()) return
  ensureSdk().markDirty(delayMs)
  status.value = ensureSdk().status
}

/**
 * 恢复身份：有 cookie 会话就拿到 identity；没有就 unconfigured。
 * 连接失败不会抛错（SDK 返回 null + offline 状态）。
 */
async function init() {
  if (!syncAvailable) {
    initialized.value = true
    status.value = { state: 'unconfigured', error: null, revision: 0, lastSyncAt: null, pending: false }
    return null
  }
  const s = ensureSdk()
  let result = null
  try {
    result = await s.init()
  } catch { /* SDK 已把状态写进 status */ }
  identity.value = result
  if (result?.user?.id) writeLocal(USER_ID_KEY, result.user.id)
  initialized.value = true
  refreshConfigured()
  maybeAutoStart()
  return result
}

/** 首台设备：用预置 projectId + 用户名注册（零运维，不用手输 projectId） */
async function enrollFirstDevice() {
  if (!syncAvailable) throw new Error('当前部署不支持同步')
  const s = ensureSdk()
  try {
    const result = await s.enroll({
      projectId: SYNC_PROJECT_ID,
      userName: SYNC_USER_NAME,
      deviceName: deviceName(),
      requestId: createRequestId(),
    })
    // 注册响应里 Set-Cookie；init() 走 /v1/me 确认 cookie 会话后 configured 才为真
    await init()
    writeLocal(USER_ID_KEY, result?.user?.id || '1')
    refreshConfigured()
    return result
  } catch (error) {
    // 服务端不允许同项目内重名用户（409 user_exists）。说明云端已有这个账号，
    // 多半是本机曾绑定过或家里另一台设备已启用 —— 记下「绑定过」，
    // 面板会改为引导用配对码加入，而不是反复撞 409。
    if (error?.body?.error === 'user_exists') writeLocal(USER_ID_KEY, 'exists')
    throw error
  }
}

/** 第二台设备：用主设备生成的一次性配对码加入同一用户 */
async function enrollWithPairingCode(code) {
  if (!syncAvailable) throw new Error('当前部署不支持同步')
  const s = ensureSdk()
  const result = await s.enroll({
    pairingCode: String(code || '').trim().toUpperCase(),
    deviceName: deviceName(),
  })
  await init()
  writeLocal(USER_ID_KEY, result?.user?.id || '1')
  refreshConfigured()
  return result
}

/** 手动同步一轮：pull → merge → import → push */
async function syncNow() {
  if (!syncAvailable) return { state: 'unconfigured', revision: null }
  if (busy.value) return { state: 'busy', revision: null }
  busy.value = true
  try {
    const result = await ensureSdk().syncNow()
    refreshConfigured()
    return result
  } finally {
    busy.value = false
  }
}

/** 生成一次性配对码（给第二台设备） */
async function createPairingCode(ttlSeconds = 600) {
  if (!syncAvailable) throw new Error('当前部署不支持同步')
  return ensureSdk().createPairingCode({ ttlSeconds })
}

/** 开启自动同步（定时 + 在线/可见恢复）；未注册/不支持时返回 false */
function startAutoSync() {
  if (!syncAvailable) return false
  const started = ensureSdk().start({ intervalMs: SYNC_INTERVAL_MS })
  autoStarted = !!started
  refreshConfigured()
  return started
}

function stopAutoSync() {
  sdk?.stop()
  autoStarted = false
}

/** 解绑本机：清本地凭据与绑定标记（不动服务端数据） */
function resetBinding() {
  sdk?.reset()
  autoStarted = false
  writeLocal(USER_ID_KEY, null)
  identity.value = null
  configured.value = false
  status.value = { state: 'unconfigured', error: null, revision: 0, lastSyncAt: null, pending: false }
}

export function useSnapshotSync() {
  return {
    status,
    identity,
    configured,
    busy,
    initialized,
    syncAvailable,
    snapshotBytes,
    hasBoundBefore,
    deviceName,
    init,
    enrollFirstDevice,
    enrollWithPairingCode,
    syncNow,
    createPairingCode,
    markDirty,
    startAutoSync,
    stopAutoSync,
    resetBinding,
  }
}
