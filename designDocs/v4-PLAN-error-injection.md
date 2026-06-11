# v4 业务阶段：错误注入专项 + 难度等级扩展

> **性质**：业务规划 (Business Plan) — v3 架构调优后的业务功能新增
> **状态**：✅ v4.0a 完成 | ✅ v4.0b 完成 | ✅ v4.0c 完成 | ✅ P1.6 完成（wrongAnswerPool 接 generateDistractors） | ✅ P1.8 完成（adjustNextQuestion 接 wrongAnswerPool 错题注入） | ❌ v4.2 未开始
> **核心设计原则**：增强学生信心是本系统的最优先考虑。在此基础上，练习掌握以往错题是系统第二目标。
> **配套**：
> - [ARCHITECTURE.md](../ARCHITECTURE.md) — 架构宪法（实施时遵守）
> - [IMPLEMENTATION_HISTORY.md](../IMPLEMENTATION_HISTORY.md) — v2.3+v3 实施过程
> - [README.md](../README.md) — 文档索引
> **历史规划**（已归档）：
> - [_ARCHIEVED_03-PLAN-v2-roadmap.md § P1 § P3](../_ARCHIEVED_03-PLAN-v2-roadmap.md) — 原始设计
> - [_ARCHIEVED_05-PLAN-v3-architecture-tuning.md § 12.3.2-4](../_ARCHIEVED_05-PLAN-v3-architecture-tuning.md) — v3 收尾前粗略规划

---

## 0. TL;DR

v3 架构调优落地后，3 项未完成业务功能重组到本计划：

|| Phase | 内容 | 净行 | 风险 | 状态 |
||-------|------|------|------|------|
|| **v4.0a** | S 层数据库代理 `services/database.js`（薄封装 re-export）| +18 | 🟢 独立 | ✅ 完成 |
|| **v4.0b** | S 层错题模块 `services/wrongAnswerService.js` | +80 | 🟢 独立 | ✅ 完成 |
|| **v4.0c** | 循环解耦 + Getter-First 重构（databaseInit 叶子模块、Answer/Question 域类、删除死代理）| -168 | 🟡 | ✅ 完成 |
|| **v4.1** | P1.6 ✅ + P1.8 ✅ 错题注入（基于 v4.0b）| +56 | 🟡 | ✅ 完成 |
|| **v4.2** | P3 L2.5 难度等级 | +57 | 🟡 | ❌ 未开始 |

**预计总时间**：2-3 周（含 S 层前置 2-3 天）

---

## 1. 总体路线与依赖

v4 分 4 个 phase，每个都**渐进可达**：

```
v4.0a: S 层数据库代理 services/database.js（10 分钟 ⚡ 已删 — 直接 databaseInit）
  │
  ↓
v4.0b: S 层错题模块 services/wrongAnswerService.js
  └── 引 services/databaseInit（不引 U 层）
  │
  ↓
v4.0c: 循环解耦 + Getter-First 重构（2026-06-10 完成）
  └── databaseInit 纯叶子模块、Answer/Question 域类继承骨架
  └── getter 即真理（stored isCorrect/score 不再写入）
  └── 删 utils/store/database.js + services/database.js 死代理
       │
       ↓
v4.1 错题注入（完成）
  ├── P1.6 干扰项错题库（取错题答案当干扰项）
  └── P1.8 3连对触发复习题（方案 B 代替 20%）
```

---

## 2. v4.0a 前置：S 层数据库代理（✅ 已建 → 🗑 已删）

> **历史备注**：v4.0a 的 `services/database.js` 薄封装 re-export 在 v4.0c 循环解耦阶段被直接删除。所有调用方改引 `@/services/databaseInit`，不再需要代理层。

### 2.1 目标

在 `services/database.js` 建一层**薄封装**——直接把 `utils/store/database.js` 所有 export 原样 re-export。

**零逻辑，10 分钟完成。**

```js
// src/services/database.js (18 行)
export {
  default as DB,
  saveSession, getSessions, getSessionDetail, deleteSession,
  saveAbilitySnapshot, getLatestAbilitySnapshot,
  getAggregatedStats, exportAllData, importAllData,
  getAllAnswers, clearAllData, saveQuestion, getQuestion,
  getQuestionByEquation,
} from '@/utils/store/database'
```

### 2.2 用途

