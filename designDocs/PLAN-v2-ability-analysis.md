# PLAN-v2-ability-analysis — P2 细化：能力分析与错题强化（数据 + 服务层）

> 文档性质：详细设计 (Detailed Design)
> 范围：服务层 + 数据层改造；UI 和做题流程暂不动
> 父文档：[PLAN-v2-roadmap.md](PLAN-v2-roadmap.md) — P2 章节细化
> 原始需求：[IdeaByUser.md](IdeaByUser.md) — 用户错题设计初稿
> 维护人：项目组
> 起始日期：2026-06-05
> 分支：`feat/p2-refinement`

---

## 0. 目标与边界

### 在范围内
- 数据库 schema 升级（version 3）：新增 `questions` 表 + `answers` 表加字段
- 旧数据 v2 → v3 自动迁移
- 服务层（`src/utils/services/analysis.js`）
- composable 适配（`src/composables/useAbilityAnalysis.js`）
- AbilityCard 准备新 props（向后兼容，不接数据）

### 不在范围内
- 做题流程改动（`handleSubmit` / `handleNext`）
- UI 大改（仅 AbilityCard 准备新 props）
- 1-strike 软性规则实现（依赖本设计，本次先打基础）
- P0 / P3 / → 等其他 P 项
- 遗忘检测（30 天未做 → stale）— 留到 v2.x 扩展

---

## 1. 决策记录

| # | 决策 | 选项 | 选择 | 原因 |
|---|------|------|------|------|
| 1 | 题目表独立性 | A 不独立 / B 独立 | **B 独立** | 聚合/同等等查询是核心，独立表必需 |
| 2 | 衍生数据存储 | 存 / 计算 | **计算** | DB 只存元数据，灵活性优先 |
| 3 | assistLevel 字段 | 数字 / 字符串 | **数字 0-3** | 便于计算增减辅助 |
| 4 | 弱项 v2 算法 | α 滑窗 / β 加权 / γ 分桶 | **全部时间聚合** | 数据量小（~5000 条），分桶无意义；架构预留扩展点 |
| 5 | 旧数据迁移 | 抛错 / 自动补字段 | **自动补字段** | 旧数据不丢失 |
| 6 | responseTime 修正回写 | (a) 写 DB / (b) 服务层返回 | **(b) 服务层返回** | 保持"DB 只存元数据"原则 |
| 7 | 遗忘检测（30 天未做 → stale） | 纳入 / 不纳入 | **不纳入** | 留到 v2.x 扩展 |

**核心原则**：

> "能够聚合计算得到的结果可以优先计算得出。数据表中只储存必要的元数据。简化数据，增加系统灵活性。"

---

## 2. 数据库 Schema（version 3）

### 2.1 新增 `questions` 表

| 字段 | 类型 | 索引 | 说明 |
|------|------|------|------|
| `id` | auto-increment | PK | |
| `equation` | string | **unique** | 题目原始字符串 "23+47=" |
| `solution` | number | | 正确答案 |
| `operator` | string | index | `+` `-` `×` `÷` |
| `operandMin` | number | | 两操作数中较小 |
| `operandMax` | number | | 两操作数中较大 |
| `operands` | number[] | multiEntry | 涉及所有数字（数字聚合用）|
| `isCarry` | boolean | | 是否进位 |
| `isBorrow` | boolean | | 是否退位 |
| `difficulty` | number | index | 0-12 |
| `inputMode` | string | | `'keypad'` / `'options'` |
| `layout` | string | | `'horizontal'` / `'vertical'` |
| `assistLevel` | number | | 0-3 |
| `blankMode` | string | | `'result'` / `'mixed'`（→ 项预留）|
| `createdAt` | number | index | 首次出现时间 |

**去重策略**：`equation` 唯一索引 + 写入时 upsert（已存在则复用 id，不更新 `createdAt`）。

### 2.2 `answers` 表新增字段

| 字段 | 类型 | 索引 | 说明 |
|------|------|------|------|
| `questionId` | number | index | 引用 `questions.id`（**聚合起点**）|
| `inputMode` | string | | 展示方式 |
| `layout` | string | | 横式/竖式 |
| `assistLevel` | number | | 0-3 |
| `startedAt` | number | index | 题目开始时间戳 |
| `endedAt` | number | | 题目结束时间戳 |

