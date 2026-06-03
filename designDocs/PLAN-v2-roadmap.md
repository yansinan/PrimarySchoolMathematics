# 选题与练习系统 v2 迭代路线图

> 文档性质：行动说明书（Action Plan）
> 范围：基于 `DESIGN.md` 的产品迭代规划
> 维护人：项目组
> 最近更新：2026-06-03

---

## 优先级总览

| 优先级 | 项 | 模块 | 复杂度 | 状态 |
|---|---|---|---|---|
| **P0** | 4. 输入模式梯度：竖式作标准，重排梯度 | adaptiveEngine / displayStrategy | 中 | 待开始 |
| **P1** | 6/7/8. 错题强化练习体系 | adaptiveBatch / database | 中-高 | 待开始 |
| **P2** | 2. 用户画像/等级 UI 展示 | Practice.vue / components | 低 | 待开始 |
| **P3** | 1. 难度等级新增 L2.5 | diagnostic / adaptiveEngine | 中 | 待开始 |
| P4 | 3. FAST/SLOW/VERY_SLOW +2s | constants/practice.js | 低 | 待开始 |
| P4 | 9. targetMin/Max 配置校验 | Generate.vue / formValidation | 低 | 待开始 |
| **→** | 5. 填空位置变换（同等级最高难度） | adaptiveEngine.js | 中 | P0 完成后启动 |

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
- 如果实现了 #7 实时调题，则**取消**预先注入策略
- 改为：每答完一道，**20% 概率**插入一道同级别错题
- 错题从 `database.js.answers` 查最近 30 天同 operator + 相似 operandMin/Max

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
// 之前
const FAST = 4000   // → 6000
const SLOW = 10000  // → 12000
const VERY_SLOW = 16000  // → 18000
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

## → — P0 完成后：填空位置变换（同等级最高难度）

### 目标
在 `evaluateGroup` 中实现 `blankMode` 从 `'result'` → `'mixed'` 的真正升级：
- 简单：`X + Y = __`
- 混合填空：`X + __ = Z` 或 `__ + Y = Z`

### 出题实现
```js
function mixedBlank(equation, solution) {
  // equation: "5+3=8"
  const parts = equation.split('=')[0].split(/([+\-×÷])/)
  // 随机选一个位置（result 或 第一个操作数 或 第二个操作数）填空
  // 重算 solution
  // ...
}
```

### 验收标准
1. 满足 `consecutiveGood >= 3 && groupsAtThisLevel >= 2 && blankMode === 'result' && assistLevel === 0` 时升到 `mixed`
2. mixed 填空随机分布：~30% result / ~35% 第一个操作数 / ~35% 第二个操作数
3. solution 重新计算正确
4. UI 显示对应空格（不是只有 `__` 在末尾）

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
│  useAdaptiveSession.js (已有)                              │
│  useAdaptiveQuestionPicker.js (P1 新建) ← 统一调度           │
│  useAbilityProfile.js (P2 新建)                            │
└────────────────┬────────────────────────────────────────────┘
                 │ 调用
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Utils                                                      │
│  adaptiveEngine.js (改 DIFFICULTY_LEVELS / pickInputMode)   │
│  adaptiveBatch.js (P1: 调 picker 替代 listResult)          │
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
P0 (输入模式梯度)
 ├─→ P3 (难度等级 L2.5)   [依赖 P0 重排后的梯度]
 ├─→ →  (填空位置 mixed)   [P0 完成后启动，依赖 P0 重新校准 ASSIST_LEVELS]
 │
P1 (错题强化练习)         [与 P0 平行，可独立]
 │
P2 (用户画像 UI)           [可独立]
 │
P4 (阈值 + 校验)          [可独立]
```

### 建议 PR 拆分

| PR | 主题 | 模块 | 预计代码量 |
|---|---|---|---|
| #1 | P0: 输入模式梯度重排 | constants/practice + adaptiveEngine + displayStrategy + 组件 | ~200 行 |
| #2 | P3: 新增 L2.5 难度 | diagnostic + adaptiveEngine | ~50 行 |
| #3 | P2: AbilityCard 组件 | 新组件 + Practice 引用 | ~150 行 |
| #4 | P4-1: 阈值上调 | constants/practice | ~10 行 |
| #5 | P4-2: targetMin/Max 校验 | formDefaults + AutoGenerateFormulas | ~50 行 |
| #6 | P1-1: 错题查询 API | database 扩展 | ~50 行 |
| #7 | P1-2: 实时调题 composable | useAdaptiveQuestionPicker + Practice 改造 | ~300 行 |
| #8 | P1-3: 错题注入策略 | useAdaptiveQuestionPicker 扩展 | ~80 行 |
| #9 | → : 填空位置 mixed | diagnostic + adaptiveEngine + 组件 | ~150 行 |

总计：约 ~1000 行代码改动 + 6 个新文件

---

## 验收总览

完成所有 P0-P4 + → 后：

| 维度 | 之前 | 之后 |
|---|---|---|
| 输入模式梯度 | keypad → choice2 → choice4（语义模糊） | choice2 → choice4 → 竖式 → 横式（清晰） |
| 填空位置 | 固定 result | result（标准）→ mixed（同等级最高） |
| 错题利用 | 干扰项用规则数 | 干扰项优先从错题库取 |
| 题目调整 | 一组生成整组 | 实时调题 + 20% 错题注入 |
| 难度等级 | 12 级 | 13 级（新增 L2.5）|
| 速度阈值 | 4s/10s/16s | 6s/12s/18s |
| 用户信息 | stage badge | AbilityCard 完整画像 |
| 配置校验 | 无 | targetMin/Max 校验 |

---

## 风险与注意

1. **P0 重排会改变行为**：所有现有自适应会话需重新评估
2. **P1 数据库查询**需要 IndexedDB 索引优化
3. **P1 实时调题**会增加响应延迟（每题多 10-50ms 决策时间）
4. **P3 L2.5** 涉及 13 处出题器，需保证每道题 result ≤ 20
5. **P2 AbilityCard** 不应影响答题核心流程
6. **P4 阈值上调** 需调整 `evaluateGroup` 评估逻辑（注意各处一致性）
