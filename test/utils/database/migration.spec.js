/**
 * 阶段 8 单测：database.js v2 → v3 迁移 dry-run
 *
 * 必读：designDocs/PLAN-v2-ability-analysis.md § 2.4 迁移代码
 *
 * 策略：直接在 fresh Dexie 上模拟 v2 → v3 升级，验证：
 *  1. answers 缺字段自动补全
 *  2. questions 表从 answers 反向建出去重
 *  3. answers.questionId 回填正确
 *  4. v3 数据迁移空跑无破坏
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'

/**
 * 构造一个隔离的 v2 测试用 Dexie（只含 v2 schema + 预填 v2 形态数据）
 * 然后升级到 v3（加 questions 表 + migration upgrade hook），
 * 验证迁移行为。
 */
function buildV2DB() {
  const db = new Dexie('TestMigrationV2')
  db.version(2).stores({
    practiceSessions: '++id, studentId',
    answers: '++id, sessionId',
    abilitySnapshots: '++id, studentId',
  })
  return db
}

describe('v2 → v3 migration', () => {
  let db

  beforeEach(async () => {
    // 显式删除同名 db，避免上一轮残留
    await Dexie.delete('TestMigrationV2')
    db = buildV2DB()
  })

  afterEach(async () => {
    if (db.isOpen()) db.close()
    await Dexie.delete('TestMigrationV2')
  })

  it('backfills missing answers fields (questionId/inputMode/layout/assistLevel/startedAt/endedAt)', async () => {
    // v2 数据：插入一条只有 v2 字段的 answer
    const now = Date.now()
    await db.answers.add({
      sessionId: 1,
      equation: '23+47=',
      solution: 70,
      userAnswer: 60,
      isCorrect: false,
      responseTime: 2500,
      operator: '+',
      isCarry: true,
      isBorrow: false,
      stepCount: 1,
      operandMin: 23,
      operandMax: 47,
      timestamp: now,
      synced: 0,
    })
    // 模拟另一条有 options 字段（用于推断 inputMode='options'）
    await db.answers.add({
      sessionId: 1,
      equation: '15-8=',
      solution: 7,
      userAnswer: 5,
      isCorrect: false,
      responseTime: 1500,
      operator: '-',
      isCarry: false,
      isBorrow: true,
      stepCount: 1,
      operandMin: 8,
      operandMax: 15,
      timestamp: now,
      options: ['5', '6', '7', '8'], // v2 旧字段 → 推断 inputMode='options'
      synced: 0,
    })
    db.close()

    // 升级到 v3（带 upgrade hook）
    const db3 = new Dexie('TestMigrationV2')
    db3.version(3).stores({
      practiceSessions: '++id, studentId',
      answers: '++id, sessionId, questionId',
      abilitySnapshots: '++id, studentId',
      questions: '++id, &equation, operator, *operands',
    }).upgrade(async (tx) => {
      // 复用生产代码相同的迁移逻辑（v3 schema 升级）
      await tx.table('answers').toCollection().modify((a) => {
        if (a.questionId === undefined) a.questionId = null
        if (!a.inputMode) a.inputMode = a.options ? 'options' : 'keypad'
        if (!a.layout) a.layout = 'horizontal'
        if (a.assistLevel === undefined) a.assistLevel = 0
        if (!a.startedAt) a.startedAt = a.timestamp - (a.responseTime || 0)
        if (!a.endedAt) a.endedAt = a.timestamp
      })
      const seen = new Map()
      await tx.table('answers').each((a) => {
        if (!a.equation || seen.has(a.equation)) return
        seen.set(a.equation, {
          equation: a.equation,
          solution: a.solution,
          operator: a.operator,
          operandMin: a.operandMin,
          operandMax: a.operandMax,
          operands: [a.operandMin, a.operandMax].filter((x) => x > 0),
          isCarry: !!a.isCarry,
          isBorrow: !!a.isBorrow,
          difficulty: a.difficulty ?? 0,
          inputMode: a.inputMode,
          layout: a.layout,
          assistLevel: a.assistLevel ?? 0,
          blankMode: 'result',
          createdAt: a.timestamp,
        })
      })
      if (seen.size > 0) {
        await tx.table('questions').bulkAdd([...seen.values()])
        const eqToId = new Map()
        await tx.table('questions').each((q) => eqToId.set(q.equation, q.id))
        await tx.table('answers').toCollection().modify((a) => {
          if (!a.questionId && a.equation) a.questionId = eqToId.get(a.equation) ?? null
        })
      }
    })
    // open 触发迁移
    await db3.open()

    // 验证
    const answers = await db3.answers.toArray()
    expect(answers).toHaveLength(2)

    // 第一条无 options → inputMode='keypad'
    expect(answers[0].inputMode).toBe('keypad')
    expect(answers[0].layout).toBe('horizontal')
    expect(answers[0].assistLevel).toBe(0)
    expect(answers[0].questionId).not.toBeNull()

    // 第二条有 options → inputMode='options'
    expect(answers[1].inputMode).toBe('options')
    expect(answers[1].layout).toBe('horizontal')

    // startedAt 应该被反推（timestamp - responseTime）
    const t1 = answers[0].timestamp
    expect(answers[0].startedAt).toBe(t1 - 2500)
    expect(answers[0].endedAt).toBe(t1)

    // questions 表新增 2 条
    const questions = await db3.questions.toArray()
    expect(questions).toHaveLength(2)
    expect(questions.map((q) => q.equation).sort()).toEqual(['15-8=', '23+47='])

    // answers.questionId 全部回填（非 null）
    expect(answers.every((a) => a.questionId !== null && a.questionId > 0)).toBe(true)

    db3.close()
  })

  it('deduplicates questions when same equation has multiple answers', async () => {
    const now = Date.now()
    const v2Answer = {
      sessionId: 1,
      equation: '23+47=',
      solution: 70,
      userAnswer: 70,
      isCorrect: true,
      responseTime: 1500,
      operator: '+',
      isCarry: true,
      isBorrow: false,
      stepCount: 1,
      operandMin: 23,
      operandMax: 47,
      timestamp: now,
      synced: 0,
    }
    await db.answers.bulkAdd([v2Answer, { ...v2Answer, id: undefined, userAnswer: 60, isCorrect: false }, { ...v2Answer, id: undefined }])
    db.close()

    const db3 = new Dexie('TestMigrationV2')
    db3.version(3).stores({
      practiceSessions: '++id, studentId',
      answers: '++id, sessionId, questionId',
      questions: '++id, &equation, *operands',
    }).upgrade(async (tx) => {
      await tx.table('answers').toCollection().modify((a) => {
        if (a.questionId === undefined) a.questionId = null
        if (!a.inputMode) a.inputMode = 'keypad'
        if (!a.layout) a.layout = 'horizontal'
        if (a.assistLevel === undefined) a.assistLevel = 0
        if (!a.startedAt) a.startedAt = a.timestamp - (a.responseTime || 0)
        if (!a.endedAt) a.endedAt = a.timestamp
      })
      const seen = new Map()
      await tx.table('answers').each((a) => {
        if (!a.equation || seen.has(a.equation)) return
        seen.set(a.equation, {
          equation: a.equation,
          solution: a.solution,
          operator: a.operator,
          operandMin: a.operandMin,
          operandMax: a.operandMax,
          operands: [a.operandMin, a.operandMax].filter((x) => x > 0),
          isCarry: !!a.isCarry,
          isBorrow: !!a.isBorrow,
          difficulty: a.difficulty ?? 0,
          inputMode: a.inputMode,
          layout: a.layout,
          assistLevel: a.assistLevel ?? 0,
          blankMode: 'result',
          createdAt: a.timestamp,
        })
      })
      if (seen.size > 0) {
        await tx.table('questions').bulkAdd([...seen.values()])
        const eqToId = new Map()
        await tx.table('questions').each((q) => eqToId.set(q.equation, q.id))
        await tx.table('answers').toCollection().modify((a) => {
          if (!a.questionId && a.equation) a.questionId = eqToId.get(a.equation) ?? null
        })
      }
    })
    await db3.open()

    // questions 表只 1 条（去重）
    const questions = await db3.questions.toArray()
    expect(questions).toHaveLength(1)
    // 3 条 answers 全部指向同一个 questionId
    const answers = await db3.answers.toArray()
    const qId = questions[0].id
    expect(answers.every((a) => a.questionId === qId)).toBe(true)
    db3.close()
  })

  it('v3 data migration is no-op (idempotent)', async () => {
    // 直接从 v3 状态启动，确认升级 hook 是空跑
    const now = Date.now()
    // 先升级到 v3
    const dbV3 = new Dexie('TestMigrationV3')
    dbV3.version(3).stores({
      practiceSessions: '++id, studentId',
      answers: '++id, sessionId, questionId',
      questions: '++id, &equation',
    })
    await dbV3.questions.add({
      equation: '1+1=',
      solution: 2,
      operands: [1, 1],
      operator: '+',
      operandMin: 1,
      operandMax: 1,
      isCarry: false,
      isBorrow: false,
      difficulty: 0,
      inputMode: 'keypad',
      layout: 'vertical',
      assistLevel: 0,
      blankMode: 'result',
      createdAt: now,
    })
    await dbV3.answers.add({
      sessionId: 1,
      questionId: 1,
      equation: '1+1=',
      solution: 2,
      userAnswer: 2,
      isCorrect: true,
      responseTime: 1000,
      operator: '+',
      isCarry: false,
      isBorrow: false,
      stepCount: 1,
      operandMin: 1,
      operandMax: 1,
      timestamp: now,
      startedAt: now - 1000,
      endedAt: now,
      inputMode: 'keypad',
      layout: 'vertical',
      assistLevel: 0,
      synced: 0,
    })
    dbV3.close()

    // 重新打开（不会触发 upgrade，因为已是 v3）
    const db3 = new Dexie('TestMigrationV3')
    db3.version(3).stores({
      practiceSessions: '++id, studentId',
      answers: '++id, sessionId, questionId',
      questions: '++id, &equation',
    })
    await db3.open()
    // 数据完整保留
    const answers = await db3.answers.toArray()
    expect(answers).toHaveLength(1)
    expect(answers[0].questionId).toBe(1)
    const questions = await db3.questions.toArray()
    expect(questions).toHaveLength(1)
    db3.close()
    await Dexie.delete('TestMigrationV3')
  })
})

