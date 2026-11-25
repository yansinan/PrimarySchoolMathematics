/**
 * 升档方式（自动 / 手动）— 默认手动
 *
 * dr 反馈：在设置里指定难度后，练习会自动进入下一档；即使关掉挑战题也照样升。
 * 需求：同一难度多做几轮，什么时候升档由家长手动决定。
 *
 * 覆盖两处「自动升档」：
 *  1) 跨轮：Profile.computeDifficultyIdx 的 promote 参数（见 profileLadder.spec.js）
 *  2) 组内：Engine.evaluateGroup 的升/降档、adjustNextQuestion 的连续答错降档
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Engine } from '@/services/adaptiveEngine'
import { Answer } from '@/services'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'
import {
  loadAutoAdvance,
  saveAutoAdvance,
  clearAutoAdvanceSetting,
} from '@/utils/store/autoAdvance'

const L = Object.fromEntries(DIFFICULTY_LEVELS.map((l, i) => [l.label, i]))
const CURRENT = L['乘法口诀·2~6']
const NEXT = L['乘法口诀·7~9']

const okAnswer = () => new Answer({ equation: '2×2=', solution: 4, userAnswer: 4 })
const badAnswer = () => new Answer({ equation: '2×2=', solution: 4, userAnswer: 5 })

/** 连跑 n 组全对（每组 6 题） */
function runGoodGroups(engine, n = 5) {
  for (let i = 0; i < n; i++) {
    engine.evaluateGroup(Array.from({ length: 6 }, okAnswer))
  }
}

function makeEngine(autoAdvance) {
  return new Engine({
    difficultyIdx: CURRENT,
    strongLevelIndices: [],
    weakLevelIndices: [],
    targetMin: 10,
    targetMax: 60,
    autoAdvance,
  })
}

/** vitest 环境是 node，没有 localStorage → 用内存 stub */
function installLocalStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
  return map
}

describe('升档方式 — 存储（默认手动）', () => {
  let store

  beforeEach(() => { store = installLocalStorage() })
  afterEach(() => { delete globalThis.localStorage })

  it('默认手动', () => {
    expect(loadAutoAdvance()).toBe(false)
  })

  it('保存 → 读取 → 清除', () => {
    expect(saveAutoAdvance(true)).toBe(true)
    expect(loadAutoAdvance()).toBe(true)
    expect(store.get('psm_auto_advance')).toBe('1')
    clearAutoAdvanceSetting()
    expect(loadAutoAdvance()).toBe(false)
  })

  it('无 localStorage（node / 隐私模式）不抛错，按手动处理', () => {
    delete globalThis.localStorage
    expect(() => loadAutoAdvance()).not.toThrow()
    expect(loadAutoAdvance()).toBe(false)
    expect(() => saveAutoAdvance(true)).not.toThrow()
    expect(() => clearAutoAdvanceSetting()).not.toThrow()
  })
})

describe('升档方式 — 组内自动升降档', () => {
  it('手动：连续 5 组全对也不自动升档', () => {
    const engine = makeEngine(false)
    runGoodGroups(engine)
    expect(engine.groupsAtThisLevel).toBeGreaterThanOrEqual(5)
    expect(engine.difficultyIdx).toBe(CURRENT)
  })

  it('自动：连续 5 组全对 → 升一档（对照组）', () => {
    const engine = makeEngine(true)
    runGoodGroups(engine)
    expect(engine.difficultyIdx).toBe(NEXT)
  })

  it('手动：连续答错也不降档', () => {
    const engine = makeEngine(false)
    engine.adjustNextQuestion([badAnswer(), badAnswer()], 0, [{ equation: '2×2=', solution: 4 }])
    expect(engine.difficultyIdx).toBe(CURRENT)
  })

  it('自动：连续答错 → 降一档（对照组）', () => {
    const engine = makeEngine(true)
    engine.adjustNextQuestion([badAnswer(), badAnswer()], 0, [{ equation: '2×2=', solution: 4 }])
    expect(engine.difficultyIdx).toBe(CURRENT - 1)
  })
})
