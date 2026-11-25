/**
 * 快照适配层：exportSnapshot / importSnapshot / 合并策略
 *
 * 覆盖（见 designDocs/15-PLAN-snapshot-sync.md §5.3–§5.4）：
 *  - 快照形状与 schemaVersion 校验；
 *  - 导入按 uid upsert、外键 sessionId 重映射、幂等、失败回滚；
 *  - 合并策略：lww 按时间取新，平局保留远端；两设备各自一轮都能留下。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'
import { DB } from '@/services/databaseInit'
import { PracticeSession } from '@/services/PracticeSession'
import { Answer } from '@/services/Answer'
import { exportSnapshot, importSnapshot, SNAPSHOT_SCHEMA_VERSION, SNAPSHOT_POLICIES } from '@/services/snapshot'
import { mergeSnapshots } from '@/sync/merge.js'

const mkAnswer = (pid, sessionId, questionIndex, baseTs) => ({
  sessionId,
  practiceSessionId: pid,
  equation: `${questionIndex + 1}+1=`,
  solution: questionIndex + 2,
  userAnswer: questionIndex + 2,
  questionIndex,
  timestamp: baseTs + questionIndex * 1000,
  responseTime: 1200,
  attemptCount: 1,
  operator: '+',
  isCarry: false,
  isBorrow: false,
  stepCount: 1,
  operandMin: 1,
  operandMax: 9,
  inputMode: 'horizontal_keypad',
  blankMode: 'result',
  previousAttemptCount: 0,
  correctedAt: null,
  startedAt: baseTs,
  endedAt: null,
  synced: 0,
})

/** 造一轮：首题壳行 + n 条答案，返回首行 id */
async function seedRound(pid, n = 3, baseTs = Date.now() - 10_000) {
  const sid = await PracticeSession.create({ practiceSessionId: pid, configSnapshot: { mode: 'adaptive' } })
  for (let i = 0; i < n; i++) await Answer.save(mkAnswer(pid, sid, i, baseTs))
  return sid
}

async function resetDb() {
  await DB.open()
  await DB.practiceSessions.clear()
  await DB.answers.clear()
}

beforeEach(async () => {
  await resetDb()
})

afterEach(async () => {
  await DB.close()
  await Dexie.delete('PracticeDB')
})

