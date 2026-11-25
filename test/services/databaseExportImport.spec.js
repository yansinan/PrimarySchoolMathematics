/**
 * 数据导出完整性 + 旧文件导入补 uid（P0a / P0b）
 *
 * 回归背景：旧 exportAllData 只按 answers.sessionId 查答案，诊断阶段的孤儿答案
 * （无 sessionId / practiceSessionId）不会被导出 —— 拿它做迁移前备份是不完整的。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'
import { DB, exportAllData, importAllData } from '@/services/databaseInit'
import { PracticeSession } from '@/services/PracticeSession'
import { Answer } from '@/services/Answer'

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
  synced: 0,
  ...overrides,
})

beforeEach(async () => {
  // Dexie 4 在 close()+Dexie.delete() 之后不会自动重开，必须显式 open
  await DB.open()
  await DB.practiceSessions.clear()
  await DB.answers.clear()
  await DB.questions.clear()
})

afterEach(async () => {
  await DB.close()
  await Dexie.delete('PracticeDB')
})

describe('exportAllData 完整性', () => {
  it('包含：会话内答案、按 pid 归属的答案、诊断孤儿答案', async () => {
    const sid = await PracticeSession.create({ practiceSessionId: 'ps_a', configSnapshot: { mode: 'adaptive' } })
    // 会话内答案（有 sessionId + pid）
    await Answer.save(mkAnswer({ sessionId: sid, practiceSessionId: 'ps_a', equation: '2+3=', questionIndex: 0 }))
    // 只有 pid 的答案（例如 sessionDbId 丢了）
    await Answer.save(mkAnswer({ practiceSessionId: 'ps_a', equation: '3+2=', questionIndex: 1 }))
    // 诊断孤儿答案（两样都没有）
    await Answer.save(mkAnswer({ equation: '4+5=', questionIndex: 0 }))
    await Answer.save(mkAnswer({ equation: '5+4=', questionIndex: 1 }))
    await DB.questions.add({ equation: '2+3=', solution: 5, operator: '+', createdAt: Date.now(), synced: 0 })

    const data = await exportAllData()
    expect(data.sessions).toHaveLength(1)
    expect(data.answers).toHaveLength(4)
    expect(data.questions).toHaveLength(1)
    // 导出的答案都带 uid（v6 起）
    expect(data.answers.every((a) => typeof a.uid === 'string' && a.uid.length > 0)).toBe(true)
  })

  it('空库导出不报错，返回空数组', async () => {
    const data = await exportAllData()
    expect(data.sessions).toEqual([])
    expect(data.answers).toEqual([])
  })
})

describe('importAllData 兼容旧文件', () => {
  it('旧导出（无 uid）导入后自动补 uid，孤儿答案也导回来', async () => {
    const sid = await PracticeSession.create({ practiceSessionId: 'ps_a' })
    await Answer.save(mkAnswer({ sessionId: sid, practiceSessionId: 'ps_a', equation: '2+3=' }))
    await Answer.save(mkAnswer({ equation: '4+5=' }))
    const exported = await exportAllData()

    // 模拟旧文件：去掉所有 uid
    const legacy = {
      ...exported,
      sessions: exported.sessions.map(({ uid: _u, ...s }) => s),
      answers: exported.answers.map(({ uid: _u, ...a }) => a),
    }

    await DB.practiceSessions.clear()
    await DB.answers.clear()
    const result = await importAllData(legacy)

    expect(result.importedSessions).toBe(1)
    const sessions = await DB.practiceSessions.toArray()
    const answers = await DB.answers.toArray()
    expect(sessions).toHaveLength(1)
    expect(answers).toHaveLength(2)
    for (const row of [...sessions, ...answers]) {
      expect(typeof row.uid).toBe('string')
      expect(row.uid.length).toBeGreaterThan(0)
    }
  })

  it('重复导入同一份文件不叠加孤儿答案', async () => {
    await Answer.save(mkAnswer({ equation: '4+5=' }))
    const exported = await exportAllData()
    const legacy = { ...exported, answers: exported.answers.map(({ uid: _u, ...a }) => a) }

    await DB.answers.clear()
    await importAllData(legacy)
    await importAllData(legacy)
    expect(await DB.answers.count()).toBe(1)
  })
})
