/**
 * 同步状态文案 / 视觉基调（面板与页头状态点共用）
 */
import { describe, it, expect } from 'vitest'
import { syncStatusLabel, syncStatusTone } from '@/sync/labels.js'

describe('syncStatusLabel', () => {
  it('已知状态返回中文文案', () => {
    expect(syncStatusLabel('synced')).toBe('已同步')
    expect(syncStatusLabel('offline')).toBe('离线，稍后重试')
    expect(syncStatusLabel('unauthorized')).toBe('需重新配对')
  })

  it('未知状态原样返回，空值兜底「未启用」', () => {
    expect(syncStatusLabel('weird')).toBe('weird')
    expect(syncStatusLabel(undefined)).toBe('未启用')
  })
})

describe('syncStatusTone', () => {
  it('已同步/待同步 → ok；待推送 → warn', () => {
    expect(syncStatusTone('synced')).toBe('ok')
    expect(syncStatusTone('idle')).toBe('ok')
    expect(syncStatusTone('idle', true)).toBe('warn')
  })

  it('同步中 → busy，离线/失败 → warn，需重新配对 → bad，未启用 → none', () => {
    expect(syncStatusTone('syncing')).toBe('busy')
    expect(syncStatusTone('busy')).toBe('busy')
    expect(syncStatusTone('locked')).toBe('busy')
    expect(syncStatusTone('offline')).toBe('warn')
    expect(syncStatusTone('error')).toBe('warn')
    expect(syncStatusTone('unauthorized')).toBe('bad')
    expect(syncStatusTone('unconfigured')).toBe('none')
  })
})
