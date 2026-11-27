/**
 * pickInputMode —— 按 assistLevel 选输入模式
 *
 * 之前的 scripts/verify-p0.mjs 把概率表手工复制了一份，已经和实现漂移
 * （脚本写 choice4 0.20 / choice2 0.10，实现是 0.15 / 0.15），
 * 这里改成直接 import 实现 + 固定 Math.random 做边界断言。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { pickInputMode } from '@/services/adaptiveEngine'
import { ASSIST_LEVELS } from '@/constants/practice'

const pick = (assistLevel, r, extra = {}) => {
  vi.spyOn(Math, 'random').mockReturnValue(r)
  return pickInputMode({ assistLevel, ...extra })
}

afterEach(() => vi.restoreAllMocks())

describe('pickInputMode', () => {
  it('横式掌握验证进行中 → 强制横式键盘', () => {
    expect(pick(0, 0.0, { masteryCheck: { active: true } })).toBe('horizontal_keypad')
    expect(pick(2, 0.99, { masteryCheck: { active: true } })).toBe('horizontal_keypad')
  })

  it('assistLevel 0：竖式 70% / 四选一 15% / 二选一 15%', () => {
    expect(pick(0, 0.00)).toBe('vertical_keypad')
    expect(pick(0, 0.69)).toBe('vertical_keypad')
    expect(pick(0, 0.70)).toBe('choice4')
    expect(pick(0, 0.849)).toBe('choice4')
    expect(pick(0, 0.85)).toBe('choice2')
    expect(pick(0, 0.999)).toBe('choice2')
  })

  it('assistLevel 1：四选一 50% / 二选一 25% / 竖式 25%', () => {
    expect(pick(1, 0.00)).toBe('choice4')
    expect(pick(1, 0.499)).toBe('choice4')
    expect(pick(1, 0.50)).toBe('choice2')
    expect(pick(1, 0.749)).toBe('choice2')
    expect(pick(1, 0.75)).toBe('vertical_keypad')
  })

  it('assistLevel 2：二选一 70% / 四选一 20% / 竖式 10%', () => {
    expect(pick(2, 0.00)).toBe('choice2')
    expect(pick(2, 0.699)).toBe('choice2')
    expect(pick(2, 0.70)).toBe('choice4')
    expect(pick(2, 0.899)).toBe('choice4')
    expect(pick(2, 0.90)).toBe('vertical_keypad')
  })

  it('返回的模式都在 ASSIST_LEVELS 里（不会拼错 key）', () => {
    const known = new Set(ASSIST_LEVELS.map(l => l.key))
    for (const L of [0, 1, 2]) {
      for (const r of [0.1, 0.3, 0.6, 0.8, 0.95]) {
        expect(known.has(pick(L, r))).toBe(true)
      }
    }
  })
})
