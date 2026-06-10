/**
 * 自适应批次生成（P5 v2.3.0）
 *
 * 原始实现见 Practice.vue 的 generateBatch(engine, count) 函数。
 * 抽离为纯函数模块，便于测试和复用。
 *
 * P5 改造：接受排列方案 plan 数组，按 strong/weak/challenge 类型逐 slot 生成，
 * 同时生成备用题池（reserve pool）用于动态微调。
 *
 * 流程：
 *  1) 根据 plan 数组和画像，逐 slot 选 DIFFICULTY_LEVELS 并生成算式
 *  2) 强项/弱项通过 pickStrongLevel/pickWeakLevel 带偏好选级
 *  3) 挑战题从 difficultyIdx + 1 级取
 *  4) 额外生成 3 道备用题入 reserve pool
 *  5) 解析为 {equation, solution} 基础题
 *  6) 用 diversifyBatch 混入输入模式（keypad/choice2/choice4）
 */

import { createFormulasGenerator } from '../paperGenerator'
import { EquationSolver } from './EquationSolver'
import { DIFFICULTY_LEVELS } from '../../constants/difficulty'
import { Question } from './question'
import { RESERVE_POOL_SIZE } from '../../constants/practice'

/**
 * 根据自适应引擎和排列方案生成一组题
 *
 * @param {object} engine - 自适应引擎实例（含 strongLevelIndices / weakLevelIndices）
 * @param {number} count - 本组题数
 * @param {string[]} plan - 排列数组，每项 'strong' | 'weak' | 'challenge'
 * @returns {{ questions: Array, reservePool: Array }}
 *   questions: [{equation, solution, options?, inputMode}]
 *   reservePool: [{equation, solution, type}]
 */
export function generateAdaptiveBatch(engine, count, plan) {
  const questions = []
  const seen = new Set()  // 去重

  // 逐 slot 生成
  for (const slotType of plan) {
    let levelIdx

    if (slotType === 'strong') {
      levelIdx = engine.pickStrongLevel()
      if (levelIdx == null) levelIdx = engine.difficultyIdx  // 兜底：用当前难度
    } else if (slotType === 'weak') {
      levelIdx = engine.pickWeakLevel()
      if (levelIdx == null) levelIdx = engine.difficultyIdx  // 兜底
    } else {
      // challenge: 当前难度 + 1
      levelIdx = Math.min(engine.difficultyIdx + 1, DIFFICULTY_LEVELS.length - 1)
    }

    const q = generateOneQuestion(levelIdx, engine, seen)
    if (q) questions.push(q)
  }

  // 生成备用题池
  const reservePool = []
  const reserveSeen = new Set(seen)  // 独立去重，与主 batch 不冲突
  for (let i = 0; i < RESERVE_POOL_SIZE; i++) {
    // 随机选类型（简单均分：每种类型 1 道）
    const type = ['strong', 'weak', 'challenge'][i % 3]
    let levelIdx
    if (type === 'strong') {
      levelIdx = engine.pickStrongLevel()
      if (levelIdx == null) levelIdx = engine.difficultyIdx
    } else if (type === 'weak') {
      levelIdx = engine.pickWeakLevel()
      if (levelIdx == null) levelIdx = engine.difficultyIdx
    } else {
      levelIdx = Math.min(engine.difficultyIdx + 1, DIFFICULTY_LEVELS.length - 1)
    }
    const q = generateOneQuestion(levelIdx, engine, reserveSeen, type)
    if (q) reservePool.push(q)
  }

  // 装配输入模式（diversifyBatch 需要 engine 实例）
  const diversified = engine.diversifyBatch(questions)
  // 备用池同样经过 diversifyBatch 处理，确保含 inputMode/options
  const diversifiedPool = engine.diversifyBatch(reservePool)

  return { questions: diversified, reservePool: diversifiedPool }
}

/**
 * 生成单道题，去重 + 去无效
 *
 * @param {number} levelIdx - DIFFICULTY_LEVELS 索引
 * @param {object} engine - 引擎实例（提供 baseConfig）
 * @param {Set} seen - 已生成题目的 equation 去重集合
 * @param {string} [type] - 类型标识，附加在返回对象上
 * @returns {{equation:string, solution:number, type?:string}|null}
 */
function generateOneQuestion(levelIdx, engine, seen, type) {
  const level = DIFFICULTY_LEVELS[levelIdx]
  if (!level) return null

  // 构造单题 paperList 配置
  const config = {
    ...engine.baseConfig,
    formulaList: level.formulaList,
    carry: level.carry,
    abdication: level.abdication,
    resultMinValue: 1,
    resultMaxValue: level.resultMax,
  }

  const paperList = [{
    step: config.step,
    numberOfFormulas: 8,  // 一次生成多道，直到找到一道可用（B12: 3→8 降 slot 浪费率）
    whereIsResult: config.whereIsResult,
    formulaList: config.formulaList,
    resultMinValue: config.resultMinValue,
    resultMaxValue: config.resultMaxValue,
    customFormulaList: null,
  }]

  const papers = createFormulasGenerator(config, paperList)
  const formulas = papers.reduce((p, c) => { p.push(...c.formulas); return p }, [])

  // 遍历取第一道不重复且有效的题
  for (const formula of formulas) {
    const solution = EquationSolver.solve(formula)
    if (solution == null || isNaN(solution) || !Number.isInteger(solution)) continue
    if (solution < 1) continue  // 去小数/零
    const key = formula.replace(/=$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    const result = { equation: formula, solution }
    if (type) result.type = type
    // B12: 验证 matchLevel 反推是否匹配预期 levelIdx
    // 1 级漂移内为同档级范围（如 L5-L6 同属"个位数巩固"），超出则拒绝
    const matched = Question.matchLevel(result)
    if (!matched || Math.abs(matched.levelIdx - levelIdx) > 1) {
      continue  // 不匹配或跨档级 → 跳过，继续试下一道
    }
    return result
  }

  return null
}
