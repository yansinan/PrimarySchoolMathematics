// filepath: src/utils/services/analysis.js
/**
 * 能力分析服务层（v2 P2 阶段 2）
 *
 * 提供题目聚合、响应时间修正等查询能力。本文件只读 query，
 * 不写 DB（聚合结果现算，符合"DB 只存元数据"原则）。
 *
 * 设计文档：designDocs/PLAN-v2-ability-analysis.md § 3
 * - § 3.0 responseTime 辅助
 * - § 3.1 题目聚合（findEquivalent / findRelated / getMasteryByNumber）
 */

import {
  db,
  saveQuestion,
  getQuestion,
  getQuestionByEquation,
} from '@/utils/database'

// ─── 辅助工具 ─────────────────────────────────────────────────────

/**
 * 将 equation 字符串解析为 {leftOperand, operator, rightOperand}
 * - 形如 "23+47=" / "15-8=" / "7×8=" / "12÷3="
 * - 失败返回 null（输入不含 = 或运算符不识别）
 * @param {string} equation
 * @returns {{leftOperand:number, operator:string, rightOperand:number} | null}
 */
function parseEquationParts(equation) {
  const m = equation.match(/^(\d+)([+\-×÷])(\d+)=$/)
  if (!m) return null
  return {
    leftOperand: +m[1],
    operator: m[2],
    rightOperand: +m[3],
  }
}

/**
 * operator 标准化（符号 → 内部表示）
 * - `×` → `*`
 * - `÷` → `/`
 * - `+` `-` 保持
 * 当前阶段（小学 1 年级）仅 + / -，但保留供阶段 3+ 复用
 * @param {string} op
 * @returns {string}
 */
function normalizeOperator(op) {
  if (op === '×') return '*'
  if (op === '÷') return '/'
  return op
}

// ─── 3.0 responseTime 辅助 ────────────────────────────────────────

/**
 * 获取单条 answer 的有效 responseTime
 * - 优先用 a.responseTime（v1/v2 旧字段，可能为 0 / undefined）
 * - 兜底用 a.endedAt - a.startedAt（v3 新增字段，迁移时补齐）
 * - 异常检测：< 200ms（太快，疑似猜）或 > 5min（疑似离开）
 * - 不写回 DB（决策 #6：服务层返回，不回写）
 *
 * @param {object} answer - Answer 记录
 * @returns {{
 *   responseTime: number|null,
 *   computedResponseTime: number|null,
 *   isComputed: boolean,
 *   isTimeout: boolean
 * }}
 */
export function getEffectiveResponseTime(answer) {
  let rt = answer.responseTime
  let computed = false
  if (rt == null && answer.endedAt != null && answer.startedAt != null) {
    rt = answer.endedAt - answer.startedAt
    computed = true
  }
  const isTimeout = rt != null && (rt < 200 || rt > 5 * 60 * 1000)
  return {
    responseTime: rt,
    computedResponseTime: rt,
    isComputed: computed,
    isTimeout,
  }
}

// ─── 3.1 题目聚合 ────────────────────────────────────────────────

/**
 * 同等题查询
 * - 加法：按交换律查（4+3 ⇔ 3+4），生成两个 equation 字符串一并查
 * - 减法：减法不视为同等（8-3 与 3-8 答案不同、意义不同），仅查原式
 * - 乘除法：暂不实现（小学 1 年级未涉及），仅查原式
 *
 * 返回数组可能包含原式（若原式存在于 DB），由上游 composable 决定是否过滤。
 *
 * @param {string} equation - 题目字符串，如 "4+3="
 * @returns {Promise<Array<object>>} - 命中的 Question 记录
 */
export async function findEquivalent(equation) {
  const parts = parseEquationParts(equation)
  if (!parts) return []

  // 默认查原式
  const queries = [`${parts.leftOperand}${parts.operator}${parts.rightOperand}=`]
  // 加法额外查交换律版本
  if (parts.operator === '+') {
    queries.push(`${parts.rightOperand}+${parts.leftOperand}=`)
  }

  // 单次 anyOf 查询
  return db.questions.where('equation').anyOf(queries).toArray()
}