describe('exportSnapshot / importSnapshot', () => {
  it('导出形状正确，且不携带设备本地自增 id', async () => {
    await seedRound('ps_a', 3)
    const snap = await exportSnapshot()

    expect(snap.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION)
    expect(Object.keys(snap.stores).sort()).toEqual(['answers', 'practiceSessions', 'settings'])
    expect(snap.stores.practiceSessions).toHaveLength(1)
    expect(snap.stores.answers).toHaveLength(3)
    for (const row of [...snap.stores.practiceSessions, ...snap.stores.answers]) {
      expect(row.id, '快照里不该带自增 id').toBeUndefined()
      expect(typeof row.uid).toBe('string')
    }
  })

  it('导入空库：行数、uid、practiceSessionId 都保留，sessionId 重映射到本机首行', async () => {
    await seedRound('ps_a', 3)
    const snap = await exportSnapshot()
    const remoteUids = snap.stores.answers.map((a) => a.uid).sort()

    await resetDb()
    await importSnapshot(snap)

    const sessions = await DB.practiceSessions.toArray()
    const answers = await DB.answers.toArray()
    expect(sessions).toHaveLength(1)
    expect(answers).toHaveLength(3)
    expect(answers.map((a) => a.uid).sort()).toEqual(remoteUids)
    expect(answers.every((a) => a.sessionId === sessions[0].id)).toBe(true)
    expect(answers.every((a) => a.practiceSessionId === 'ps_a')).toBe(true)
  })

  it('幂等：重复导入同一快照不增行、不换本机外键', async () => {
    await seedRound('ps_a', 2)
    const snap = await exportSnapshot()
    await resetDb()
    await importSnapshot(snap)
    const firstSid = (await DB.practiceSessions.toArray())[0].id

    await importSnapshot(snap)
    expect(await DB.practiceSessions.count()).toBe(1)
    expect(await DB.answers.count()).toBe(2)
    expect((await DB.practiceSessions.toArray())[0].id).toBe(firstSid)
  })

  it('导入后列表取最终行：快照按 uid 排序，不能按自增 id 判新旧', async () => {
    // 造一轮：首题壳 + 最终结算（completed）
    const sid = await PracticeSession.create({
      practiceSessionId: 'ps_final',
      configSnapshot: { mode: 'adaptive', difficultyIdx: 2, targetMax: 12 },
      profileSnapshot: { difficultyIdx: 2 },
    })
    await Answer.save(mkAnswer('ps_final', sid, 0, Date.now() - 5000))
    await PracticeSession.create({
      practiceSessionId: 'ps_final',
      configSnapshot: { mode: 'adaptive', difficultyIdx: 2, targetMax: 12 },
      evaluations: '[{"group":0,"score":3,"count":1}]',
      completed: true,
    })

    const snap = await exportSnapshot()
    // 模拟合并后的顺序：按 uid 排序（与真实 merge 一致），此时顺序与创建顺序无关
    snap.stores.practiceSessions.sort((a, b) => String(a.uid).localeCompare(String(b.uid)))

    await resetDb()
    await importSnapshot(snap)

    const [entry] = await PracticeSession.list()
    expect(entry.practiceSessionId).toBe('ps_final')
    expect(entry.completed).toBe(true)
    expect(entry.evaluations).toBeTruthy()
  })

  it('schemaVersion 不匹配 / 缺 uid：拒绝导入且不写入任何行', async () => {
    await seedRound('ps_a', 1)
    const snap = await exportSnapshot()
    await resetDb()

    await expect(importSnapshot({ ...snap, schemaVersion: 99 })).rejects.toThrow(/不支持的快照版本/)

    const broken = {
      ...snap,
      stores: {
        practiceSessions: snap.stores.practiceSessions,
        answers: [{ ...snap.stores.answers[0], uid: undefined }],
      },
    }
    await expect(importSnapshot(broken)).rejects.toThrow(/缺少 uid/)
    // 事务回滚：会话行也没写进去
    expect(await DB.practiceSessions.count()).toBe(0)
    expect(await DB.answers.count()).toBe(0)
  })
})

describe('合并策略', () => {
  it('lww：同 uid 取更新的 timestamp，平局保留远端', async () => {
    const mk = (ts, userAnswer) => ({
      schemaVersion: 1,
      stores: {
        practiceSessions: [],
        answers: [{ uid: 'u1', timestamp: ts, userAnswer, equation: '2+3=', practiceSessionId: 'ps_x' }],
      },
    })

    const newerLocal = mergeSnapshots(mk(2000, 5), mk(1000, 9), { policies: SNAPSHOT_POLICIES })
    expect(newerLocal.stores.answers[0].userAnswer).toBe(5)

    const newerRemote = mergeSnapshots(mk(1000, 5), mk(2000, 9), { policies: SNAPSHOT_POLICIES })
    expect(newerRemote.stores.answers[0].userAnswer).toBe(9)

    const tie = mergeSnapshots(mk(1000, 5), mk(1000, 9), { policies: SNAPSHOT_POLICIES })
    expect(tie.stores.answers[0].userAnswer).toBe(9)
  })

  it('两设备各自练一轮 → 合并后两条都在，导入后统计各自正确', async () => {
    await seedRound('ps_a', 2)
    const snapA = await exportSnapshot()

    await resetDb()
    await seedRound('ps_b', 3)
    const snapB = await exportSnapshot()

    const merged = mergeSnapshots(snapB, snapA, { policies: SNAPSHOT_POLICIES })
    expect(merged.stores.practiceSessions).toHaveLength(2)
    expect(merged.stores.answers).toHaveLength(5)

    await resetDb()
    await importSnapshot(merged)

    const list = await PracticeSession.list()
    expect(list).toHaveLength(2)
    const stats = await PracticeSession.getBatchSessionStats(list)
    expect(list.map((s) => stats[s.id].totalQuestions).sort()).toEqual([2, 3])

    // 详情按 pid 正确切开（外键重映射后仍能按轮次取答案）
    for (const entry of list) {
      const detail = await PracticeSession.getDetail(entry.id)
      const pid = entry.practiceSessionId
      const expected = pid === 'ps_a' ? 2 : 3
      expect(detail.answers.length).toBe(expected)
    }
  })
})