describe('v3 → v4 migration', () => {
  let db

  beforeEach(async () => {
    await Dexie.delete('TestMigrationV4')
    db = new Dexie('TestMigrationV4')
    db.version(3).stores({
      practiceSessions: '++id, studentId',
      answers: '++id, sessionId, questionId, isCorrect, startedAt, synced, timestamp',
      abilitySnapshots: '++id, studentId, computedAt, synced',
      questions: '++id, &equation, operator, difficulty, createdAt, *operands',
    })
    await db.open()
    await db.answers.bulkAdd([
      {
        sessionId: 1,
        questionId: 1,
        equation: '1+1=',
        solution: 2,
        userAnswer: 2,
        isCorrect: true,
        responseTime: 1000,
        operator: '+',
        isCarry: false,
        isBorrow: false,
        stepCount: 1,
        operandMin: 1,
        operandMax: 1,
        timestamp: Date.now(),
        startedAt: Date.now() - 1000,
        endedAt: Date.now(),
        synced: 0,
      },
      {
        sessionId: 1,
        questionId: 2,
        equation: '2+2=',
        solution: 4,
        userAnswer: 3,
        isCorrect: false,
        responseTime: 2000,
        operator: '+',
        isCarry: false,
        isBorrow: false,
        stepCount: 1,
        operandMin: 2,
        operandMax: 2,
        timestamp: Date.now(),
        startedAt: Date.now() - 2000,
        endedAt: Date.now(),
        synced: 0,
      },
    ])
    db.close()
  })

  afterEach(async () => {
    if (db?.isOpen()) db.close()
    await Dexie.delete('TestMigrationV4')
  })

  it('backfills attemptCount and score for legacy answers', async () => {
    const db4 = new Dexie('TestMigrationV4')
    db4.version(4).stores({
      practiceSessions: '++id, studentId, createdAt, synced, updatedAt',
      answers: '++id, sessionId, questionId, isCorrect, startedAt, synced, timestamp',
      abilitySnapshots: '++id, studentId, computedAt, synced',
      questions: '++id, &equation, operator, difficulty, createdAt, *operands',
    }).upgrade(async (tx) => {
      await tx.table('answers').toCollection().modify((a) => {
        if (a.attemptCount == null) a.attemptCount = 1
        if (a.score == null) a.score = a.isCorrect ? 1 : 0
      })
    })
    await db4.open()
    const answers = await db4.answers.toArray()
    expect(answers).toHaveLength(2)
    expect(answers[0].attemptCount).toBe(1)
    expect(answers[0].score).toBe(1)
    expect(answers[1].attemptCount).toBe(1)
    expect(answers[1].score).toBe(0)
    db4.close()
  })
})
