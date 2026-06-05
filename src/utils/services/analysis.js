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

import { db } from '@/utils/database'

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

  // 按欧氏距离升序（Schwartzian transform：先 map 预解析，再 sort，最后 strip）
  // - 避免 sort 比较器内重复 parseEquationParts（之前每对比较调 2 次）
  // - 同时给 sort 加 null 守卫（filter 阶段已保证 pa/pb 非 null，理论不会触发）
  const decorated = candidates.map((q) => {
    const p = parseEquationParts(q.equation)
    return p && {
      q,
      dist: Math.hypot(p.leftOperand - leftOperand, p.rightOperand - rightOperand),
    }
  }).filter(Boolean)
  decorated.sort((a, b) => a.dist - b.dist)
  const ordered = decorated.map((d) => d.q)

  return ordered.slice(0, limit)
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

// ─── 3.2 错题分析 ────────────────────────────────────────────────

/**
 * 查询错题
 * - 命中 isCorrect 索引（IndexedDB 中 false 存为 0）
 * - operator 过滤通过 questions.operator 索引：先按 operator 拿 questionId，
 *   再 anyOf(questionId) 命中 answers.questionId 索引
 *   （answers 表无 operator 索引，避免全表扫描）
 * - operandMin/Max 在内存过滤
 * - 默认 30 天时间窗（cutoff = now - days*86400e3）
 *
 * @param {object} [filters]
 * @param {string} [filters.operator]   算子（'+' '-' '×' '÷'）
 * @param {number} [filters.operandMin] 仅返回 最小操作数 ≥ 此值
 * @param {number} [filters.operandMax] 仅返回 最大操作数 ≤ 此值
 * @param {number} [filters.days=30]    时间窗口（天）
 * @param {number} [filters.limit]      返回条数上限
 * @returns {Promise<Array<{
 *   answerId:number, questionId:number|null, equation:string, operator:string,
 *   solution:number, userAnswer:number, operandMin:number, operandMax:number,
 *   responseTime:number, timestamp:number,
 *   difficulty:number|null, isCarry:boolean, isBorrow:boolean
 * }>>}
 */
export async function getWrongAnswers({
  operator,
  operandMin,
  operandMax,
  days = 30,
  limit,
} = {}) {
  const cutoff = Date.now() - days * 86400e3
  const isWrong = (a) => a.isCorrect === false

  // 1. 取错题（按 operator 是否给定选不同索引路径）
  let wrongAnswers
  if (operator) {
    // operator 索引在 questions 上：先拿到匹配的 questionId 集合
    const qList = await db.questions.where('operator').equals(operator).toArray()
    const qIds = qList.map((q) => q.id)
    if (qIds.length === 0) return []
    wrongAnswers = await db.answers
      .where('questionId')
      .anyOf(qIds)
      .and((a) => isWrong(a) && a.timestamp > cutoff)
      .toArray()
  } else {
    // 无 operator：直接用 timestamp 索引（主过滤条件）
    wrongAnswers = await db.answers
      .where('timestamp')
      .above(cutoff)
      .and(isWrong)
      .toArray()
  }

  if (wrongAnswers.length === 0) return []

  // 2. 内存过滤 operandMin/Max
  if (operandMin != null) {
    wrongAnswers = wrongAnswers.filter((a) => a.operandMin >= operandMin)
  }
  if (operandMax != null) {
    wrongAnswers = wrongAnswers.filter((a) => a.operandMax <= operandMax)
  }

  // 3. 按时间倒序（最近的错题优先），再 limit
  wrongAnswers.sort((a, b) => b.timestamp - a.timestamp)
  if (limit != null && limit > 0) {
    wrongAnswers = wrongAnswers.slice(0, limit)
  }

  // 4. 批量 join questions：拿 difficulty / isCarry / isBorrow
  //    （answer 记录里也有 isCarry/isBorrow，但 question 是权威源）
  const uniqueQIds = [
    ...new Set(wrongAnswers.map((a) => a.questionId).filter((id) => id != null)),
  ]
  const qMap = await loadQuestionsByIds(uniqueQIds)

  // 5. 拼装返回结构
  return wrongAnswers.map((a) => {
    const q = a.questionId != null ? qMap.get(a.questionId) : null
    return {
      answerId: a.id,
      questionId: a.questionId ?? null,
      equation: a.equation,
      operator: a.operator,
      solution: a.solution,
      userAnswer: a.userAnswer,
      operandMin: a.operandMin,
      operandMax: a.operandMax,
      responseTime: a.responseTime,
      timestamp: a.timestamp,
      // 来自 questions（找不到时回落到 answer 旧字段）
      difficulty: q ? q.difficulty : (a.difficulty ?? null),
      isCarry: q ? q.isCarry : !!a.isCarry,
      isBorrow: q ? q.isBorrow : !!a.isBorrow,
    }
  })
}

