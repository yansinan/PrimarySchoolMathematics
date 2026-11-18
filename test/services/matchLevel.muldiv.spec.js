/**
 * 乘除档位匹配测试（feat/mul-div-levels）
 *
 * 目的：
 *  1) 锁死新增乘除档位的 matchLevel 行为
 *  2) 锁死原有加减档位不受影响（回归保护）
 *
 * 档位索引（DIFFICULTY_LEVELS，按人教教材进度排）：
 *   0-4   一上 20 以内加减
 *   5-6   一下 100 以内加减（口算）
 *   7-8   二上 100 以内加减（笔算）
 *   9-10  二上 表内乘法
 *   11-12 二下 表内除法
 *   13-15 三上 万以内加减
 *   16-17 三上 多位数乘一位数
 *   18    三下 两位数乘两位数
 *   19-20 三下 除数是一位数的除法
 *   21    四上 三位数乘两位数
 *   22-23 四上 除数是两位数的除法
 *
 * ⚠️ 断言一律用 L[label] 反查索引，不写死数字 —— 档位顺序会按教材调整。
 */
import { describe, it, expect } from 'vitest'
import { Question } from '@/services/Question'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'

const L = Object.fromEntries(DIFFICULTY_LEVELS.map((l, i) => [l.label, i]))

// 只传 equation：真实答题记录里 operator 字段可选，matchLevel 会从算式自行解析
const m = (equation) => Question.matchLevel({ equation })

describe('加减档位回归（原有 12 级不得漂移）', () => {
  it('3+4= 仍在「起步」', () => {
    expect(m('3+4=')).toEqual({ levelIdx: 0, label: '起步' })
  })
  it('9+8= 仍在「混合进退位①」', () => {
    expect(m('9+8=')).toEqual({ levelIdx: 3, label: '混合进退位①' })
  })
  it('12-5= 仍在两位数之前的加减区段', () => {
    const r = m('12-5=')
    expect(r).not.toBeNull()
    expect(r.levelIdx).toBeLessThan(12)
  })
})

describe('乘法档位', () => {
  it('3×4= → 乘法口诀·2~6', () => {
    expect(m('3×4=')).toEqual({ levelIdx: L['乘法口诀·2~6'], label: '乘法口诀·2~6' })
  })
  it('6×6= → 乘法口诀·2~6', () => {
    expect(m('6×6=').levelIdx).toBe(L['乘法口诀·2~6'])
  })
  it('9×9= → 乘法口诀·7~9', () => {
    expect(m('9×9=')).toEqual({ levelIdx: L['乘法口诀·7~9'], label: '乘法口诀·7~9' })
  })
  it('7×2= → 乘法口诀·7~9（含 7 即属大口诀）', () => {
    expect(m('7×2=').levelIdx).toBe(L['乘法口诀·7~9'])
  })
  it('12×3= → 两位数×一位数', () => {
    expect(m('12×3=')).toEqual({ levelIdx: L['两位数×一位数'], label: '两位数×一位数' })
  })
  it('27×4= → 两位数×一位数', () => {
    expect(m('27×4=').levelIdx).toBe(L['两位数×一位数'])
  })
  it('105×3= → 三位数×一位数', () => {
    expect(m('105×3=')).toEqual({ levelIdx: L['三位数×一位数'], label: '三位数×一位数' })
  })
  it('23×14= → 两位数×两位数', () => {
    expect(m('23×14=')).toEqual({ levelIdx: L['两位数×两位数'], label: '两位数×两位数' })
  })
  it('456×23= → 三位数×两位数', () => {
    expect(m('456×23=')).toEqual({ levelIdx: L['三位数×两位数'], label: '三位数×两位数' })
  })
})

describe('除法档位', () => {
  it('12÷3= → 表内除法·2~6', () => {
    expect(m('12÷3=')).toEqual({ levelIdx: L['表内除法·2~6'], label: '表内除法·2~6' })
  })
  it('36÷6= → 表内除法·2~6', () => {
    expect(m('36÷6=').levelIdx).toBe(L['表内除法·2~6'])
  })
  it('63÷7= → 表内除法·7~9', () => {
    expect(m('63÷7=')).toEqual({ levelIdx: L['表内除法·7~9'], label: '表内除法·7~9' })
  })
  it('72÷8= → 表内除法·7~9', () => {
    expect(m('72÷8=').levelIdx).toBe(L['表内除法·7~9'])
  })
  it('84÷4= → 两位数÷一位数', () => {
    expect(m('84÷4=')).toEqual({ levelIdx: L['两位数÷一位数'], label: '两位数÷一位数' })
  })
  it('840÷4= → 三位数÷一位数', () => {
    expect(m('840÷4=').levelIdx).toBe(L['三位数÷一位数'])
  })
  it('96÷12= → 两位数÷两位数', () => {
    expect(m('96÷12=')).toEqual({ levelIdx: L['两位数÷两位数'], label: '两位数÷两位数' })
  })
  it('840÷12= → 三位数÷两位数', () => {
    expect(m('840÷12=').levelIdx).toBe(L['三位数÷两位数'])
  })
})

describe('档位数据自检', () => {
  // 乘除档位按运算符过滤（旧写法 slice(12) 依赖「乘除都排在加减之后」的布局，
  // 教材顺序重排后乘除已穿插在加减之间）
  const mulDiv = DIFFICULTY_LEVELS.filter(l =>
    l.formulaList.some(f => (f.operators || []).some(o => o === 3 || o === 4)))

  it('乘除档位共 12 级', () => {
    expect(mulDiv.length).toBe(12)
  })
  it('乘除档位的 operators 只用 3/4', () => {
    for (const level of mulDiv) {
      const ops = level.formulaList.flatMap(f => f.operators || [])
      expect(ops.length).toBeGreaterThan(0)
      expect(ops.every(o => o === 3 || o === 4)).toBe(true)
    }
  })
  it('多位数档位都带 opMin/opMax 边界约束', () => {
    for (const label of ['两位数×一位数', '三位数×一位数', '两位数×两位数', '三位数×两位数',
      '两位数÷一位数', '三位数÷一位数', '两位数÷两位数', '三位数÷两位数']) {
      expect(DIFFICULTY_LEVELS[L[label]].formulaList[0].opMax).toBeDefined()
    }
  })
  it('所有除法档位显式声明整除（remainder=2）', () => {
    for (const level of mulDiv) {
      if (level.formulaList.some(f => f.operators.includes(4))) {
        expect(level.remainder).toBe('2')
      }
    }
  })
})
