/**
 * 档位阶梯 —— 「口诀没练完就跳进多位数乘法」回归测试
 *
 * 真实 bug：升档只看「答题命中的档位」，而每轮练习会混入 3~6 道 difficultyIdx+1 的
 * 挑战题。这些探针答对后 100% 命中下一档，被当成「该档强项」，下一轮整体跳档：
 * 5 轮 ×30 题就能从「进退位巩固(8)」窜到「三位数×一位数(17)」，口诀·2~6 只被
 * 3~6 道题「探过」。
 *
 * 修复后的规则（见 abilityProfile.js#computeDifficultyIdx）：
 *   - 升档依据是「每轮练习的起始档位」，不是单道题命中的档位
 *   - 每一档必须练够量（LEVEL_EVIDENCE_MIN）+ 正确率达标（ACCURACY_THRESHOLDS.good）
 *   - 逐档推进：跳过的空档自动回填，先回来重练
 *   - 没有轮次记录时（首次诊断 / 旧数据）沿用诊断定位逻辑
 */
import { describe, it, expect } from 'vitest'
import { Engine } from '@/services/adaptiveEngine'
import { Profile } from '@/services/abilityProfile'
import { Answer, Question } from '@/services'
import { generateAdaptiveBatch } from '@/utils/algorithm/adaptiveBatch'
import { generateOneQuestion } from '@/utils/algorithm/adaptiveBatch'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'
import { LEVEL_EVIDENCE_MIN, ACCURACY_THRESHOLDS, STRONG_THRESHOLD, WEAK_THRESHOLD } from '@/constants/practice'

const L = Object.fromEntries(DIFFICULTY_LEVELS.map((l, i) => [l.label, i]))
const MAX = DIFFICULTY_LEVELS.length - 1

/** 最小 engine 桩：generateOneQuestion 只用到 baseConfig */
const engineStub = () => ({
  baseConfig: {
    step: '1', whereIsResult: '0', enableBrackets: false,
    remainder: '3', solution: '0', numberOfPapers: 1,
  },
  _seenEquations: new Set(),
})

/** 每个档位的题池（档位内组合有限，×÷口诀档凑不满 30 道唯一题 → 循环复用） */
const poolCache = new Map()

function poolOf(levelIdx) {
  if (!poolCache.has(levelIdx)) {
    const engine = engineStub()
    const seen = new Set()
    const pool = []
    for (let i = 0; i < 200; i++) {
      const q = generateOneQuestion(levelIdx, engine, seen)
      if (!q) break   // 题池耗尽
      pool.push(q)
    }
    poolCache.set(levelIdx, pool)
  }
  return poolCache.get(levelIdx)
}

/** 生成 n 道指定档位的题，并包成答题记录 */
function answersAtLevel(levelIdx, n, { pid = 'ps_1', correct = true } = {}) {
  const pool = poolOf(levelIdx)
  expect(pool.length, `档位 ${levelIdx} 一道题都生成不出来`).toBeGreaterThan(0)
  const out = []
  while (out.length < n) {
    const q = pool[out.length % pool.length]
    const lv = Question.matchLevel(q)?.levelIdx
    // 生成的题必须属于目标档位附近（生成器有 ±1 漂移保护）
    expect(Math.abs(lv - levelIdx)).toBeLessThanOrEqual(1)
    out.push(new Answer({
      equation: q.equation,
      solution: q.solution,
      userAnswer: correct ? q.solution : q.solution + 1,
      operator: q.operator || '',
      practiceSessionId: pid,
      inputMode: 'horizontal_keypad',
      blankMode: 'result',
    }))
  }
  return out
}

