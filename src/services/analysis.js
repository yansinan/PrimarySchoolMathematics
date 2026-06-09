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

import db from '@/utils/store/database'
import { getAnswerScore, sumAnswerScores } from '@/utils/score'
import { Question } from '@/utils/algorithm/question'
import { Answer } from '@/utils/algorithm/answer'
import { WrongAnswer } from '@/utils/algorithm/wrongAnswer'

// ─── 辅助工具 ─────────────────────────────────────────────────────

// parseEquationParts 已被 Question._parseEquationTriple 替代。
// 业务侧改用 Question.findByEquation / Question.filterByLevel /
// Question.levelMatch（这些方法内部已统一方程解析）。

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
  if (!equation) return []
  // 用 Question.findByEquation 找等价族（交换律 + 事实家族 + =__ 形式兼容）
  // 注：原实现只查加法交换律 + DB where('equation')anyOf；新版统一走内存匹配
  // 优点：内部解析升级（×÷、负数、__ 占位）自动受益
  const all = await db.questions.toArray()
  return Question.findByEquation(all, equation, { exact: false })
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
  const triple = Question._parseEquationTriple(equation)
  if (!triple) return []

  const { bodyA, bodyB, op } = triple

  // 按 operator 查（无 leftOperand 索引，全量加载后内存过滤）
  // 注：questions.operator 字段是字符串（'+'/'-'/'×'/'÷'）而非 opNum
  const all = await db.questions.where('operator').equals(op).toArray()

  const leftMin = bodyA - range
  const leftMax = bodyA + range
  const rightMin = bodyB - range
  const rightMax = bodyB + range

  // 范围过滤 + 排除自身（用 Question.fromJSON 解析）
  const candidates = []
  for (const plain of all) {
    if (plain.equation === equation) continue
    const q = plain instanceof Question ? plain : Question.fromJSON(plain)
    const qt = Question._parseEquationTriple(q.equation || '')
    if (!qt) continue
    if (qt.bodyA < leftMin || qt.bodyA > leftMax) continue
    if (qt.bodyB < rightMin || qt.bodyB > rightMax) continue
    candidates.push(q)
  }

  // 按欧氏距离升序（Schwartzian transform：先 map 预解析，再 sort，最后 strip）
  const decorated = candidates.map((q) => {
    const qt = Question._parseEquationTriple(q.equation || '')
    return qt && { q, dist: Math.hypot(qt.bodyA - bodyA, qt.bodyB - bodyB) }
  }).filter(Boolean)
  decorated.sort((a, b) => a.dist - b.dist)
  return decorated.map((d) => d.q).slice(0, limit)
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
  // P2 阶段 13：不依赖 questions.operands 字段（migration 不一致），
  // 改从 operandMin + operandMax 反推数位（“3”' ’、‘8' 也击 number=3、8）
  const allQuestions = await db.questions.toArray()
  const questions = allQuestions.filter((q) => Question.extractOperandDigits(q).includes(number))
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
  const score = total > 0 ? sumAnswerScores(answers) / total : 0
  const correct = answers.filter((a) => getAnswerScore(a) === 1).length
  const accuracy = score

  return {
    number,
    total,
    correct,
    score,
    accuracy,
    questionsCount: questions.length,
    days,
  }
}

/**
 * P2 阶段 11：从传入的 answers 算 masteryByNumber（不查 db.answers）
 * - 用于“本轮”/“本组”等上下文相关数据源（不同统计范围）
 * - 仍查 db.questions 拿 operands 字段（反查哪些题涉及该数字）
 *
 * @param {Array} answers - caller 传入的 answer 数组（任意范围）
 * @param {number} number - 目标数字
 * @returns {Promise<{
 *   number:number, total:number, correct:number, accuracy:number, questionsCount:number
 * }>}
 */
