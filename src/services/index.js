// filepath: src/services/index.js
/**
 * Services 桶导出 (S 层)
 *
 * 桶 + 领域类：analysis / operatorMap / abilityProfile / adaptiveEngine /
 * PracticeSession / Question / Answer / WrongAnswer 均已在本目录。
 *
 * 架构标准: ARCHITECTURE.md § 2.4 "Composable→Service 走 @/services 桶"
 */

export * from './analysis'
// 统一 operator 映射 (ARCHITECTURE.md §2.1 目标树)
export * from './operatorMap'
// 能力画像加载 + 查询 (2026-06-10 类化: Profile class)
export * from './abilityProfile'
// 自适应引擎 (2026-06-10 升层自 utils/algorithm)
export * from './adaptiveEngine'
// PracticeSession 域类 + CRUD
export * from './PracticeSession'
// 领域模型 (2026-06-12 迁自 utils/algorithm)
export * from './Question'
export * from './Answer'
export * from './WrongAnswer'
// 领域模型 (2026-06-12 迁自 utils/algorithm，含原 wrongAnswerService CRUD)
export { DB } from './databaseInit'
