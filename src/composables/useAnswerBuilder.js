/**
 * 答题数据构造 composable
 *
 * 封装 extractQuestionMetadata + buildAttemptScore 两个 U 层函数，
 * 使 V 层不直接 import U 层（ARCHITECTURE § 1.2 铁律5）。
 *
 * 职责：
 *  - extractQuestionMetadata 的调用方从 V 移到 C
 *  - buildAttemptScore 的调用方从 V 移到 C
 *
 * 用法：
 *   const { buildAnswerMeta, buildScore } = useAnswerBuilder()
 *   const { operator, isCarry, ... } = buildAnswerMeta(equation, question)
 *   const { attemptCount, score } = buildScore(prevAttempts, isCorrect)
 */
import { extractQuestionMetadata } from '@/utils/algorithm/equationParser'
import { buildAttemptScore } from '@/utils/score'

export function useAnswerBuilder() {
  /**
   * 从算式提取元数据（operator / isCarry / isBorrow / stepCount / operandMin / operandMax）
   * @param {string} equation 算式字符串如 "23+47="
   * @param {object} [question] 题目对象（可选，提供了部分字段时优先用它）
   * @returns {{ operator, isCarry, isBorrow, stepCount, operandMin, operandMax }}
   */
  function buildAnswerMeta(equation, question) {
    return extractQuestionMetadata(equation, question)
  }

  /**
   * 计算尝试次数和得分（含重试逻辑）
   * @param {number} previousAttemptCount 之前尝试次数
   * @param {boolean} isCorrect 本次是否正确
   * @returns {{ attemptCount: number, score: number }}
   */
  function buildScore(previousAttemptCount, isCorrect) {
    return buildAttemptScore(previousAttemptCount, isCorrect)
  }

  return { buildAnswerMeta, buildScore }
}