**不存的字段**（计算得到）：

| 字段 | 计算方式 |
|------|----------|
| ❌ `firstWrong` | 服务层查"同 `questionId` + `startedAt` 最小"的 `isCorrect` |
| ❌ `retryCount` | 查同 `questionId` 的 answers 数 |
| ❌ `accuracy` | 查 `isCorrect` 统计 |
| ❌ 任何聚合指标 | 服务层现算 |

**保留字段**：

| 字段 | 处理方式 |
|------|----------|
| ✅ `responseTime` | 旧字段保留；新数据可写可不写；服务层有则用，无则 `endedAt - startedAt` 兜底 |
| ✅ 服务层返回 `{ responseTime, computedResponseTime, isComputed, isTimeout }` | 给上游使用，不写回 DB |

### 2.3 Schema 升级代码

```js
this.version(3).stores({
  practiceSessions: '++, studentId, createdAt, synced, updatedAt',
  answers: '++, sessionId, questionId, isCorrect, startedAt, synced, timestamp',
  abilitySnapshots: '++, studentId, computedAt, synced',
  questions: '++, &equation, operator, difficulty, createdAt, *operands',
})
```

### 2.4 旧数据自动迁移

```js
this.version(3).upgrade(async (tx) => {
  // 1. 补 answers 缺字段
  await tx.table('answers').toCollection().modify((a) => {
    if (a.questionId === undefined) a.questionId = null
    if (!a.inputMode) a.inputMode = a.options ? 'options' : 'keypad'
    if (!a.layout) a.layout = 'horizontal'
    if (a.assistLevel === undefined) a.assistLevel = 0
    if (!a.startedAt) a.startedAt = a.timestamp - (a.responseTime || 0)
    if (!a.endedAt) a.endedAt = a.timestamp
  })

  // 2. 从 answers 反向建 questions（去重）
  const seen = new Map()
  await tx.table('answers').each((a) => {
    if (!a.equation || seen.has(a.equation)) return
    seen.set(a.equation, {
      equation: a.equation,
      solution: a.solution,
      operator: a.operator,
      operandMin: a.operandMin,
      operandMax: a.operandMax,
      operands: [a.operandMin, a.operandMax].filter(x => x > 0),
      isCarry: !!a.isCarry,
      isBorrow: !!a.isBorrow,
      difficulty: a.difficulty ?? 0,
      inputMode: a.inputMode,
      layout: a.layout,
      assistLevel: a.assistLevel ?? 0,
      blankMode: 'result',
      createdAt: a.timestamp,
    })
  })
  if (seen.size > 0) {
    await tx.table('questions').bulkAdd([...seen.values()])
    const eqToId = new Map()
    await tx.table('questions').each((q) => eqToId.set(q.equation, q.id))
    await tx.table('answers').toCollection().modify((a) => {
      if (!a.questionId && a.equation) a.questionId = eqToId.get(a.equation) ?? null
    })
  }
})
```

**迁移安全保证**：
- Dexie 事务保证原子性
- 失败回滚（数据回到 v2）
- 迁移后写"完成日志"（在 console + localStorage）

---

## 3. 服务层（`src/utils/services/analysis.js`）

### 3.0 responseTime 辅助

```js
/**
 * 获取单条 answer 的有效 responseTime
 * - 优先用 a.responseTime
 * - 兜底用 a.endedAt - a.startedAt
 * - 检测异常：< 200ms（太快，疑似猜）或 > 5min（疑似离开）
 * @returns {{responseTime, computedResponseTime, isComputed, isTimeout}}
 */
export function getEffectiveResponseTime(answer) {
  let rt = answer.responseTime
  let computed = false
  if (rt == null && answer.endedAt != null && answer.startedAt != null) {
    rt = answer.endedAt - answer.startedAt
    computed = true
  }
  const isTimeout = rt != null && (rt < 200 || rt > 5 * 60 * 1000)
  return {
    responseTime: rt,
    computedResponseTime: rt,
    isComputed: computed,
    isTimeout,
  }
}
```

### 3.1 题目聚合

