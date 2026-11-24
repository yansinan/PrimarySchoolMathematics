/**
 * completeGroup 的落库时机
 *
 * 规则：保存只跟着数据走，不等任何不产生数据的 UI 或可失败的后续步骤。
 *  - 组 checkpoint：自我评价一落定就写库，先于组边界的画像刷新（Profile.load）
 *  - 最终结算：整轮一结束就写库，先于总结弹窗 —— 总结弹窗上的按钮不产生数据，
 *    把保存放在弹窗之后，等于让「关标签页 / 崩溃」有机会吞掉 completed 标记和最终快照。
 *
 * 走真实的 Pinia store + 真实 Dexie（fake-indexeddb）+ 真实 usePracticeSaver；
 * 只把弹窗和 router 换成注入的桩（useAdaptiveSession 本身支持 options 注入）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DB } from '@/services/databaseInit'
import { usePracticeStore } from '@/stores/practice'
import { useAdaptiveSession } from '@/composables/useAdaptiveSession'
import { usePracticeSaver } from '@/composables/usePracticeSaver'
import { Engine } from '@/services/adaptiveEngine'
import { Profile } from '@/services/abilityProfile'

function mkAnswers(size) {
  return Array.from({ length: size }, (_, i) => ({
    equation: `${100 + i}+1=`,
    solution: i + 2,
    userAnswer: i + 2,
    attemptCount: 1,
    timestamp: Date.now(),
    responseTime: 1200,
    operator: '+',
    isCarry: false,
    isBorrow: false,
    stepCount: 1,
    operandMin: 1,
    operandMax: 9,
    inputMode: 'horizontal_keypad',
    blankMode: 'result',
    questionIndex: i,
  }))
}

/**
 * 跑一次「最后一组答完 → completeGroup」并记录各步骤的先后顺序。
 * targetMax=1 → 第一组答完就到量 → 走「整轮完成」分支。
 */
async function runLastGroup({ groupSize = 2 } = {}) {
  const order = []
  let rowsAtSummary = null

  const store = usePracticeStore()
  store.setPhase('practice')
  store.setListSource('adaptive')
  store.session.answers = mkAnswers(groupSize)

  const engine = new Engine({ targetMin: 1, targetMax: 1 })
  engine.lastGroupSize = groupSize

  const realLoad = Profile.load.bind(Profile)
  vi.spyOn(Profile, 'load').mockImplementation(async (...args) => {
    order.push('Profile.load')
    return realLoad(...args)
  })

  const saver = usePracticeSaver()
  const realCheckpoint = saver.saveGroupCheckpoint
  saver.saveGroupCheckpoint = async (...args) => {
    order.push('checkpoint')
    return realCheckpoint(...args)
  }
  const realFinal = saver.saveSessionFinal
  saver.saveSessionFinal = async (...args) => {
    order.push('final')
    return realFinal(...args)
  }

  const dialogs = {
    showSelfEvaluationDialog: vi.fn(async () => 3),
    showPracticeSummaryDialog: vi.fn(async () => {
      order.push('summary')
      rowsAtSummary = await DB.practiceSessions.toArray()
      return 'close'
    }),
  }
  const router = { push: vi.fn() }

  const session = useAdaptiveSession({ router, dialogs, saver })
  session.adaptiveEngine.value = engine
  const result = await session.completeGroup()

  return { order, rowsAtSummary, result, router, pid: store.session.practiceSessionId }
}

beforeEach(async () => {
  setActivePinia(createPinia())
  await DB.practiceSessions.clear()
  await DB.answers.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('completeGroup 落库时机', () => {
  it('组 checkpoint 先于组边界的画像刷新写库', async () => {
    const { order } = await runLastGroup()
    expect(order.indexOf('checkpoint')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('checkpoint')).toBeLessThan(order.indexOf('Profile.load'))
  })

  it('总结弹窗弹出时，最终结算已经在库里', async () => {
    const { order, rowsAtSummary, pid } = await runLastGroup()
    expect(order.indexOf('final')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('final')).toBeLessThan(order.indexOf('summary'))

    const final = rowsAtSummary.find(r => r.practiceSessionId === pid && r.completed === true)
    expect(final).toBeTruthy()
    // 组评价同样已落库
    expect(rowsAtSummary.some(r => r.practiceSessionId === pid && r.evaluations)).toBe(true)
  })

  it('弹窗之后的收尾不变：点关闭 → 回首页', async () => {
    const { result, router } = await runLastGroup()
    expect(result).toBe('done')
    expect(router.push).toHaveBeenCalledWith('/home')
  })
})
