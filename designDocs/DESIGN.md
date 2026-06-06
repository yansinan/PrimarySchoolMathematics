# 选题逻辑与出题流程 — 功能设计说明

> 文档目的：记录 PrimarySchoolMathematics 项目中
> **题目选择**与**出题流程**的完整设计，方便后续维护和重构。
>
> 维护人：项目组
> 最近更新：2026-06-03

---

## 1. 入口分流

```
用户点击"开始练习"
        │
        ├─── 路径 A: 智能测试（首次/能力画像缺失）──→ 诊断题
        │
        └─── 路径 B: Generate 抽屉手动配置 ──→ 普通练习
```

**路由判断**（`src/components/Practice.vue:onMounted`）：

| 条件 | 行为 |
|---|---|
| `isIdle && listPractices.length === 0` | 走**路径 A**（诊断） |
| `isPractice && abilityProfile` | 继续**路径 A**（新一轮自适应） |
| `isPractice && !abilityProfile` | 路径 B 的题已加载，直接显示 |

---

## 2. 路径 A：诊断流程（5 题能力评估）

**入口**：`generateDiagnosticQuestions()` in `src/utils/diagnostic.js`

### 2.1 5 个等级

| 等级 | 范围 | 特征 |
|---|---|---|
| L1 | 个位数 ± | 和 ≤ 10，**无进位/退位** |
| L2 | 个位数 ± | **有进位/退位**（个位和≥10 或被减数个位<减数个位）|
| L3 | 两位数 ± | **无进位/退位** |
| L4 | 两位数 ± | **有进位/退位** |
| L5 | 混合 | 随机从 L1~L4 抽一题 |

### 2.2 出题器实现

每个 `genL1~L4` 是**纯函数**，根据数学约束随机生成算式：

```js
// L1 示例：个位数 +/−，和 ≤ 10，不退位
function genL1() {
  if (Math.random() < 0.5) {
    const a = rand(1, 9)
    const b = rand(1, Math.min(9, 10 - a))   // 约束：a + b ≤ 10
    return `${a}+${b}=`
  }
  const a = rand(1, 9)
  const b = rand(1, a)                        // 约束：a ≥ b
  return `${a}-${b}=`
}
```

**`generateDiagnosticQuestions` 流程**：

```js
for (const level of DIAG_LEVELS) {     // L1, L2, L3, L4, L5
  for (let i = 0; i < level.count; i++) {  // count=1 each
    let attempts = 0
    do {
      equation = GENERATORS[level.id]()
      solution = EquationSolver.solve(equation)
      attempts++
    } while (
      (solution === null || isNaN(solution) || !Number.isInteger(solution)) &&
      attempts < 30                       // 防止无解死循环
    )
    if (Number.isInteger(solution)) {
      questions.push({ equation, solution, level: level.id })
    }
  }
}
// 按 L1 → L5 排序返回
```

### 2.3 诊断结果分析

`analyzeAbility(answers)`：

```js
const WEAK_THRESHOLD = 0.5
// 每等级 1 题，答错 1 道即该等级薄弱（accuracy < 0.5）
return { levelScores, weakLevels, allCorrect }
```

### 2.4 初始练习配置生成

`generatePracticeConfig(profile)` 根据 `weakLevels` 调整 13 个字段：

| 弱项 | 调整 |
|---|---|
| L1 弱 | min/max=1-5，禁止进退位，结果 ≤10 |
| L2 弱 | 1-9 强制进退位，结果 ≤18 |
| L3 弱 | 10-99 两位数，无进退位 |
| L4 弱 | 10-99 强制进退位 |
| L5 弱 | 全范围混合 |
| 全部正确 | 自动升级到 10-99 两位数+混合进退位 |
| **输出** | 直接兼容 `formData` 字段格式 |

---

## 3. 路径 A 的下一步：自适应引擎

**入口**：`createAdaptiveEngine(profile, targetMin=10, targetMax=30)` in `src/utils/adaptiveEngine.js`

### 3.1 初始难度