describe('档位阶梯 — 断档回退', () => {
  it('练过 8 和 10、没练过 9 → 回到 9（乘法口诀·2~6）', () => {
    const answers = [
      ...answersAtLevel(L['进退位巩固'], 30, { pid: 'ps_1' }),
      ...answersAtLevel(L['乘法口诀·7~9'], 30, { pid: 'ps_2' }),
    ]
    // 模拟被挑战题带出来的 9 档探针（同一轮里 3 道题，不能单独成档）
    answers.push(...answersAtLevel(L['乘法口诀·2~6'], 3, { pid: 'ps_1' }))
    const sessionLevels = new Map([['ps_1', L['进退位巩固']], ['ps_2', L['乘法口诀·7~9']]])
    expect(Profile.computeDifficultyIdx(answers, sessionLevels)).toBe(L['乘法口诀·2~6'])
  })

  it('挑战题（下一档 3 道）不会把档位推到下一档的下一档', () => {
    const answers = [
      ...answersAtLevel(L['进退位巩固'], 30, { pid: 'ps_1' }),
      ...answersAtLevel(L['乘法口诀·2~6'], 3, { pid: 'ps_1' }),
    ]
    const sessionLevels = new Map([['ps_1', L['进退位巩固']]])
    // 修复前：最高命中档位 9 + 1 = 10（乘法口诀·7~9）
    expect(Profile.computeDifficultyIdx(answers, sessionLevels)).toBe(L['乘法口诀·2~6'])
  })
})

describe('档位阶梯 — 逐档推进', () => {
  it('只练过 8 且掌握 → 升到 9，且只升一档', () => {
    const answers = answersAtLevel(L['进退位巩固'], 30, { pid: 'ps_1' })
    const sessionLevels = new Map([['ps_1', L['进退位巩固']]])
    expect(Profile.computeDifficultyIdx(answers, sessionLevels)).toBe(L['乘法口诀·2~6'])
  })

  it('练到 8 后跳到 17（多位数乘法）→ 回退到 9，不会停在 17', () => {
    const rungs = [
      ['ps_1', L['进退位巩固']],
      ['ps_2', L['乘法口诀·7~9']],
      ['ps_3', L['表内除法·7~9']],
      ['ps_4', L['两位数×一位数']],
    ]
    const answers = rungs.flatMap(([pid, lv]) => answersAtLevel(lv, 30, { pid }))
    const sessionLevels = new Map(rungs)
    const idx = Profile.computeDifficultyIdx(answers, sessionLevels)
    expect(idx).toBe(L['乘法口诀·2~6'])
    expect(DIFFICULTY_LEVELS[idx].label).not.toMatch(/×|÷/)
  })
})

describe('档位阶梯 — 不升档的条件', () => {
  it('本轮正确率低于 80% → 停在原档', () => {
    const good = answersAtLevel(L['进退位巩固'], 20, { pid: 'ps_1' })
    const bad = answersAtLevel(L['进退位巩固'], 10, { pid: 'ps_1', correct: false })
    const sessionLevels = new Map([['ps_1', L['进退位巩固']]])
    expect(Profile.computeDifficultyIdx([...good, ...bad], sessionLevels)).toBe(L['进退位巩固'])
  })

  it('刚好达到 80% → 升档（口径与引擎「答好一组」一致）', () => {
    const total = 30
    const wrongCount = total - Math.ceil(total * ACCURACY_THRESHOLDS.good)
    const answers = [
      ...answersAtLevel(L['进退位巩固'], total - wrongCount, { pid: 'ps_1' }),
      ...answersAtLevel(L['进退位巩固'], wrongCount, { pid: 'ps_1', correct: false }),
    ]
    const sessionLevels = new Map([['ps_1', L['进退位巩固']]])
    expect(Profile.computeDifficultyIdx(answers, sessionLevels)).toBe(L['乘法口诀·2~6'])
  })

  it('题量不足（中途退出）→ 不算练过，停在原档', () => {
    const answers = answersAtLevel(L['进退位巩固'], LEVEL_EVIDENCE_MIN - 1, { pid: 'ps_1' })
    const sessionLevels = new Map([['ps_1', L['进退位巩固']]])
    expect(Profile.computeDifficultyIdx(answers, sessionLevels)).toBe(L['进退位巩固'])
  })

  it('恰好在 LEVEL_EVIDENCE_MIN 题且全对 → 升档', () => {
    const answers = answersAtLevel(L['进退位巩固'], LEVEL_EVIDENCE_MIN, { pid: 'ps_1' })
    const sessionLevels = new Map([['ps_1', L['进退位巩固']]])
    expect(Profile.computeDifficultyIdx(answers, sessionLevels)).toBe(L['乘法口诀·2~6'])
  })
})

