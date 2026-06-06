/**
 * 答题提交处理 composable（ARCH 合规：V 层零业务规则）
 *
 * 封装 handleSubmit 中的编排逻辑：
 *   - 答案提取 + 校验
 *   - 计时
 *   - 元数据提取（委托 useAnswerBuilder→U）
 *   - 分数计算（委托 useAnswerBuilder→U）
 *   - 按 questionIndex 去重
 *   - 写 session.answers
 *   - 持久化触发（委托 usePracticeSaver→C→U）
 *   - 反馈路由判定
 *
 * V 层保留：
 *   - ElMessage 渲染
 *   - handleNext / digitFocus 等 UI 操作
 */
import { useAnswerBuilder } from '@/composables/useAnswerBuilder'

export function useSubmitHandler({ practiceStore, saver }) {
  const { buildAnswerMeta, buildScore } = useAnswerBuilder()

  /**
   * 处理一题提交
   * @param {object} params
   * @param {number} params.answer - 用户输入的答案
   * @param {object} params.currentQuestion - 当前题目
   * @param {number} params.groupAnswerOffset - 组偏移量
   * @param {number} params.currentIndex - 当前题号
   * @param {{ answers: Array, streak: number }} params.session - session 引用
   * @param {function} params.endQuestionTimer - store.endQuestionTimer
   * @returns {{ isCorrect, attemptCount, score, feedbackType, correctAnswer }}
   */
  function processAnswer({ answer, currentQuestion, groupAnswerOffset, currentIndex, session, endQuestionTimer }) {
    const rawAnswer = String(session.currentAnswer || '').replace(/_/g, '')
    const userAnswer = answer !== undefined ? answer : Number(rawAnswer)

    if (isNaN(userAnswer)) {
      return { feedbackType: 'invalid' }
    }

    const isCorrect = userAnswer === currentQuestion.solution
    const responseTime = endQuestionTimer()

    const { operator, isCarry, isBorrow, stepCount, operandMin, operandMax } = buildAnswerMeta(
      currentQuestion.equation,
      currentQuestion
    )

    const newQuestionIndex = groupAnswerOffset + currentIndex
    const existingIdx = session.answers.findIndex(a => a.questionIndex === newQuestionIndex)
    const previousAttemptCount = existingIdx >= 0 ? (session.answers[existingIdx].attemptCount || 1) : 0
    const { attemptCount, score } = buildScore(previousAttemptCount, isCorrect)

    const answerEntry = {
      ...currentQuestion,
      userAnswer,
      isCorrect,
      attemptCount,
      score,
      timestamp: Date.now(),
      responseTime,
      operator,
      isCarry,
      isBorrow,
      stepCount,
      operandMin,
      operandMax,
      questionIndex: newQuestionIndex,
    }

    if (existingIdx >= 0) {
      session.answers[existingIdx] = answerEntry
    } else {
      session.answers.push(answerEntry)
    }

    // 每道题立即写入数据库（fire-and-forget，委托 saver）
    saver.savePerQuestion()

    if (isCorrect) {
      session.streak++
      return {
        isCorrect: true,
        attemptCount,
        score,
        feedbackType: 'correct',
        correctAnswer: currentQuestion.solution,
      }
    }

    session.streak = 0
    // 尝试次数超出上限
    if (attemptCount >= 4) {
      return {
        isCorrect: false,
        attemptCount,
        score,
        feedbackType: 'maxRetry',
        correctAnswer: currentQuestion.solution,
      }
    }

    return {
      isCorrect: false,
      attemptCount,
      score,
      feedbackType: 'wrong',
      correctAnswer: currentQuestion.solution,
    }
  }

  return { processAnswer }
}