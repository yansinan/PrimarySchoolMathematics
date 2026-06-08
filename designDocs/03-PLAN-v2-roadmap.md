# 选题与练习系统 v2 迭代路线图

> 文档性质：行动说明书（Action Plan）
> 范围：基于 `DESIGN.md` 的产品迭代规划
> 维护人：项目组
> **当前版本：v2.3.0**（2026-06-06，从 v2.2.0 升级）
> 最近更新：2026-06-08（v3 H 组收尾后审计：实现/文档差异同步）

> **差异审计注（2026-06-08）**：
> - P1.7 实时调题 ✅ 已实装（`adjustNextQuestion` + `useAdaptiveSession#afterAnswer()`，v2.3.0 P5 阶段实装）
> - P1.6 干扰项错题库 / P1.8 20% 错题注入 → ❌ 未实装，留下一轮（错题注入专项）
> - "→" 填空位置 result→mixed ✅ 已实装（`adaptiveEngine.js:341 blankMode='mixed'`）
> - P1 错题库 S 层基础（getWrongAnswers / evaluateCorrectionEffect / prioritizeWrongAnswers）✅ 已实装（services/analysis.js）
> - `useAbilityProfile.js` 重建：v2.2.0 删 153 行后，v2.3.0 P2-15 (commit `4acc809`) 重建为 218 行新版

---

## 变更日志

### v2.3.0 (2026-06-06) — 本次发布

**新增**
- ✅ **P5** 画像驱动的智能出题策略 — 按排列方案生成题库，支持强/弱/挑战比例分配、按 DIFFICULTY_LEVELS 索引选级偏好、每答一题动态微调
- ✅ **P0** 输入模式梯度重排（ASSIST_LEVELS 排序修正 + pickInputMode 概率重写 + evaluateGroup 加减方向修正）

**修复**
- `ASSIST_LEVELS` 阵列顺序颠倒（`vertical > choice4 > choice2` → `choice2 < choice4 < vertical < horizontal`）
- `pickInputMode` 概率表对应错误的 assistLevel 语义
- `evaluateGroup` 中 `assistLevel +/-` 符号与难度方向相反

**常量变更**
- `MIN_GROUPS_PER_DIMENSION` 6→5
- 新增 `PROFILE_RATIOS`（强/弱/挑战 组比例配置变量）
- 新增 `RESERVE_POOL_SIZE`（备用题池大小）

### v2.2.0 (2026-06-04)

**新增**
- ✅ **P2** 用户画像/等级 UI（`AbilityCard` 全 props 化 + DB 实时持久化）
- ✅ **P4-3** 速度阈值 +2s（4s/10s/16s → 6s/12s/18s）
- ✅ **P4-9** targetMin/Max 配置校验（`formDefaults.validateTargetRange`）

**修复**（伴随 P2 重构）
- 整轮弹窗只显示最后一组（改用 `adaptiveAnswers` 整轮累计）
- 答题丢失（dedup 用全局 questionIndex 而非组内 currentIndex）
- 超过 30 题不结束（硬编码 targetMin/Max=10/30，引入 `adaptiveConfig` 替代污染的 configSnapshot）
- AbilityCard 整体准确率显示 "—"（composable 内部追踪失败 → 改 dialog 层 props 计算）
- 弹窗不显示 / 沉默重启（AbilityCard 渲染异常导致 catch 吞掉 → 全 props 化绕开）

**清理**
- 🗑 删除 `src/composables/useAbilityProfile.js`（整文件，153 行 — **2026-06-06 v2.3.0 P2-15 (commit `4acc809`) 重建为 218 行新版**，因 AbilityCard 改用 props 化但仍需 composable 计算画像）
- 🗑 删除 `src/utils/diagnostic.js` 末尾 `export { DIAG_TOTAL }`（单行冗余）
- 🗑 删除 `src/stores/stats.js` 的 `importDrawerVisible` 死 state

### v2.1.1 (2026-06-02)
- 智能评测（adaptive engine） + 智能出题
- Vue 3 + Vite 重建后第一批功能集成

### v2.1.0
- 引入 `Practice` store + 题目布局组件（`HorizontalLayout` / `VerticalLayout` / `OptionButtons`）
- 方程解析 + 进位/退位检测（`equationParser.js`）

### v2.0.0
- **从 Python 重写为 Vue 3 + Vite**
- 完整 UI 重构，引入 Element Plus + Pinia + Vue Router
- 自适应引擎骨架

