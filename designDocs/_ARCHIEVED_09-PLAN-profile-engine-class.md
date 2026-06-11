# Profile + Engine 类型化 + 升层方案

> 编制：2026-06-10
> 关联：.refactor-todo.md §I-2（僵尸 profile）、ARCHITECTURE.md §2.1（S 层目标树）
> 问题：`generateQuestionPlan`/`adjustNextQuestion` 同时接收 `engine` 和 `profile` 造成双源分叉

---

## 目标结构

```
┌─────────────────────────────────────┐
│  Profile (src/services/Profile.js)  │
│  └─ { difficultyIdx,                │
│        strongLevelIndices,          │
│        weakLevelIndices }           │
│    不可变，来自 loadProfile → DB     │
└──────────────┬──────────────────────┘
               │ engine.profile = instance
               ▼
┌─────────────────────────────────────┐
│  Engine (src/services/adaptiveEngine│
│          /Engine.js 或同级)         │
│  ├─ profile           → Profile     │
│  ├─ difficultyIdx     → own prop    │
│  │  初始化=profile.difficultyIdx    │
│  │  会话内可降级                    │
│  ├─ get strongLevelIndices()        │
│  │   = this.profile.strongLevelIndices│
│  ├─ get weakLevelIndices()          │
│  │   = this.profile.weakLevelIndices │
│  ├─ assistLevel, blankMode, ...     │
│  └─ reservePool, history, ...       │
└─────────────────────────────────────┘
```

**核心约束**：任何函数只收 `engine` 不收 `profile`。Profile 数据通过 engine getter 委派，双源合一。

---

## Step 1 — Profile + Engine 类型化（不改层、不改 import 路径）

**目标**：最小行为迁移——只加类 + 改调用方，不搬文件。

### 1.1 新建 Profile 类 (在 `services/abilityProfile.js` 中)

当前位置已属 S 层，直接加类。

```js
export class Profile {
  /** @param {{ difficultyIdx: number, strongLevelIndices: number[], weakLevelIndices: number[] }} data */
  constructor(data) {
    this.difficultyIdx = data.difficultyIdx ?? 0
    this.strongLevelIndices = data.strongLevelIndices ?? []
    this.weakLevelIndices = data.weakLevelIndices ?? []
  }
}
```

`loadProfile()` 返回 `new Profile({...})` 替代 plain object。

### 1.2 Engine 类化 (在 `utils/algorithm/adaptiveEngine.js` 中)

把 `createAdaptiveEngine` 工厂函数改为 Class，Profile 实例挂 `this.profile`，强弱项走 getter。

```js
export class Engine {
  /** @param {{ difficultyIdx, strongLevelIndices, weakLevelIndices, targetMin, targetMax }} profile */
  constructor({ difficultyIdx = 0, strongLevelIndices = [], weakLevelIndices = [],
                 targetMin = 10, targetMax = 30 } = {}) {
    this.profile = new Profile({ difficultyIdx, strongLevelIndices, weakLevelIndices })
    this.difficultyIdx = difficultyIdx          // own property，可会话内降级
    this.assistLevel = 0
    this.blankMode = 'result'
    this.groupSizeIdx = 0
    this.totalAnswered = 0
    this.groupIndex = 0
    this.groupsAtThisLevel = 0
    this.consecutiveGood = 0
    this.consecutiveBad = 0
    this.targetMin = targetMin
    this.targetMax = targetMax
    this.reservePool = []
    this.masteryCheck = { active: false, horizontalGood: 0, consecutiveVerticalGood: 0 }
    this.lastGroupResult = null
    this.lastEvaluation = null
    this.lastGroupSize = 0
    this.wrongAnswerPool = []
    this.history = []
  }

  get strongLevelIndices() { return this.profile.strongLevelIndices }
  get weakLevelIndices()   { return this.profile.weakLevelIndices }
}

// 向后兼容 —— 给现有 createAdaptiveEngine() 调用方过渡
export const createAdaptiveEngine = (opts) => new Engine(opts)
```

### 1.3 函数签名统一

| 函数 | 当前签名 | 改为 |
|------|---------|------|
| `generateQuestionPlan` | `(groupIndex, groupSize, engine, profile, isLastGroup)` | `(groupIndex, groupSize, engine, isLastGroup)` |
| `adjustNextQuestion` | `(engine, roundAnswers, nextIdx, listPractices, profile)` | `(engine, roundAnswers, nextIdx, listPractices)` |

`generateQuestionPlan` 内部 weakSeverity 计算从 engine 取：
```js
// 当前: const weakSeverity = 1 - (profile.avgScore || 0.5)       → 恒 0.5
// 改为: 弱项数占比
const weakSeverity = engine.weakLevelIndices.length
  / Math.max(1, engine.weakLevelIndices.length + engine.strongLevelIndices.length)
```

