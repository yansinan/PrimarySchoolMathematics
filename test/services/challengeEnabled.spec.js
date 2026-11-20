/**
 * 挑战题开关 — 家长手动决定要不要出「下一档」的题
 *
 * 背景（dr 定调）：有些档位的前置知识孩子还没学到，上一档的题不是努力就能做出来的，
 * 所以挑战题默认关闭；关闭时整组题目档位上限 = 当前档位。
 */
import { describe, it, expect } from 'vitest'
import { Engine } from '@/services/adaptiveEngine'
import { generateAdaptiveBatch } from '@/utils/algorithm/adaptiveBatch'
import { Question } from '@/services/Question'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'

const L = Object.fromEntries(DIFFICULTY_LEVELS.map((l, i) => [l.label, i]))
const CURRENT = L['乘法口诀·2~6']
const NEXT = L['乘法口诀·7~9']

/** 造引擎：强项含「下一档」，弱项为空（排除弱项干扰） */
function makeEngine(challengeEnabled) {
  const engine = new Engine({
    difficultyIdx: CURRENT,
    strongLevelIndices: [NEXT, L['进退位巩固']],
    weakLevelIndices: [],
    targetMin: 10,
    targetMax: 30,
    challengeEnabled,
  })
  engine.levelCoefficients = {}
  return engine
}

/** 跑一个纯 challenge 的 plan，返回生成题目的档位 */
function challengeSlotLevels(challengeEnabled) {
  const engine = makeEngine(challengeEnabled)
  const questions = generateAdaptiveBatch(engine, 3, ['challenge', 'challenge', 'challenge'])
  return questions.map(q => Question.matchLevel(q)?.levelIdx)
}

describe('挑战题开关 — 关闭（默认）', () => {
  it('challenge 槽位只出当前档，不出下一档', () => {
    const levels = challengeSlotLevels(false)
    expect(levels).toHaveLength(3)
    expect(levels.every(lv => lv === CURRENT)).toBe(true)
  })

  it('强项池上限 = 当前档（不再取 +1 档）', () => {
    const engine = makeEngine(false)
    const picks = new Set(Array.from({ length: 60 }, () => engine.pickStrongLevel()))
    expect([...picks].every(idx => idx <= CURRENT)).toBe(true)
    // 下一档的强项不会被选中
    expect(picks.has(NEXT)).toBe(false)
  })
})

describe('挑战题开关 — 打开', () => {
  it('challenge 槽位出下一档', () => {
    const levels = challengeSlotLevels(true)
    expect(levels).toHaveLength(3)
    expect(levels.every(lv => lv === NEXT)).toBe(true)
  })

  it('强项池可到 +1 档', () => {
    const engine = makeEngine(true)
    const picks = new Set(Array.from({ length: 60 }, () => engine.pickStrongLevel()))
    expect(picks.has(NEXT)).toBe(true)
    expect([...picks].every(idx => idx <= CURRENT + 1)).toBe(true)
  })
})
