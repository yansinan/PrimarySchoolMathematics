/**
 * 运算符符号约定
 *
 * 显示用 × ÷，内部计算与匹配用 * /。
 * 三层分工：
 *   1. 生成器（psm.generate）出口把 * / 换成 × ÷ —— 存在 equation 里的就是数学符号
 *   2. EquationSolver / parseEquation / Question._parseOperands 进来先 toEvalSymbols 归一化
 *   3. parseEquation 额外给 displayOperator（× ÷）供模板渲染，operator 保持归一化
 *      （operator 会被 extractQuestionMetadata 写进 Answer 记录，不能变成 × ÷）
 */
import { describe, it, expect } from 'vitest'
import { createFormulasGenerator } from '@/utils/paperGenerator'
import { EquationSolver } from '@/utils/algorithm/EquationSolver'
import { parseEquation } from '@/utils/algorithm/equationParser'
import { Question } from '@/services/Question'

/** 按运算符生成一批算式（operators: 1=+ 2=- 3=× 4=÷） */
function gen(op, min = 2, max = 9, count = 12) {
  const papers = createFormulasGenerator(
    {
      numberOfPapers: 1, enableBrackets: false, carry: '1', abdication: '1',
      solution: '0', paperTitle: '', paperSubTitle: '', numberOfPagerColumns: 2,
    },
    [{
      step: 1, numberOfFormulas: count, whereIsResult: 0,
      formulaList: [{ min, max, operators: [op] }],
      resultMinValue: 1, resultMaxValue: 999, customFormulaList: null,
    }],
  )
  return papers.flatMap(p => p.formulas)
}

describe('生成器输出使用数学符号', () => {
  it('乘法输出 ×，不出现 *', () => {
    const list = gen(3)
    expect(list.length).toBeGreaterThan(0)
    expect(list.every(f => !f.includes('*'))).toBe(true)
    expect(list.some(f => f.includes('×'))).toBe(true)
  })

  it('除法输出 ÷，不出现 /', () => {
    const list = gen(4)
    expect(list.length).toBeGreaterThan(0)
    expect(list.every(f => !f.includes('/'))).toBe(true)
    expect(list.some(f => f.includes('÷'))).toBe(true)
  })

  it('加减仍用 + 和 −（不被误改）', () => {
    const add = gen(1, 1, 9)
    expect(add.every(f => !f.includes('×') && !f.includes('÷'))).toBe(true)
    expect(add.some(f => f.includes('+'))).toBe(true)
  })
})

describe('× ÷ 能被各层正确解析', () => {
  it('EquationSolver 解得对', () => {
    expect(EquationSolver.solve('6×7=')).toBe(42)
    expect(EquationSolver.solve('8÷2=')).toBe(4)
    expect(EquationSolver.solve('246×3=')).toBe(738)
    expect(EquationSolver.solve('936÷8=')).toBe(117)
  })

  it('Question.matchLevel 认得出乘除档位', () => {
    const mul = Question.matchLevel({ equation: '6×7=', solution: 42 })
    expect(mul).toBeTruthy()
    expect(mul.levelIdx).toBeGreaterThanOrEqual(9)   // 乘法档在 9 之后
    const div = Question.matchLevel({ equation: '8÷2=', solution: 4 })
    expect(div).toBeTruthy()
  })
})

describe('parseEquation 显示与内部符号分开', () => {
  it('displayOperator 给 × ÷', () => {
    expect(parseEquation('6×7=').displayOperator).toBe('×')
    expect(parseEquation('8÷2=').displayOperator).toBe('÷')
    expect(parseEquation('3+5=').displayOperator).toBe('+')
  })

  it('operator 保持归一化（会被写进 Answer 记录，不能变）', () => {
    expect(parseEquation('6×7=').operator).toBe('*')
    expect(parseEquation('8÷2=').operator).toBe('/')
  })

  it('纯 * / 写法的老数据也能显示成数学符号', () => {
    expect(parseEquation('6*7=').displayOperator).toBe('×')
    expect(parseEquation('8/2=').displayOperator).toBe('÷')
  })

  it('操作数解析不受符号影响', () => {
    const p = parseEquation('246×3=')
    expect(p.leftOperand).toBe('246')
    expect(p.rightOperand).toBe('3')
    expect(p.blankPosition).toBe('result')
  })
})