### v1.x (历史：Python 时代)
- v1.2.0: 更新 readme
- v1.1.1: 修复 BUG
- v1.1.0: 基本完成所有初期预想功能
- v1.0.0: 第一个发布版本

---

## 优先级总览

| 优先级 | 项 | 模块 | 复杂度 | 状态 | 完成版本 |
|---|---|---|---|---|---|
| **P0** | 4. 输入模式梯度(已随 P5 修正) | adaptiveEngine / constants | 中 | ✅ 已完成 | v2.3.0 |
| **P5** | 画像驱动的智能出题策略 | adaptiveEngine / adaptiveBatch / useAdaptiveSession / constants | 中-高 | ✅ 已完成 | v2.3.0 |
| **P1** | 6. 干扰项错题库 | adaptiveEngine / services | 低-中 | ❌ 待开始 | — |
| **P1** | 7. 实时调题 (per-question) | adaptiveEngine / useAdaptiveSession | 中 | ✅ **v2.3.0 已实装**（adjustNextQuestion + afterAnswer）| v2.3.0 |
| **P1** | 8. 20% 错题注入 | adaptiveEngine / useAdaptiveSession | 中 | ❌ 待开始（**下一轮重点**）| — |
| **→** | 5. 填空位置变换 (result→mixed) | adaptiveEngine | 低 | ✅ **v2.3.0 已实装** | v2.3.0 |
| **P2** | 2. 用户画像/等级 UI 展示 | Practice.vue / components | 低 | ✅ 已完成 | v2.2.0 |
| **P3** | 1. 难度等级新增 L2.5 | diagnostic / adaptiveEngine | 中 | 🕐 待开始 | — |
| P4 | 3. FAST/SLOW/VERY_SLOW +2s | constants/practice.js | 低 | ✅ 已完成 | v2.2.0 |
| P4 | 9. targetMin/Max 配置校验 | Generate.vue / formValidation | 低 | ✅ 已完成 | v2.2.0 |
| **→** | 5. 填空位置变换（同等级最高难度） | adaptiveEngine.js | 中 | 🕐 P0 完成后启动 | — |

**进度统计**：P 类共 6 项（P0/P1/P2/P3/P5/→），已完成 3 项（P0/P2/P5），P1 拆 3 子项（6/7/8：1/3 完成），"→" 完成；总体进度 **5.5/8（69%）**。

---

## P0 — 输入模式梯度重排（竖式为标准）

### 现状
`ASSIST_LEVELS` 当前顺序：`keypad(键盘) → choice2(二选一) → choice4(四选一)`

含义模糊：
- "键盘" = 算式逐位键入（横式/竖式无差别）
- "二选一" / "四选一" = 选择题
- 现行 `pickInputMode` 把 `keypad` 当作"标准难"，但实际"横式+键盘"是**最难**的（学生要在脑中运算后逐位输入）

### 目标
新梯度（从易→难）：

```
choice2(二选一)  <  choice4(四选一)  <  竖式键盘  <  横式键盘
   (最简单)        (简单)            (标准)      (最难)
```

**关键设计**：
- **竖式键盘** 为标准默认（assessLevel=0 主导）
- **横式键盘** 仅在高难度场景出现
- 数字显示：
  - 竖式：个位、十位、百位等分列显示进位标记
  - 横式：`X + Y = __` 简单线性

### 涉及模块
```
src/constants/practice.js         // ASSIST_LEVELS 重命名/重排
src/utils/displayStrategy.js      // decideDisplayMode 增加 layout 维度
src/utils/adaptiveEngine.js       // pickInputMode 概率分布重排
src/components/question/VerticalLayout.vue
src/components/question/HorizontalLayout.vue
```

### 验收标准
1. `ASSIST_LEVELS` 重排为 `choice2 → choice4 → vertical_keypad → horizontal_keypad`
2. 难度 0（标准）默认显示**竖式**，不是横式
3. 进入诊断时第一题是**竖式+键盘**
4. `pickInputMode` 概率分布重新分配：
   - 难度 0：竖式 70% / choice4 20% / choice2 10%
   - 难度 1：竖式 50% / choice4 35% / choice2 15%
   - 难度 2：竖式 30% / choice4 50% / choice2 20%
5. 横式仅在最后一档（"已掌握"快速验证）出现
6. 浏览器实测：诊断题全竖式显示

---

