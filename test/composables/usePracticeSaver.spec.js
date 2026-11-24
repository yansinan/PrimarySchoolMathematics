/**
 * 练习持久化：轮次身份 + 中断轮次的可见性
 *
 * 术语沿用 ARCHITECTURE / DESIGN：一轮（round）= 一次完整练习，用 practiceSessionId 标识；
 * 一组（group）= 轮内一次「答题 → 自我评价」；checkpoint = 一组自我评价后写的 practiceSessions 行。
 *
 * 回归背景（2026-11-24）：practiceSessionId / sessionDbId 在新轮次开始时没有重置，
 * 同一页面生命周期内第二轮起复用第一轮的 id，于是：
 *  - Answer.save 按 (practiceSessionId, questionIndex) 判定同一答题槽位 → 第二轮第 1 题覆盖第一轮第 1 题
 *  - PracticeSession.list 按 practiceSessionId 去重 → 多轮合并成一条练习记录
 *  - Profile.loadSessionLevels 每个 practiceSessionId 只取首条快照 → 第二轮起丢失「本轮起始档位」
 *
 * 另：一组只写了 checkpoint、没走到最终结算就中断的轮次，仍要出现在练习记录里 ——
 * 答案本来就每题落库、能力画像也已计入，记录列表若不显示就成了第二套真相。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DB } from '@/services/databaseInit'
import { usePracticeStore } from '@/stores/practice'
import { usePracticeSaver } from '@/composables/usePracticeSaver'
import { PracticeSession } from '@/services/PracticeSession'
import { Profile } from '@/services/abilityProfile'

let seq = 0

/** 造一条答题记录（字段与 useSubmitHandler 写进 session.answers 的一致），equation 全局唯一 */
function mkAnswer(questionIndex, solution, userAnswer = solution) {
  seq += 1
  return {
    equation: `${seq}+1=`,
    solution,
    userAnswer,
    attemptCount: 1,
    timestamp: Date.now(),
    responseTime: 1200,
    operator: '+',
    isCarry: false,
    isBorrow: false,
    stepCount: 1,
    operandMin: 1,
    operandMax: 9,
    inputMode: 'horizontal_keypad',
    blankMode: 'result',
    questionIndex,
  }
}

/**
 * 走一遍「开始新一轮 → 逐题保存」的真实路径。
 * resetPracticeSession 是三条开局入口（handleStartPractice / startNewAdaptiveSession / startAssessment）的共同动作。
 * @param {object} store practice store
 * @param {object} saver usePracticeSaver 实例
 * @param {Array} answers 本轮要答的题
 * @param {object} [startSnapshot] 本轮起始档位快照（startNewAdaptiveSession 在开局时写入）
 * @param {object} [configSnapshot] 本轮配置快照（自适应轮：mode/difficultyIdx/targetMin/targetMax）
 */
async function startRound(store, saver, answers, startSnapshot = null, configSnapshot = null) {
  store.resetPracticeSession()
  store.setPhase('practice')
  store.setListSource('adaptive')
  store.session._pendingProfileSnapshot = startSnapshot
  store.session.configSnapshot = configSnapshot
  for (const a of answers) {
    store.session.answers.push(a)
    await saver.savePerQuestion()
  }
}

/** 累积 history：第 i 组 → [{groupIdx: 0..i, evaluation, total}] */
function historyUpTo(groupSizes, evaluation = 3) {
  return groupSizes.map((total, groupIdx) => ({ groupIdx, evaluation, total }))
}

beforeEach(async () => {
  setActivePinia(createPinia())
  await DB.practiceSessions.clear()
  await DB.answers.clear()
})

describe('轮次身份：一轮一个 practiceSessionId', () => {
  it('新一轮拿到新的 practiceSessionId，第二轮不覆盖第一轮的答案', async () => {
    const store = usePracticeStore()
    const saver = usePracticeSaver()

    await startRound(store, saver, [mkAnswer(0, 2), mkAnswer(1, 3)])
    const pid1 = store.session.practiceSessionId
    await saver.saveGroupCheckpoint(historyUpTo([2]))
    await saver.saveSessionFinal({ evaluations: '[{"group":0,"score":3}]' })

    // 第二轮：questionIndex 同样从 0 开始
    await startRound(store, saver, [mkAnswer(0, 5)])
    const pid2 = store.session.practiceSessionId

    expect(pid2).toBeTruthy()
    expect(pid2).not.toBe(pid1)

    const round1 = await DB.answers.where('practiceSessionId').equals(pid1).toArray()
    expect(round1).toHaveLength(2)
    // 第 0 槽位仍是第一轮那道题（solution=2），没被第二轮（solution=5）顶掉
    expect(round1.find(a => a.questionIndex === 0)?.solution).toBe(2)
  })

  it('每轮在练习记录里各占一条，各算各的题数', async () => {
    const store = usePracticeStore()
    const saver = usePracticeSaver()

    await startRound(store, saver, [mkAnswer(0, 2), mkAnswer(1, 3)])
    await saver.saveSessionFinal({})
    await startRound(store, saver, [mkAnswer(0, 5)])
    await saver.saveSessionFinal({})

    const list = await PracticeSession.list()
    expect(list).toHaveLength(2)
    const stats = await PracticeSession.getBatchSessionStats(list)
    const sizes = list.map(s => stats[s.id].totalQuestions).sort()
    expect(sizes).toEqual([1, 2])
  })

  it('第二轮的「本轮起始档位」快照独立入库，升档阶梯才拿得到证据', async () => {
    const store = usePracticeStore()
    const saver = usePracticeSaver()

    await startRound(store, saver, [mkAnswer(0, 2)], { difficultyIdx: 0 })
    const pid1 = store.session.practiceSessionId
    await saver.saveSessionFinal({ finalProfileSnapshot: { difficultyIdx: 0 } })

    await startRound(store, saver, [mkAnswer(0, 5)], { difficultyIdx: 1 })
    const pid2 = store.session.practiceSessionId

    const levels = await Profile.loadSessionLevels()
    expect(levels.get(pid1)).toBe(0)
    expect(levels.get(pid2)).toBe(1)
  })
})