async function _getMasteryByNumberFromAnswers(answers, number) {
  // P5 v2.3.0 兼容修复：答案记录无 questionId（从 currentQuestion spread 但 ID 被丢失），
  // 直接从 answer.operandMin/Max 提取数位
  // 不用 Answer.fromJSON 包装：getter (userAnswer===solution) 与 fixture
  // (isCorrect:false + userAnswer=任意) 冲突，会让"假错题"被计为正确
  const ansList = answers || []
  const qIds = [...new Set(ansList.map((a) => a.questionId).filter((id) => id != null))]
  // 兼容：无 questionId 时直接用 answer 自身字段
  const useAnswerDirectly = qIds.length === 0
  const qMap = useAnswerDirectly ? null : await Question.loadByIds(qIds)

  let total = 0
  let correct = 0
  let score = 0
  const qIdsWithNumber = new Set()
  for (const a of ansList) {
    // 优先用 question 字段，没有则用 answer 自身
    const q = qMap ? qMap.get(a.questionId) : null
    const refForDigits = q || a
    if (!refForDigits || !Question.extractOperandDigits(refForDigits).includes(number)) continue
    total += 1
    // 用 getAnswerScore 而非 Answer.score getter：
    //   - getter 严格要求 userAnswer === solution
    //   - getAnswerScore 优先用 a.score 字段，回退到 a.isCorrect
    //   - 测试 fixture 经常用 isCorrect=false + userAnswer=60 这种组合
    //   - 这是“兼容历史数据”的妥协，正常答题流两个判断一致
    const attemptScore = getAnswerScore(a)
    score += attemptScore
    if (attemptScore === 1) correct += 1
    if (q) qIdsWithNumber.add(a.questionId)
  }

  return {
    number,
    total,
    correct,
    score: total > 0 ? score / total : 0,
    accuracy: total > 0 ? score / total : 0,
    questionsCount: qIdsWithNumber.size,
  }
}

/**
 * P2 阶段 13：从 question.operandMin + operandMax 反推涉及的数字（0-9）
 * - 原因：questions.operands 字段在 migration 中只填了 [operandMin, operandMax]，
 *   而设计意图是"按数位拆分"（13+15 → [1,3,1,5]）。直接查 equals(n) 会丢失 0-9 范围。
 * - 修正：反推方式同时保证代码与设计语义一致，不依赖 questions.operands。
 * - 现用 Question 类的 operandMin/operandMax getter 访问字段。
 /**
  * @param {{operandMin:number, operandMax:number}} q - question
  * @returns {number[]} 涉及的所有数字（0-9，去重）
  * @deprecated 用 Question.extractOperandDigits(q)
  */
 function _extractOperandDigits(q) {
   return Question.extractOperandDigits(q)
 }

/**
 * P2 阶段 11：批量查 0-9 数字 mastery（从 caller 传入的 answers 算）
 * - 三个调用方不同数据范围：
 *   - StatsDrawer：传 db.answers 全量（历史所有）
 *   - PracticeSummaryDialog：传 adaptiveAnswers（本轮）
 *   - SelfEvaluationDialog：传 session.answers（本组）
 *
 * @param {Array} answers - caller 传入的 answer 数组
 * @returns {Promise<Array<{number, total, correct, accuracy, questionsCount}>>}
 */
export async function getMasteryByNumberFromAnswersBatch(answers) {
  const numbers = Array.from({ length: 10 }, (_, i) => i)
  return await Promise.all(
    numbers.map((n) => _getMasteryByNumberFromAnswers(answers || [], n))
  )
}

export async function _getStrengthByNumberBatch(answers, { minScore = 1, minTotal = 3 } = {}) {
  const batch = await getMasteryByNumberFromAnswersBatch(answers)
  return batch
    .filter((r) => r.total >= minTotal && r.score >= minScore)
    .sort((a, b) => b.score - a.score)
}

export async function _getMidByNumberBatch(answers, { minScore = 0.5, maxScore = 1, minTotal = 3 } = {}) {
  const batch = await getMasteryByNumberFromAnswersBatch(answers)
  return batch
    .filter((r) => r.total >= minTotal && r.score >= minScore && r.score < maxScore)
    .sort((a, b) => b.score - a.score)
}