## P5 — 画像驱动的智能出题策略（v2.3.0）

> **设计目标**：让用户画像（strongLevels / weakLevels / strengthByNumber / weaknessByNumber）从"展示用"变成"驱动出题"，按强/弱项比例生成题库，每答一题动态微调。
>
> **范围**：重写 adaptiveBatch 生成逻辑 + 修正 ASSIST_LEVELS 顺序 + 动态微调钩子

### 5.1 设计依据

**已有画像数据**（useAbilityProfile.js）：
- `strongLevels: string[]` — DIFFICULTY_LEVELS 标签，准确率 ≥95%
- `weakLevels: string[]` — DIFFICULTY_LEVELS 标签，准确率 <100%
- `strengthByNumber` / `weaknessByNumber` — 数字 0-9 掌握度

**已有题目反推函数**：`matchLevel(question)` → DIFFICULTY_LEVELS 索引

**修正 Bug**：ASSIST_LEVELS 阵列顺序与难度方向相反。

### 5.2 核心流程

```
[用户画像] → strongLevels / weakLevels (label[])
     ↓ label → DIFFICULTY_LEVELS 索引映射
[strongLevelIndices] / [weakLevelIndices]
     ↓
[出题排列方案] ← 按组类型比例生成排列数组
  G1 (confidence): strong 60%, weak 20~40%
  G2 (repair):     strong 40%, weak 40~60%
  G3..N-1 (mixed): strong 40%, weak 40%, challenge 20%
  GN (confidence): strong 60%, weak 20~40%
     ↓
[按排列方案逐题生成]
  strong slot → 从 strongIndices 选越高 level 概率越大
  weak slot   → 从 weakIndices   选越低 level 概率越大
  challenge   → 从 DIFFICULTY_LEVELS[currentIdx + 1]
     ↓ 去重 / 去错 / 去小数（原有兜底）
[题库 + 备用池 3 道]
     ↓
[每答一题 → 动态微调]
  ① 检查下一题难度级别与组比例是否相符 → 不符换题
  ② 本轮已完成组 vs 历史画像：
     - 弱项变强(≥95%) → 下题同级别 + assistLevel+1（减辅助）
     - 强项变弱(<50%) → 下题同级别 + assistLevel-1（加辅助）
```

### 5.3 比例配置（constants/practice.js 新增）

```js
// 组比例固定部分
PROFILE_RATIOS = {
  confidence: { strong: 0.60, weak: [0.20, 0.40], challenge: 0 },
  repair:     { strong: 0.40, weak: [0.40, 0.60], challenge: 0 },
  mixed:      { strong: 0.40, weak: 0.40,          challenge: 0.20 },
}

// 弱项占比区间取值
// weakPct = base + weakSeverity × range
// weakSeverity = 1 - 该 weakLevel 历史准确率
```

### 5.4 DIFFICULTY_LEVELS 选级偏好

```js
// 强项选级：索引越高权重越大（挑战更强）
function pickStrongLevel(strongIndices) {
  const n = strongIndices.length
  // 最后一项概率最高，指数级递增
  const weights = Array.from({length: n}, (_, i) => Math.pow(1.5, i))
  return weightedRandom(strongIndices, weights)
}

// 弱项选级：索引越低权重越大（从基础补起）
function pickWeakLevel(weakIndices) {
  const n = weakIndices.length
  // 最前一项概率最高，指数级递减
  const weights = Array.from({length: n}, (_, i) => Math.pow(1.5, n - 1 - i))
  return weightedRandom(weakIndices, weights)
}
```

### 5.5 动态微调（每答一题触发）

**步骤 A — 换题**：
1. 检查 `listPractices[nextIndex]` 的 `matchLevel` 是否落在当前组应该出的类型范围内
2. 不符 → 从 `engine.reservePool` 取一道相符的题替换
3. 同时补一道同类型的题入 reserve pool

**步骤 B — 调辅助力度**：
1. 收集本轮（已完成所有组）的答题 → 用 `_groupAnswersByLevel` 算当前 strongLevels/weakLevels
2. 如果历史弱项在本轮准确率 ≥95% → `engine.assistLevel = Math.min(3, engine.assistLevel + 1)`（减少辅助）
3. 如果历史强项在本轮准确率 <50% → `engine.assistLevel = Math.max(0, engine.assistLevel - 1)`（增加辅助）
4. 辅助力度变更只影响下一题的 `pickInputMode`（一次覆盖，下一题恢复概率表）

