/**
 * 数据访问 S 层代理（薄封装 utils/store/database.js）
 * 
 * 用途：v4.0a 过渡层——当前全部 re-export utils/store/database.js 的 export，
 * 未来逐步将 @/utils/store/database 调用者迁移到此，
 * 最终合并到本文件中（删 utils/store/database.js 原生实现）。
 *
 * 调用方：import { saveSession } from '@/services/database'
 * （不要用 barrel @/services——本文件不通过 /services 桶导出，
 *  调用方显式 import 以保持代理语义清晰）
 *
 * @see ARCHITECTURE.md § 1.1 S 层 = 领域规则（data access 归 S 层）
 * @see v4-PLAN-error-injection.md § v4.0a
 */
export {
  default as DB,
  saveSession,
  getSessions,
  getSessionDetail,
  deleteSession,
  saveAbilitySnapshot,
  getLatestAbilitySnapshot,
  getAggregatedStats,
  exportAllData,
  importAllData,
  getAllAnswers,
  clearAllData,
  saveQuestion,
  getQuestion,
  getQuestionByEquation,
} from '@/utils/store/database'
