# Profile + Engine 方法封装计划

> 关联：IMPLEMENTATION_HISTORY.md §9、09-PLAN-profile-engine-class.md
> 问题：Engine 相关操作分散在 9 个独立函数中（`getGroupSize(engine)`、`evaluateGroup(engine, ...)` 等），调用方需分别 import。Profile 目前也只有字段没有方法。

---

## 封装原则

- 以 `engine`/`profile` 为第一参数的函数 → 实例方法
- 纯计算不依赖实例状态的 → static 方法或保留为纯函数
- 调用方 import 从 N 个命名导出 → `Engine` / `Profile` 类 + 少数纯函数

---

## Profile 类（S 层）

```
services/abilityProfile.js
```

| 当前 | 改为 | 理由 |
|------|------|------|
| `loadProfile(studentId)` 独立函数 | `Profile.load(studentId)` 静态工厂 | 语义上是 Profile 的创建入口 |
| `new Profile(data)` 构造 | 不变 | 已有 |

Profile 是纯数据类，没有实例方法。静态工厂 `Profile.load()` 封装了 `Answer.getAllByStudent` → `groupAnswersByLevel` → `computeDifficultyIdx` 的全流程。

## Engine 类（U 层 → 后续升 S 层）

```
utils/algorithm/adaptiveEngine.js
```

### 转为实例方法（7 个）

| 函数签名 | 改为实例方法 | 调用方变更 |
|---------|-------------|-----------|
| `getDifficultyLabel(engine)` | `engine.difficultyLabel` getter | `getDifficultyLabel(engine)` → `engine.difficultyLabel` |
| `getDifficultyConfig(engine)` | `engine.getDifficultyConfig()` | `getDifficultyConfig(engine)` → `engine.getDifficultyConfig()` |
| `getGroupSize(engine)` | `engine.getGroupSize()` | `getGroupSize(engine)` → `engine.getGroupSize()` |
| `diversifyBatch(baseEquations, engine)` | `engine.diversifyBatch(baseEquations)` | 参数交换：engine 变为 `this` |
| `evaluateGroup(engine, groupAnswers)` | `engine.evaluateGroup(groupAnswers)` | 删第一个参数 |
| `generateQuestionPlan(groupIndex, groupSize, engine, isLastGroup)` | `engine.generateQuestionPlan(groupIndex, groupSize, isLastGroup)` | 删 `engine` 参数 |
| `adjustNextQuestion(engine, roundAnswers, nextIdx, listPractices)` | `engine.adjustNextQuestion(roundAnswers, nextIdx, listPractices)` | 删 `engine` 参数 |

### 保留为纯函数/静态工具（4 个）

| 函数 | 理由 |
|------|------|
| `computeDifficultyIdx(answers)` | 纯函数，不依赖 Engine 实例。无 `engine` 参数 |
| `pickStrongLevel(indices, currentDifficulty)` | 静态选举算法，不依赖 Engine 状态 |
| `pickWeakLevel(indices, currentDifficulty)` | 同上 |
| `generateDistractors(correct, count, wrongPool, equation)` | 纯函数，无 Engine 关联 |

`buildReviewQuestion(wa)` 是内部工具函数，不 export，保持局部。

### 向后兼容

原导出名保留为 delegate 函数：

```js
// 文件末尾（被 adaptiveBatch.js 和旧代码引用）
export const getGroupSize = (engine, ...args) => engine.getGroupSize(...args)
export const evaluateGroup = (engine, ...args) => engine.evaluateGroup(...args)
// ...其他同理
```

这样 `adaptiveBatch.js`（内部相对导入）和 `useAdaptiveSession.js`（需逐步迁移）不会 break。

---

## 调用方迁移路线

### Phase 1（随封装同步改）

`useAdaptiveSession.js` — 所有 engine 调用统一走实例方法：

```js
// 当前
import { createAdaptiveEngine, getGroupSize, evaluateGroup, getDifficultyLabel, generateQuestionPlan, adjustNextQuestion } from '@/utils/algorithm/adaptiveEngine'
const engine = createAdaptiveEngine(opts)
const size = getGroupSize(engine)
const label = getDifficultyLabel(engine)
const plan = generateQuestionPlan(idx, size, engine, last)
engine2 = evaluateGroup(engine, groupAnswers)
adjustNextQuestion(engine, ...)

// 改为
import { Engine } from '@/utils/algorithm/adaptiveEngine'
const engine = new Engine(opts)
const size = engine.getGroupSize()
const label = engine.difficultyLabel
const plan = engine.generateQuestionPlan(idx, size, last)
engine2 = engine.evaluateGroup(groupAnswers)
engine.adjustNextQuestion(...)
```

### Phase 2（可选，随 Step 2 升层改）

`adaptiveBatch.js` — `diversifyBatch` 改方法调用；`pickStrongLevel`/`pickWeakLevel` 保持不变（纯函数）。

### Phase 3（可选）

`services/abilityProfile.js` — `Profile.load()` 替代 `loadProfile()` 独立函数。
`useAdaptiveSession.js` 中的 `import { loadProfile }` → `import { Profile }` → `Profile.load()`。

---

## 改动量预估

| 文件 | 变更 | 行数 |
|------|------|------|
| `utils/algorithm/adaptiveEngine.js` | 7 个函数搬进 Engine 类 + 向后兼容桥 | ~20 行净增 |
| `composables/useAdaptiveSession.js` | 约 9 处调用改方法风格 | ~15 行 |
| `utils/algorithm/adaptiveBatch.js` | `diversifyBatch` 一处改方法调用 | ~2 行 |
| `services/abilityProfile.js` | `Profile.load()` 静态工厂 | ~3 行 |
| 其他 | DebugPanel.vue、stores/practice.js 等无影响 | 0 |

**风险点**：
1. `evaluateGroup` 返回 `{ engine, nextGroupSize, done, history }` — 方法返回 `this` 或新对象需要保持原结构
2. `diversifyBatch` 参数顺序从 `(baseEquations, engine)` 变为 `engine.diversifyBatch(baseEquations)` — 注意 `adaptiveBatch.js` 中的相对 import
3. 向后兼容 delegate 函数可能让新旧调用并存一段时间，注意别产生 name conflict