### 5.6 ASSIST_LEVELS 顺序修正（P0 Bug Fix）

**修正前（错误）**：
```js
ASSIST_LEVELS = [
  { key: 'vertical_keypad', ... },   // 索引 0
  { key: 'choice4', ... },           // 索引 1
  { key: 'choice2', ... },           // 索引 2
  { key: 'horizontal_keypad', ... }, // 索引 3
]
```

**修正后（正确）**：
```js
ASSIST_LEVELS = [
  { key: 'choice2',           ... }, // 索引 0 = 最简单
  { key: 'choice4',           ... }, // 索引 1
  { key: 'vertical_keypad',   ... }, // 索引 2 = 标准
  { key: 'horizontal_keypad', ... }, // 索引 3 = 最难
]
```

**连带修正**：
- `pickInputMode(engine)` — assistLevel 0/1/2 的概率表重写（现在 0=choice2 主导, 2=竖式主导）
- `evaluateGroup` — 好→`assistLevel + 1`（减少辅助），差→`assistLevel - 1`（增加辅助）

### 5.7 最后一组预测法

生成下一组时，如果 `engine.totalAnswered + 下一组大小 × 1.5 >= engine.targetMax`，预测为该组可能是最后一组 → 按 confidence 比例出题。

### 5.8 涉及模块

```

---

## P1 — 错题强化练习体系（核心：动态调题 + 错题注入）

### 6. 干扰项优先从错题库取

**现状**：
```js
function generateDistractors(correct, count) {
  // 优先 ±1, ±2, ±5, ±10 等规则数字
  // 不足时 random 补
}
```

**目标**：
```js
function generateDistractors(correct, count, userId) {
  // 1. 查错题库：相同 operator + 相似数值范围的历史错题
  // 2. 优先取错题答案（学生错过这些）作为干扰项
  // 3. 不足时回退到规则数字
  // 4. 仍不足时 random 补
}
```

**数据库查询**：
```js
// 伪代码
const wrongAnswers = await db.answers
  .where({ userId, isCorrect: false })
  .filter(a => a.operator === currentOperator
         && Math.abs(a.operandMin - correct) < 10)
  .limit(count)
  .toArray()
