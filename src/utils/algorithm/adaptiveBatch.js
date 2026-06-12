/**
 * 自适应批次生成（P5 v2.3.0）
 *
 * 原始实现见 Practice.vue 的 generateBatch(engine, count) 函数。
 * 抽离为纯函数模块，便于测试和复用。
 *
 * P5 改造：接受排列方案 plan 数组，按 strong/weak/challenge 类型逐 slot 生成。
 *
 * 流程：
 *  1) 根据 plan 数组和画像，逐 slot 选 DIFFICULTY_LEVELS 并生成算式
 *  2) 强项/弱项通过 pickStrongLevel/pickWeakLevel 带偏好选级
 *  3) 挑战题从 difficultyIdx + 1 级取
 *  4) 解析为 {equation, solution} 基础题
 *  5) 用 diversifyBatch 混入输入模式（keypad/choice2/choice4）
 *
 * P2-1：删 reserve pool 预生成——adjustNextQuestion 改即时生成单道题。
 * 见 services/adaptiveEngine.js#adjustNextQuestion。
 */

import { createFormulasGenerator } from '../paperGenerator'
import { EquationSolver } from './EquationSolver'
import { DIFFICULTY_LEVELS } from '../../constants/difficulty'
import { Question } from '@/services'

/**
 * 根据自适应引擎和排列方案生成一组题（仅主题库，不含 reserve）
 *
 * @param {object} engine - 自适应引擎实例（含 strongLevelIndices / weakLevelIndices）
 * @param {number} count - 本组题数
 * @param {string[]} plan - 排列数组，每项 'strong' | 'weak' | 'challenge'
 * @returns {Array<{equation, solution, options?, inputMode}>}
 */
export function generateAdaptiveBatch(engine, count, plan) {
  const questions = []
  const seen = engine._seenEquations || new Set()  // 去重（跨组）

  for (const slotType of plan) {
    const levelIdx = pickLevelForSlot(engine, slotType)
    const q = generateOneQuestion(levelIdx, engine, seen, slotType)
    if (q) questions.push(q)
  }

  return engine.diversifyBatch(questions)
}

/**
 * 为单个 slot 选目标难度等级
 * @param {object} engine
 * @param {'strong'|'weak'|'challenge'} slotType
 * @returns {number} DIFFICULTY_LEVELS 索引
 */
function pickLevelForSlot(engine, slotType) {
  if (slotType === 'strong') {
    const idx = engine.pickStrongLevel()
    return idx == null ? engine.difficultyIdx : idx
  }
  if (slotType === 'weak') {
    const idx = engine.pickWeakLevel()
    return idx == null ? engine.difficultyIdx : idx
  }
  // challenge: 当前难度 + 1
  return Math.min(engine.difficultyIdx + 1, DIFFICULTY_LEVELS.length - 1)
}

/**
 * 生成单道题，去重 + 去无效 + matchLevel 校验
 *
 * P2-1：调整为可被 adjustNextQuestion 即时调用的公开 API（不再是私有）。
 * 调用方需自行传入 seen Set 与 type 标识。
 *
 * @param {number} levelIdx - DIFFICULTY_LEVELS 索引
 * @param {object} engine - 引擎实例（提供 baseConfig）
 * @param {Set} seen - 已生成题目的 equation 去重集合
 * @param {string} [type] - 类型标识，附加在返回对象上
 * @returns {{equation:string, solution:number, type?:string, levelIdx?:number}|null}
 */
export function generateOneQuestion(levelIdx, engine, seen, type) {
  const level = DIFFICULTY_LEVELS[levelIdx]
  if (!level) return null

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

  for (const formula of formulas) {
    const solution = EquationSolver.solve(formula)
    if (solution == null || isNaN(solution) || !Number.isInteger(solution)) continue
    if (solution < 1) continue
    const key = formula.replace(/=$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    const result = { equation: formula, solution, levelIdx }
    if (type) result.type = type
    // B12: 验证 matchLevel 反推是否匹配预期 levelIdx
    // 1 级漂移内为同档级范围（如 L5-L6 同属"个位数巩固"），超出则拒绝
    const matched = Question.matchLevel(result)
    if (!matched || Math.abs(matched.levelIdx - levelIdx) > 1) {
      continue
    }
    return result
  }

  return null
}