`initialDifficulty(profile)`：
```js
allCorrect 或无弱项     → 难度 4 (混合进退位①)
L5/L4 弱               → 难度 5 (两位数入门)
L3 弱                  → 难度 3 (混合进退位①)
L1/L2 弱                → 难度 1 (个位数巩固)
```

### 3.2 12 级难度表 `DIFFICULTY_LEVELS`

| 阶段 | 难度 | 标签 | 范围 | 进位 | 退位 | resultMax |
|---|---|---|---|---|---|---|
| 建立信心 | 0 | 起步 | 1-5 | 禁 | 禁 | 10 |
|  | 1 | 个位数巩固 | 1-6 | 禁 | 禁 | 12 |
|  | 2 | 个位数进阶 | 1-9 | 禁 | 禁 | 18 |
| 引入进退位 | 3 | 混合进退位① | 2-9 | 混 | 混 | 18 |
|  | 4 | 混合进退位② | 2-9 | 鼓励 | 鼓励 | 18 |
| 两位数 | 5 | 两位数入门 | 10-30 | 禁 | 禁 | 60 |
|  | 6 | 两位数巩固 | 10-50 | 禁 | 禁 | 100 |
|  | 7 | 进退位入门 | 11-50 | 混 | 混 | 100 |
|  | 8 | 进退位巩固 | 11-99 | 混 | 混 | 198 |
| 大数 | 9 | 大数加法 | 50-999 | 混 | 禁 | 1998 |
|  | 10 | 大数减法 | 50-999 | 禁 | 混 | 1998 |
|  | 11 | 综合挑战 | 10-999 | 鼓励 | 鼓励 | 1998 |

### 3.3 三维调节轴

1. **输入模式**（`ASSIST_LEVELS`）: `keypad` → `choice2` → `choice4`（从难到易）
2. **填空位置**: `result`（仅末尾填空）→ `mixed`（等式不同位置填空，**当前未实现**）
3. **难度阶梯**: 0~11

---

## 4. 自适应组题数：`getGroupSize(engine)`

```js
groupSizeIdx: 0~4 (速度等级)
GROUP_SIZES = [6, 10, 14, 18, 22]  // 基础大小
y = max(4, 2 + 4*x + 2*random(-2~+2))  // 6/10/14/18/22 题 ±4
```

### 4.1 输入模式概率 `pickInputMode(engine)`

| assistLevel | keypad | choice2 | choice4 |
|---|---|---|---|
| 0（标准） | 70% | 20% | 10% |
| 1（轻度辅助） | 20% | 55% | 25% |
| 2（重度辅助） | 10% | 25% | 65% |

### 4.2 `diversifyBatch` 流程

```js
对每道基础算式：
  1. 强制 result 填空（统一改为 "X+Y=__"）
  2. 选 inputMode（keypad/choice2/choice4）
  3. 若选择题：generateDistractors(solution, n-1) 生成干扰项
  4. 随机打乱选项
```

---

## 5. 出题：实际算式生成

**`generateAdaptiveBatch(engine, count)`** in `src/utils/adaptiveBatch.js`：

```js
1. getDifficultyConfig(engine) → 12 级 DIFFICULTY_LEVELS 配置
2. 构造 paperList = [{
     step, numberOfFormulas: count,
     whereIsResult, formulaList,
     resultMinValue, resultMaxValue
   }]
3. createFormulasGenerator(config, paperList)  // → psm.js
4. flatten 算式 + EquationSolver.solve() 解析
5. filter 掉无整数解的
6. diversifyBatch() 混入选择题/填空形式
```

### 5.1 `createFormulasGenerator` in `src/utils/paperGenerator.js`

调用第三方 `FormulasGenerator`（`psm.js`）生成算式：

- 构造 `multiSteps`（各步操作数范围）和 `symbols`（运算符）
- 不足 4 步的补 `[1,9]` + `[1]`
- 实例化 `FormulasGenerator` 并 `generate()`
- 按 `numberOfPapers` 生成多套

---

## 6. 自适应调节：组内评估

**`evaluateGroup(engine, groupAnswers)`** 流程：