/**
 * 相关题查询（同 operator + 数字在 ±range 范围内）
 * 例：findRelated("34+3=", { range: 3, limit: 10 })
 *   → leftOperand ∈ [31, 37] 且 rightOperand ∈ [0, 6]，排除自身
 *
 * 性能：~1000 题库目标 < 30ms。当前实现：按 operator 全量加载（无 leftOperand
 * 索引），内存内范围过滤 + 欧氏距离排序。
 *
 * @param {string} equation - 题目字符串
 * @param {object} [opts]
 * @param {number} [opts.range=3] - 数字范围半径
 * @param {number} [opts.limit=10] - 返回数量上限
 * @returns {Promise<Array<object>>} - 按欧氏距离升序的 Question 记录
 */
export async function findRelated(equation, { range = 3, limit = 10 } = {}) {
  const parts = parseEquationParts(equation)
  if (!parts) return []
  const { leftOperand, operator, rightOperand } = parts

  // 按 operator 查（无 leftOperand 索引，全量加载后内存过滤）
  const all = await db.questions.where('operator').equals(operator).toArray()

  const leftMin = leftOperand - range
  const leftMax = leftOperand + range
  const rightMin = rightOperand - range
  const rightMax = rightOperand + range

  // 范围过滤 + 排除自身
  const candidates = all.filter((q) => {
    if (q.equation === equation) return false
    const p = parseEquationParts(q.equation)
    if (!p) return false
    return (
      p.leftOperand >= leftMin &&
      p.leftOperand <= leftMax &&
      p.rightOperand >= rightMin &&
      p.rightOperand <= rightMax
    )
  })

  // 按欧氏距离升序
  candidates.sort((a, b) => {
    const pa = parseEquationParts(a.equation)
    const pb = parseEquationParts(b.equation)
    const distA = Math.hypot(
      pa.leftOperand - leftOperand,
      pa.rightOperand - rightOperand,
    )
    const distB = Math.hypot(
      pb.leftOperand - leftOperand,
      pb.rightOperand - rightOperand,
    )
    return distA - distB
  })

  return candidates.slice(0, limit)
}

/**
 * 数字聚合：所有 operands 包含该 number 的题目的正确率统计
 * - 通过 multiEntry 索引 `*operands` 命中题目
 * - 限制时间窗口：默认近 30 天（cutoff = now - days*86400e3）
 * - 涉及题目数（questionsCount）独立于作答次数（total）
 *
 * @param {number} number - 目标数字
 * @param {object} [opts]
 * @param {number} [opts.days=30] - 时间窗口（天）
 * @returns {Promise<{
 *   number: number,
 *   total: number,
 *   correct: number,
 *   accuracy: number,
 *   questionsCount: number,
 *   days: number,
 * }>}
 */
export async function getMasteryByNumber(number, { days = 30 } = {}) {
  // 1. 查所有 operands 包含 number 的题目（multiEntry 索引）
  const questions = await db.questions.where('operands').equals(number).toArray()
  const questionIds = questions.map((q) => q.id)

  if (questionIds.length === 0) {
    return {
      number,
      total: 0,
      correct: 0,
      accuracy: 0,
      questionsCount: 0,
      days,
    }
  }

  // 2. 查这些题目的答题记录（questionId 索引 + 时间窗口内存过滤）
  const cutoff = Date.now() - days * 86400e3
  const answers = await db.answers
    .where('questionId')
    .anyOf(questionIds)
    .and((a) => a.timestamp > cutoff)
    .toArray()

  // 3. 统计
  const total = answers.length
  const correct = answers.filter((a) => a.isCorrect).length
  const accuracy = total > 0 ? correct / total : 0

  return {
    number,
    total,
    correct,
    accuracy,
    questionsCount: questions.length,
    days,
  }
}
