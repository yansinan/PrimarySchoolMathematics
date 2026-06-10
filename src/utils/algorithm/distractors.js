/**
 * 干扰项生成（U 层纯函数）
 *
 * 策略：
 *   1. 优先从错题库（wrongPool）取当前算式的真实错误答案
 *   2. 不够再用算法填充（±1/±2/±5/±10/随机）
 *
 * @param {number} correct - 正确答案
 * @param {number} count - 需要的干扰项数量
 * @param {Array}  [wrongPool=[]] - 错题库（WrongAnswer 实例数组），可选
 * @param {string} [equation=''] - 算式，用于匹配错题库
 * @returns {number[]}
 */
import { WrongAnswer } from './wrongAnswer'

export function generateDistractors(correct, count, wrongPool = [], equation = '') {
  const distractors = new Set()
  if (correct == null || isNaN(correct) || correct <= 0) return []

  // 优先错题库：取同一算式（含交换律/事实家族）的历史错误答案
  if (wrongPool.length && equation) {
    const matches = WrongAnswer.findByEquation(wrongPool, equation, { exact: false })
    for (const w of matches) {
      const v = Number(w.userAnswer)
      if (v !== correct && v > 0 && !distractors.has(v)) distractors.add(v)
      if (distractors.size >= count) return Array.from(distractors).slice(0, count)
    }
  }

  // 算法填充
  const candidates = [
    correct + 1, correct - 1,
    correct + 2, correct - 2,
    correct + 5, correct - 5,
    correct + 10, correct - 10,
    Math.abs(correct - 1),
    correct + (correct > 5 ? -3 : 3),
  ]
  for (const c of candidates) {
    if (c !== correct && c > 0 && !distractors.has(c)) distractors.add(c)
    if (distractors.size >= count) break
  }
  while (distractors.size < count) {
    const r = Math.max(1, correct + Math.floor(Math.random() * 10) - 5)
    if (r !== correct && !distractors.has(r)) distractors.add(r)
  }
  return Array.from(distractors).slice(0, count)
}
