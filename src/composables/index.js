/**
 * Composables 桶导出 (C 层)
 * 架构标准: ARCHITECTURE.md § 2.4 "组件引用 composable 走 @/composables 桶"
 */
export * from './useAbilityAnalysis'
export * from './useAbilityProfile'
export * from './useAdaptiveSession'
export * from './usePracticeDialogs'
export * from './usePracticeSaver'
export * from './useDisplayStrategy'  // 🆕 PR-4.2 新增
// 🆕 D 组 D2/D4 落地 (2026-06-08):
export * from './useAnswerBuilder'   //     PR-4.x 新增（漏桶补）
export * from './useSubmitHandler'   //     PR-4.x 新增（漏桶补）
export * from './useStatsDrawer'     //     PR-4.x 新增（漏桶补）
export * from './useStatsQuery'      // 🆕 D2 抽 5 个 DB 加载 action