| 用途 | 描述 |
|------|------|
| **v4.0b 用** | `wrongAnswerService` 引 `@/services/database` 不直接引 U 层——将来 U 层 database 迁移时错题模块**不用改** |
| **v4.0c 迁移用** | 逐步改 9 处 `@/utils/store/database` → `@/services/database`（有错题先改，其他后改）|
| **v4.0d 最终态** | 全部迁移完成 → `services/database.js` 从 re-export 改为原生实现 → 删 `utils/store/database.js` |

### 2.3 迁移清单（9 处 import 站点）

| 文件 | import | 迁移优先级 |
|------|--------|-----------|
| `utils/services/analysis.js:13` | `import db from '@/utils/store/database'` | 🟢 v4.0c |
| `composables/usePracticeSaver.js:26` | `import db, { saveQuestion } from '@/utils/store/database'` | 🟢 v4.0c |
| `stores/practice.js:3` | `import { saveSession } from '@/utils/store/database'` | 🟡 v4.0c（小心）|
| `stores/stats.js:3-12` | `import { getSessions, ... } from '@/utils/store/database'` | 🟡 v4.0c（小心）|
| `services/abilityProfile.js:27` | `import { saveAbilitySnapshot } from '@/utils/store/database'` | 🟢 v4.0c |
| `services/PracticeSession.js` | `import { saveSession } from '@/services/PracticeSession'` | 🟢 v4.0c |
| `views/ResetData.vue:32` | `import { clearAllData } from '@/utils/store/database'` | 🟢 v4.0c |
| `utils/services/__tests__/analysis.spec.js:10` | `import db from '@/utils/store/database'` | 🟢 v4.0c |
| `services/__tests__/analysis.spec.js:10` | `import db from '@/utils/store/database'` | 🟢 v4.0c |

**优先级策略**：`wrongAnswerService` 直接建在 v4.0a 上；`services/xxx` 层文件优先迁移（`sessionPersistence`、`abilityProfile`）；`stores/*` 和 `composables/*` 可后迁（安全第一）。

---

## 3. v4.0b 前置：S 层错题模块（用户推荐）

### 3.1 目标

独立于 `analysis.js` 和引擎逻辑的**错题专用服务**。从 U 层 database 查询 → 组织成错题服务：增删改查 + 灵活条件过滤。

### 2.2 与已有代码的关系

| 已有 | 与 v4.0 关系 |
|------|-------------|
| `services/analysis.js#getWrongAnswers({operator, operandMin, operandMax, limit, levelIdx})` | ✅ 已有查询逻辑，**不拆** analysis.js。v4.0 **新建** `wrongAnswerService.js`，内部可复用 `getWrongAnswers` 或自己做 Dexie 查询 |
| `services/analysis.js#prioritizeWrongAnswers({limit})` | ✅ 已有优先级排序，v4.0 可**引用重用** |
| `utils/store/database.js#getAllAnswers(studentId)` | ✅ 数据库入口，v4.0 可直引 |
| `adaptiveEngine.js` / `useAdaptiveSession.js` | ❌ **不依赖**（v4.0 不考虑 engine） |
| `stores/practice.js` / `stores/stats.js` | ❌ **不依赖**（v4.0 不考虑 store） |

**关键约束**：`wrongAnswerService` 是 S 层（services/），只引 U 层（database/score），**不引 C 层 / M 层 / V 层**。纯函数 + DB 查询。

### 2.3 API 设计

```js
// src/services/wrongAnswerService.js

/**
 * 错题查询（支持多维过滤器）
 * @param {Object} opts
 * @param {string} opts.studentId   — 默认 'default'
 * @param {string} opts.operator    — 如 '+' '-' '×' '÷'
 * @param {number} opts.levelIdx    — 难度等级索引（如 3 = 混合进退位）
 * @param {number} opts.minOperand   — operandMin ≥ 该值（相似数值范围）
 * @param {number} opts.maxOperand   — operandMax ≤ 该值
 * @param {number} opts.limit       — 返回条数（默认 20）
 * @param {number} opts.days        — 近 N 天（默认 30）
 * @param {boolean} opts.includeFixed — 是否包含已被"修正"的错题（默认否）
 * @returns {Promise<Array<{ equation, solution, operandMin, operandMax, operator, responseTime, ... }>>}
 */
export async function getWrongAnswers(opts = {})

/**
 * 获取错题数量统计（用于 dashboard / 摸底）
 * @param {Object} opts — 同 getWrongAnswers 的过滤条件
 * @returns {Promise<number>}
 */
export async function countWrongAnswers(opts = {})

/**
 * 按 equation 精确查找错题
 * @param {string} equation — 如 "25+18=__"
 * @returns {Promise<Object|null>}
 */
export async function getWrongAnswerByEquation(equation)

/**
 * 标记某条错题为"已修正"（学生后来答对 -> 不再是错题）
 * @param {number} sessionId      — 所属 session
 * @param {number} questionIndex   — 题号
 * @param {boolean} corrected      — true=修正, false=取消修正
 * @returns {Promise<boolean>}
 */
export async function markWrongAnswerCorrected(sessionId, questionIndex, corrected = true)

/**
 * 删除单个错题（从 answers 表移除该条记录）
 * @param {number} sessionId
 * @param {number} questionIndex
 * @returns {Promise<boolean>}
 */
export async function removeWrongAnswer(sessionId, questionIndex)

/**
 * 清空某用户全部错题（恢复式重置）
 * @param {string} studentId
 * @returns {Promise<number>} 删除条数
 */
export async function clearWrongAnswers(studentId = 'default')
```

