/**
 * EquationSolver 单测（U 层）
 *
 * @see utils/algorithm/EquationSolver.js
 */
import { describe, it, expect } from 'vitest'
import { EquationSolver } from '@/utils/algorithm/EquationSolver'

describe('EquationSolver', () => {
  const solver = EquationSolver

  // ============ 基础运算 ============
  describe('基础运算', () => {
    it('加法: 3+4=', () => {
      expect(solver.solve('3+4=')).toBe(7)
    })

    it('乘法: 5×6=', () => {
      expect(solver.solve('5×6=')).toBe(30)
    })

    it('除法: 15÷3=', () => {
      expect(solver.solve('15÷3=')).toBe(5)
    })
  })

  // ============ 未知数解法 ============
  describe('未知数 __ 求解', () => {
    it('10-__=6', () => {
      expect(solver.solve('10-__=6')).toBe(4)
    })

    it('__+5=12', () => {
      expect(solver.solve('__+5=12')).toBe(7)
    })

    it('__-3=7', () => {
      expect(solver.solve('__-3=7')).toBe(10)
    })

    it('5×__=30', () => {
      expect(solver.solve('5×__=30')).toBe(6)
    })

    it('24÷__=6', () => {
      expect(solver.solve('24÷__=6')).toBe(4)
    })
  })

  // ============ 多步运算 + 复合方程 ============
  describe('复合方程', () => {
    it('10-__-10=6', () => {
      expect(solver.solve('10-__-10=6')).toBe(-6)
    })

    it('3+5×__=18', () => {
      expect(solver.solve('3+5×__=18')).toBe(3)
    })

    it('__+5-3=10', () => {
      expect(solver.solve('__+5-3=10')).toBe(8)
    })

    it('20-__×2=10', () => {
      expect(solver.solve('20-__×2=10')).toBe(5)
    })

    it('15÷__+5=10', () => {
      expect(solver.solve('15÷__+5=10')).toBe(3)
    })

    it('(__+5)×2=20', () => {
      expect(solver.solve('(__+5)×2=20')).toBe(5)
    })

    it('24÷(__-2)=6', () => {
      expect(solver.solve('24÷(__-2)=6')).toBe(6)
    })
  })
})
