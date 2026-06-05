/**
 * 自我评价相关常量 (arch-v2.3-2 整改新增)
 *
 * 抽离自 SelfEvaluationDialog.vue 的硬编码 UI 配置
 * 架构标准: ARCHITECTURE.md § 2.3 (常量集中到 constants/)
 * 命名规范: UPPER_SNAKE
 */

/** 5 个表情配置 (Unicode 表情字符, 直接渲染) */
export const EVAL_FACES = [
  { score: 1, emoji: '😩' },
  { score: 2, emoji: '😟' },
  { score: 3, emoji: '🙂' },
  { score: 4, emoji: '😄' },
  { score: 5, emoji: '😌' },
]

/** 评分标签 (孩子友好的简洁文案) */
export const EVAL_SCORE_LABELS = {
  1: '有点难…',
  2: '不太轻松',
  3: '刚刚好',
  4: '挺容易',
  5: '太简单',
}

/** 默认评分 (用户未点选时的兜底 = 3 = 刚刚好) */
export const DEFAULT_EVAL_SCORE = 3

/** 单击表情后到关闭弹窗的延迟 (ms)
 *  原版 400ms 太快, 延长到 800ms 让用户看清选择 */
export const SELECT_CONFIRM_DELAY_MS = 800