### 2.4 与 `analysis.js#getWrongAnswers` 的关系

| 维度 | `analysis.js` 已有 | `wrongAnswerService` 新增 |
|------|--------------------|--------------------------|
| 职责 | A 组获取错题栈 | **错题 CRUD + 多维过滤 + 修正管理** |
| 过滤维度 | 有限（operator, operandMin/Max, limit）| 全 ＋ levelIdx, days, includeFixed |
| 写入能力 | 无 | ✅ mark/remove/clear |
| 依赖 engine | ❌ 不依赖 | ✅ 同理不依赖 |
| 可替换 | `analysis.js` 内部函数 | **可作为 engine 上游数据源** |

**决定**：不拆 `analysis.js`，新建 `wrongAnswerService.js`。v4.1 的 `adaptiveEngine` 调用方 **改调 `wrongAnswerService`** → `analysis.js` 的 `getWrongAnswers` 未来可标记 deprecated。

### 2.5 实施细节

```js
// 内部实现（直接调 Dexie answers 表，不走 analysis.js）

async function queryWrongAnswers(studentId, filters) {
  const db = await getDB()
  const collection = db.answers
    .where({ studentId, isCorrect: false })

  // 时间范围过滤
  if (filters.days) {
    const cutoff = new Date(Date.now() - filters.days * 864e5).toISOString()
    collection = collection.filter(a => a.createdAt >= cutoff)
  }

  // operator / levelIdx 过滤
  if (filters.operator)
    collection = collection.filter(a => a.operator === filters.operator)
  if (filters.levelIdx != null)
    collection = collection.filter(a => a.levelIdx === filters.levelIdx)

  // operandMin/Max 范围
  if (filters.minOperand != null)
    collection = collection.filter(a => (a.operandMin || 0) >= filters.minOperand)
  if (filters.maxOperand != null)
    collection = collection.filter(a => (a.operandMax || 0) <= filters.maxOperand)

  return collection.limit(filters.limit || 20).toArray()
}
```

| 函数 | 实现难度 | 净行 |
|------|----------|------|
| `getWrongAnswers` | 🟢 D 层查询，已有 `getAllAnswers` 做范本 | 25 行 |
| `countWrongAnswers` | 🟢 D 层 `.count()` | 10 行 |
| `getWrongAnswerByEquation` | 🟢 D 层已有 `getQuestionByEquation` 范本 | 8 行 |
| `markWrongAnswerCorrected` | 🟡 需同时改 `answers` 表（加 `correctedAt` 字段 * 标记）| 15 行 |
| `removeWrongAnswer` | 🟢 D 层 `db.answers.delete()` | 8 行 |
| `clearWrongAnswers` | 🟢 D 层 `where(studentId).filter(isCorrect=false).delete()` | 8 行 |
| **新增单测** | 🟢 `__tests__/wrongAnswerService.spec.js` 6 case | 30 行 |
| **总** | **2-3 天** | **~80 行** |

### 2.6 数据模型说明

错题数据源自 `db.answers` 表（现有字段）：
```js
{
  id, sessionId, questionId,
  studentId: 'default',              // 已有
  isCorrect: false,                  // == false → 错题
  operator: '+',                     // 已有
  operandMin: 25, operandMax: 18,    // 已有
  levelIdx: 3,                       // 已有
  equation: "25+18=__",              // 已有
  solution: 43,                      // 已有
  responseTime: 1500,                // 已有
  createdAt: '2026-06-08T...',       // 已有
  // 新增（可选 — by markWrongAnswerCorrected）
  correctedAt: null | ISODateString, // 修正时间戳
}
```

