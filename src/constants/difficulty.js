/**
 * 难度等级定义（constants 层 — 纯数据，无逻辑）
 *
 * DIFFICULTY_LEVELS：24 级精细难度分阶，**按人教版教材进度排序**
 *   1-5    一上    20 以内加减（含进位加法、退位减法）
 *   6-7    一下    100 以内加减（口算）
 *   8-9    二上    100 以内加减（笔算、进退位）
 *   10-11  二上    表内乘法（2~6 表、7~9 表）
 *   12-13  二下    表内除法（用 2~6 / 7~9 口诀求商）
 *   14-16  三上    万以内加减（三位数笔算）
 *   17-18  三上    多位数乘一位数
 *   19     三下    两位数乘两位数
 *   20-21  三下    除数是一位数的除法
 *   22     四上    三位数乘两位数
 *   23-24  四上    除数是两位数的除法
 *
 * 每级包含：
 *   - label: 中文名称
 *   - grade: 教材年级（人教），用于 UI 展示与按年级选档
 *   - formulaList: [{ min, max, operators, ... }] 数字范围 + 运算符约束
 *   - carry: '1'(鼓励进位) | '2'(允许进位) | '3'(禁止进位)
 *   - abdication: 同上（退位）
 *   - remainder: 仅除法档位，'2'=必须整除（本项目不采用有余数）
 *   - resultMax: 结果上限
 *
 * ⚠️ 顺序即进度：数组下标就是 difficultyIdx。
 * 调整顺序不会破坏已有画像 —— difficultyIdx 每次都由
 * Profile.computeDifficultyIdx(answers) 按本表重新匹配计算，不落库依赖。
 *
 * @see ../services/adaptiveEngine.js — 引擎用此表决定升降级
 * @see ../services/abilityProfile.js — computeDifficultyIdx 从答题史重算档位
 */

