/**
 * 挑战题开关存储 — utils/store/challengeSetting
 *
 * 默认关闭（只出当前档及以下）；家长在「其他设置 → 练习档位」里手动打开。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  loadChallengeEnabled,
  saveChallengeEnabled,
  clearChallengeSetting,
} from '@/utils/store/challengeSetting'

const KEY = 'psm_challenge_enabled'

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

describe('挑战题开关 — 保存 / 读取 / 清除', () => {
  let store

  beforeEach(() => { store = installLocalStorage() })
  afterEach(() => { delete globalThis.localStorage })

  it('默认关闭', () => {
    expect(loadChallengeEnabled()).toBe(false)
  })

  it('打开后读回 true，落库为 "1"', () => {
    expect(saveChallengeEnabled(true)).toBe(true)
    expect(loadChallengeEnabled()).toBe(true)
    expect(store.get(KEY)).toBe('1')
  })

  it('关闭后读回 false，并清掉存储键', () => {
    saveChallengeEnabled(true)
    expect(saveChallengeEnabled(false)).toBe(false)
    expect(loadChallengeEnabled()).toBe(false)
    expect(store.has(KEY)).toBe(false)
  })

  it('清除设置 → 回到默认关闭', () => {
    saveChallengeEnabled(true)
    clearChallengeSetting()
    expect(loadChallengeEnabled()).toBe(false)
  })

  it('只认 "1"，脏值当作关闭', () => {
    store.set(KEY, 'true')
    expect(loadChallengeEnabled()).toBe(false)
  })
})

describe('挑战题开关 — 无 localStorage 环境（node / 隐私模式）', () => {
  it('读写清除都不抛错', () => {
    expect(() => loadChallengeEnabled()).not.toThrow()
    expect(loadChallengeEnabled()).toBe(false)
    expect(() => saveChallengeEnabled(true)).not.toThrow()
    expect(() => clearChallengeSetting()).not.toThrow()
  })
})