describe('档位阶梯 — 家长手动指定起点档位（设置 → 练习档位）', () => {
  it('还没有新轮次时，直接返回指定档位（不被旧的高档记录拉走）', () => {
    const oldAnswers = answersAtLevel(L['两位数×一位数'], 30, { pid: 'ps_old' })
    const sessionLevels = new Map([['ps_old', L['两位数×一位数']]])
    expect(Profile.computeDifficultyIdx(oldAnswers, sessionLevels, L['乘法口诀·2~6']))
      .toBe(L['乘法口诀·2~6'])
  })

  it('指定起点后只认起点之后的新轮次：新轮次掌握 → 升一档', () => {
    const oldAnswers = answersAtLevel(L['两位数×一位数'], 30, { pid: 'ps_old' })
    const newAnswers = answersAtLevel(L['乘法口诀·2~6'], 30, { pid: 'ps_new' })
    // loadSessionLevels(since) 只返回生效后的轮次，旧轮次已被过滤
    const sessionLevels = new Map([['ps_new', L['乘法口诀·2~6']]])
    const idx = Profile.computeDifficultyIdx(
      [...oldAnswers, ...newAnswers], sessionLevels, L['乘法口诀·2~6'],
    )
    expect(idx).toBe(L['乘法口诀·7~9'])
  })

  it('指定起点后新轮次没掌握 → 停在指定档位', () => {
    const bad = answersAtLevel(L['乘法口诀·2~6'], 30, { pid: 'ps_new', correct: false })
    const sessionLevels = new Map([['ps_new', L['乘法口诀·2~6']]])
    expect(Profile.computeDifficultyIdx(bad, sessionLevels, L['乘法口诀·2~6']))
      .toBe(L['乘法口诀·2~6'])
  })
})

describe('练习重点 — 只列当前档位及以下的弱项', () => {
  const mkProfile = (difficultyIdx, weakLevelIndices) =>
    new Profile({ difficultyIdx, weakLevelIndices })

  it('起点改到口诀·2~6 → 不再把多位数乘除的弱项当练习重点', () => {
    const profile = mkProfile(L['乘法口诀·2~6'], [
      L['两位数×两位数'], L['三位数×一位数'], L['进退位巩固'],
    ])
    expect(profile.getFocusLevels()).toEqual(['进退位巩固'])
  })

  it('弱项全在当前档位之上 → 返回空列表（界面隐藏该区块）', () => {
    const profile = mkProfile(L['乘法口诀·2~6'], [
      L['两位数×一位数'], L['两位数×两位数'],
    ])
    expect(profile.getFocusLevels()).toEqual([])
  })

  it('最多 3 个且保持升序', () => {
    const profile = mkProfile(L['综合挑战'], [
      L['进退位入门'], L['两位数入门'], L['混合进退位①'], L['起步'],
    ])
    expect(profile.getFocusLevels()).toEqual(['起步', '混合进退位①', '两位数入门'])
  })
})

describe('档位阶梯 — 记录解析不到档位时仍按轮次走', () => {
  it('答题记录一条都匹配不到档位 → 不直接掉回 0 起步，仍按轮次阶梯推进', () => {
    // 造 30 条无法解析运算符的脏记录（matchLevel 返回 null）
    const dirty = Array.from({ length: 30 }, (_, i) => new Answer({
      equation: '42=',
      solution: 42,
      userAnswer: 42,
      practiceSessionId: 'ps_dirty',
      questionIndex: i,
    }))
    expect(Question.groupAnswersByLevel(dirty)).toEqual([])
    const sessionLevels = new Map([['ps_dirty', L['乘法口诀·2~6']]])
    expect(Profile.computeDifficultyIdx(dirty, sessionLevels)).toBe(L['乘法口诀·7~9'])
  })
})

