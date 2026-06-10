# P0-2 诊断等级体系说明 + P2 完成记录（2026-06-10）

> 来源：浏览器测试报告（2026-06-10 subagent 全量实测）

---

## 一、P0-2 — 诊断等级体系设计说明

### 现状

`utils/algorithm/diagnostic.js` 用 5 级 `DIAG_LEVELS`（L1-L5）出 5 道诊断题，映射到 12 级 `DIFFICULTY_LEVELS`：

| 诊断级 | 数字范围 | carry/abdication | 映射到 12 级 |
|--------|----------|-------------------|-------------|
| L1 | ≤9 | 禁 | L1 起步 |
| L2 | ≤9 | 鼓励 | L2-L3 个位数巩固/进阶 |
| L3 | 11-89 | 禁 | L6 两位数入门 |
| L4 | 11-89 | 鼓励 | L8-L9 两位数进退位 |
| L5 | 混合 | 混合 | 不可控 |

**L10-L12（大数 50-999）永远不会被诊断到**，依赖自适应引擎后续"摸黑"探测。

### 设计决策

**P0-2 不修代码**，原因：
1. 诊断只有 5 道题，统计效力本来就低（n=1 时 accuracy ∈ {0, 1}），不宜加难度
2. 加到 L10-L12 会让用户首屏就面对 999+999 这种劝退题
3. L10-L12 由自适应引擎在用户熟练后自动推入，**这才是合理路径**

**未来如果想覆盖 L10-L12**，可以：
- 评估时把诊断扩到 10 题（含 L1-L4 + L6-L9 各 1 题，L5-L12 由自适应摸黑）
- 或新增"L10 挑战卷"作为可选诊断

### 用户文档（写到 README 或 ARCHITECTURE）

- **诊断定位**：5 题粗筛，定位基本盘（个位数 / 两位数 / 进退位），不测综合挑战
- **难度阶梯**：诊断起手 → 自适应摸 L10+ → 综合挑战

---

## 二、P2 修复完成记录

### P2-1 — reserve pool 删 ← 超过原计划

**原计划**：reserve pool 按 weakSeverity 加权。
**实际实施**：用户指出"预生成备用题池"走偏，应改为按 slot 类型即时生成单道题。

**改动**：
- `utils/algorithm/adaptiveBatch.js` — 删 reserve pool 生成，export `generateOneQuestion`，返回仅 questions
- `services/adaptiveEngine.js` — 删 `reservePool` 成员，import `generateOneQuestion`，`adjustNextQuestion` 两步调即时生成
- `composables/useAdaptiveSession.js` — 删 3 处 reservePool 解构/赋值
- `constants/practice.js` — 删 `RESERVE_POOL_SIZE` 常量

**影响**：消除了整个 reserve pool 状态线，减少 state 维护负担。

---

### P2-2 — diagnosticAnswers 字段隔离

**原计划**：审计 `session.answers` 生命周期，改为诊断完保留到 snapshot 再清。
**实际实施**：用户建议"5 道诊断题不入库"→ 加独立字段 `session.diagnosticAnswers` 从源头隔离。

**改动**：
- `stores/practice.js` — 加 `diagnosticAnswers: []` state 字段
- `stores/practice.js` — `correctCount` getter 按 phase 分支读不同字段
- `composables/useSubmitHandler.js` — `processAnswer` 按 `practiceStore.phase` 选 `diagnosticAnswers`/`answers` push
- `composables/useAdaptiveSession.js` — `completeAssessment` 改读 `diagnosticAnswers`
- `composables/useAdaptiveSession.js` — `stageName` computed 改读 `diagnosticAnswers.length`
- `composables/useAdaptiveSession.js` — `groupCorrectCount` computed 按 phase 分支
- `components/Practice.vue` — ProgressSteps `:answers="currentAnswers"`（按 phase 选）

**连带修复的 bug**：