describe('中断的轮次仍进入练习记录', () => {
  /** 自适应轮的配置快照（与 startNewAdaptiveSession 写入的形状一致） */
  const ADAPTIVE_CFG = { mode: 'adaptive', difficultyIdx: 2, targetMin: 8, targetMax: 12 }

  /** 第 1 组 2 题已自我评价（checkpoint 落库），第 2 组答了 1 题就中断，没有最终结算 */
  async function interruptedRound() {
    const store = usePracticeStore()
    const saver = usePracticeSaver()
    await startRound(store, saver, [mkAnswer(0, 2), mkAnswer(1, 3)], null, ADAPTIVE_CFG)
    await saver.saveGroupCheckpoint(historyUpTo([2], 4))
    store.session.answers.push(mkAnswer(2, 4))
    await saver.savePerQuestion()
    return store.session.practiceSessionId
  }

  it('只有 checkpoint、没有最终结算：列表可见、带本组评价、统计按本轮答案算', async () => {
    await interruptedRound()

    const list = await PracticeSession.list()
    expect(list).toHaveLength(1)
    expect(list[0].completed).toBe(false)
    expect(JSON.parse(list[0].evaluations)).toEqual([{ group: 0, score: 4, count: 2 }])

    const stats = await PracticeSession.getBatchSessionStats(list)
    expect(stats[list[0].id].totalQuestions).toBe(3)
    expect(stats[list[0].id].practiceType).toBe('自适应')
    // 完成/中断一眼可辨：completed=false 供 UI 打「中断」标签
    expect(stats[list[0].id].completed).toBe(false)
    // 中断轮次的列表行是 checkpoint，也要带本轮配置快照：难度不再是「—」、完成度用真实上限
    expect(stats[list[0].id].difficultyLabel).not.toBe('—')
    expect(stats[list[0].id].completion).toBeCloseTo(3 / 12)
  })

  it('答题详情按组切开：已评价的组各占一组，没答完的下一组单独成组', async () => {
    await interruptedRound()

    const [entry] = await PracticeSession.list()
    const detail = await PracticeSession.getDetail(entry.id)
    // 第 1 组 = checkpoint 那 2 题；没答完的第 2 组 = 剩下 1 题（main）
    expect(detail.siblings.map(s => s.answers.length)).toEqual([2])
    expect(detail.answers).toHaveLength(1)
    expect(detail.answers[0].questionIndex).toBe(2)
  })

  it('完成的轮次：详情按组切分不受影响，状态为已完成', async () => {
    const store = usePracticeStore()
    const saver = usePracticeSaver()
    store.session.configSnapshot = { mode: 'adaptive', difficultyIdx: 2, targetMin: 5, targetMax: 20 }
    const sizes = [2, 3, 2]
    for (let g = 0; g < sizes.length; g++) {
      for (let k = 0; k < sizes[g]; k++) {
        store.session.answers.push(mkAnswer(store.session.answers.length, 10 + g * 10 + k))
        await saver.savePerQuestion()
      }
      await saver.saveGroupCheckpoint(historyUpTo(sizes.slice(0, g + 1)))
    }
    await saver.saveSessionFinal({ evaluations: '[{"group":2,"score":3}]' })

    const [entry] = await PracticeSession.list()
    expect(entry.completed).toBe(true)
    const stats = await PracticeSession.getBatchSessionStats([entry])
    expect(stats[entry.id].completed).toBe(true)
    expect(stats[entry.id].difficultyLabel).not.toBe('—')
    // 提前结束（7 题 < 上限 20）不影响「已完成」判定
    expect(stats[entry.id].completion).toBeCloseTo(7 / 20)
    const detail = await PracticeSession.getDetail(entry.id)
    expect(detail.siblings.map(s => s.answers.length)).toEqual([2, 3, 2])
    expect(detail.answers).toHaveLength(0)
  })
})

describe('computeSessionStats 的完成状态', () => {
  const answers = (n) => Array.from({ length: n }, () => ({ userAnswer: 1, solution: 1 }))

  it('completed 原样透传：true / false / 旧数据 undefined', () => {
    expect(PracticeSession.computeSessionStats({ completed: true }, answers(2)).completed).toBe(true)
    expect(PracticeSession.computeSessionStats({ completed: false }, answers(2)).completed).toBe(false)
    expect(PracticeSession.computeSessionStats({}, answers(2)).completed).toBeUndefined()
  })

  it('自适应轮按本轮 targetMax 算题量进度，类型由 mode 识别', () => {
    const s = PracticeSession.computeSessionStats(
      { completed: false, config: { mode: 'adaptive', difficultyIdx: 2, targetMax: 12 } },
      answers(6)
    )
    expect(s.practiceType).toBe('自适应')
    expect(s.difficultyLabel).not.toBe('—')
    expect(s.completion).toBeCloseTo(0.5)
  })

  it('没有 completed 字段的旧数据仍可用（不因缺字段抛错）', () => {
    const s = PracticeSession.computeSessionStats({ evaluations: '[{"group":0,"score":3}]' }, answers(3))
    expect(s.practiceType).toBe('自适应')
    expect(s.completed).toBeUndefined()
  })
})
