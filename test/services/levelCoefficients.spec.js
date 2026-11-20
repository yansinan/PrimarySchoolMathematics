/**
 * 档位配比系数 — 选题权重缩放
 *
 * 核心约束：**空系数表时选题行为与加入此功能之前逐位一致**。
 * 这里用统计分布来锁这条约束（同一随机种子下无法逐位比对，只能比对权重比）。
 */
import { describe, it, expect } from 'vitest'
import { Engine } from '@/services/adaptiveEngine'
import { DIFFICULTY_LEVELS } from '@/constants/difficulty'

/** 构造一个「强项集中在高位档」的引擎，模拟多位数加减法出太多的场景 */
function makeEngine(overrides = {}) {
  const engine = new Engine({
    difficultyIdx: 15,
    strongLevelIndices: [13, 14, 15],
    weakLevelIndices: [],
    targetMin: 10,
    targetMax: 30,
    ...overrides,
  })
  return engine
}

/** 采样 pickStrongLevel 的档位分布 */
function sample(engine, n = 6000) {
  const counts = {}
  for (let i = 0; i < n; i++) {
    const idx = engine.pickStrongLevel()
    counts[idx] = (counts[idx] || 0) + 1
  }
  return counts
}

describe('档位配比 — 默认不改变行为', () => {
  it('空系数表：候选池只含强项档位，权重比为 1 : 1.5 : 2.25', () => {
    const engine = makeEngine()
    engine.levelCoefficients = {}          // 显式空表，等价于从未配置
    const counts = sample(engine)

    // 只应出现三个强项档位，不引入别的档
    expect(Object.keys(counts).map(Number).sort()).toEqual([13, 14, 15])

    // 权重 1 : 1.5 : 2.25 → 占比约 21% : 32% : 47%
    const total = 13 in counts || true ? Object.values(counts).reduce((s, v) => s + v, 0) : 0
    const ratio15 = counts[15] / total
    const ratio13 = counts[13] / total
    // 最高档占比应明显高于最低档（1.5^2 / 1 = 2.25 倍）
    expect(ratio15 / ratio13).toBeGreaterThan(1.8)
    expect(ratio15 / ratio13).toBeLessThan(2.8)
  })

  it('空系数表：候选上限仍是 difficultyIdx + 2', () => {
    const engine = makeEngine({ strongLevelIndices: [13, 14, 15, 20] })
    engine.levelCoefficients = {}
    const counts = sample(engine, 3000)
    // 20 > 15 + 2 → 不进候选池
    expect(counts[20]).toBeUndefined()
  })
})

describe('档位配比 — 系数生效', () => {
  it('某档系数为 0：该档不再出题', () => {
    const engine = makeEngine()
    engine.levelCoefficients = { 15: 0 }
    const counts = sample(engine)
    expect(counts[15]).toBeUndefined()
    expect(Object.keys(counts).map(Number).sort()).toEqual([13, 14])
  })

  it('某档系数调小：该档占比显著下降', () => {
    const base = sample(makeEngine())
    const tuned = makeEngine()
    tuned.levelCoefficients = { 15: 0.2 }
    const after = sample(tuned)
    const totalBase = Object.values(base).reduce((s, v) => s + v, 0)
    const totalAfter = Object.values(after).reduce((s, v) => s + v, 0)
    expect(after[15] / totalAfter).toBeLessThan(base[15] / totalBase / 2)
  })

  it('非强项但配了系数的档位会被拉进候选池', () => {
    const engine = makeEngine()
    engine.levelCoefficients = { 8: 2 }
    const counts = sample(engine)
    // 8 原本不在 strong 里、也在 difficultyIdx+2 之内 → 应出现
    expect(counts[8]).toBeGreaterThan(0)
  })

  it('所有候选档系数为 0：退回当前难度档，不返回 undefined', () => {
    const engine = makeEngine()
    engine.levelCoefficients = { 13: 0, 14: 0, 15: 0 }
    const idx = engine.pickStrongLevel()
    expect(idx).toBe(15)     // difficultyIdx
  })
})

describe('档位配比 — 弱项选档', () => {
  it('默认取最低档弱项', () => {
    const engine = makeEngine({ weakLevelIndices: [6, 9] })
    engine.levelCoefficients = {}
    expect(engine.pickWeakLevel()).toBe(6)
  })

  it('最低档弱项被系数关掉时，顺延到下一个弱项', () => {
    const engine = makeEngine({ weakLevelIndices: [6, 9] })
    engine.levelCoefficients = { 6: 0 }
    expect(engine.pickWeakLevel()).toBe(9)
  })

  it('弱项全被系数关掉 → 返回 null（调用方回退当前档位，不硬塞一个）', () => {
    const engine = makeEngine({ weakLevelIndices: [6, 9] })
    engine.levelCoefficients = { 6: 0, 9: 0 }
    expect(engine.pickWeakLevel()).toBeNull()
  })

  it('弱项全在当前档位之上 → 返回 null（不把高档错题拉进本轮）', () => {
    const engine = makeEngine({ weakLevelIndices: [16, 18, 19] })   // difficultyIdx = 15
    engine.levelCoefficients = {}
    expect(engine.pickWeakLevel()).toBeNull()
  })
})

describe('档位配比 — 系数表本身', () => {
  it('node 环境无 localStorage 时不抛错，返回空表', async () => {
    const { loadLevelCoefficients, getLevelCoefficient } = await import('@/utils/store/levelCoefficients')
    expect(() => loadLevelCoefficients()).not.toThrow()
    expect(loadLevelCoefficients()).toEqual({})
    expect(getLevelCoefficient(15, {})).toBe(1)
  })

  it('档位索引落在难度表范围内', () => {
    // 防止测试里写死过期的档位号
    expect(DIFFICULTY_LEVELS.length).toBeGreaterThanOrEqual(24)
    expect(DIFFICULTY_LEVELS[13]).toBeDefined()
    expect(DIFFICULTY_LEVELS[15]).toBeDefined()
  })
})