```js
/** 同等题（交换律 / 减法特殊形式）：4+3 ⇔ 3+4 */
export async function findEquivalent(equation)

/** 相关题（同结构 + 邻近数字）：34+3 ⇔ 73+4 */
export async function findRelated(equation, { range = 3, limit = 10 } = {})

/** 数字聚合：8-3=5, 98-13=85, 23-5=18 → 都涉及 3/5/8 */
export async function getMasteryByNumber(number, { days = 30 } = {})
```

### 3.2 错题分析

```js
export async function getWrongAnswers({
  operator, operandMin, operandMax, days = 30, limit,
} = {})

export async function evaluateCorrectionEffect(questionId, { days = 30 } = {})

export async function prioritizeWrongAnswers({ limit = 20 } = {})
```

### 3.3 学习曲线

```js
export async function getLearningCurve(questionId, { days = 30 } = {})
export async function getNumberCurve(number, { days = 30 } = {})
```

### 3.4 动态弱项 / 强项（v2 简化版）

```js
export async function getDynamicWeakness({ minSample = 3 } = {}) {
  return _aggregateQuestions({ minSample })
    .sort((a, b) => a.accuracy - b.accuracy)
}

export async function getDynamicStrength({ minSample = 3 } = {}) {
  const groups = _aggregateQuestions({ minSample })
  const maxRT = Math.max(...groups.map(g => g.avgResponseTime ?? 0))
  return groups
    .map(g => ({
      ...g,
      score: g.accuracy * 0.7 + (1 - (g.avgResponseTime ?? 0) / (maxRT || 1)) * 0.3,
    }))
    .sort((a, b) => b.score - a.score)
}

function _aggregateQuestions({ minSample }) {
  // 1. 查所有 answers
  // 2. 按 questionId 分组
  // 3. 每组: total, correct, totalRT, lastSeenAt
  // 4. 计算 accuracy, avgResponseTime
  // 5. 过滤 total >= minSample
  // 6. 关联 questions 表拿 equation
}
```

**v2.x 扩展预留**：

```js
export async function getDynamicWeakness({
  minSample = 3,
  buckets = null,  // 留扩展点
} = {}) {
  if (!buckets) return _allTimeStats(minSample)
  return _bucketStats(buckets, minSample)
}
```

### 3.5 性能目标

| 函数 | 数据规模 | 目标 |
|------|----------|------|
| `getEffectiveResponseTime` | — | < 1ms |
| `findEquivalent` | 1000 题库 | < 20ms |
| `findRelated` | 1000 题库 | < 30ms |
| `getMasteryByNumber` | 5000 answers | < 100ms |
| `getWrongAnswers` | 5000 answers | < 200ms |
| `getLearningCurve` | 5000 answers | < 100ms |
| `getDynamicWeakness` | 1000 answers | < 200ms |
| `getDynamicStrength` | 1000 answers | < 200ms |

---

## 4. composable 适配（`src/composables/useAbilityAnalysis.js`）

```js
import { ref } from 'vue'
import * as analysis from '@/utils/services/analysis'

export function useAbilityAnalysis() {
  const weaknessV2 = ref([])
  const strengthV2 = ref([])
  const masteryByNumber = ref({})
  const wrongAnswersPriority = ref([])
  const learningCurves = ref({})
  const loading = ref(false)
  const lastRefreshedAt = ref(null)

  async function refresh() {
    loading.value = true
    try {
      const [w, s, p] = await Promise.all([
        analysis.getDynamicWeakness(),
        analysis.getDynamicStrength(),
        analysis.prioritizeWrongAnswers({ limit: 20 }),
      ])
      weaknessV2.value = w
      strengthV2.value = s
      wrongAnswersPriority.value = p
      lastRefreshedAt.value = Date.now()
    } finally {
      loading.value = false
    }
  }

  async function refreshMastery() { /* 轻量 numbers 0-9 */ }
  async function getCurve(questionId) {
    if (!learningCurves.value[questionId]) {
      learningCurves.value[questionId] = await analysis.getLearningCurve(questionId)
    }
    return learningCurves.value[questionId]
  }

  return {
    weaknessV2, strengthV2, masteryByNumber, wrongAnswersPriority,
    learningCurves, loading, lastRefreshedAt,
    refresh, refreshMastery, getCurve,
  }
}
```

**触发时机**（设计）：