/**
 * 评估错题改正效果（按时序分段）
 * - 段（segment）: 连续同 isCorrect 的一组作答
 * - 切换规则: isCorrect 翻转时新开一段；段 endedAt = 触发翻转的下一题 startedAt
 * - correctionStreak: 最后一错之后连续答对的次数
 *   当最后一段是 correct 时，等于该段 attempts；最后答错则为 0
 * - effectRating:
 *     streak >= 3 → 'improved'
 *     streak >= 1 → 'unstable'
 *     streak == 0 → 'still-struggling'
 *
 * @param {number} questionId
 * @param {object} [opts]
 * @param {number} [opts.days=30] 时间窗口（天）
 * @returns {Promise<{
 *   questionId:number|null,
 *   totalAttempts:number, finalCorrect:boolean,
 *   correctionStreak:number, effectRating:'improved'|'unstable'|'still-struggling',
 *   segments:Array<{startedAt:number, endedAt:number, isCorrect:boolean, attempts:number, finalCorrect:boolean}>
 * }>}
 */
export async function evaluateCorrectionEffect(questionId, { days = 30 } = {}) {
  const empty = {
    questionId: questionId ?? null,
    totalAttempts: 0,
    finalCorrect: false,
    correctionStreak: 0,
    effectRating: 'still-struggling',
    segments: [],
  }

  if (questionId == null) return empty

  const cutoff = Date.now() - days * 86400e3
  // 按 startedAt 升序（v3 字段，迁移时从 timestamp-responseTime 回填）
  const raw = await db.answers
    .where('questionId')
    .equals(questionId)
    .toArray()
  const answers = raw
    .filter((a) => a.startedAt > cutoff)
    .sort((a, b) => a.startedAt - b.startedAt)

  if (answers.length === 0) {
    return { ...empty, questionId }
  }

  // 1. 划分段
  const segments = []
  let cur = null
  for (const a of answers) {
    if (!cur) {
      cur = {
        startedAt: a.startedAt,
        endedAt: a.startedAt,
        isCorrect: a.isCorrect,
        attempts: 1,
        finalCorrect: a.isCorrect,
      }
    } else if (cur.isCorrect === a.isCorrect) {
      // 同结果：累加 attempts
      cur.attempts += 1
      cur.endedAt = a.startedAt
      cur.finalCorrect = a.isCorrect
    } else {
      // 翻转：段真正在 a.startedAt 结束
      cur.endedAt = a.startedAt
      segments.push(cur)
      cur = {
        startedAt: a.startedAt,
        endedAt: a.startedAt,
        isCorrect: a.isCorrect,
        attempts: 1,
        finalCorrect: a.isCorrect,
      }
    }
  }
  if (cur) segments.push(cur)

  // 2. 总体效果
  const totalAttempts = answers.length
  const lastSeg = segments[segments.length - 1]
  const finalCorrect = lastSeg.isCorrect
  // 最后答错 → 0；最后答对 → 取最后一段 attempts
  const correctionStreak = lastSeg.isCorrect ? lastSeg.attempts : 0

  let effectRating
  if (correctionStreak >= 3) effectRating = 'improved'
  else if (correctionStreak >= 1) effectRating = 'unstable'
  else effectRating = 'still-struggling'

  return {
    questionId,
    totalAttempts,
    finalCorrect,
    correctionStreak,
    effectRating,
    segments,
  }
}

