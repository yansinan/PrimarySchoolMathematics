/**
 * 第二组 e 的回归用例
 *
 * 背景：Question 实例的 operandMin/operandMax 是懒计算 getter，
 * 在缺 operator 时 _parseOperands 直接返回 [null,null]，getter 于是返回 0。
 * 旧代码用 `!= null` 判断 getter 值是否可用 → 0 被当成有效值 → 所有档位范围校验失败
 * → matchLevel 返回 null → 自适应引擎认为这题「不属于任何档位」
 *   → 组内强项/弱项/挑战混合被压成清一色当前档位。
 */
import { describe, it, expect } from 'vitest'
import { Question } from '@/services/Question'

describe('matchLevel 对 Question 实例', () => {
  it('不带 operator 时也能匹配到档位', () => {
    const q = new Question({ equation: '78+98=__', solution: 176 })
    const m = Question.matchLevel(q)
    expect(m, '不应返回 null').not.toBeNull()
    expect(typeof m.levelIdx).toBe('number')
  })

  it('带 operator 时结果一致', () => {
    const withOp = new Question({ equation: '78+98=__', solution: 176, operator: '+' })
    const without = new Question({ equation: '78+98=__', solution: 176 })
    expect(Question.matchLevel(withOp)?.levelIdx)
      .toBe(Question.matchLevel(without)?.levelIdx)
  })

  it('乘除法同样不因缺 operator 而失配', () => {
    for (const eq of ['6×7=__', '24÷4=__']) {
      const q = new Question({ equation: eq })
      expect(Question.matchLevel(q), `${eq} 应能匹配`).not.toBeNull()
    }
  })

  it('普通对象（store 原始条目）仍然正常', () => {
    const m = Question.matchLevel({ equation: '78+98=__' })
    expect(m).not.toBeNull()
  })
})
