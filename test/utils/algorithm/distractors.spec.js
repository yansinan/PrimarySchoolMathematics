/**
 * 干扰项错误模型 —— 验证「每个干扰项都对应一种真实算错方式」
 */
import { describe, it, expect } from 'vitest'
import { buildErrorDistractors } from '@/utils/algorithm/distractors'

const build = (equation, count = 3) => {
  const solution = Number(equation.split('=')[0].length) // 占位，真实值下面各自传
  return buildErrorDistractors({ equation, solution, count })
}

describe('加法干扰项', () => {
  it('27 + 15 = 42：包含「忘进位」32 与「多进一位」52', () => {
    const d = buildErrorDistractors({ equation: '27+15=', solution: 42, count: 3 })
    expect(d).toContain(32)   // 42 - 10：个位进位丢了
    expect(d).toContain(52)   // 42 + 10：不该进却进了
    expect(d).not.toContain(42)
    expect(d.length).toBe(3)
  })

  it('8 + 7 = 15：包含忘进位 5（15-10）', () => {
    const d = buildErrorDistractors({ equation: '8+7=', solution: 15, count: 3 })
    expect(d).toContain(5)
  })

  it('三位数进位：365 + 78 = 443 → 忘进位 343', () => {
    const d = buildErrorDistractors({ equation: '365+78=', solution: 443, count: 4 })
    expect(d).toContain(343)
  })

  it('不进位时不会把「忘进位」当干扰项（不该有 42-10 这种无意义值）', () => {
    const d = buildErrorDistractors({ equation: '12+13=', solution: 25, count: 3 })
    expect(d).not.toContain(15)
    expect(d.length).toBe(3)
  })

  it('把加号看成减号：23 + 9 = 32 → 含 14', () => {
    const d = buildErrorDistractors({ equation: '23+9=', solution: 32, count: 6 })
    expect(d).toContain(14)
  })
})

describe('减法干扰项', () => {
  it('42 - 15 = 27：含忘退位 37（27+10）', () => {
    const d = buildErrorDistractors({ equation: '42-15=', solution: 27, count: 3 })
    expect(d).toContain(37)
  })

  it('53 - 27 = 26：含「大减小」错位 80（26 + 2×27）', () => {
    const d = buildErrorDistractors({ equation: '53-27=', solution: 26, count: 4 })
    expect(d).toContain(80)
  })

  it('把减号看成加号：42 - 15 → 57', () => {
    const d = buildErrorDistractors({ equation: '42-15=', solution: 27, count: 8 })
    expect(d).toContain(57)
  })

  it('不退位时不会塞「忘退位」', () => {
    const d = buildErrorDistractors({ equation: '48-25=', solution: 23, count: 3 })
    expect(d).not.toContain(33)
  })
})

describe('乘法干扰项', () => {
  it('7 × 8 = 56：含口诀串行 48（6×8）与 63（7×9）', () => {
    const d = buildErrorDistractors({ equation: '7×8=', solution: 56, count: 4 })
    expect(d).toContain(48)
    expect(d).toContain(63)
  })

  it('把乘当加：7 × 8 → 15', () => {
    const d = buildErrorDistractors({ equation: '7×8=', solution: 56, count: 8 })
    expect(d).toContain(15)
  })

  it('多算一组：56 + 7 = 63 或 56 + 8 = 64', () => {
    const d = buildErrorDistractors({ equation: '7×8=', solution: 56, count: 8 })
    expect(d.some(v => v === 63 || v === 64)).toBe(true)
  })
})

describe('除法干扰项', () => {
  it('56 ÷ 8 = 7：含试商偏差 6 / 8 与口诀反向 48（6×8）', () => {
    const d = buildErrorDistractors({ equation: '56÷8=', solution: 7, count: 4 })
    expect(d).toContain(6)
    expect(d).toContain(8)
    expect(d).toContain(48)
  })

  it('36 ÷ 5 = 7 余 1：余数 1（a % b）可作为「把余数当商」的干扰项', () => {
    const d = buildErrorDistractors({ equation: '36÷5=', solution: 7, count: 8 })
    expect(d).toContain(1)
  })
})

describe('通用约束', () => {
  const cases = [
    ['27+15=', 42], ['8+7=', 15], ['42-15=', 27], ['7×8=', 56], ['56÷8=', 7],
    ['365+78=', 443], ['1000-1=', 999], ['9+9=', 18],
  ]

  it('干扰项全部为正整数、互不相同、且不含正确答案', () => {
    for (const [equation, solution] of cases) {
      const d = buildErrorDistractors({ equation, solution, count: 3 })
      expect(d.length).toBe(3)
      expect(new Set(d).size).toBe(3)
      for (const v of d) {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThan(0)
        expect(v).not.toBe(solution)
      }
    }
  })

  it('解析不出算式时退回邻近值，仍然合法', () => {
    const d = buildErrorDistractors({ equation: '', solution: 20, count: 3 })
    expect(d.length).toBe(3)
    expect(d.every(v => v > 0 && v !== 20)).toBe(true)
  })

  it('答案非法时返回空数组', () => {
    expect(buildErrorDistractors({ equation: '1+1=', solution: 0 })).toEqual([])
    expect(buildErrorDistractors({ equation: '1+1=', solution: NaN })).toEqual([])
  })

  it('运算符用归一化字段也能工作（operator=2 表示减法）', () => {
    const d = buildErrorDistractors({ equation: '42-15=', solution: 27, operator: 2, count: 3 })
    expect(d).toContain(37)
  })
})

// ── 引擎侧集成：错题库优先，其次错误模型 ──
import { generateDistractors } from '@/services/adaptiveEngine'

describe('adaptiveEngine.generateDistractors', () => {
  it('加法 27+15：选项里出现「忘进位」32（不是纯 ±1 数列）', () => {
    const d = generateDistractors(42, 3, [], '27+15=', '+')
    expect(d).toContain(32)
    expect(d.length).toBe(3)
    expect(new Set(d).size).toBe(3)
    expect(d).not.toContain(42)
  })

  it('乘法 7×8：选项含口诀串行值（48 / 63）', () => {
    const d = generateDistractors(56, 3, [], '7×8=', '*')
    expect(d.some(v => v === 48 || v === 63)).toBe(true)
  })

  it('有错题库时优先用孩子自己的错误答案', () => {
    const pool = [{ equation: '27+15=', solution: 42, userAnswer: 33 }]
    const d = generateDistractors(42, 3, pool, '27+15=', '+')
    expect(d[0]).toBe(33)
  })

  it('错误模型与错题库重复时不重复占位', () => {
    const pool = [{ equation: '27+15=', solution: 42, userAnswer: 32 }]
    const d = generateDistractors(42, 3, pool, '27+15=', '+')
    expect(d[0]).toBe(32)
    expect(new Set(d).size).toBe(3)
  })
})