/**
 * 错题优先级排序（综合：错误频率 / 未改正 / 最近出错）
 * - 评分公式:
 *     priority = wrongCount * 10
 *              + (isResolved ? 0 : 5)        // 未改正 +5
 *              + recencyScore                  // 越近分越高
 *   recencyScore: <1天+10, <7天+5, <30天+2, >=30天+0
 * - 暂不实现"全面薄弱"加成分（占位 0），等阶段 5 弱项算法联动
 * - 全时间聚合（无 days 限制）
 *
 * @param {object} [opts]
 * @param {number} [opts.limit=20] 返回条数上限
 * @returns {Promise<Array<{
 *   questionId:number, equation:string, operator:string, difficulty:number|null,
 *   wrongCount:number, totalAttempts:number,
 *   lastWrongAt:number, lastCorrectAt:number|null, isResolved:boolean,
 *   priority:number
 * }>>}
 */
export async function prioritizeWrongAnswers({ limit = 20 } = {}) {
  // 1. 取所有错题（命中 isCorrect 索引）
  const wrongAnswers = await db.answers.where('isCorrect').equals(0).toArray()
  if (wrongAnswers.length === 0) return []

  // 2. 按 questionId 聚合：wrongCount + lastWrongAt
  const byQ = new Map()
  for (const a of wrongAnswers) {
    if (a.questionId == null) continue
    const cur = byQ.get(a.questionId) || {
      questionId: a.questionId,
      wrongCount: 0,
      lastWrongAt: 0,
    }
    cur.wrongCount += 1
    if (a.timestamp > cur.lastWrongAt) cur.lastWrongAt = a.timestamp
    byQ.set(a.questionId, cur)
  }

  const uniqueQIds = [...byQ.keys()]
  if (uniqueQIds.length === 0) return []

  // 3. 批量取 questions 元数据（PK 查找，**复用 loadQuestionsByIds helper**）
  const qMap = await loadQuestionsByIds(uniqueQIds)

  // 4. 一次 anyOf 取这些题目的所有记录，内存里求 totalAttempts + lastCorrectAt
  const allForQ = await db.answers
    .where('questionId')
    .anyOf(uniqueQIds)
    .toArray()
  const totalByQ = new Map()
  const lastCorrectByQ = new Map()
  for (const a of allForQ) {
    totalByQ.set(a.questionId, (totalByQ.get(a.questionId) || 0) + 1)
    if (a.isCorrect === true) {
      const cur = lastCorrectByQ.get(a.questionId) || 0
      if (a.timestamp > cur) lastCorrectByQ.set(a.questionId, a.timestamp)
    }
  }

  // 5. 计算 priority
  const now = Date.now()
  const DAY = 86400e3
  const results = []
  for (const [qId, stat] of byQ) {
    const q = qMap.get(qId)
    const lastCorrectAt = lastCorrectByQ.get(qId) || null
    const isResolved = lastCorrectAt != null

    let recencyScore = 0
    const delta = now - stat.lastWrongAt
    if (delta < 1 * DAY) recencyScore = 10
    else if (delta < 7 * DAY) recencyScore = 5
    else if (delta < 30 * DAY) recencyScore = 2
    else recencyScore = 0

    const priority =
      stat.wrongCount * 10 + (isResolved ? 0 : 5) + recencyScore

    results.push({
      questionId: qId,
      equation: q ? q.equation : '',
      operator: q ? q.operator : '',
      difficulty: q ? q.difficulty : null,
      wrongCount: stat.wrongCount,
      totalAttempts: totalByQ.get(qId) || stat.wrongCount,
      lastWrongAt: stat.lastWrongAt,
      lastCorrectAt,
      isResolved,
      priority,
    })
  }

  // 6. 排序 + 截断
  results.sort((a, b) => b.priority - a.priority)
  return results.slice(0, limit)
}

// ─── 4.0 internal helpers ────────────────────────────────────────

/**
 * @internal
 * 批量加载 questions，返回 Map<id, question> 便于 O(1) 查询
 * - ids 为空直接返回空 Map（避免无效 DB 调用）
 * - 仅本文件内部使用：阶段 3 的 2 处重复（行 309 / 478）暂不回头改；
 *   阶段 9 验收时统一 refactor（阶段 3 + 阶段 4）
 * @param {Array<number>} ids
 * @returns {Promise<Map<number, object>>}
 */
async function loadQuestionsByIds(ids) {
  if (!ids.length) return new Map()
  const qs = await db.questions.where('id').anyOf(ids).toArray()
  return new Map(qs.map((q) => [q.id, q]))
}

// ─── 3.3 学习曲线 ────────────────────────────────────────────────