export const DIFFICULTY_LEVELS = [
  // ─── 一年级上：20 以内加减 ───
  { label: '起步',        grade: '一上', formulaList: [{ min: 1, max: 5, operators: null }, { min: 1, max: 5, operators: [1, 2] }], carry: '3', abdication: '3', resultMax: 10 },
  { label: '个位数巩固',  grade: '一上', formulaList: [{ min: 1, max: 6, operators: null }, { min: 1, max: 6, operators: [1, 2] }], carry: '3', abdication: '3', resultMax: 12 },
  { label: '个位数进阶',  grade: '一上', formulaList: [{ min: 1, max: 9, operators: null }, { min: 1, max: 9, operators: [1, 2] }], carry: '3', abdication: '3', resultMax: 18 },
  { label: '混合进退位①', grade: '一上', formulaList: [{ min: 2, max: 9, operators: null }, { min: 2, max: 9, operators: [1, 2] }], carry: '2', abdication: '2', resultMax: 18 },
  { label: '混合进退位②', grade: '一上', formulaList: [{ min: 2, max: 9, operators: null }, { min: 2, max: 9, operators: [1, 2] }], carry: '1', abdication: '1', resultMax: 18 },

  // ─── 一年级下：100 以内加减（口算）───
  { label: '两位数入门',  grade: '一下', formulaList: [{ min: 10, max: 30, operators: null }, { min: 10, max: 30, operators: [1, 2] }], carry: '3', abdication: '3', resultMax: 60 },
  { label: '两位数巩固',  grade: '一下', formulaList: [{ min: 10, max: 50, operators: null }, { min: 10, max: 50, operators: [1, 2] }], carry: '3', abdication: '3', resultMax: 100 },

  // ─── 二年级上：100 以内加减（笔算，进退位）───
  { label: '进退位入门',  grade: '二上', formulaList: [{ min: 11, max: 50, operators: null }, { min: 11, max: 50, operators: [1, 2] }], carry: '2', abdication: '2', resultMax: 100 },
  { label: '进退位巩固',  grade: '二上', formulaList: [{ min: 11, max: 99, operators: null }, { min: 11, max: 99, operators: [1, 2] }], carry: '2', abdication: '2', resultMax: 198 },

  // ─── 二年级上：表内乘法 ───
  // 分级维度取「乘数位数」——生成器可按范围精确控制，不依赖 psm.js 无法约束的进位
  // opMin/opMax 约束「较小因数」的位数，避免两位数×两位数被误收进一位数档位
  { label: '乘法口诀·2~6', grade: '二上', formulaList: [{ min: 2, max: 6, operators: [3] }, { min: 2, max: 6, operators: [3] }], carry: '1', abdication: '2', resultMax: 36 },
  { label: '乘法口诀·7~9', grade: '二上', formulaList: [{ min: 2, max: 9, operators: [3] }, { min: 7, max: 9, operators: [3] }], carry: '1', abdication: '2', resultMax: 81 },

  // ─── 二年级下：表内除法 ───
  // remainder 语义与 psm.js 一致：'2'=整除（本项目一律整除），'3'=必须有余数（不采用）
  // 注意：baseConfig.remainder 默认 '3'，故每个除法档位必须显式声明 '2'
  { label: '表内除法·2~6', grade: '二下', formulaList: [{ min: 4, max: 36, operators: [4], opMin: 2, opMax: 6, quotMin: 2, quotMax: 6 }, { min: 2, max: 6, operators: [4], opMin: 2, opMax: 6, quotMin: 2, quotMax: 6 }], carry: '1', abdication: '2', remainder: '2', resultMax: 6 },
  { label: '表内除法·7~9', grade: '二下', formulaList: [{ min: 14, max: 81, operators: [4], opMin: 7, opMax: 9, quotMin: 2, quotMax: 9 }, { min: 7, max: 9, operators: [4], opMin: 7, opMax: 9, quotMin: 2, quotMax: 9 }], carry: '1', abdication: '2', remainder: '2', resultMax: 9 },

  // ─── 三年级上：万以内加减（三位数笔算）───
  { label: '大数加法',    grade: '三上', formulaList: [{ min: 50, max: 999, operators: null }, { min: 50, max: 999, operators: [1] }], carry: '2', abdication: '3', resultMax: 1998 },
  { label: '大数减法',    grade: '三上', formulaList: [{ min: 50, max: 999, operators: null }, { min: 50, max: 999, operators: [2] }], carry: '3', abdication: '2', resultMax: 1998 },
  { label: '综合挑战',    grade: '三上', formulaList: [{ min: 10, max: 999, operators: null }, { min: 10, max: 999, operators: [1, 2] }], carry: '1', abdication: '1', resultMax: 1998 },

  // ─── 三年级上：多位数乘一位数 ───
  { label: '两位数×一位数', grade: '三上', formulaList: [{ min: 10, max: 99, operators: [3], opMin: 1, opMax: 9 }, { min: 2, max: 9, operators: [3], opMin: 1, opMax: 9 }], carry: '1', abdication: '2', resultMax: 999 },
  { label: '三位数×一位数', grade: '三上', formulaList: [{ min: 100, max: 999, operators: [3], opMin: 1, opMax: 9 }, { min: 2, max: 9, operators: [3], opMin: 1, opMax: 9 }], carry: '1', abdication: '2', resultMax: 9999 },

  // ─── 三年级下：两位数乘两位数、除数是一位数的除法 ───
  { label: '两位数×两位数', grade: '三下', formulaList: [{ min: 10, max: 99, operators: [3], opMin: 10, opMax: 99 }, { min: 10, max: 99, operators: [3], opMin: 10, opMax: 99 }], carry: '1', abdication: '2', resultMax: 9801 },
  { label: '两位数÷一位数', grade: '三下', formulaList: [{ min: 10, max: 99, operators: [4], opMin: 2, opMax: 9, quotMin: 10 }, { min: 2, max: 9, operators: [4], opMin: 2, opMax: 9, quotMin: 10 }], carry: '1', abdication: '2', remainder: '2', resultMax: 99 },
  { label: '三位数÷一位数', grade: '三下', formulaList: [{ min: 100, max: 999, operators: [4], opMin: 2, opMax: 9 }, { min: 2, max: 9, operators: [4], opMin: 2, opMax: 9 }], carry: '1', abdication: '2', remainder: '2', resultMax: 999 },

  // ─── 四年级上：三位数乘两位数、除数是两位数的除法 ───
  { label: '三位数×两位数', grade: '四上', formulaList: [{ min: 100, max: 999, operators: [3], opMin: 10, opMax: 99 }, { min: 10, max: 99, operators: [3], opMin: 10, opMax: 99 }], carry: '1', abdication: '2', resultMax: 99999 },
  { label: '两位数÷两位数', grade: '四上', formulaList: [{ min: 10, max: 99, operators: [4], opMin: 10, opMax: 99, quotMin: 2 }, { min: 10, max: 99, operators: [4], opMin: 10, opMax: 99, quotMin: 2 }], carry: '1', abdication: '2', remainder: '2', resultMax: 99 },
  { label: '三位数÷两位数', grade: '四上', formulaList: [{ min: 100, max: 999, operators: [4], opMin: 10, opMax: 99, quotMin: 2 }, { min: 10, max: 99, operators: [4], opMin: 10, opMax: 99, quotMin: 2 }], carry: '1', abdication: '2', remainder: '2', resultMax: 999 },
]
