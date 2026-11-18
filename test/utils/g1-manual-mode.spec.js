/**
 * 第一组修复的回归用例
 *
 * 1. 题数=0 不再死循环（原 psm.js generate() 是 while(true) + length===number）
 * 2. 条件过严时走尝试上限兜底，不卡住
 * 3. 除法统一按「必须整除」生成（有余数除法需要商+余数双输入，暂不支持）
 */
import { describe, it, expect, vi } from 'vitest'
import { createFormulasGenerator } from '@/utils/paperGenerator'

const baseOptions = {
  step: '1', numberOfFormulas: 8, whereIsResult: '0', enableBrackets: false,
  carry: '1', abdication: '1', remainder: '1', solution: '0',
  numberOfPapers: 1, numberOfPagerColumns: 3, paperTitle: 't', paperSubTitle: 't',
  resultMinValue: 1, resultMaxValue: 999,
}

const mkPaper = (extra) => ({
  step: '1', numberOfFormulas: 8, whereIsResult: '0',
  formulaList: [
    { min: 1, max: 9, operators: null },
    { min: 1, max: 9, operators: [1] },
  ],
  resultMinValue: 1, resultMaxValue: 18,
  ...extra,
})

const countFormulas = (papers) => papers.reduce((p, c) => p + (c.formulas?.length || 0), 0)

describe('psm 生成器兜底', () => {
  it('题数为 0 时立即返回空，不死循环', () => {
    const papers = createFormulasGenerator({ ...baseOptions, numberOfFormulas: 0 }, [mkPaper({ numberOfFormulas: 0 })])
    expect(countFormulas(papers)).toBe(0)
  })

  it('条件过严（50 题但范围 1~2 且必须进位）时不死循环', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const papers = createFormulasGenerator({ ...baseOptions, numberOfFormulas: 50 }, [
      mkPaper({
        numberOfFormulas: 50,
        formulaList: [
          { min: 1, max: 2, operators: null },
          { min: 1, max: 2, operators: [1] },
        ],
        resultMinValue: 1, resultMaxValue: 4, carry: '2',
      }),
    ])
    // 1~2 范围里没有任何一组能产生进位 → 实际生成 0 题，靠尝试上限返回而非死循环
    expect(countFormulas(papers)).toBe(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('除法暂不支持有余数', () => {
  it('即使传 remainder=1（随机余数）也只生成整除题', () => {
    const papers = createFormulasGenerator({ ...baseOptions, numberOfFormulas: 12 }, [{
      step: '1', numberOfFormulas: 12, whereIsResult: '0',
      formulaList: [
        { min: 10, max: 99, operators: null },
        { min: 2, max: 9, operators: [4] },
      ],
      resultMinValue: 1, resultMaxValue: 99,
      remainder: '1',
    }])
    const formulas = papers.reduce((p, c) => { p.push(...c.formulas); return p }, [])
    const divs = formulas.filter(f => f.includes('÷'))
    expect(divs.length).toBeGreaterThan(0)
    for (const f of divs) {
      const m = f.replace(/=$/, '').match(/(\d+)÷(\d+)/)
      if (!m) continue
      expect((+m[1]) % (+m[2]), `${f} 应整除`).toBe(0)
    }
  })
})
