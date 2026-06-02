/**
 * 自适应批次生成
 *
 * 原始实现见 Practice.vue 的 generateBatch(engine, count) 函数。
 * 抽离为纯函数模块，便于测试和复用。
 *
 * 流程：
 *  1) 根据引擎当前 difficultyIdx 取 DIFFICULTY_LEVELS 配置
 *  2) 构造 paperList 传给 createFormulasGenerator 生成算式
 *  3) flatten 出 formula 数组
 *  4) 解析为 {equation, solution} 基础题
 *  5) 用 diversifyBatch 混入输入模式（keypad/choice2/choice4）和填空位置
 */

import { createFormulasGenerator } from './paperGenerator'
import { EquationSolver } from './EquationSolver'
import { getDifficultyConfig, diversifyBatch } from './adaptiveEngine'

/**
 * 根据自适应引擎生成一组题
 * @param {object} engine - 自适应引擎实例（来自 createAdaptiveEngine）
 * @param {number} count - 本组题数（来自 getGroupSize）
 * @returns {Array<{equation:string, solution:number, options?:number[]}>}
 */
export function generateAdaptiveBatch(engine, count) {
  // 1) 取当前难度配置
  const config = getDifficultyConfig(engine)

  // 2) 构造 paperList 并调用生成器
  // paperList 数组每个元素是一"页"题，这里只用一页
  const paperList = [{
    step: config.step,
    numberOfFormulas: count,
    whereIsResult: config.whereIsResult,
    formulaList: config.formulaList,
    resultMinValue: config.resultMinValue,
    resultMaxValue: config.resultMaxValue,
    customFormulaList: null
  }]
  const papers = createFormulasGenerator(config, paperList)

  // 3) flatten 出所有算式
  const formulas = papers.reduce((p, c) => { p.push(...c.formulas); return p }, [])

  // 4) 解析为 {equation, solution}，过滤掉无解的题
  const baseQuestions = formulas.map(cur => ({
    equation: cur,
    solution: EquationSolver.solve(cur)
  })).filter(q => q.solution !== null && !isNaN(q.solution))

  // 5) 混入输入模式（选择题/keypad）与填空位置
  return diversifyBatch(baseQuestions, engine)
}