**不需要动 IndexedDB schema** —— `db.answers` 表已有所有字段。`correctedAt` 字段可通过标记逻辑加（首次标记时 upsert），不要求 schema 升级。

### 2.7 验收

- ✅ `getWrongAnswers({ operator: '+', limit: 5 })` 返回 ≤ 5 条加法错题
- ✅ `getWrongAnswers({ levelIdx: 3, days: 7 })` 返回近 7 天 level 3 错题
- ✅ `countWrongAnswers()` 返回总错误数
- ✅ `markWrongAnswerCorrected(sid, qIdx, true)` → 再次 `getWrongAnswers` 不包含该题
- ✅ `removeWrongAnswer(sid, qIdx)` → 再次查询确认删除
- ✅ 所有函数**不引 C/M/V 层**（只引 utils/store 和 services）

### 2.8 风险

| 风险 | 描述 | 缓解 |
|------|------|------|
| **indexedDB 查询性能** | `answers` 表条目可能上万 | `studentId` + `isCorrect` 复合查询，走 Dexie 索引 |
| **correctedAt 字段不存在于旧数据** | 旧 answers 无此字段 | 新代码 `a.correctedAt == null` 即未修正，兼容旧数据 |
| **与 analysis.js 重复** | `getWrongAnswers` 有两份 | v4.1 引擎改调 `wrongAnswerService`，analysis.js 函数标记 deprecated |

---

## 3. v4.1 错题注入（P1.6 + P1.8 合并）

### 3.1 背景

P1.7 实时调题已实装（`adjustNextQuestion` 3 步骤: 换题/Mastery/调辅助），但不接错题库。

**P1.6 + P1.8 是补"错题维度"**：
- P1.6：`generateDistractors` 优先从错题库取候选替代规则数字
- P1.8：`adjustNextQuestion` 步骤 A 前加 20% 概率插入错题

基于 v4.0 **`wrongAnswerService.getWrongAnswers`**。

### 3.2 P1.6 干扰项错题库

#### 3.2.1 现状

```js
// adaptiveEngine.js:71
function generateDistractors(correct, count) {
  // 规则数字 ±1, ±2, ±5, ±10... 不足 random 补
}
```

#### 3.2.2 目标

```js
async function generateDistractors(correct, count, { operator, operandMin, operandMax } = {}) {
  // 1. 从 wrongAnswerService 取错题答案作候选
  const wrongAnswers = await getWrongAnswers({
    operator,
    minOperand: operandMin,
    maxOperand: operandMax,
    limit: count * 2,
  })
  const candidates = wrongAnswers.map(a => a.solution)  // 取错题答案
  // 2. 优先取
  // 3. 不足回退规则数字
  // 4. 仍不足 random 补
}
```

#### 3.2.3 实施

| 维度 | 详情 |
|------|------|
| **改 `adaptiveEngine.js`** | `generateDistractors` 改 `async`，加 `opts` 参数，调 `getWrongAnswers` |
| **改调用方** | `adaptiveEngine.js:269` 改 `await generateDistractors(solution, count - 1, {...})` |
| **async 链** | 调用方需 `await`（向上逐层 await 到 `generateAdaptiveBatch`）|
| **单测** | 5 case：空错题库 / 错题重复 / 不足 fallback 规则数 / 不足 random / operator 过滤 |

#### 3.2.4 净行

- `adaptiveEngine.js + __tests__`: +30 行（含单测）
- **小计：+30 行**

### 3.3 P1.8 20% 错题注入

#### 3.3.1 现状

```js
// adaptiveEngine.js:738
function adjustNextQuestion(engine, roundAnswers, nextIdx, listPractices, profile) {
  // ── A. 换题 ──
  // ...
}
```

#### 3.3.2 目标

```js
async function adjustNextQuestion(engine, roundAnswers, nextIdx, listPractices, profile) {
  // ── A': 20% 错题注入（新增，在最前） ──
  if (Math.random() < WRONG_ANSWER_INJECTION_RATE) {
    const wrong = await pickRandomWrongAnswer(engine.difficultyIdx, engine.currentOperator)
    if (wrong) {
      listPractices[nextIdx] = wrong    // 替换下一道
      return                            // 跳过 A/B/C
    }
  }
  // ── A. 换题（原有） ──
  ...
}

async function pickRandomWrongAnswer(levelIdx, operator) {
  const wrongs = await getWrongAnswers({ levelIdx, operator, limit: 20 })
  if (!wrongs.length) return null
  return wrongs[Math.floor(Math.random() * wrongs.length)]
}
```