/**
 * 单题学习曲线（答题历史时间序列）
 * - 命中 questionId 索引，内存按 startedAt 时间窗口过滤
 * - 按 startedAt 升序，标 attemptIndex（0-based）
 * - 每点 responseTime 用 getEffectiveResponseTime 兜底（v1 旧字段 → v3 startedAt/endedAt）
 * - 不 join questions（题目元数据走 questionId 单独取）
 *
 * @param {number} questionId
 * @param {object} [opts]
 * @param {number} [opts.days=30] 时间窗口（天）
 * @returns {Promise<Array<{
 *   timestamp:number, startedAt:number, endedAt:number,
 *   isCorrect:boolean, responseTime:number|null, isTimeout:boolean,
 *   userAnswer:number, attemptIndex:number
 * }>>}
 */
export async function getLearningCurve(questionId, { days = 30 } = {}) {
  if (questionId == null) return []

  // 命中 questionId 索引；时间窗口内存过滤（与 evaluateCorrectionEffect 一致）
  const cutoff = Date.now() - days * 86400e3
  const raw = await db.answers
    .where('questionId')
    .equals(questionId)
    .toArray()
  const answers = raw
    .filter((a) => a.startedAt > cutoff)
    .sort((a, b) => a.startedAt - b.startedAt)

  if (answers.length === 0) return []

  return answers.map((a, idx) => {
    const { responseTime, isTimeout } = getEffectiveResponseTime(a)
    return {
      timestamp: a.timestamp,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
      isCorrect: a.isCorrect,
      responseTime,
      isTimeout,
      userAnswer: a.userAnswer,
      attemptIndex: idx,
    }
  })
}

/**
 * 单数字历史正确率曲线（按日期桶聚合）
 * - 命中 *operands multiEntry 索引查所有含 number 的 questions
 * - anyOf(questionId) 命中 answers 索引
 * - 按日期桶（YYYY-MM-DD）聚合 total/correct/questionsCount
 * - 与 getMasteryByNumber 的差异：后者是"全时间单值聚合"，本函数是"按时段序列"
 *
 * @param {number} number
 * @param {object} [opts]
 * @param {number} [opts.days=30] 时间窗口（天）
 * @returns {Promise<Array<{
 *   date:string, total:number, correct:number, accuracy:number,
 *   questionsCount:number
 * }>>}
 */
