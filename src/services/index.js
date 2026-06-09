// filepath: src/services/index.js
/**
 * Services 桶导出 (S 层)
 *
 * 桥接模式: 当前 src/services/ 仅作桶, 内容仍在 src/utils/services/analysis.js
 * 后续 PR 阶段 2 会把 analysis.js 整体迁到 src/services/analysis.js
 * (本轮最小改动: 仅建桶 + 改 import 路径, 避免大范围破坏)
 *
 * 架构标准: ARCHITECTURE.md § 2.4 "Composable→Service 走 @/services 桶"
 */

export * from './analysis'
// 统一 operator 映射 (ARCHITECTURE.md §2.1 目标树)
export * from './operatorMap'
// 能力画像计算 (2026-06-07 升层自 utils/abilityProfile.js)
export * from './abilityProfile'
// Session 持久化 (2026-06-08 E1 抽层自 stores/practice.js#saveSessionToDB)
export * from './sessionPersistence'
// 注意: wrongAnswerService 不走桶 — 与 analysis.js#getWrongAnswers 同名冲突
// 调用方直引: import { getWrongAnswers } from '@/services/wrongAnswerService'