```js
计算 total / correct / accuracy / avgTime
累积到 next: totalAnswered / groupIndex / history

判定 done 条件（任一）：
  1. totalAnswered < targetMin (10)        → 继续
  2. totalAnswered >= targetMax (30)       → 结束 ✓
  3. accuracy ≥ GOOD(0.8) AND avgTime < FAST(4s) 
     AND 最近 2 组都好且快                       → 结束 ✓
  4. accuracy < BAD(0.5) AND totalAnswered >= targetMin+5
     AND consecutiveBad >= 2                   → 结束 ✓
  5. history.length >= 6                      → 结束 ✓（兜底）
  否则 → 继续，调整参数：
```

### 6.1 速度调整（按 avgTime）

| avgTime | speedAdjust |
|---|---|
| < 3s | +2 |
| < 5s | +1 |
| < 8s | 0 |
| < 12s | -1 |
| else | -2 |

### 6.2 表现调整

```
accuracy ≥ GOOD (0.8):
  consecutiveGood >= 3 AND groupsAtThisLevel >= 2:
    assistLevel > 0      → assistLevel--      // 先减辅助
    blankMode='result'   → blankMode='mixed'  // 再改填空位置
    否则                  → difficultyIdx++   // 最后升难度
  next.groupSizeIdx += speedAdjust (clamped)

accuracy < BAD (0.5):
  consecutiveBad >= 2:
    assistLevel < max   → assistLevel++       // 先加辅助
    否则                 → difficultyIdx--    // 再降难度
  next.groupSizeIdx = max(0, groupSizeIdx + min(-1, speedAdjust))
```

### 6.3 done=true 出口（5 个）

1. `targetMax` 严格上限
2. 连续 2 组都好又快
3. 连续 2 组差且超过 min 太多
4. 6 组封顶兜底
5. `total === 0`（防御性）

---

## 7. 完整流程图

```
首次进入
   │
   ▼
Practice.vue onMounted
   │
   ├─ isIdle + listPractices=0
   │     │
   │     ▼
   │  generateDiagnosticQuestions() → 5 道诊断题
   │     │
   │     ▼
   │  store.startAssessment(questions) → phase=assessment
   │
   ├─ isPractice + abilityProfile
   │     │
   │     ▼
   │  useAdaptiveSession().startNewAdaptiveSession()
   │     │
   │     ├─ createAdaptiveEngine(profile, targetMin, targetMax)
   │     ├─ resetPracticeSession() 清输入态
   │     └─ generateAdaptiveBatch(engine, getGroupSize(engine))
   │           │
   │           ├─ getDifficultyConfig(engine) → 12 级配置
   │           ├─ createFormulasGenerator(config, paperList)
   │           │     └─ FormulasGenerator (psm.js) → 算式数组
   │           ├─ EquationSolver.solve() + filter
   │           └─ diversifyBatch() → 加入选择题/keypad 形式
   │
   └─ isPractice + !abilityProfile
         │
         ▼
      Generate.vue 已 setListPractices(listResult)
      （用户手动配置：step / formulaList / numberOfFormulas）

答题循环
   │
   ├─ handleSubmit
   │   ├─ parseEquation 提取 operator / operand
   │   ├─ getCarryType 判定进位/退位
   │   ├─ 生成 answerEntry
   │   ├─ session.answers.push(answerEntry)（跨组全局 questionIndex）
   │   └─ saver.savePerQuestion() 立即写 DB
   │
   ├─ handleNext
   │   ├─ 若不是最后一题 → nextQuestion() + initPractice()
   │   └─ 最后一题
   │         ├─ isAssessment → handleAssessmentComplete
   │         │     └─ analyzeAbility → 画像 → 自适应第 1 组
   │         ├─ adaptiveEngine → completeAdaptiveGroup
   │         │     ├─ 弹自我评价弹窗
   │         │     ├─ evaluateGroup 评估
   │         │     ├─ 若 done=false → 生成下一组
   │         │     └─ 若 done=true → 弹汇总弹窗
   │         └─ !adaptiveEngine → handlePracticeComplete
   │               └─ 弹汇总弹窗（普通练习）

弹窗关闭
   │
   ▼
watch(listPractices) 变空时：
   - abilityProfile 有 → startNewAdaptiveSession()
   - 普通练习 + 无 profile → 重新诊断
```

