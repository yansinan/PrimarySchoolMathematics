/**
 * 乘除档位生成测试（feat/mul-div-levels）
 *
 * 验证 DIFFICULTY_LEVELS 新增档位能被自适应链路真正出题：
 *   generateOneQuestion → createFormulasGenerator → psm.js
 * 要求：算式含 ×/÷、解为正整数、matchLevel 反推命中本档位
 */
import { describe, it, expect } from 'vitest'
import { generateOneQuestion } from '@/utils/algorithm/adaptiveBatch'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'
import { EquationSolver } from '@/utils/algorithm/EquationSolver'
import { Question } from '@/services/Question'

const L = Object.fromEntries(DIFFICULTY_LEVELS.map((l, i) => [l.label, i]))

/** 最小 engine 桩：generateOneQuestion 只用到 baseConfig */
const makeEngine = () => ({
  baseConfig: {
    step: '1', whereIsResult: '0', enableBrackets: false,
    remainder: '3', solution: '0', numberOfPapers: 1,
  },
  _seenEquations: new Set(),
})

const MUL_DIV_LEVELS = [
  '乘法口诀·2~6', '乘法口诀·7~9',
  '两位数×一位数', '三位数×一位数', '两位数×两位数', '三位数×两位数',
  '表内除法·2~6', '表内除法·7~9',
  '两位数÷一位数', '三位数÷一位数', '两位数÷两位数', '三位数÷两位数',
]

describe('乘除档位能出题', () => {
  for (const label of MUL_DIV_LEVELS) {
    it(`${label} 生成 3 道合法题`, () => {
      const idx = L[label]
      const engine = makeEngine()
      const seen = new Set()
      const got = []
      for (let i = 0; i < 3; i++) {
        const q = generateOneQuestion(idx, engine, seen)
        expect(q, `${label} 第 ${i + 1} 道生成失败`).not.toBeNull()
        got.push(q)
      }
      for (const q of got) {
        expect(/[×÷]/.test(q.equation)).toBe(true)
        expect(Number.isInteger(q.solution)).toBe(true)
        expect(q.solution).toBeGreaterThan(0)
        expect(EquationSolver.solve(q.equation)).toBe(q.solution)
        // 与引擎 B12 校验一致：允许 ±1 档漂移（相邻档位边界题，如 63÷7 归表内除法·7~9）
        const matched = Question.matchLevel(q)
        expect(matched, `${label} 的 ${q.equation} 匹配不到档位`).not.toBeNull()
        expect(Math.abs(matched.levelIdx - idx)).toBeLessThanOrEqual(1)
      }
    }, 30000)
  }
})

describe('除法档位必须整除（档位显式 remainder=2）', () => {
  for (const label of ['表内除法·2~6', '表内除法·7~9', '两位数÷一位数', '三位数÷一位数', '两位数÷两位数', '三位数÷两位数']) {
    it(`${label} 全部整除`, () => {
      const idx = L[label]
      const engine = makeEngine()
      for (let i = 0; i < 3; i++) {
        const q = generateOneQuestion(idx, engine, new Set())
        expect(q, `${label} 生成失败`).not.toBeNull()
        const [a, b] = q.equation.replace(/=$/, '').split('÷').map(Number)
        expect(Number.isInteger(a)).toBe(true)
        expect(Number.isInteger(b)).toBe(true)
        expect(a % b).toBe(0)
      }
    }, 30000)
  }
})