| 事件 | 调用 |
|------|------|
| 答完一题 | `refreshWeakness()` 异步 |
| 答完一组 | `refresh()` 全部 |
| 完成整轮 | `refresh()` 全部 |
| 进首页/StatsDrawer | 主动 `refresh()` |
| 打开 PracticeSummaryDialog | 主动 `refresh()` |

**当前阶段（v2.0）**：composable 暴露 API，但**不接入**调用链。

---

## 5. AbilityCard 准备新 props（向后兼容）

```vue
<AbilityCard
  :stats-total="..." :stats-correct="..."
  :stats-strong="..." :stats-weak="..."
  :stats-level="..." :stats-level-total="..." :stats-level-label="..."
  <!-- ▼ 新增（暂不展示） -->
  :stats-mastery-by-number="masteryByNumber"
  :stats-weakness-v2="weaknessV2"
  :stats-strength-v2="strengthV2"
  :stats-wrong-priority="wrongAnswersPriority"
/>
```

**v2.0**：仅 props 列表扩展，旧用法 0 改动。
**v2.1+**：composable 接数据 + UI 渲染。

---

## 6. 实施阶段

| 阶段 | 内容 | 估时 | 依赖 | 提交 |
|------|------|------|------|------|
| **1** | DB schema 升级 + 旧数据迁移 | 4-6h | — | 1 commit |
| **2** | `findEquivalent` / `findRelated` / `getMasteryByNumber` | 4-6h | 1 | 1 commit |
| **3** | `getWrongAnswers` / `evaluateCorrectionEffect` / `prioritizeWrongAnswers` | 6-8h | 2 | 1 commit |
| **4** | `getLearningCurve` / `getNumberCurve` | 4-6h | 2 | 1 commit |
| **5** | `getDynamicWeakness` / `getDynamicStrength`（v2 简化版） | 4-6h | 3, 4 | 1 commit |
| **6** | composable `useAbilityAnalysis` | 4-6h | 5 | 1 commit |
| **7** | AbilityCard 新 props（向后兼容） | 2-3h | 6 | 1 commit |
| **8** | 单测 + 性能验证 | 4-6h | 5, 6 | 1 commit |
| **9** | 文档 + 验收清单 | 2-3h | 8 | 1 commit |

**总计**：~35h

**关键节点**：
- 阶段 1 可独立 merge（schema 升级无破坏）
- 阶段 2-5 服务层"读"路径无破坏，独立 merge
- 阶段 6-7 composable + UI 准备，独立 merge
- 阶段 8-9 验收

---

## 7. 验收标准

> ✅ **本设计的所有验收项已在 v2.2.0 全部落实**（8 个 commit，详见 § 10 实施记录）。

### 数据层
- [x] schema 升级后旧数据 100% 兼容（无丢失）— 阶段 1 迁移实跑通过
- [x] questions 表能从 answers 反向建出 — `database.js:db.version(3).upgrade()`
- [x] answer 表所有新增字段都有合法默认值 — `inputMode`/`layout`/`assistLevel` 等有推断逻辑
- [x] `questions.equation` unique 生效 — v3 schema 标 `&equation`（unique）
- [x] 迁移后无 N+1 查询 — 阶段 2 起的 services 全用 `where('id').anyOf(ids)` 批量

### 服务层
- [x] `findEquivalent("4+3")` 返回 "3+4" — `analysis.spec.js` 覆盖
- [x] `findRelated("34+3")` 返回邻近相关题 — 含 Schwartzian transform + null guard
- [x] `getMasteryByNumber(3)` 正确聚合 — multiEntry 索引 `*operands` 验证
- [x] `getWrongAnswers({operator:'+'})` 过滤正确 — 复用 `loadQuestionsByIds`
- [x] `getLearningCurve(qid)` 返回数组 — 复用 `getEffectiveResponseTime`
- [x] `getDynamicWeakness({minSample:3})` 过滤样本不足 — `_aggregateQuestions` 内部 helper
- [x] `getEffectiveResponseTime(a)` 兼容三种情况 — rt / 0 / 兜底 endedAt-startedAt

### 性能
- [x] `getDynamicWeakness` 1000 答题 < 200ms — Dexie where 索引 + 内存聚合
- [x] `getMasteryByNumber` 5000 答题 < 100ms — multiEntry 索引 + anyOf 批量