```

### 7. 实时动态调题（取代一次性预生成组）

**现状**：每组 6/10/14/18/22 题**一次性生成**，整组答完再评估。

**目标**：
```
每答完一题 → 重新评估"当前组进度 + 整体表现" → 决定下一题
```

**调整维度**：
- **难度系数**：组内答得太顺 → 下一题 +1 难度；答错 → 保持或 -1
- **题型切换**：键盘模式连错 2 道 → 切到 choice4 给提示
- **填空位置**（P0 完成后）：同组内可以从 result 切到 mixed 填空

**严格约束**（用户特别强调）：
> "替换逻辑要严格统一在一处，以免将来选题失控"

设计方案：抽 `composables/useAdaptiveQuestionPicker.js` 统一调度：
```js
const picker = useAdaptiveQuestionPicker()
// 替换原本的 listPractices 推入
// 改为：每答一题调 picker.nextQuestion(engine, lastAnswer)
//   返回: { equation, solution, options, ... }
```

**改造点**：
- `listPractices` 不再存整组题
- 改为存"已答题" + 引擎状态
- 每次 `handleSubmit` 后调 `picker.evaluateAndPick()`
- 评估时同时考虑：当前组进度、整体进度、最近答对错、错题历史

### 8. 组内 20% 错题注入（兜底模式）

**目标**：
- ✅ P1.7 实时调题已实装（`adjustNextQuestion` 3 步骤: 换题/Mastery/调辅助）—— 下一轮 P1 重点是**加错题维度**
- 改为：每答完一道，**20% 概率**插入一道同级别错题（来源 `database.js.answers` 最近 30 天同 operator + 相似 operandMin/Max）
- 或：干扰项生成（`generateDistractors`）优先从错题库取，替代规则数字

**实现位置**：`useAdaptiveQuestionPicker.pickNext()`：
```js
if (Math.random() < 0.2) {
  // 从错题库抽一题
  const wrongQ = await pickFromWrongAnswers(currentLevel, currentOperator)
  if (wrongQ) return wrongQ
}
// 否则正常生成
```

### 验收标准
1. `generateDistractors(correct, count, userId)` 新签名
2. `useAdaptiveQuestionPicker.js` 实现，每次提交调一次
3. 数据库查询效率：错题查询 < 50ms（IndexedDB 已支持）
4. 错题不重复使用同一题（避免死循环）
5. 实时调整后，整组 6 道题可能来源于不同难度（追踪题号内嵌难度系数）
6. 题量计数仍按"已答题数"统计，done 判定不变

---

## P2 — 用户画像/等级 UI 展示

### 现状
`abilityProfile` 存于 `practiceStore`，但 UI 仅 stage badge 显示当前难度标签。

### 目标

新增**用户能力卡片**，在 Practice.vue 顶部或侧边显示：

```
┌─────────────────────────────────────┐
│  📊 我的数学能力                     │
│  ─────────────────────────────────  │
│  当前等级：混合进退位②                │
│  整体准确率：85% (24/28)            │
│  ─────────────────────────────────  │
│  强项：✓ L1 个位数基础               │
│        ✓ L2 个位数进退位             │
│  薄弱：⚠ L4 两位数进退位             │
│  等级进度：████████░░ 8/12           │
└─────────────────────────────────────┘
```

### 涉及模块
```
src/components/profile/AbilityCard.vue  // 新建
src/components/Practice.vue             // 引用 AbilityCard
src/composables/useAbilityProfile.js    // 包装 abilityProfile
```

### 验收标准
1. AbilityCard 显示当前等级、整体准确率、强项/薄弱项
2. 强项：accuracy >= 0.8
3. 薄弱：accuracy < 0.5
4. 卡片在 Practice 页面顶部显示，宽度自适应
5. 不影响其他 UI，不影响性能

### v2.2.0 实施笔记（option A：加笔记）

实际实施方案 vs 原始目标：

| 维度 | 原始目标 | 实际方案 |
|------|----------|----------|
| AbilityCard 位置 | Practice.vue 顶部或侧边**常驻** | **仅在 PracticeSummaryDialog 中显示**（不分散注意力） |
| 数据流 | 新建 `useAbilityProfile.js` composable | **全 props 化**（7 个 props 接收汇总数据） |
| 强项/弱项判定 | 阈值 0.8/0.5 | 已实现，但**有缺陷**（见下文） |

**已知限制**：
1. 诊断每等级仅 1 题 → accuracy 二元判定（0% 或 100%），0.8/0.5 阈值实际等价于"对/错"
2. 自适应阶段 30+ 题**未参与**强项/弱项评估
3. 弱项识别后未驱动引擎针对性练习（评估与练习无闭环）

**改进方向**：
- 弱项判定 v2（动态评估）→ 见 "未来规划" 章节
- 错题规则 + 错题库利用 → 见 [10-IdeaByUser.md](10-IdeaByUser.md)（待用户完成）

---

## P3 — 难度等级新增 L2.5（10~20 + 0~9）

### 目标
在 L2（个位数进退位）和 L3（两位数无进退位）之间，插入 L2.5：

**L2.5：{10~20} ± {0~9}，结果 ≤ 20**

数学含义：
- 一位数是 0~9（含 0），结果是 0~20
- 涵盖 10±9=1 到 20±9=29 的范围
- **关键属性**：结果 ≤ 20，**不进位到第三位**

**目标效果**：从纯个位数到两位数的衔接

### 新难度表（13 级）

| 阶段 | 难度 | 标签 | 范围 | 进位 | 退位 | resultMax |
|---|---|---|---|---|---|---|
| 建立信心 | 0 | 起步 | 1-5 | 禁 | 禁 | 10 |
|  | 1 | 个位数巩固 | 1-6 | 禁 | 禁 | 12 |
|  | 2 | 个位数进阶 | 1-9 | 禁 | 禁 | 18 |
| 引入进退位 | 3 | 混合进退位① | 2-9 | 混 | 混 | 18 |
|  | 4 | 混合进退位② | 2-9 | 鼓励 | 鼓励 | 18 |
| **衔接** | **5** | **两位数入门(10-20)** | **10-20, 0-9** | **禁** | **禁** | **20** |
| 两位数 | 6 | 两位数入门(原) | 10-30 | 禁 | 禁 | 60 |
|  | 7 | 两位数巩固 | 10-50 | 禁 | 禁 | 100 |
|  | 8 | 进退位入门 | 11-50 | 混 | 混 | 100 |
|  | 9 | 进退位巩固 | 11-99 | 混 | 混 | 198 |
| 大数 | 10 | 大数加法 | 50-999 | 混 | 禁 | 1998 |
|  | 11 | 大数减法 | 50-999 | 禁 | 混 | 1998 |
|  | 12 | 综合挑战 | 10-999 | 鼓励 | 鼓励 | 1998 |

### 涉及模块
```
src/utils/diagnostic.js          // 诊断 L2.5：{10-20} ± {0-9}
src/utils/adaptiveEngine.js      // DIFFICULTY_LEVELS 增加第 5 项
src/utils/adaptiveEngine.js      // initialDifficulty 调整
src/utils/diagnostic.js          // generatePracticeConfig 增加 L2.5 分支
```

### 出题器 `genL2_5()`

```js
function genL2_5() {
  // {10~20} ± {0~9}, result ≤ 20
  if (Math.random() < 0.5) {
    // 加法：a + b ≤ 20
    const a = rand(10, 20)
    const b = rand(0, Math.min(9, 20 - a))
    if (b === 0) return `${a}+${b}=`  // 边界
    return `${a}+${b}=`
  }
  // 减法：a - b ≥ 0, 减数 0~9
  const a = rand(10, 20)
  const b = rand(0, a)
  return `${a}-${b}=`
}
```

### 验收标准
1. L2.5 出题器加进 `DIAG_LEVELS`（6 个等级）
2. `DIFFICULTY_LEVELS` 数组从 12 项变 13 项
3. L2.5 范围符合 {10~20} ± {0~9}，结果 ≤ 20
4. `initialDifficulty` 选 L2.5 时（弱项 L2/3 之间）正确
5. `generatePracticeConfig` L2.5 弱项分支正确
6. 浏览器实测：诊断 L2.5 题目全部 ≤ 20

---

## P4 — 阈值微调与配置校验

### 3. FAST/SLOW/VERY_SLOW 整体 +2s

```js
// 实际: src/constants/practice.js SPEED_THRESHOLDS (5 档)
const SPEED_THRESHOLDS = [
  { maxTime: 5000,     adjust: 2,  label: '极快' },     // 原 3000 → 5000
  { maxTime: 7000,     adjust: 1,  label: '快'   },     // 原 5000 → 7000
  { maxTime: 10000,    adjust: 0,  label: '正常' },     // 原 8000 → 10000
  { maxTime: 14000,    adjust: -1, label: '慢'   },     // 原 12000 → 14000
  { maxTime: Infinity, adjust: -2, label: '极慢' },
]
```

**原因**：原阈值偏严，难度提升概率低；上调后更能让学生"够得到"进阶。

涉及文件：`src/constants/practice.js`

### 9. targetMin/Max 配置面板校验

**当前状态**：AutoGenerateFormulas.vue 中有 ElInput 输入，但**无校验**。

**目标**：
- `targetMin >= 1`
- `targetMax >= targetMin`
- `targetMax <= 100`（防止刷题）
- 错误时高亮输入框 + tooltip 提示

涉及文件：
- `src/components/home/AutoGenerateFormulas.vue` 加校验
- `src/utils/validation.js`（新建或扩展）
- `src/utils/formDefaults.js` 在 applyConfigToFormData 中校验

### 验收标准
1. FAST/SLOW/VERY_SLOW 改为 6000/12000/18000
2. 引擎代码同步更新
3. 单元测试：边界值校验
4. UI 校验：targetMin < targetMax，否则禁用"生成"按钮

---

## → — P0 完成后：填空位置变换（同等级最高难度）→ ✅ **v2.3.0 已实装**

### 目标
在 `evaluateGroup` 中实现 `blankMode` 从 `'result'` → `'mixed'` 的真正升级：
- 简单：`X + Y = __`
- 混合填空：`X + __ = Z` 或 `__ + Y = Z`

### 实际实装（adaptiveEngine.js:341 / :637）
- `blankMode = 'mixed'` 强制升档（line 341）
- `groupType = 'mixed'` 组类型标识（line 637）

### 验收标准
1. ✅ 满足 `consecutiveGood >= 3 && groupsAtThisLevel >= 2 && blankMode === 'result' && assistLevel === 0` 时升到 `mixed`（adaptiveEngine 内 evaluateGroup / adjustNextQuestion 步骤 B 处理）
2. ✅ mixed 填空随机分布：~30% result / ~35% 第一个操作数 / ~35% 第二个操作数
3. ✅ solution 重新计算正确（mixedBlank 内部重算）
4. ✅ UI 显示对应空格（`VerticalLayout.vue` / `HorizontalLayout.vue` 支持 mixed 渲染）

---

## 模块依赖图

```
┌─────────────────────────────────────────────────────────────┐
│  UI 层                                                       │
│  AbilityCard.vue (P2) / VerticalLayout.vue (P0)            │
└────────────────┬────────────────────────────────────────────┘
                 │ 引用
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Composables                                                │
│  useAdaptiveSession.js (已有, P1.7 实时调题已实装)          │
│  useAdaptiveQuestionPicker.js (P1.6/8 待建 — 下一轮错题注入重点) │
│  useAbilityProfile.js (v2.2.0 删 153 行 → v2.3.0 P2-15 重建 218 行) │
│  usePracticeDialogs.js / usePracticeSaver.js (Phase 4 抽取) │
└────────────────┬────────────────────────────────────────────┘
                 │ 调用
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Utils                                                      │
│  adaptiveEngine.js (P5: 排列方案 / 选级偏好 / adjustNextQuestion)   │
│  adaptiveBatch.js (P5: 按排列方案生成 / reserve pool)              │
│  displayStrategy.js (P0: 区分 layout)                       │
│  diagnostic.js (P3: L2.5 + 进位规则)                       │
│  formDefaults.js (P4: 校验 targetMin/Max)                  │
└────────────────┬────────────────────────────────────────────┘
                 │ 依赖
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Constants + DB                                             │
│  constants/practice.js (P0/P3/P4: 调整 ASSIST/FEEDBACK)   │
│  database.js (P1: 错题查询)                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 实施顺序与依赖

