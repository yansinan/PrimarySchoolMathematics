/**
 * Dexie v5 → v6：`uid` 迁移
 *
 * 验收点（见 designDocs/15-PLAN-snapshot-sync.md §5.6）：
 *  - 只加 uid，行数与业务字段不变；
 *  - 每行 uid 非空且互不相同；
 *  - 重复打开不重新生成（幂等）；
 *  - 空库升级不报错。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'
import { DB } from '@/services/databaseInit'

const V5_STORES = {
  practiceSessions: '++id, studentId, createdAt, synced, updatedAt, practiceSessionId',
  answers: '++id, sessionId, questionId, startedAt, synced, timestamp, practiceSessionId',
  questions: '++id, &equation, operator, createdAt, synced',
}

const mkSession = (pid, createdAt, completed = false) => ({
  studentId: 'default',
  practiceSessionId: pid,
  config: { mode: 'adaptive', difficultyIdx: 2, targetMax: 12 },
  profileSnapshot: { difficultyIdx: 2 },
  finalProfileSnapshot: completed ? { difficultyIdx: 3 } : null,
  evaluations: completed ? '[{"group":0,"score":3}]' : null,
  completed,
  createdAt,
  updatedAt: createdAt,
  synced: 0,
})

const mkAnswer = (pid, sessionId, questionIndex, equation) => ({
  sessionId,
  equation,
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
  questionIndex,
  previousAttemptCount: 0,
  correctedAt: null,
  startedAt: Date.now(),
  endedAt: null,
  practiceSessionId: pid,
  timestamp: Date.now(),
  synced: 0,
})

/** 用 v5 schema 造一份「旧库」，然后关闭连接，交给真正的 DB(v6) 去升级 */
async function seedV5({ sessions = [], answers = [], questions = [] } = {}) {
  await DB.close()
  await Dexie.delete('PracticeDB')
  const seed = new Dexie('PracticeDB')
  seed.version(5).stores(V5_STORES)
  await seed.open()
  if (sessions.length) await seed.practiceSessions.bulkAdd(sessions)
  if (answers.length) await seed.answers.bulkAdd(answers)
  if (questions.length) await seed.questions.bulkAdd(questions)
  seed.close()
}

beforeEach(async () => {
  await DB.close()
  await Dexie.delete('PracticeDB')
})

afterEach(async () => {
  await DB.close()
  await Dexie.delete('PracticeDB')
})

describe('Dexie v5 → v6（uid 迁移）', () => {
  it('补齐 uid：行数、业务字段、外键都不变', async () => {
    await seedV5({
      sessions: [
        mkSession('ps_a', '2026-11-24T01:00:00.000Z'),
        mkSession('ps_a', '2026-11-24T01:05:00.000Z', true),
        mkSession('ps_b', '2026-11-24T02:00:00.000Z'),
      ],
      answers: [
        mkAnswer('ps_a', 1, 0, '2+3='),
        mkAnswer('ps_a', 1, 1, '3+2='),
        mkAnswer('ps_b', 3, 0, '4+1='),
      ],
      questions: [{ equation: '2+3=', solution: 5, operator: '+', createdAt: Date.now(), synced: 0 }],
    })

    await DB.open()

    expect(DB.verno).toBe(6)
    const sessions = await DB.practiceSessions.toArray()
    const answers = await DB.answers.toArray()
    const questions = await DB.questions.toArray()

    expect(sessions).toHaveLength(3)
    expect(answers).toHaveLength(3)
    expect(questions).toHaveLength(1)

    for (const row of [...sessions, ...answers]) {
      expect(typeof row.uid, 'uid 必须是字符串').toBe('string')
      expect(row.uid.length).toBeGreaterThan(0)
    }
    const uids = [...sessions, ...answers].map((r) => r.uid)
    expect(new Set(uids).size).toBe(uids.length)

    // 业务字段与外键原样保留
    expect(sessions.map((s) => s.practiceSessionId).sort()).toEqual(['ps_a', 'ps_a', 'ps_b'])
    expect(sessions.filter((s) => s.completed)).toHaveLength(1)
    expect(answers.map((a) => a.sessionId).sort()).toEqual([1, 1, 3])
    expect(answers[0].practiceSessionId).toBe('ps_a')
  })

  it('再次打开不会重新生成 uid（幂等）', async () => {
    await seedV5({
      sessions: [mkSession('ps_a', '2026-11-24T01:00:00.000Z')],
      answers: [mkAnswer('ps_a', 1, 0, '2+3=')],
    })

    await DB.open()
    const before = [
      (await DB.practiceSessions.toArray())[0].uid,
      (await DB.answers.toArray())[0].uid,
    ]
    DB.close()
    await DB.open()
    const after = [
      (await DB.practiceSessions.toArray())[0].uid,
      (await DB.answers.toArray())[0].uid,
    ]
    expect(after).toEqual(before)
  })

  it('空库升级不报错', async () => {
    await DB.open()
    expect(DB.verno).toBe(6)
    expect(await DB.practiceSessions.count()).toBe(0)
    expect(await DB.answers.count()).toBe(0)
  })
})