---

## 8. 关键配置参数

| 参数 | 值 | 来源 | 说明 |
|---|---|---|---|
| `targetMin` | 10 | Generate.vue `formData.targetMin` | 最少答题数 |
| `targetMax` | 30 | Generate.vue `formData.targetMax` | 最多答题数（强制结束阈值）|
| `GOOD` | 0.8 | `constants/practice.js` | 答好阈值（accuracy ≥ 0.8）|
| `BAD` | 0.5 | `constants/practice.js` | 答差阈值（accuracy < 0.5）|
| `FAST` | 4000ms | `constants/practice.js` | 反应快阈值 |
| `SLOW` | 10000ms | `constants/practice.js` | 反应慢阈值 |
| `VERY_SLOW` | 16000ms | `constants/practice.js` | 非常慢阈值 |
| `CONSECUTIVE_GOOD_TO_ADVANCE` | 3 | `constants/practice.js` | 连续答好组数 → 升阶 |
| `ASSESSMENT_ABORT_WRONG_STREAK` | 2 | `constants/practice.js` | 评估模式连续错 2 道提前结束 |
| `MIN_GROUPS_PER_DIMENSION` | 6 | `adaptiveEngine.js` | 同维度至少 6 组才考虑变动 |
| `GROUP_SIZES` | [6,10,14,18,22] | `adaptiveEngine.js` | 小组题量阶梯 |

---

## 9. 关键设计决策

1. **fillNaN 防御**：每个 `genL1~L4` 用 `do-while attempts < 30` 防止无解算式
2. **L5 复用 L1~L4**：`pick(genL1, genL2, genL3, genL4)()` 而非独立生成
3. **跨组全局 `questionIndex`**：`groupAnswerOffset + currentIndex` 避免去重冲突
4. **不重置 `session.answers`**：让"整轮"累计含诊断+自适应
5. **诊断答案用于画像但不计入整轮统计**：profile 单独存，不影响弹窗数字
6. **mixed 填空位置未实现**：当前 `diversifyBatch` 强制 `result` 填空
7. **可恢复 vs 重新开始**：`startNewAdaptiveSession` 无画像时进入 idle 重诊断；有画像时直接开新组

---

## 10. 模块结构

```
src/
├─ constants/
│  └─ practice.js          // FEEDBACK_DELAYS / ACCURACY_THRESHOLDS / SPEED_THRESHOLDS / etc.
├─ utils/
│  ├─ equationParser.js    // parseEquation / getCarryType / EMPTY_PARSED_EQUATION
│  ├─ EquationSolver.js    // solve / toEvalSymbols (CJS)
│  ├─ psm.js               // FormulasGenerator（第三方口算题生成器）
│  ├─ paperGenerator.js    // createFormulasGenerator 组装 paperList
│  ├─ diagnostic.js        // DIAG_LEVELS / generateDiagnosticQuestions / analyzeAbility / generatePracticeConfig
│  ├─ adaptiveEngine.js    // 12 级难度表 / ASSIST_LEVELS / createAdaptiveEngine / getGroupSize / pickInputMode / diversifyBatch / evaluateGroup
│  └─ adaptiveBatch.js     // generateAdaptiveBatch（粘合 adaptiveEngine + paperGenerator + diversifyBatch）
├─ composables/
│  ├─ useAdaptiveSession.js  // 响应式状态 + startNewAdaptiveSession
│  ├─ usePracticeDialogs.js  // Promise 化弹窗
│  └─ usePracticeSaver.js    // 持久化封装
├─ stores/
│  └─ practice.js          // listPractices / phase / abilityProfile / session
├─ components/
│  └─ Practice.vue         // 入口 + onMounted + handleSubmit + handleNext + watch
└─ views/
   └─ Home.vue             // （实际被 Layout 取代）
```

---

## 11. 已知约束 / TODO

