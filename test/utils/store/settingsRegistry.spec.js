/**
 * 配置同步注册表（localStorage 侧）
 *
 * 覆盖：时间戳、显式删除的墓碑、白名单（不同步凭据）、重置不留墓碑、平局取远端。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  writeSetting,
  readSetting,
  exportSettingRows,
  applySettingRows,
  resetSettings,
} from '@/utils/store/settingsRegistry'

const FORM = 'psm_form_state'
const CHALLENGE = 'psm_challenge_enabled'

let storage
let now = 1_000

beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  })
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  resetSettings()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('writeSetting / exportSettingRows', () => {
  it('写入配置并记录时间戳', () => {
    now = 1_000
    writeSetting(FORM, '{"a":1}')
    expect(readSetting(FORM)).toBe('{"a":1}')
    expect(exportSettingRows()).toEqual([{ key: FORM, value: '{"a":1}', updatedAt: 1_000 }])
  })

  it('从未设置过的键不导出（避免空设置覆盖另一台设备）', () => {
    now = 2_000
    writeSetting(FORM, 'x')
    const keys = exportSettingRows().map((r) => r.key)
    expect(keys).toContain(FORM)
    expect(keys).not.toContain('psm_sfx_enabled')
  })

  it('显式清除留墓碑（value=null），让其它设备也删掉', () => {
    now = 1_000
    writeSetting(CHALLENGE, '1')
    now = 2_000
    writeSetting(CHALLENGE, null)
    expect(exportSettingRows()).toEqual([{ key: CHALLENGE, value: null, updatedAt: 2_000 }])
  })

  it('白名单外的键照常写入，但不参与同步', () => {
    writeSetting('psm.snapshotSync.deviceToken', 'secret')
    expect(readSetting('psm.snapshotSync.deviceToken')).toBe('secret')
    expect(exportSettingRows().some((r) => r.key === 'psm.snapshotSync.deviceToken')).toBe(false)
  })

  it('内容没变不刷新时间戳（启动时重复写默认值不会挡住远端新配置）', () => {
    now = 1_000
    writeSetting(FORM, 'x')
    now = 2_000
    writeSetting(FORM, 'x')
    expect(exportSettingRows()).toEqual([{ key: FORM, value: 'x', updatedAt: 1_000 }])
  })
})

describe('applySettingRows', () => {
  it('远端更新则应用；远端更旧则忽略', () => {
    now = 5_000
    writeSetting(FORM, 'local')

    expect(applySettingRows([{ key: FORM, value: 'remote-old', updatedAt: 4_000 }])).toEqual([])
    expect(readSetting(FORM)).toBe('local')

    expect(applySettingRows([{ key: FORM, value: 'remote-new', updatedAt: 6_000 }])).toEqual([FORM])
    expect(readSetting(FORM)).toBe('remote-new')
  })

  it('平局（时间相同）接受远端', () => {
    now = 1_000
    writeSetting(FORM, 'local')
    applySettingRows([{ key: FORM, value: 'remote', updatedAt: 1_000 }])
    expect(readSetting(FORM)).toBe('remote')
  })

  it('墓碑（value=null）会删除本地配置', () => {
    now = 1_000
    writeSetting(FORM, 'x')
    applySettingRows([{ key: FORM, value: null, updatedAt: 2_000 }])
    expect(readSetting(FORM)).toBe(null)
  })

  it('未知键一律忽略（防止快照往本机塞别的东西）', () => {
    const applied = applySettingRows([
      { key: 'psm.snapshotSync.deviceToken', value: 'evil', updatedAt: 9e12 },
      { key: 'random_key', value: 'x', updatedAt: 9e12 },
    ])
    expect(applied).toEqual([])
    expect(readSetting('psm.snapshotSync.deviceToken')).toBe(null)
  })
})

describe('resetSettings', () => {
  it('清值 + 清时间，不留墓碑（重置不传播删除）', () => {
    now = 1_000
    writeSetting(FORM, 'x')
    writeSetting(CHALLENGE, '1')
    resetSettings()
    expect(readSetting(FORM)).toBe(null)
    expect(readSetting(CHALLENGE)).toBe(null)
    expect(exportSettingRows()).toEqual([])
  })
})