export async function _getWeaknessByNumberBatch(answers, { maxScore = 0.5, minTotal = 1 } = {}) {
  const batch = await getMasteryByNumberFromAnswersBatch(answers)
  return batch
    .filter((r) => r.total >= minTotal && r.score < maxScore)
    .sort((a, b) => a.score - b.score)
}

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
  // 用静态方法 Answer.isCorrect(a) 走数学真理（userAnswer === solution）
  const isWrong = (a) => !Answer.isCorrect(a)

  // 1. 取错题（按 operator 是否给定选不同索引路径）
  //    用 Dexie 索引查 → 内存里用 WrongAnswer.filterBy 统一过滤
  let candidates
  if (operator) {
    // operator 索引在 questions 上：先拿到匹配的 questionId 集合
    const qList = await db.questions.where('operator').equals(operator).toArray()
    const qIds = qList.map((q) => q.id)
    if (qIds.length === 0) return []
    candidates = await db.answers
      .where('questionId')
      .anyOf(qIds)
      .and((a) => a.timestamp > cutoff)
      .toArray()
  } else {
    // 无 operator：直接用 timestamp 索引（主过滤条件）
    candidates = await db.answers
      .where('timestamp')
      .above(cutoff)
      .and(isWrong)
      .toArray()
  }

  if (candidates.length === 0) return []

  // 2. 用 WrongAnswer.filterBy 统一过滤（operandMin/Max/limit）
  //    注意：isCorrect 已在 Dexie 层过滤，此处 set 已只含错题 → includeFixed 默认 false 仍生效
  //    不传 operator：原版通过 db.questions.where('operator')=eq 走题目级索引
  //    （answer.operator 是写入时的反规范副本，可能与 question.operator 不一致）
  const filtered = WrongAnswer.filterBy(candidates, {
    minOperand: operandMin,
    maxOperand: operandMax,
    days,            // days 也已应用，filterBy 内部会再算一次 cutoff，幂等
    limit,
  })

  if (filtered.length === 0) return []

  // 3. 批量 join questions：拿 difficulty / isCarry / isBorrow
  //    （answer 记录里也有 isCarry/isBorrow，但 question 是权威源）
  const uniqueQIds = [
    ...new Set(filtered.map((a) => a.questionId).filter((id) => id != null)),
  ]
  const qMap = await Question.loadByIds(uniqueQIds)

  // 4. 拼装返回结构（保持原 shape 不变）
  return filtered.map((a) => {
    const q = a.questionId != null ? qMap.get(a.questionId) : null
    return {
      answerId: a.id,
      questionId: a.questionId ?? null,
      // 以下字段 question 是权威源（answer 行里的是写入时的反规范化副本，可能过期）
      // 找不到 question 时回落到 answer 旧字段，与 difficulty/isCarry/isBorrow 一致
      equation: q ? q.equation : a.equation,
      operator: q ? q.operator : a.operator,
      solution: q ? q.solution : a.solution,
      operandMin: q ? q.operandMin : a.operandMin,
      operandMax: q ? q.operandMax : a.operandMax,
      userAnswer: a.userAnswer,
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
  // 用 Answer.fromJSON 包装：isCorrect 走 getter 统一字段 vs 字段混用
  const raw = await db.answers
    .where('questionId')
    .equals(questionId)
    .toArray()
  const answers = raw
    .filter((a) => a.startedAt > cutoff)
    .map(a => a instanceof Answer ? a : new Answer(a))
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
        isCorrect: a.isCorrect,  // Answer getter
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
  // 1. 取所有错题（用 Answer.isCorrect 静态方法——数学真理：userAnswer === solution）
  //    Answer.isCorrect 是 getter 优先的静态方法，兼容 Answer 实例和 plain object
  const allAnswers = await db.answers.toArray()
  const wrongAnswers = allAnswers.filter((a) => !Answer.isCorrect(a))
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
  const qMap = await Question.loadByIds(uniqueQIds)

  // 4. 一次 anyOf 取这些题目的所有记录，内存里求 totalAttempts + lastCorrectAt
  //    用 stored isCorrect 字段（不用 Answer getter，见函数头部注释）
  const allForQ = await db.answers
    .where('questionId')
    .anyOf(uniqueQIds)
    .toArray()
  const totalByQ = new Map()
  const lastCorrectByQ = new Map()
  for (const a of allForQ) {
    totalByQ.set(a.questionId, (totalByQ.get(a.questionId) || 0) + 1)
    if (Answer.isCorrect(a)) {
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
 * 批量加载 questions，返回 Map<id, Question> 便于 O(1) 查询
 * - ids 为空直接返回空 Map（避免无效 DB 调用）
 * - 现用 Question.fromJSON 包装，确保调用方拿到的是类实例
 *   （字段访问与 plain object 完全一致，类 getter 自动可用）
 * @param {Array<number>} ids
 * @returns {Promise<Map<number, Question>>}
 */

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
    // 用 Answer getter 读 isCorrect、effectiveResponseTime 等
    const ans = a instanceof Answer ? a : new Answer(a)
    return {
      timestamp: ans.timestamp,
      startedAt: ans.startedAt,
      endedAt: ans.endedAt,
      isCorrect: ans.isCorrect,  // 用 Answer getter（统一计算）
      responseTime: ans.effectiveResponseTime,
      isTimeout: ans.isTimeout,
      userAnswer: ans.userAnswer,
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
  //    用 Answer.isCorrect 静态方法（getter 优先——数学真理）
  const buckets = new Map() // date -> { total, correct, qIds: Set }
  for (const a of answers) {
    const date = new Date(a.timestamp).toISOString().slice(0, 10)
    let bucket = buckets.get(date)
    if (!bucket) {
      bucket = { total: 0, correct: 0, qIds: new Set() }
      buckets.set(date, bucket)
    }
    bucket.total += 1
    if (Answer.isCorrect(a)) bucket.correct += 1
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
 * - 额外统计 realWrongCount（v2.3.0 1-strike 软规则用）：非 isTimeout/快错的"真错"
 * - 过滤 total >= minSample
 *
 * @param {object} [opts]
 * @param {number} [opts.minSample=3] 最少作答次数门槛
 * @returns {Promise<Array<{
 *   questionId:number, equation:string,
 *   total:number, correct:number, totalRT:number, lastSeenAt:number,
 *   realWrongCount:number,
 *   accuracy:number, avgResponseTime:number|null
 * }>>}
 */
async function _aggregateQuestions({ minSample = 3 } = {}) {
  // 1. 全量查 answers（v3 schema 无更强索引）
  const rawAnswers = await db.answers.toArray()

  // 2. 按 questionId 分组 reduce（用 Answer 实例的 getter 读字段）
  const map = new Map()
  for (const plain of rawAnswers) {
    if (plain.questionId == null) continue
    const a = plain instanceof Answer ? plain : new Answer(plain)
    let g = map.get(a.questionId)
    if (!g) {
      g = {
        questionId: a.questionId,
        equation: a.equation, // 先用 answer 的 equation（兜底）
        total: 0,
        correct: 0,
        totalRT: 0,
        lastSeenAt: 0,
        realWrongCount: 0, // v2.3.0 1-strike：非 isTimeout/快错的"真错"计数
      }
      map.set(a.questionId, g)
    }
    g.total += 1
    if (a.isCorrect) g.correct += 1  // 用 Answer getter
    // 用 Answer getter 读响应时间
    const rt = a.effectiveResponseTime
    const isTimeout = a.isTimeout
    if (rt != null) g.totalRT += rt
    // v2.3.0 1-strike 软规则：仅在"真错"时计数（isTimeout/快错不算）
    // 边界：isCorrect=false 且 !isTimeout 才算"真错"
    if (!a.isCorrect && !isTimeout) g.realWrongCount += 1
    g.lastSeenAt = Math.max(g.lastSeenAt, a.startedAt ?? a.timestamp ?? 0)
  }

  // 3. 关联 questions 表拿权威 equation（**复用 loadQuestionsByIds**）
  const qMap = await Question.loadByIds([...map.keys()])
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
 * - v2.3.0 支持 mode: 'strict' 1-strike 软规则：
 *   - normal（默认）：保持 v2.2.0 行为，minSample 门槛 + accuracy 升序
 *   - strict：minSample 强制为 1，但过滤条件更严：
 *     1. 至少 1 次"真错"（realWrongCount >= 1，非 isTimeout/快错）
 *     2. 至少 1 次对题作对比（correct >= 1，避免"全错"被高估）
 *   - 设计动机：normal 模式样本门槛 =3 会漏掉新题/偶尔错题；strict 模式
 *     让"1 次真错 + 有对比"的题立即进入弱项候选（即使 1 次对 1 次错）
 *   - 边界：仅影响"刚做过但样本不足"的题，老题仍按 normal 路径走
 *
 * @param {object} [opts]
 * @param {number} [opts.minSample=3] 最少作答次数（strict 模式忽略，强制 1）
 * @param {'normal' | 'strict'} [opts.mode='normal'] 判定模式
 * @returns {Promise<Array<{
 *   questionId:number, equation:string,
 *   total:number, correct:number, accuracy:number,
 *   avgResponseTime:number|null, lastSeenAt:number,
 *   realWrongCount:number
 * }>>}
 */
export async function getDynamicWeakness({ minSample = 3, mode = 'normal' } = {}) {
  if (mode === 'strict') {
    // 1-strike 软规则：取消 minSample 门槛（强制为 1），但要求：
    // 1. 至少 1 次"真错"（realWrongCount >= 1）
    // 2. 至少 1 次对题作对比（correct >= 1）
    const groups = await _aggregateQuestions({ minSample: 1 })
    return groups
      .filter((g) => (g.realWrongCount ?? 0) >= 1 && g.correct >= 1)
      .sort((a, b) => a.accuracy - b.accuracy)
  }
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