#### 3.3.3 实施

| 维度 | 详情 |
|------|------|
| **改 `adaptiveEngine.js`** | `adjustNextQuestion` 改 `async`，加步骤 A' + `pickRandomWrongAnswer` |
| **常量** | `WRONG_ANSWER_INJECTION_RATE = 0.2` → `constants/practice.js` |
| **改调用方** | `useAdaptiveSession.js:333` `adjustNextQuestion(...)` → `await adjustNextQuestion(...)` |
| **单测** | 4 case：错题库空 / 不匹配 level / 命中后不调 A / 20% 命中概率 |

#### 3.3.4 与 P1.7 现有步骤的关系

| 步骤 | 现有 | P1.8 后 | ⚠️ |
|------|------|---------|-----|
| A': 20% 错题注入 | ❌ | ✅ **最前** | 命中后**直接 return**，跳过 A/B/C |
| A. 换题 | ✅ | 原样 | 不变 |
| B. Mastery Check | ✅ | 原样 | 不变 |
| C. 调辅助 | ✅ | 原样 | 不变 |

#### 3.3.5 净行

- `adaptiveEngine.js + __tests__`: +25 行（步骤 + helper + 单测）
- `constants/practice.js`: +1 行
- `useAdaptiveSession.js`: +0（只需加 `await`，已有 async 链）
- **小计：+26 行**

### 3.4 P1.6 + P1.8 总净行：+56 行（含 ~30 行单测）

---

## 4. v4.1 PR 拆分

| PR | 内容 | 估行 | 依赖 |
|----|------|------|------|
|| **PR-1** | v4.1.1 P1.6 干扰项错题库（改 `generateDistractors` + 调 `wrongAnswerService.getWrongAnswers`）| ✅ 完成 | v4.0 已完成 |
|| **PR-2** | v4.1.2 P1.8 20% 错题注入（改 `adjustNextQuestion` + `pickRandomWrongAnswer`）| ✅ 完成（改用方案 B：3 连对触发复习题）| PR-1 基础 |

PR-1 和 PR-2 可同 PR 也可以独立。**推荐同 PR** —— 同一天做，P1.6 是"干扰项"，P1.8 是"注入策略"，两个功能配套。

---

## 5. v4.2 P3 L2.5 难度等级（同之前版本，不变）

[看原始设计 → _ARCHIEVED_03-PLAN-v2-roadmap.md § P3]

---

## 6. 提交策略与节奏

| 步骤 | 内容 | 估时 | 负责人 |
|------|------|------|--------|
| **v4.0** | `services/wrongAnswerService.js` 完整 CRUD + 单测 | 2-3 天 | 用户指定前置 |
| **v4.1 PR-1** | P1.6 干扰项错题库 | 1-2 天 | 基于 v4.0 |
| **v4.1 PR-2** | P1.8 20% 错题注入 | 1-2 天 | 基于 PR-1 |
| **v4.2** | P3 L2.5 难度等级 | 2-3 天 | v4.1 稳定后 |
| **文档同步** | PROGRESS + README 更新 | 0.5 天 | 每个 phase 后 |

**总估时**：2-3 周

---

## 7. 验证门禁

每个 PR 必过：
- ✅ `npx vitest run` ≥ 49/50（不引入 regression）
- ✅ `npx vite build` ≥ 736 modules
- ✅ 浏览器实测：评估 → 答完 N 题 → 检查错题库注入效果
- ✅ v4.0 独立验证：`wrongAnswerService.getWrongAnswers` 5 条查询全部正确
- ✅ v4.1 验证：100 题答完统计约 20 题错题复用（误差 ±5%）

---

## 8. 元信息

- 编制时间：2026-06-08（用户指定前置策略后重写）
- 维护：项目组
- 下次更新：每个子任务完成后
- 关联：
  - [ARCHITECTURE.md](../ARCHITECTURE.md) — 架构宪法
  - [IMPLEMENTATION_HISTORY.md](../IMPLEMENTATION_HISTORY.md) — v2.3+v3 实施过程
  - [_ARCHIEVED_03-PLAN-v2-roadmap.md § P1 § P3](../_ARCHIEVED_03-PLAN-v2-roadmap.md) — 历史规划
  - [_ARCHIEVED_05-PLAN-v3-architecture-tuning.md § 12.3.2-4](../_ARCHIEVED_05-PLAN-v3-architecture-tuning.md) — v3 收尾前粗略规划