- [ ] `blankMode='mixed'` 填空位置未实现（`diversifyBatch` 强制 result 填空）
- [ ] `getGroupSize` 仍使用 `Math.random()`（每次刷新会变），未持久化
- [ ] `generateDistractors` 偶有重复（用 `Set` 兜底）
- [ ] 诊断只 5 道题，每等级 1 道，可能误判（"错 1 道即薄弱"）
- [ ] `feedbackType === 'wrong'` 弹窗后是否中止 → 阈值 `2` 由 `ASSESSMENT_ABORT_WRONG_STREAK` 控制
- [ ] E1 提到 `psm.js:getRandomBracket` 有 `while(true)` 永真循环（虽然 diagnostic.js 不用 bracket）
- [ ] 诊断题生成超过 30 次尝试则丢弃该题（理论极端情况）

---

## 12. [P5 v2.3.0] 画像驱动的智能出题策略

> **目标**：让用户画像（strongLevels / weakLevels）从"展示用"变成"驱动出题"，
> 按强/弱项比例生成题库，每答一题动态微调。
>
> 完整设计见 `PLAN-v2-roadmap.md § 5`。

### 12.1 核心概念

**画像数据**（来自 `useAbilityProfile.js`）：
- `strongLevels: string[]` — DIFFICULTY_LEVELS 标签，准确率 ≥95%
- `weakLevels: string[]`   — DIFFICULTY_LEVELS 标签，准确率 <100%

**复用 matchLevel**：用已有反推函数将题目匹配到 DIFFICULTY_LEVELS 索引，
强项/弱项/挑战类型的选级偏好由 `pickStrongLevel` / `pickWeakLevel` 控制。

### 12.2 出题排列方案

```
[用户画像] → strongLevelIndices / weakLevelIndices
     ↓
[出题排列方案] ← 按组类型比例生成排列数组
  G1 (confidence): strong 60%, weak 20~40%
  G2 (repair):     strong 40%, weak 40~60%
  G3..N-1 (mixed): strong 40%, weak 40%, challenge 20%
  GN (confidence): strong 60%, weak 20~40%
     ↓
[按排列方案逐题生成]
  strong slot → DIFFICULTY_LEVELS[strongIndices]
                 选中概率：高索引 > 低索引（挑战更强）
  weak slot   → DIFFICULTY_LEVELS[weakIndices]
                 选中概率：低索引 > 高索引（从基础补起）
  challenge   → DIFFICULTY_LEVELS[currentIdx + 1]
     ↓ 去重 / 去错 / 去小数
[题库 + 备用池 3 道]
```

### 12.3 动态微调（每答一题触发）

```
步骤 A — 换题：
  检查下一题 matchLevel 是否落在当前组应出的类型范围
  不符 → 从 reserve pool 取一道替换

步骤 B — 调辅助力度：
  历史弱项本轮 ≥95% → assistLevel + 1（减少辅助）
  历史强项本轮 <50%  → assistLevel - 1（增加辅助）
```

### 12.4 ASSIST_LEVELS 顺序修正（P0 Bug Fix）

**修正后**（从易→难）：
```
choice2(最简单) < choice4 < vertical_keypad(竖式标准) < horizontal_keypad(横式验证)
```

**连带修正**：
- `pickInputMode` 概率表：assistLevel 0=vertical 主导 / 1=choice4 主导 / 2=choice2 主导
- `evaluateGroup`：好→+1（减少辅助），差→-1（增加辅助）

### 12.5 常量变更

| 常量 | 旧值 | 新值 |
|---|---|---|
| `MIN_GROUPS_PER_DIMENSION` | 6 | 5 |
| `ASSIST_LEVELS` 顺序 | vertical > choice4 > choice2 > horizontal | choice2 > choice4 > vertical > horizontal |
| 新增 `PROFILE_RATIOS` | — | confidence / repair / mixed 三组比例 |
| 新增 `RESERVE_POOL_SIZE` | — | 3 |

### 12.6 不修改的部分

- 三维调节引擎（`evaluateGroup`）核心逻辑
- 题量公式（`getGroupSize` / `GROUP_SIZES`）
- `diversifyBatch` / 输入模式概率表
- 已有画像计算逻辑（`useAbilityProfile` / `useAbilityAnalysis`）