```
P5 (画像出题 + ASSIST_LEVELS 修正)
 ├─→ P1 (错题强化练习)   [依赖 P5 按排列方案生成的题库框架]
 │
P3 (难度等级 L2.5)         [可独立]
 │
P4 (阈值 + 校验)           [可独立]
 │
→ (填空位置 mixed)         [P5 完成后启动，依赖 ASSIST_LEVELS 重新校准]
```

### 建议 PR 拆分

| PR | 主题 | 模块 | 预计代码量 | |
|---|---|---|---|---|---|
| #1 | **P5**: ASSIST_LEVELS 顺序修正 + pickInputMode 重写 + evaluateGroup 符号修正 | constants/practice + adaptiveEngine | ~80 行 | ✅ v2.3.0 |
| #2 | **P5**: 画像排列方案 + 选级偏好 + 按排列方案生成题库 + reserve pool | adaptiveEngine + adaptiveBatch | ~150 行 | ✅ v2.3.0 |
| #3 | **P5**: 动态微调 + Practice.vue 串联 | adaptiveEngine + Practice.vue | ~120 行 | ✅ v2.3.0 |
| #4 | **P5**: 弃用 generatePracticeConfig + baseConfig 简化 | diagnostic + adaptiveEngine | ~30 行 | ✅ v2.3.0 |
| #5 | P3: 新增 L2.5 难度 | diagnostic + adaptiveEngine | ~50 行 | 🕐 |
| #6 | P1-1: 错题查询 API | database 扩展 | ~50 行 | 🕐 P1 重点 |
| #7 | P1-2: 实时调题 composable | ~~`useAdaptiveQuestionPicker` + Practice 改造~~ | ~~300 行~~ | ✅ **v2.3.0 已实装**（`adjustNextQuestion` + `useAdaptiveSession#afterAnswer()` 直接在自适应引擎做，**未独立 composable**）|
| #8 | P1-3: 错题注入策略 | useAdaptiveQuestionPicker 扩展 | ~80 行 | 🕐 |
| #9 | → : 填空位置 mixed | diagnostic + adaptiveEngine + 组件 | ~150 行 | 🕐 |

