/**
 * 数据访问 S 层代理（对接 services/databaseInit + utils/store/database）
 *
 * 保持向后兼容：当前 re-export utils/store/database.js 的全部 export。
 * 未来消费者全部改引 services/databaseInit 或 utils/store/database。
 */
export {
  default as DB, default,
  saveSession, getSessions, getSessionDetail, deleteSession,
  saveAbilitySnapshot, getLatestAbilitySnapshot,
  getAggregatedStats, exportAllData, importAllData, clearAllData,
} from '@/utils/store/database'
