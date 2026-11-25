/**
 * 答案行的稳定 uid
 *
 * 回归背景：`Answer.save` 的 put 是整行替换；答错重试时内存对象若不带 uid，
 * 会把库里的 uid 抹掉。uid 一变，快照合并会把同一道题当成两条记录（另一台设备上
 * 出现重复行，统计翻倍）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'
import { DB } from '@/services/databaseInit'
import { Answer } from '@/services/Answer'
import { newUid } from '@/utils/id'
import { useSubmitHandler } from '@/composables/useSubmitHandler'

const mkAnswer = (overrides = {}) => ({
  equation: '2+3=',
  solution: 5,
  userAnswer: 5,
  responseTime: 1200,
  operator: '+',
  isCarry: false,
  isBorrow: false,
  stepCount: 1,
  operandMin: 2,
  operandMax: 3,
  inputMode: 'horizontal_keypad',
  blankMode: 'result',
  questionId: 0,
  questionIndex: 0,
  previousAttemptCount: 0,
  correctedAt: null,
  startedAt: Date.now(),
  endedAt: null,
  timestamp: Date.now(),
  practiceSessionId: 'ps_uid',
  synced: 0,
  ...overrides,
})

beforeEach(async () => {
  await DB.open()
  await DB.answers.clear()
})

afterEach(async () => {
  await DB.close()
  await Dexie.delete('PracticeDB')
})

describe('newUid', () => {
  it('始终返回非空字符串，且不依赖安全上下文', () => {
    const a = newUid()
    const b = newUid()
    expect(typeof a).toBe('string')
    expect(a.length).toBeGreaterThan(0)
    expect(a).not.toBe(b)
  })
})

describe('Answer.save 的 uid 不变量', () => {
  it('首次写入自动生成 uid', async () => {
    await Answer.save(mkAnswer())
    const row = (await DB.answers.toArray())[0]
    expect(typeof row.uid).toBe('string')
    expect(row.uid.length).toBeGreaterThan(0)
  })

  it('重试（同 pid + questionIndex，内存对象不带 uid）不换 uid，只更新内容', async () => {
    await Answer.save(mkAnswer({ userAnswer: 6, questionIndex: 0 }))
    const before = (await DB.answers.toArray())[0]

    await Answer.save(mkAnswer({ userAnswer: 5, questionIndex: 0 }))
    const after = (await DB.answers.toArray())[0]

    expect(after.id).toBe(before.id)
    expect(after.uid).toBe(before.uid)
    expect(after.userAnswer).toBe(5)
    expect(await DB.answers.count()).toBe(1)
  })

  it('按显式 id 更新时也保留原 uid', async () => {
    await Answer.save(mkAnswer())
    const row = (await DB.answers.toArray())[0]
    await Answer.save({ ...row, userAnswer: 9, uid: undefined })
    const after = (await DB.answers.toArray())[0]
    expect(after.uid).toBe(row.uid)
    expect(after.userAnswer).toBe(9)
  })
})

describe('useSubmitHandler 在内存里复用 uid', () => {
  it('同一题答错再答对，session.answers 里是同一条记录且 uid 不变', () => {
    const session = { answers: [], diagnosticAnswers: [], currentAnswer: '' }
    const practiceStore = { phase: 'practice', session }
    const saver = { savePerQuestion: () => {} }
    const { processAnswer } = useSubmitHandler({ practiceStore, saver })

    const question = { equation: '2+3=', solution: 5, inputMode: 'horizontal_keypad', blankMode: 'result' }
    const base = {
      currentQuestion: question,
      groupAnswerOffset: 0,
      currentIndex: 0,
      session,
      endQuestionTimer: () => 1200,
    }

    processAnswer({ ...base, answer: 6 })
    const uid = session.answers[0].uid
    expect(typeof uid).toBe('string')

    processAnswer({ ...base, answer: 5 })
    expect(session.answers).toHaveLength(1)
    expect(session.answers[0].uid).toBe(uid)
  })
})
