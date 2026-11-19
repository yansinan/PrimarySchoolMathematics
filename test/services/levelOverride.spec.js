/**
 * 练习档位「起点」手动指定 —— utils/store/levelOverride
 *
 * 家长设置入口：其他设置 → 练习档位。
 * 语义：钉住自适应练习的起点，不删答题史；生效前的旧轮次不再参与升档阶梯。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'
import {
  loadLevelOverride,
  saveLevelOverride,
  clearLevelOverride,
  hasLevelOverride,
} from '@/utils/store/levelOverride'

const KEY = 'psm_level_override'

/** vitest 环境是 node，没有 localStorage → 用内存 stub 模拟浏览器 */
function installLocalStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
  return map
}

describe('练习档位 — 保存 / 读取 / 清除', () => {
  let store

  beforeEach(() => { store = installLocalStorage() })
  afterEach(() => { delete globalThis.localStorage })

  it('默认未设置', () => {
    expect(loadLevelOverride()).toBeNull()
    expect(hasLevelOverride()).toBe(false)
  })

  it('保存后再读回来：档位索引 + 生效时间', () => {
    const before = Date.now()
    const saved = saveLevelOverride(9)
    const loaded = loadLevelOverride()
    expect(saved.levelIdx).toBe(9)
    expect(loaded.levelIdx).toBe(9)
    expect(loaded.since).toBeGreaterThanOrEqual(before)
    expect(hasLevelOverride()).toBe(true)
    // 落库内容就是这一条键
    expect(JSON.parse(store.get(KEY)).levelIdx).toBe(9)
  })

  it('非法档位索引：拒绝保存，也不会覆盖已有设置', () => {
    saveLevelOverride(9)
    expect(saveLevelOverride(999)).toBeNull()
    expect(saveLevelOverride(-1)).toBeNull()
    expect(saveLevelOverride('abc')).toBeNull()
    expect(loadLevelOverride().levelIdx).toBe(9)
  })

  it('数据损坏 / 越界索引 → 当作未设置', () => {
    store.set(KEY, '{not json')
    expect(loadLevelOverride()).toBeNull()
    store.set(KEY, JSON.stringify({ levelIdx: DIFFICULTY_LEVELS.length, since: 1 }))
    expect(loadLevelOverride()).toBeNull()
  })

  it('清除后回到自动', () => {
    saveLevelOverride(9)
    clearLevelOverride()
    expect(loadLevelOverride()).toBeNull()
    expect(hasLevelOverride()).toBe(false)
  })
})

describe('练习档位 — 无 localStorage 环境（node / 隐私模式）', () => {
  it('读写清除都不抛错', () => {
    expect(() => loadLevelOverride()).not.toThrow()
    expect(loadLevelOverride()).toBeNull()
    expect(() => saveLevelOverride(9)).not.toThrow()
    expect(() => clearLevelOverride()).not.toThrow()
    expect(hasLevelOverride()).toBe(false)
  })
})
