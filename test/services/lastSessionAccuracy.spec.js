/**
 * 上一轮练习正确率 — 准备开始页「上次正确率」的数据源
 *
 * 与「历史正确率」（全部历史平均）区分：这里只取最近一轮有答题的练习。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { DB } from '@/services/databaseInit'
import { Answer, PracticeSession } from '@/services'
import { getLastSessionAccuracy } from '@/services/statsAggregator'

const STUDENT = 'default'

/** 造一条答题记录 */
function makeAnswer({ pid, sessionId = 0, equation = '2+3=', solution = 5, correct = true, questionIndex = 0 }) {
  return {
    sessionId,
    equation,
    solution,
    userAnswer: correct ? solution : solution + 1,
    practiceSessionId: pid,
    questionIndex,
    timestamp: Date.now(),
  }
}

/** 造一轮 session（含一条「最终结算」记录） */
async function addRound({ pid, createdAt, answers }) {
  await PracticeSession.create({
    practiceSessionId: pid,
    profileSnapshot: null,
    evaluations: null,
    completed: true,
  })
  // createdAt 由 create 写成本机当前时间，这里再覆盖成可控值排序
  await DB.practiceSessions
    .where('practiceSessionId').equals(pid)
    .modify({ createdAt })
  await DB.answers.bulkAdd(answers)
}

beforeEach(async () => {
  await DB.answers.clear()
  await DB.practiceSessions.clear()
})

describe('getLastSessionAccuracy', () => {
  it('没有任何练习 → accuracy 为 null', async () => {
    const r = await getLastSessionAccuracy(STUDENT)
    expect(r.accuracy).toBeNull()
    expect(r.total).toBe(0)
  })

  it('有诊断答案但没有练习轮次 → 仍为 null（诊断不挂 session）', async () => {
    await DB.answers.bulkAdd([
      makeAnswer({ pid: null, equation: '3+4=', solution: 7 }),
    ])
    const r = await getLastSessionAccuracy(STUDENT)
    expect(r.accuracy).toBeNull()
  })

  it('两轮时取「最近一轮」而不是历史平均', async () => {
    // 第一轮 10 题全对；第二轮 10 题错 5（50%）
    await addRound({
      pid: 'ps_old',
      createdAt: '2026-01-01T10:00:00.000Z',
      answers: Array.from({ length: 10 }, (_, i) =>
        makeAnswer({ pid: 'ps_old', equation: `2+${i}=`, solution: 2 + i, correct: true, questionIndex: i })),
    })
    await addRound({
      pid: 'ps_new',
      createdAt: '2026-01-02T10:00:00.000Z',
      answers: Array.from({ length: 10 }, (_, i) =>
        makeAnswer({ pid: 'ps_new', equation: `3+${i}=`, solution: 3 + i, correct: i % 2 === 0, questionIndex: i })),
    })

    const r = await getLastSessionAccuracy(STUDENT)
    expect(r.accuracy).toBe(50)     // 不是历史平均 75
    expect(r.total).toBe(10)
    expect(r.correct).toBe(5)
  })

  it('最近一轮没有答案时往前找上一轮', async () => {
    await addRound({
      pid: 'ps_a',
      createdAt: '2026-01-01T10:00:00.000Z',
      answers: [makeAnswer({ pid: 'ps_a', equation: '4+4=', solution: 8 })],
    })
    // 只有 session 记录、没有答案（例如刚创建就离开）
    await PracticeSession.create({ practiceSessionId: 'ps_empty', completed: false })

    const r = await getLastSessionAccuracy(STUDENT)
    expect(r.accuracy).toBe(100)
    expect(r.total).toBe(1)
  })

  it('同一轮多条 session 记录 / 重复 questionIndex → 不重复累加', async () => {
    // 两条 session 记录共用同一 pid（首题壳 + 最终结算），答案也只有 2 条
    await PracticeSession.create({ practiceSessionId: 'ps_dup' })
    await addRound({
      pid: 'ps_dup',
      createdAt: '2026-01-03T10:00:00.000Z',
      answers: [
        makeAnswer({ pid: 'ps_dup', equation: '5+5=', solution: 10, correct: true, questionIndex: 0 }),
        makeAnswer({ pid: 'ps_dup', equation: '6+6=', solution: 12, correct: false, questionIndex: 1 }),
        // 同一题重复写入（脏数据）
        makeAnswer({ pid: 'ps_dup', equation: '5+5=', solution: 10, correct: true, questionIndex: 0 }),
      ],
    })

    const r = await getLastSessionAccuracy(STUDENT)
    expect(r.total).toBe(2)
    expect(r.correct).toBe(1)
    expect(r.accuracy).toBe(50)
  })
})