describe('档位阶梯 — 无轮次记录时保持诊断定位逻辑', () => {
  const mk = (pairs) => pairs.map(([equation, solution]) => ({
    equation, solution, userAnswer: solution,
  }))

  it('诊断 5 题全对 → 仍是进退位巩固，不跳乘法', () => {
    const idx = Profile.computeDifficultyIdx(mk([
      ['3+4=', 7], ['8+7=', 15], ['47+21=', 68], ['56+38=', 94], ['72-35=', 37],
    ]))
    expect(idx).toBe(L['进退位巩固'])
  })

  it('乘除历史但没有轮次记录 → 仍在乘除档位内', () => {
    const idx = Profile.computeDifficultyIdx(mk([['3×4=', 12], ['6×6=', 36]]))
    expect(DIFFICULTY_LEVELS[idx].label).toMatch(/乘法/)
  })
})

describe('档位阶梯 — 整轮练习链路（每轮最多升一档）', () => {
  const toAnswer = (q, pid, correct = true) => new Answer({
    equation: q.equation,
    solution: q.solution,
    userAnswer: correct ? q.solution : q.solution + 1,
    operator: q.operator || '',
    practiceSessionId: pid,
    inputMode: q.inputMode || 'horizontal_keypad',
    blankMode: 'result',
  })

  /** 跑一轮练习（全对，到 targetMax 为止），返回本轮答案 */
  function runSession(startIdx, history, pid, targetMax = 30) {
    const groups = Question.groupAnswersByLevel(history)
    const profile = new Profile({
      difficultyIdx: startIdx,
      strongLevelIndices: groups.filter(g => g.accuracy >= STRONG_THRESHOLD).map(g => g.levelIdx),
      weakLevelIndices: groups.filter(g => g.accuracy < WEAK_THRESHOLD).map(g => g.levelIdx),
    })
    const engine = new Engine({
      difficultyIdx: startIdx,
      strongLevelIndices: profile.strongLevelIndices,
      weakLevelIndices: profile.weakLevelIndices,
      targetMin: 10,
      targetMax,
    })
    let group = 1
    const roundAnswers = []
    while (true) {
      const size = engine.getGroupSize()
      const plan = engine.generateQuestionPlan(group, size, false)
      const qs = generateAdaptiveBatch(engine, size, plan)
      for (const q of qs) roundAnswers.push(toAnswer(q, pid))
      const res = engine.evaluateGroup(qs.map(q => toAnswer(q, pid)))
      group++
      if (res.done) break
    }
    return roundAnswers
  }

  it('诊断起点 8 → 之后每轮只升一档，不跳档', () => {
    const diag = [
      ['3+4=', 7], ['8+7=', 15], ['47+21=', 68], ['56+38=', 94], ['72-35=', 37],
    ].map(([equation, solution]) => toAnswer({ equation, solution }, null))

    let history = [...diag]
    const sessionLevels = new Map()
    let level = Profile.computeDifficultyIdx(history)
    expect(level).toBe(L['进退位巩固'])

    const seen = [level]
    for (let s = 1; s <= 5; s++) {
      const pid = `ps_session_${s}`
      sessionLevels.set(pid, level)
      history = [...history, ...runSession(level, history, pid)]
      const next = Profile.computeDifficultyIdx(history, sessionLevels)
      // 核心断言：每轮最多升一档（修复前是 8→10→12→14→15→17）
      expect(next - level).toBeLessThanOrEqual(1)
      seen.push(next)
      level = next
    }
    // 逐档经过乘除口诀，而不是直接窜到多位数乘法
    expect(seen).toEqual([
      L['进退位巩固'],
      L['乘法口诀·2~6'],
      L['乘法口诀·7~9'],
      L['表内除法·2~6'],
      L['表内除法·7~9'],
      L['大数加法'],
    ])
    expect(seen.every(i => i <= MAX)).toBe(true)
  }, 60000)
})
