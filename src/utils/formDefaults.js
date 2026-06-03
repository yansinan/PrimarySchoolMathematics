/**
 * 题目生成表单默认值 + 配置应用工具
 *
 * 抽离自 Home.vue / Generate.vue / configStorage.js 3 处重复的 formData 默认值。
 * 单一来源原则：所有 formData 默认值都从这里导出。
 *
 * 关键函数：
 *  - DEFAULT_FORM_DATA: 表单初始值（17 个字段）
 *  - DEFAULT_CONFIG_ROW: 配置存储中的默认行（带 targetMin/Max）
 *  - applyConfigToFormData(formData, config): 把选中配置应用到表单
 *
 * 调用方：
 *  - Home.vue: formData 初值 + selectedConfiguration
 *  - Generate.vue: formData 初值 + selectedConfiguration + onMounted 加载
 *  - configStorage.js: loadAll() 的兜底配置
 */

import { fileNameGeneratedRuleEnum } from './enum'

/** 标准表单初始值（17 字段） */
export const DEFAULT_FORM_DATA = {
  step: '1',                       // 几步运算
  numberOfFormulas: 30,            // 口算题数量
  whereIsResult: '0',              // 题型设置
  enableBrackets: false,           // 启用括号
  carry: '1',
  abdication: '1',
  remainder: '2',
  solution: '0',                   // 解题方式
  numberOfPapers: 3,               // 试卷数量
  numberOfPagerColumns: 3,         // 试卷列数
  paperTitle: '小学生口算题',        // 试卷标题
  paperSubTitle: '姓名：__________ 日期：____月____日 时间：________ 对题：____道',
  formulaList: [
    { min: 1, max: 9, operators: null },
    { min: 1, max: 9, operators: [1] },
  ],
  resultMinValue: 1,               // 试题运行结果最小值
  resultMaxValue: 9,               // 试题运行结果最大值
  targetMin: 10,                   // 自适应最少答题数
  targetMax: 30,                   // 自适应最多答题数
  generateMode: '1',
  customFormulaList: [
    { formula: '' }
  ],
  fileNameGeneratedRule: fileNameGeneratedRuleEnum.baseOnTitleAndIndex.key,
}

/** 配置存储中的默认行（id + name + data） */
export const DEFAULT_CONFIG_ROW = {
  id: '1',
  name: '默认',
  data: {
    ...DEFAULT_FORM_DATA,
    numberOfPapers: 1,  // 配置存储的默认试卷数偏保守（1 而非 3）
  },
}

/**
 * 把一个 config 对象的所有字段应用到 formData
 * @param {object} formData - Vue ref 的 formData.value
 * @param {object} config - 从 ConfigStorage 读出的 config（必含字段；缺则用 DEFAULT_FORM_DATA）
 * @param {object} [options]
 * @param {boolean} [options.includeAdaptive=true] - 是否应用 targetMin/targetMax
 */
export function applyConfigToFormData(formData, config, options = {}) {
  const { includeAdaptive = true } = options
  const c = config || {}

  formData.step = c.step ?? DEFAULT_FORM_DATA.step
  formData.numberOfFormulas = c.numberOfFormulas ?? DEFAULT_FORM_DATA.numberOfFormulas
  formData.whereIsResult = c.whereIsResult ?? DEFAULT_FORM_DATA.whereIsResult
  formData.enableBrackets = c.enableBrackets ?? DEFAULT_FORM_DATA.enableBrackets
  formData.carry = c.carry ?? DEFAULT_FORM_DATA.carry
  formData.abdication = c.abdication ?? DEFAULT_FORM_DATA.abdication
  formData.remainder = c.remainder ?? DEFAULT_FORM_DATA.remainder
  formData.solution = c.solution ?? DEFAULT_FORM_DATA.solution
  formData.numberOfPapers = c.numberOfPapers ?? DEFAULT_FORM_DATA.numberOfPapers
  formData.numberOfPagerColumns = c.numberOfPagerColumns ?? DEFAULT_FORM_DATA.numberOfPagerColumns
  formData.paperTitle = c.paperTitle ?? DEFAULT_FORM_DATA.paperTitle
  formData.paperSubTitle = c.paperSubTitle ?? DEFAULT_FORM_DATA.paperSubTitle
  formData.formulaList = c.formulaList ?? DEFAULT_FORM_DATA.formulaList
  formData.resultMinValue = c.resultMinValue ?? DEFAULT_FORM_DATA.resultMinValue
  formData.resultMaxValue = c.resultMaxValue ?? DEFAULT_FORM_DATA.resultMaxValue
  formData.fileNameGeneratedRule = c.fileNameGeneratedRule ?? DEFAULT_FORM_DATA.fileNameGeneratedRule

  if (includeAdaptive) {
    formData.targetMin = c.targetMin ?? DEFAULT_FORM_DATA.targetMin
    formData.targetMax = c.targetMax ?? DEFAULT_FORM_DATA.targetMax
  }
}
