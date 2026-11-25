/**
 * 快照里的配置（settings store）
 *
 * 覆盖：导出包含配置、导入还原、lww 合并（远端更新覆盖本地）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Dexie from 'dexie'
import { DB } from '@/services/databaseInit'
import { exportSnapshot, importSnapshot, SNAPSHOT_POLICIES } from '@/services/snapshot'
import { writeSetting, readSetting, resetSettings } from '@/utils/store/settingsRegistry'
import { mergeSnapshots } from '@/sync/merge.js'

let storage

beforeEach(async () => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  })
  resetSettings()
  await DB.open()
  await DB.practiceSessions.clear()
  await DB.answers.clear()
})

afterEach(async () => {
  await DB.close()
  await Dexie.delete('PracticeDB')
  vi.unstubAllGlobals()
})

describe('配置随快照同步', () => {
  it('导出包含配置，导入后还原', async () => {
    writeSetting('psm_form_state', '{"formData":{"paperTitle":"同步测试卷"}}')
    writeSetting('psm_challenge_enabled', '1')

    const snap = await exportSnapshot()
    expect(Array.isArray(snap.stores.settings)).toBe(true)
    expect(snap.stores.settings.find((r) => r.key === 'psm_form_state')?.value).toContain('同步测试卷')

    // 模拟另一台设备：本机配置清空
    resetSettings()
    expect(readSetting('psm_form_state')).toBe(null)

    const applied = await importSnapshot(snap)
    expect(applied).toContain('psm_form_state')
    expect(readSetting('psm_form_state')).toContain('同步测试卷')
    expect(readSetting('psm_challenge_enabled')).toBe('1')
  })

  it('lww 合并：远端更新的配置覆盖本地', async () => {
    writeSetting('psm_challenge_enabled', '0')
    const local = await exportSnapshot()
    const remote = {
      schemaVersion: 1,
      stores: {
        practiceSessions: [],
        answers: [],
        settings: [{ key: 'psm_challenge_enabled', value: '1', updatedAt: Date.now() + 10_000 }],
      },
    }
    const merged = mergeSnapshots(local, remote, { policies: SNAPSHOT_POLICIES })
    await importSnapshot(merged)
    expect(readSetting('psm_challenge_enabled')).toBe('1')
  })

  it('首次绑定：settingsReplace 强制采用云端配置（忽略本机默认配置的更新时间）', async () => {
    // 本机启动时写入的默认配置（时间戳更新）
    writeSetting('psm_form_state', '{"formData":{"paperTitle":"本机默认"}}')
    // 云端是更旧的真实配置
    const remote = {
      schemaVersion: 1,
      settingsReplace: true,
      stores: {
        practiceSessions: [],
        answers: [],
        settings: [{ key: 'psm_form_state', value: '{"formData":{"paperTitle":"云端配置"}}', updatedAt: 1 }],
      },
    }
    await importSnapshot(remote)
    expect(readSetting('psm_form_state')).toContain('云端配置')
  })

  it('旧快照没有 settings 字段也能导入（向后兼容）', async () => {
    const snap = await exportSnapshot()
    const legacy = { ...snap, stores: { practiceSessions: [], answers: [] } }
    await expect(importSnapshot(legacy)).resolves.toEqual([])
  })
})