| Bug | 根因 | 修复 |
|-----|------|------|
| `completeAssessment` 解构 bug | `const { questions: firstQuestions } = generateAdaptiveBatch(...)` 数组解构 → `firstQuestions` 恒为 `undefined` | 改为 `const firstQuestions = ...` |
| `stageName` 读错源 | P2-2 后诊断答案已迁 `diagnosticAnswers`，但 stageName 仍读 `session.answers.length` | 改读 `diagnosticAnswers.length` |
| `groupCorrectCount` 读错源 | 同上 | 按 phase 分支 |
| ProgressSteps 始终读 `answers` | 模板 `:answers="session.answers.slice(groupAnswerOffset)"` | 加 `currentAnswers` computed |

**影响**：根除 125% bug 数据流污染，诊断/练习数据完全隔离。

---

### P2-3 — watch(listPractices) 抽纯函数 + unit test

**实施**：
- 新建 `src/utils/listPracticesGuard.js` — `decideListPracticesTransition` 纯函数，抽离 watch 决策逻辑
- PATCH `Practice.vue` — watch 回调改委托给纯函数
- TEST：`test/utils/listPracticesGuard.spec.js` — 11 个测试覆盖 3 决策分支

**影响**：防御性代码可测、可维护。✅

---

### P2-4 — `__psm_debug.state()` 加 engine 扁平字段

**实施**：
- PATCH `Practice.vue` — `__psm_debug.state()` 加 4 个扁平字段：`engineReady`, `engineDifficultyIdx`, `engineStrongCount`, `engineWeakCount`

**影响**：agent 自动化测试不再需要 `.value?.profile?.` 链式试探。

---

### P2-5 — `pickWeakLevel` 顺序控制

**问题**：用户 level 4（索引 3）连对 3 题后，弱项 slot 选中 level 9（大数减法，索引 8）→ 出 888-97 横式，难度跳了 5 级。

**根因**：`pickWeakLevel()` 无上限，直接随机从所有弱项中选。

**修复**：`services/adaptiveEngine.js` — `pickWeakLevel()` 改为**始终返回最低难度弱项**（`weakLevelIndices[0]`，数组天然升序）。

**升级链路验证**：

| 环节 | 状态 | 说明 |
|------|------|------|
| 答弱项题 | ✅ | `useSubmitHandler.js` 写 `session` + `savePerQuestion()` 持久化 DB |
| 组完成后 | ✅ | `completeGroup()` → `evaluateGroup()` → `Profile.load()` |
| Profile.load() | ✅ | 读 DB 全表 → 按 level 分组算正确率 → ≥ 95% 移出 weakLevelIndices |
| 下一组 | ✅ | `generateQuestionPlan` → `pickWeakLevel()` → 自然选下一个最低弱项 |

**影响**：弱项从最低难度开始练，逐个攻克，逐步升级。

---

## 三、执行总结

| 优先级 | 任务 | 状态 | 实际工作 |
|--------|------|------|----------|
| 1 | P0-2 文档 | ✅ 已记录 | 设计说明 |
| 2 | P2-3 watch 抽函数 + unit test | ✅ 已修 | +11 测试 |
| 3 | P2-1 reserve pool 加权 | ✅ 超过原计划 | 删整个 reserve pool，改即时生成 |
| 4 | P2-2 session.answers 生命周期审计 | ✅ 超过原计划 | diagnosticAnswers 完全隔离 + 修 4 个连带 bug |
| 5 | P2-4 engine 扁平字段 | ✅ 已修 | 4 个 debug 扁平字段 |
| 6 | P2-5 pickWeakLevel 顺序 | ✅ 已修 | 从最低弱项开始练 |
| 7 | P2-6 completeAssessment 解构 bug | ✅ 连带修 | `firstQuestions` 改正确 |
| 8 | P2-7 诊断答案引用错源 | ✅ 连带修 | stageName/groupCorrectCount/模板全部修正 |

## 四、相关文件

- `src/services/adaptiveEngine.js` — pickWeakLevel 顺序控制
- `src/stores/practice.js` — diagnosticAnswers 字段
- `src/composables/useSubmitHandler.js` — 按 phase 分支 push
- `src/composables/useAdaptiveSession.js` — completeAssessment/stageName/groupCorrectCount 修正
- `src/components/Practice.vue` — currentAnswers computed + ProgressSteps 模板
- `src/utils/algorithm/adaptiveBatch.js` — 删 reserve pool
- `src/utils/listPracticesGuard.js` — 新建纯函数