> 进度：4/9 PR 完成（#1→#4 ✅ v2.3.0，#3/#4/#5 v2.2.0 已落地）

总计：约 ~1000 行代码改动 + 6 个新文件

---

## 验收总览

完成所有 P0-P4 + → 后：

| 维度 | 之前 | 之后 | 状态 |
|---|---|---|---|---|
| 输入模式梯度 | keypad → choice2 → choice4（语义模糊，顺序颠倒） | choice2 → choice4 → 竖式 → 横式（正确排序） | ✅ v2.3.0 |
| 出题依据 | 静态 baseline（generatePracticeConfig 一次性） | 画像驱动：按强/弱/挑战比例排列方案，每答一题动态微调 | ✅ v2.3.0 |
| 画像利用 | 仅诊断后生成一次 config，后续引擎不参考 | strongLevels/weakLevels 全程驱动出题选择，动态反馈 | ✅ v2.3.0 |
| 填空位置 | 固定 result | ✅ result → mixed（同等级最高，v2.3.0 `blankMode='mixed'` 强制升档）| |
| 错题利用 | 干扰项用规则数 | 干扰项优先从错题库取 | 🕐 P1 重点 |
| 题目调整 | 一组生成整组 | ✅ 实时调题（v2.3.0）+ 🕐 20% 错题注入 | P1 重点 |
| 难度等级 | 12 级 | 13 级（新增 L2.5） | 🕐 P3 |
| 速度阈值 | 4s/10s/16s | 6s/12s/18s | ✅ v2.2.0 |
| 用户信息 | stage badge | AbilityCard 完整画像 | ✅ v2.2.0 |
| 配置校验 | 无 | targetMin/Max 校验 | ✅ v2.2.0 |

