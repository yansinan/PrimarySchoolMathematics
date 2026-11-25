/**
 * 整库快照适配层（S 层）
 *
 * 对接 indexDB-snapshot-sync 的 browser SDK：SDK 只要求宿主提供
 * `exportAll()` / `importAll(snapshot)`，合并策略由这里声明。
 *
 * 快照形状：
 *   { schemaVersion, exportedAt, stores: { practiceSessions, answers } }
 *
 * 三个关键取舍（见 designDocs/15-PLAN-snapshot-sync.md §5）：
 *  - **questions 不同步**：派生缓存（equation/operator/... 都能从 answers 重建），
 *    同步它只会让快照体积翻倍。
 *  - **answers 用 lww(timestamp)**：答错重试会原地更新同一行；用 union 的话
 *    合并实现「先遍历远端、同键跳过」（见 sdk/merge.js unionRecords），
 *    本地的新答案会输给远端旧记录。
 *  - **practiceSessions 用 lww(updatedAt)**：一轮里的多行（首题壳 / 组 checkpoint /
 *    最终结算）各自是独立行，各有自己的 uid。
 *
 * 删除语义（阶段一）：只增不删。快照里没有的行不会被删除；`/reset` 清空后
 * 下次同步会把云端数据拉回来 —— 所以重置页提供「同时断开同步」。
 */
import { DB } from './databaseInit'

/** 快照结构版本：不匹配就拒绝导入，避免把旧结构静默写进新库 */
export const SNAPSHOT_SCHEMA_VERSION = 1

/** 各 store 的合并策略（传给 SDK 的 mergeSnapshots / createSnapshotSync） */
export const SNAPSHOT_POLICIES = Object.freeze({
  practiceSessions: Object.freeze({ mode: 'lww', key: 'uid', timeField: 'updatedAt' }),
  answers: Object.freeze({ mode: 'lww', key: 'uid', timeField: 'timestamp' }),
})

/** 快照里不携带设备本地的自增 id */
function withoutLocalId(row) {
  const { id: _id, ...rest } = row
  return rest
}

/**
 * 导出整库快照。
 *
 * 必须在一个读事务里完成：SDK 的集成清单要求，否则可能导出「写了一半」的快照
 * （例如 sessions 含新一轮、answers 还没写入）。
 *
 * @returns {Promise<{schemaVersion:number, exportedAt:string, stores:object}>}
 */
export async function exportSnapshot() {
  return DB.transaction('r', DB.practiceSessions, DB.answers, async () => ({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    stores: {
      practiceSessions: (await DB.practiceSessions.toArray()).map(withoutLocalId),
      answers: (await DB.answers.toArray()).map(withoutLocalId),
    },
  }))
}

/**
 * 应用「合并后」的快照：按 uid upsert，不删除本地任何行。
 *
 * 外键重映射：`answers.sessionId` 是本机自增 id，直接沿用远端的数值会指向
 * 另一轮（甚至另一台设备上的别的东西）。导入时按 `practiceSessionId` 找到本机
 * 这轮的首行 id；本机已有的行保留自己的外键，只同步内容。
 *
 * 幂等：同一快照重复导入结果一致。
 *
 * @param {{schemaVersion:number, stores:{practiceSessions:Array, answers:Array}}} snapshot
 * @returns {Promise<void>}
 */
export async function importSnapshot(snapshot) {
  const version = snapshot?.schemaVersion
  if (version !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`不支持的快照版本：${String(version)}（期望 ${SNAPSHOT_SCHEMA_VERSION}）`)
  }
  const sessions = snapshot?.stores?.practiceSessions
  const answers = snapshot?.stores?.answers
  if (!Array.isArray(sessions) || !Array.isArray(answers)) {
    throw new TypeError('快照缺少 stores.practiceSessions / stores.answers')
  }

  await DB.transaction('rw', DB.practiceSessions, DB.answers, async () => {
    // 1) 会话行：按 uid upsert
    for (const row of sessions) {
      if (!row?.uid) throw new Error('快照中有 practiceSessions 记录缺少 uid')
      const existing = await DB.practiceSessions.where('uid').equals(row.uid).first()
      if (existing) await DB.practiceSessions.put({ ...withoutLocalId(row), id: existing.id })
      else await DB.practiceSessions.add(withoutLocalId(row))
    }

    // 2) practiceSessionId → 本机首行 id（外键映射表）
    const pidToSessionId = new Map()
    for (const row of sessions) {
      const pid = row?.practiceSessionId
      if (!pid || pidToSessionId.has(pid)) continue
      const local = await DB.practiceSessions
        .where('practiceSessionId').equals(pid).sortBy('createdAt')
      if (local.length) pidToSessionId.set(pid, local[0].id)
    }

    // 3) 答案：按 uid upsert
    for (const row of answers) {
      if (!row?.uid) throw new Error('快照中有 answers 记录缺少 uid')
      const existing = await DB.answers.where('uid').equals(row.uid).first()
      const remapped = row.practiceSessionId ? (pidToSessionId.get(row.practiceSessionId) ?? null) : null
      if (existing) {
        // 本机已有的行：保留自己的外键，只同步内容
        await DB.answers.put({
          ...withoutLocalId(row),
          sessionId: existing.sessionId ?? remapped,
          id: existing.id,
        })
      } else {
        await DB.answers.add({ ...withoutLocalId(row), sessionId: remapped })
      }
    }
  })
}
