/**
 * 同步状态文案（C/V 共用，避免面板与状态点各写一份）
 *
 * state 来自 indexDB-snapshot-sync browser SDK：
 * idle / syncing / synced / offline / unauthorized / unconfigured / error / busy / locked
 */

export const SYNC_STATUS_LABELS = Object.freeze({
  idle: '待同步',
  syncing: '同步中…',
  synced: '已同步',
  offline: '离线，稍后重试',
  unauthorized: '需重新配对',
  unconfigured: '未启用',
  error: '同步失败',
  busy: '同步中…',
  locked: '其他标签页同步中',
})

/** 文案（未知 state 原样返回） */
export function syncStatusLabel(state) {
  return SYNC_STATUS_LABELS[state] || state || '未启用'
}

/**
 * 视觉基调：
 *  - ok    绿色（已同步 / 待同步但没有待推送）
 *  - busy  蓝色（同步中）
 *  - warn  橙色（离线 / 失败 / 待推送）
 *  - bad   红色（需要重新配对）
 *  - none  不显示（未启用）
 */
export function syncStatusTone(state, pending = false) {
  switch (state) {
    case 'synced':
      return 'ok'
    case 'idle':
      return pending ? 'warn' : 'ok'
    case 'syncing':
    case 'busy':
      return 'busy'
    case 'locked':
      return 'busy'
    case 'offline':
    case 'error':
      return 'warn'
    case 'unauthorized':
      return 'bad'
    default:
      return 'none'
  }
}