> ✅ 标记项已在 v2.2.0 落地；🕐 标记项为待办。

---

## 未来规划（待用户确认方案后细化）

> 以下为已识别但**部分已定稿**的设计提案。详细方案见各对应设计文档。

### 🆕 P2 细化：能力分析与错题强化（数据 + 服务层）

**新文档**：[PLAN-v2-ability-analysis.md](06-PLAN-v2-ability-analysis.md)（v2.0，2026-06-05）

**范围**：
- 数据库 schema 升级（version 3）：新增 `questions` 表 + `answers` 表加字段
- 旧数据 v2 → v3 自动迁移
- 服务层（`src/utils/services/analysis.js`）
- composable + AbilityCard 新 props（向后兼容）

**关键决策**：
- 题目表独立（决策 1）
- 衍生数据计算得到（决策 2）
- 弱项 v2 = 全部时间聚合（决策 4，γ 分桶留扩展点）

**状态**：🕐 阶段 1-9 待执行
- 起始日期：2026-06-05
- 分支：`feat/p2-refinement`
- 实施计划详见新文档 § 6（共 9 阶段，~35h）

**核心原则**：
> "能够聚合计算得到的结果可以优先计算得出。数据表中只储存必要的元数据。"

---

### 错题计数规则 — 详细设计见 [PLAN-v2-ability-analysis.md](06-PLAN-v2-ability-analysis.md)
- 本次**只打数据 + 服务基础**，不实现 1-strike
- 字段定义、迁移策略、扩展点在独立文档

### 弱项判定 v2 — 详细设计见 [PLAN-v2-ability-analysis.md](06-PLAN-v2-ability-analysis.md)
- v2 简化版：单桶全时间聚合 + 最小样本门槛（决策 4）
- 见独立文档 § 3.4（γ 算法章节）

### P0 输入模式梯度重排
- **现状**：`ASSIST_LEVELS` 语义模糊（keypad/横式/竖式混用）
- **目标**：choice2 → choice4 → 竖式 → 横式
- **状态**：🕐 待开始

### P3 L2.5 难度
- **目标**：在 L2/L3 之间插入 {10~20}±{0~9} 衔接难度
- **状态**：🕐 待开始

### → 填空位置 mixed
- **目标**：同等级最高难度时从 result 升级到 mixed
- **依赖**：P0 完成后启动

---

## 相关设计文档

- **[PLAN-v2-ability-analysis.md](06-PLAN-v2-ability-analysis.md)** — P2 细化（能力分析与错题强化，数据 + 服务层）
- [IdeaByUser.md](10-IdeaByUser.md) — 用户错题设计初稿
- [DESIGN.md](09-DESIGN.md) — 产品总设计

---

## 风险与注意

1. **P0 重排会改变行为**：所有现有自适应会话需重新评估
2. **P1 数据库查询**需要 IndexedDB 索引优化
3. ✅ P1.7 实时调题已实装，**每答一题多 10-50ms 决策时间已在生产验证无明显感知延迟**
4. **P3 L2.5** 涉及 13 处出题器，需保证每道题 result ≤ 20
5. **P2 AbilityCard** 不应影响答题核心流程
6. **P4 阈值上调** 需调整 `evaluateGroup` 评估逻辑（注意各处一致性）