export async function getNumberCurve(number, { days = 30 } = {}) {
  if (number == null) return []

  // 1. 查所有 operands 包含 number 的题目（multiEntry 索引）
  const questions = await db.questions.where('operands').equals(number).toArray()
  if (questions.length === 0) return []

  const qIds = questions.map((q) => q.id)

  // 2. 查这些题目的答题记录（questionId 索引 + 时间窗口内存过滤）
  //    用 timestamp 而非 startedAt：与 getMasteryByNumber 保持一致（同属"数字聚合"语义）
  const cutoff = Date.now() - days * 86400e3
  const raw = await db.answers
    .where('questionId')
    .anyOf(qIds)
    .toArray()
  const answers = raw.filter((a) => a.timestamp > cutoff)

  if (answers.length === 0) return []

  // 3. 按日期桶聚合（YYYY-MM-DD 字符串）
  const buckets = new Map() // date -> { total, correct, qIds: Set }
  for (const a of answers) {
    const date = new Date(a.timestamp).toISOString().slice(0, 10)
    let bucket = buckets.get(date)
    if (!bucket) {
      bucket = { total: 0, correct: 0, qIds: new Set() }
      buckets.set(date, bucket)
    }
    bucket.total += 1
    if (a.isCorrect) bucket.correct += 1
    if (a.questionId != null) bucket.qIds.add(a.questionId)
  }

  // 4. 转数组 + 按日期升序
  return [...buckets.entries()]
    .map(([date, b]) => ({
      date,
      total: b.total,
      correct: b.correct,
      accuracy: b.total > 0 ? b.correct / b.total : 0,
      questionsCount: b.qIds.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ─── 3.4 动态弱项 / 强项 ────────────────────────────────────────

/**
 * @internal
 * 通用聚合：按 questionId 聚合所有 answers，返回每题的总/正确/响应时间/最近作答
 * - 全量 answers（v3 schema 无更强索引，只能全表；阶段 9 考虑加 timestamp 上界）
 * - 按 questionId 分组 reduce，关联 questions 表（**复用 loadQuestionsByIds**）
 * - responseTime 用 getEffectiveResponseTime 兜底（**复用**，不内联）
 * - 过滤 total >= minSample
 *
 * @param {object} [opts]
 * @param {number} [opts.minSample=3] 最少作答次数门槛
 * @returns {Promise<Array<{
 *   questionId:number, equation:string,
 *   total:number, correct:number, totalRT:number, lastSeenAt:number,
 *   accuracy:number, avgResponseTime:number|null
 * }>>}
 */
async function _aggregateQuestions({ minSample = 3 } = {}) {
  // 1. 全量查 answers（v3 schema 无更强索引）
  const answers = await db.answers.toArray()

  // 2. 按 questionId 分组 reduce
  const map = new Map()
  for (const a of answers) {
    if (a.questionId == null) continue
    let g = map.get(a.questionId)
    if (!g) {
      g = {
        questionId: a.questionId,
        equation: a.equation, // 先用 answer 的 equation（兜底）
        total: 0,
        correct: 0,
        totalRT: 0,
        lastSeenAt: 0,
      }
      map.set(a.questionId, g)
    }
    g.total += 1
    if (a.isCorrect) g.correct += 1
    // 复用 getEffectiveResponseTime（不内联）——落实阶段 3 review 建议
    const { responseTime } = getEffectiveResponseTime(a)
    if (responseTime != null) g.totalRT += responseTime
    g.lastSeenAt = Math.max(g.lastSeenAt, a.startedAt ?? a.timestamp ?? 0)
  }

  // 3. 关联 questions 表拿权威 equation（**复用 loadQuestionsByIds**）
  const qMap = await loadQuestionsByIds([...map.keys()])
  for (const g of map.values()) {
    const q = qMap.get(g.questionId)
    g.equation = q?.equation ?? g.equation
  }

  // 4. 计算衍生字段
  for (const g of map.values()) {
    g.accuracy = g.total > 0 ? g.correct / g.total : 0
    g.avgResponseTime = g.total > 0 ? g.totalRT / g.total : null
  }

  // 5. 过滤 + 转数组
  return [...map.values()].filter((g) => g.total >= minSample)
}

/**
 * 动态弱项（v2 简化版）：单桶全时间聚合 + 最小样本门槛
 * - 按 accuracy 升序（最不熟排前）
 * - 全时间（无 days 限制）；阶段 9 考虑加时间窗口
 *
 * @param {object} [opts]
 * @param {number} [opts.minSample=3] 最少作答次数
 * @returns {Promise<Array<{
 *   questionId:number, equation:string,
 *   total:number, correct:number, accuracy:number,
 *   avgResponseTime:number|null, lastSeenAt:number
 * }>>}
 */
export async function getDynamicWeakness({ minSample = 3 } = {}) {
  const groups = await _aggregateQuestions({ minSample })
  return groups.sort((a, b) => a.accuracy - b.accuracy)
}

/**
 * 动态强项（v2 简化版）：综合 accuracy + 响应速度
 * - 评分公式：score = accuracy * 0.7 + (1 - avgResponseTime / maxRT) * 0.3
 * - 按 score 降序
 * - 全时间（无 days 限制）
 *
 * @param {object} [opts]
 * @param {number} [opts.minSample=3] 最少作答次数
 * @returns {Promise<Array<{
 *   questionId:number, equation:string,
 *   total:number, correct:number, accuracy:number,
 *   avgResponseTime:number|null, lastSeenAt:number,
 *   score:number
 * }>>}
 */
export async function getDynamicStrength({ minSample = 3 } = {}) {
  const groups = await _aggregateQuestions({ minSample })
  // 空数据防御：避免 Math.max(...[]) 返回 -Infinity
  if (groups.length === 0) return []
  // maxRT 防御：所有题都无 responseTime 时退化为纯 accuracy 排序（除以 1）
  const maxRT = Math.max(...groups.map((g) => g.avgResponseTime ?? 0))
  const divisor = maxRT || 1
  return groups
    .map((g) => ({
      ...g,
      score:
        g.accuracy * 0.7 +
        (1 - (g.avgResponseTime ?? 0) / divisor) * 0.3,
    }))
    .sort((a, b) => b.score - a.score)
}