`adjustNextQuestion` 步骤 D（L760）从 engine 拿 label：
```js
// 当前: const histWeakLabels = profile.weakLevels || []          (string label)
// 改为: 
const histWeakLabels = engine.weakLevelIndices
  .map(idx => DIFFICULTY_LEVELS[idx]?.label)
  .filter(Boolean)
```

### 1.4 useAdaptiveSession.js 调用方更新

**3 处 loadProfile 后同步 store**（已由 I-1 完成）+ 1 处 generateQuestionPlan 调用：

| 位置 | 当前 | 改为 |
|------|------|------|
| L150 `startNewAdaptiveSession` | `generateQuestionPlan(1, size, engine, practiceStore.abilityProfile, false)` | 删第 4 个参数 |
| L206 `completeAssessment` | `generateQuestionPlan(1, size, engine, profile, false)` | 同 |
| L335 `completeGroup` | `generateQuestionPlan(..., engine, practiceStore.abilityProfile, isLast)` | 同 |
| L363 `afterAnswer` | `adjustNextQuestion(engine, ..., practiceStore.abilityProfile)` | 删最后参数 |

**组边界刷新**（completeGroup L266-274）：

```js
// 当前: engine 的 strong/weak/difficulty 逐个赋值
// 改为: 整个 profile 替换
const dbProfile = await loadProfile()
adaptiveEngine.value.profile = dbProfile               // 替换 profile
adaptiveEngine.value.difficultyIdx = dbProfile.difficultyIdx  // 重置降级
practiceStore.currentDifficultyIdx = dbProfile.difficultyIdx
```

### 1.5 影响范围

| 文件 | 改动 |
|------|------|
| `src/services/abilityProfile.js` | 加 Profile 类；`loadProfile` 返回 `new Profile` |
| `src/utils/algorithm/adaptiveEngine.js` | 加 Engine 类；`createAdaptiveEngine` 保持兼容；改 2 个函数签名 |
| `src/composables/useAdaptiveSession.js` | 4 处删 profile 参数；组边界换 `engine.profile = dbProfile` |
| `src/utils/algorithm/adaptiveBatch.js` | 无改动（`diversifyBatch`/`pickStrongLevel` 等纯函数不变） |

**无改动**：`stores/practice.js`、`composables/useAbilityProfile.js`、`components/`、`test/`

### 1.6 验证

```
npx vitest run   → 106 PASS  (单元覆盖 engine/logic)
npx vite build   → 构建成功
浏览器实测       → 诊断→自适应→多组→刷新页面，0 错误
```

---

## Step 2 — Engine 升层到 services（可选，视 Step 1 结果评估）

**目标**：按 ARCHITECTURE.md §2.1 目标树，Engine 类从 `utils/algorithm/` 升到 `src/services/`，纯函数留下。

### 2.1 新建 `src/services/adaptiveEngine.js`

迁入：`Engine` class、`generateQuestionPlan`、`adjustNextQuestion`、`evaluateGroup`、`getGroupSize`、`computeDifficultyIdx`

### 2.2 `utils/algorithm/adaptiveEngine.js` 变为桥接桶

原有文件仅保留：
- 纯函数：`generateDistractors`、`buildReviewQuestion`、`getDifficultyLabel`
- re-export: `export { Engine, generateQuestionPlan, ... } from '@/services/adaptiveEngine'`

### 2.3 消费者 import 逐步迁移到 `@/services/adaptiveEngine`

| 当前 | 改为 |
|------|------|
| `composables/useAdaptiveSession.js` → `@/utils/algorithm/adaptiveEngine` | → `@/services/adaptiveEngine` |
| `components/dev/DebugPanel.vue` → `@/utils/algorithm/adaptiveEngine` (仅 DIFFICULTY_LEVELS) | → `@/constants/difficulty` |

`services/abilityProfile.js` 的 `computeDifficultyIdx` 和 `groupAnswersByLevel` import 仍可从 `@/utils/algorithm/adaptiveEngine` 走（桥接兼容），也可在 Step 2 后走 `@/utils/algorithm/matchLevel`。

### 2.4 barrel 补充

`utils/algorithm/index.js` 补 `export * from './matchLevel'`，确保 `groupAnswersByLevel` 有直接导出路径。

### 2.5 验证

同上 —— 测试 + 构建 + 浏览器实测。

---

## 后续（Step 2 之后）

- 删 `generatePracticeConfig` 死代码（diagnostic.js 中已注释的 ~80 行）
- `practiceStore.abilityProfile` 降级为仅 `phase` 判空，最终删除 state 字段