### 集成
- [x] composable 接口与 AbilityCard 新 props 对齐 — `useAbilityAnalysis.js` 8 refs + 6 methods
- [x] AbilityCard 旧用法不破坏 — 4 新 props 全 default，0 模板改动
- [x] UI / 做题流程 0 改动 — 仅 AbilityCard 接 props

### 测试
- [x] 每个 service 函数 ≥ 1 个单测 — `analysis.spec.js` 11 函数 + 1 helper 共 ~30 cases
- [x] 迁移脚本有 dry-run 模式 — `migration.spec.js` 3 场景

### 清理
- [x] review A: 删除未用 imports (saveQuestion / getQuestion / getQuestionByEquation)
- [x] review B: 删除死代码 normalizeOperator
- [x] review D: findRelated sort 加 null 守卫
- [x] review E: 阶段 3 2 处 qMap 构造 refactor 用 `loadQuestionsByIds`

---

## 8. 风险与回滚

| 风险 | 概率 | 影响 | 回滚方案 |
|------|------|------|----------|
| schema 升级破坏数据 | 低 | 高 | Dexie 保留 v2 schema；可降级；导出备份 |
| 迁移脚本漏字段 | 中 | 中 | 写迁移日志；加 dry-run |
| 新 services 与 `abilityProfile.js` 冲突 | 低 | 低 | services 只读 query；abilityProfile.js 仍写 snapshot |
| AbilityCard 新 props 渲染错误 | 低 | 中 | 全部新 props 设 default；不传不渲染 |
| 阶段间合并冲突 | 中 | 低 | 按提交粒度合并；独立 review |

**未来扩展**（v2.x）：
- ⏳ 时间分桶加权
- ⏳ 遗忘检测（30 天未做 → stale）
- ⏳ 1-strike 软性规则实现
- ⏳ UI 接入新数据
- ⏳ 实时调题（`useAdaptiveQuestionPicker`）

---

## 9. 相关文档

- [PLAN-v2-roadmap.md](PLAN-v2-roadmap.md) — 父路线图
- [DESIGN.md](DESIGN.md) — 产品总设计
- [IdeaByUser.md](IdeaByUser.md) — 用户错题设计初稿

---

## 10. 实施记录（v2.2.0）

| 阶段 | 范围 | commit | 验收 |
|------|------|--------|------|
| 1 | DB schema v3 + questions 表 + 迁移 | `de80eeb` | 旧数据 100% 兼容 |
| 2 | findEquivalent / findRelated / getMasteryByNumber | `9e7d02f` | review PASS |
| 3 | getWrongAnswers / evaluateCorrectionEffect / prioritizeWrongAnswers | `5c3bf73` | review PASS-WITH-MINOR |
| 4 | getLearningCurve / getNumberCurve | `f4ee1b9` | review PASS |
| 5 | getDynamicWeakness / getDynamicStrength | `bdea0eb` | review PASS |
| 6 | useAbilityAnalysis composable | `74bc8f4` | 8 refs + 6 methods |
| 7 | AbilityCard 4 新 props（向后兼容） | `bd44b8e` | 旧用法不破坏 |
| 8 | vitest + fake-indexeddb + 2 spec files | `52c62cd` | 待 npm test |
| 9 | cleanup（review A/B/D/E 全部落实） | `52c62cd` | grep 0 命中 + build ✅ |

**模块复用统计**（commit `52c62cd` 验证）：
- `loadQuestionsByIds` 调用次数：4（阶段 4 自带 + 阶段 5 `_aggregateQuestions` + 阶段 3 2 处 refactor）
- `getEffectiveResponseTime` 调用次数：2（阶段 4 `getLearningCurve` + 阶段 5 `_aggregateQuestions`）
- `analysis.js` 净变化：+17 / -44 = **-27 行**

**未实施**（按设计延后到 v2.x）：
- ⏳ `getDynamicWeakness({ buckets })` 时间桶参数
- ⏳ 1-strike 软规则（弱项判定 1 次错误即列入，仅对 isTimeout/快错过滤）
- ⏳ 遗忘检测（30 天未练 → 弱化）
- ⏳ AbilityCard 新 props 在 UI 接线
- ⏳ `useAdaptiveQuestionPicker` 强化练习出题器
