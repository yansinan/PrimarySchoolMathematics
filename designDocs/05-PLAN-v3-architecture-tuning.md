# PLAN-v3: 架构调优

> 文档性质: 执行计划 (Action Plan) - 调优阶段
> 范围: v2 arch 重构之后的"扫尾 + 深化"工作
> 配套: [01-ARCHITECTURE.md](01-ARCHITECTURE.md) 是"是什么"，[04-PLAN-v2-architecture-refactor.md](04-PLAN-v2-architecture-refactor.md) 是 v2 阶段 1-7
> 状态: ✅ **2026-06-08 全部完成**（A/B/C/D/E/F/G/H 8 大组，仅 G3 集成测试留 v3.1）
> 维护: 项目组 / 所有 agent

---

## 0. TL;DR

v2 arch 重构（7 阶段）是结构性整改（分层、路径）。**v3 调优**是扫尾 + 深化工作：
- 完成 v2 阶段 1.3 / 2 / 3 / 4 / 5 / 6 / 7 剩余项
- A 组（死代码清理）的 B / C / D / E / F / G / H 后续批次
- 跨层调优 + 文档整理 + 路径最终统一

按 **6 大组** 渐进（每组独立可发布），总预计 **6-8 PR**，跨度 2-3 周。

| 组 | 内容 | 风险 | 净行数 | 状态（2026-06-07）|
|----|------|------|--------|---|
| **A** | 死代码清理 | 🟢 | -460 | ✅ **完成**（v2.3 A6+A7+A3+A1+A2+A4b）|
| **B** | 路径统一（PR 阶段 1.3）| 🟡 | -63 (实际: -43 + 6 删 + 0 桶影响) | ✅ **完成** (commit `210c9b5`, 2026-06-08) |
| **C** | services 升顶层 + 完善 | 🟡 | +30 | ✅ C1+C2+C3 (`3f9f777`)、C4 (`ded867e`) 完成；C6 paperGenerator 跳过（单函数不值当，v2.4+ 聚合）|
| **D** | composables 补齐 | 🟡 | +100 | ✅ D2 useStatsQuery 完整落地 (`399e3ba`+`4525335`)，D1/D3 跳过 |
| **E** | stores 瘦身 + 删 app.js | 🟠 | -70 | 🟢 E1 完成 (sessionPersistence 抽层)；E2 由 D2 提前完成；**E3 完成 (路径 4 sessionStorage + key in query)** |
| **F** | components 目录归位 | 🟡 | -63 | ✅ 完成 (`4829643`) — home→generate + Test*→dev/ + 删 3 死文件 |
| **G** | 测试分区 | 🟢 | +1 | ✅ **完成**（2026-06-08，G1+G2；G3 留 v3.1）|
| **H** | 验证 + 文档 | 🟢 | 0 | ✅ **2026-06-08 全部完成**（H1 build/test/手测 + H2 全文档同步）|

> **不在 v3 范围**:
> - bug 修复（totalDuration 等单独排期）
> - 大型 `Practice.vue` 拆分（放 v2.4）
> - 业务功能新做（P0-P3 等，留 [03-PLAN-v2-roadmap.md](03-PLAN-v2-roadmap.md) 跟踪）

---

## 1. A 组：死代码清理（✅ 已完成）

**2026-06-07 完成。** 5 个 PR / 子任务：
- A6 删 `views/Home.vue`（router 0 引用 + 与 Generate.vue 重复）
- A7 删 `apis/paper.js` + `utils/request.js` + `utils/download.js`（仅死 import 引用）
- A3 删 `Generate.vue:81-83` 死 import（`httpContentTypeExtensionsMappingEnum` / `download` / `generatePaper`）
- A1 删 `components/index.js`（仅 Layout.vue 用了桶 → 改直接路径）
- A2 删 `utils/enum.js` 的 `httpContentTypeExtensionsMappingEnum`
- A4b 升 `utils/abilityProfile.js` → `services/abilityProfile.js`（唯一 import 同步改）
- 附：`router/index.js` 调试注释 `// console.log(baseUrl)` 清掉

**累计净减 ~460 行**（commit `793056e` + `b69aac4`）

详见 [02-PROGRESS.md](02-PROGRESS.md) 的"v2.3 A 组死代码清理"段。

**用户决议 2026-06-07**: ~~A8 删 §3.4 调试残留 6 处 console.log~~ → **从计划中删除**（低优先级，dev 价值可接受，留 v2.4+）。

---

## 2. B 组：路径统一（PR 阶段 1.3）

**目标**: 删 8 个根目录 stub，简化 `utils/index.js` 到 4 行

```
src/utils/   (当前 9 个根 stub)
   ↓
src/utils/
├ algorithm/   (8 文件，真实实现)
├ form/        (1 文件)
├ store/       (2 文件)
├ time/        (2 文件)
└ index.js     (4 行, 仅 4 个子目录桶)
```

| 编号 | 任务 | 减行 | 风险 |
|------|------|------|------|
| B1 | 上游 5 个 default import 改 named，删 `utils/database.js` 根 stub | -11 | 🟡 |
| B2 | 改 4 处 `'@/utils/configStorage'` → `'@/utils/store/configStorage'`，删根 stub | -10 | 🟡 |
| B3 | 改 5 处 `'@/utils/EquationSolver/adaptiveEngine/adaptiveBatch/diagnostic/displayStrategy/formDefaults/timeFormat'` → 各自子目录，删 7 个根 stub | -70 | 🟡 |
| B4 | 简化 `utils/index.js` 从 28 行到 4 行 | -24 | 🟢 |
| B5 | 改 1 处 `useDisplayStrategy.js` 的 `'@/utils/displayStrategy'` → 子目录路径 | 0 | 🟢 |

**预计**: 净减 115 行，1-2 PR

---

## 3. C 组：services 升顶层 + 完善

**目标**: 完整顶层 services/ 目录

| 编号 | 任务 | 净行 | 风险 |
|------|------|------|------|
| C1 | 迁 `utils/services/analysis.js` (831 行) → `services/analysis.js` | +0 | 🟡（重命名 + 测试文件迁）|
| C2 | 迁 `utils/services/__tests__/analysis.spec.js` → `services/__tests__/` | +0 | 🟡 |
| C3 | 改 `services/index.js` 桥接：`export * from '@/utils/services/analysis'` → `export * from './analysis'` | -1 | 🟡 |
| C4 | 新增 `services/sessionMetrics.js`（备 totalDuration bug）| +30 | 🟢 |
| C5 | 升 `utils/abilityProfile.js` → `services/abilityProfile.js` | ✅ | **2026-06-07 A4b 已落地** |
| C6 | ~~升 `utils/paperGenerator.js` → `services/paperGenerator.js`~~ | ~~0~~ | ⏸️ **决议跳过**（单函数移 1 改 3 性价比低；v2.4+ 聚合 7 个文件到 `services/questionGen/`）|

**预计**: 净增 30 行，2 PR

---

## 4. D 组：composables 补齐

**目标**: 完成规划中的 3 个 composable

| 编号 | 任务 | 净行 | 风险 |
|------|------|------|------|
| D1 | ~~新增 `composables/usePrintPreview.js`，替代 `stores/app.js` 业务~~ | ~~+20~~ | ⛔ **跳过**（E3 改走路径 4 sessionStorage 替代整文件，无需 D1）|
| D2 | 新增 `composables/useStatsQuery.js`，抽 `stores/stats.js` 业务规则 | +50 | 🟡 |
| D3 | 新增 `composables/useChart.js`（chart.js 通用封装）| +30 | 🟢 |
| D4 | 补 `composables/index.js` 桶：3 个新 composable 入口 | +5 | 🟢 |

**预计**: 净增 105 行，2-3 PR

**依赖**:
- D1 完成后才能删 `stores/app.js`（E3）
- D2 完成后才能瘦 `stores/stats.js`（E2）

---

## 5. E 组：stores 瘦身（依赖 D1）

**目标**: `stores/practice.js` + `stores/stats.js` 减业务，删 `app.js`

| 编号 | 任务 | 减行 | 风险 | 状态 |
|------|------|------|------|------|
| E1 | `stores/practice.js` 拆 `saveSessionToDB` → `services/sessionPersistence.js` | -57 +109 (新, 含 B) = +52 | 🟠 | ✅ **2026-06-08 完成**（A+1 方案，B 方案同日合并） |
| E2 | `stores/stats.js` 拆 `load*` 方法 → `useStatsQuery`（D2 落地后） | -131 (244→113) | 🟠 | ✅ **由 D2 Phase 1+2 提前完成** |
| E3 | 删 `stores/app.js`（D1 落地后） | -20 | 🟠 | ✅ **2026-06-08 完成**（路径 4：sessionStorage + key in query） |

**预计**: 净减 8 行（E1 +89/E3 -20 综合 + 路径 4 模板代码 +5），2-3 PR

### E3 删 app.js 详情

**问题**：`stores/app.js`（20 行）— 跨页面用 `printPreviewPapers` state 传数据，违反 M 层"只放字段" + V→M 反向依赖。

**路径 4（推荐，已落地）**：
- `Generate.vue` 选中配置时：写 `sessionStorage.setItem('print_xxx', JSON.stringify(papers))` + `router.push({ path: '/print', query: { fileName, key } })`
- `Print.vue` 从 `route.query.key` 读 `sessionStorage` → 渲染
- `router/index.js` `beforeEach` 兜底清理（离开 /print 时 `removeItem`）
- `Print.vue` `onUnmounted` 双保险清理
- 删 `stores/app.js` 整文件 + 删 `useAppStore` 引用

**顺手修复 pre-existing 2 个 bug**：
- `Generate.vue#selectedConfiguration` 之前用 `appStore.navigateToPrint(router, ...)` 但 `appStore` 和 `router` 都没声明（import 了但 const 没写）— 因主流程（`generateFormulas` line 158）不调此函数，bug 一直潜伏
- 这次内联 navigateToPrint 时显式加 `const router = useRouter()`，移除 `appStore` 调用

**预计**: 净增 32 行（E1 业务从 M 抽 S，加 doc 注释 + payload 解构 + persistSingleAnswer），1-2 PR

### E1 抽层详情

**问题**：`stores/practice.js#saveSessionToDB`（52 行）— DB 写编排混在 M 层，违反 ARCHITECTURE.md §1.1"S 层 = IO 边界"原则。

**方案 A+1**（最小手术）：
- 新建 `services/sessionPersistence.js`（109 行含 B，2 个 export）
- S 层纯函数接 payload（`{ answers, configSnapshot, evaluations, studentId }`），不引 store
- `usePracticeSaver.js` 4 处调 store action / 内联 DB 操作 → 调 S 层：
  - `saveGroupCheckpoint` / `saveAdaptiveFinal` / `savePracticeFinal` 调 `persistSession`
  - `savePerQuestion` 调 `persistSingleAnswer`（B 方案）
- 删 `stores/practice.js#saveSessionToDB` 整 action（-57 行，含死 import `saveSession` / `sumResponseTimes`）
- 删 usePracticeSaver 内联 `db.answers.put` + `saveQuestion`（B 方案：-7 行 + import 清理）
- 调用方 `Practice.vue` 注释更新

**合并分析（用户决策 2026-06-08）**：B 方案不新建 `answerPersistence.js`，合并到 `sessionPersistence.js`，原因：
- `persistSession` 写整组 session+answers，`persistSingleAnswer` 写 1 条 answer+question — 强语义关联（"练习答题数据持久化"）
- 文件职责统一，避免"答 1 题"和"答 N 题"分两个文件碎片化
- 文件名保留（`sessionPersistence`）— "session" 在项目里等同"练习次"（看 `practiceSessions` 表名），且不改 services 桶引用

**方案 B 已完成**（不再"待重评"）：
- A 已做：`saveSessionToDB` 抽 S 层
- B 完成：把 `usePracticeSaver.savePerQuestion` 内的 `db.answers.put` + `saveQuestion` 编排也抽 S 层（建 `persistSingleAnswer`）
- 价值兑现：未来加批量重试 / 上传云端只改 S 层
- 风险已控：S 层函数保留 try/catch 失败日志 + 返回 void，C 层仍 fire-and-forget 调用

---

## 6. F 组：components 归位

**目标**: `home/` → `generate/` 改名 + `→dev/` 归位

| 编号 | 任务 | 净行 | 风险 |
|------|------|------|------|
| F1 | 移 `components/home/*` (7 文件) → `components/generate/*` | 0 | 🟡（改 7 个 import）|
| F2 | 移 `components/Generate.vue` → `components/generate/Generate.vue` | 0 | 🟡 |
| F3 | 移 `components/TestComponentView/HorizontalLayout` → `components/dev/` | 0 | 🟢（路径简单）|
| F4 | 删 `components/index.js` 顶层桶（已删除 ✅ 2026-06-07）| 0 | ✅ |

**预计**: 净增 0 行（纯移动），2-3 PR

---

## 7. G 组：测试分区

**目标**: 顶层 `test/`（单数）集中所有 spec

**2026-06-08 完成。** G1+G2 落地；G3 端到端集成测试留 v3.1。

| 编号 | 任务 | 净行 | 状态 |
|------|------|------|------|
| G1 | 3 个 spec 迁出 `__tests__/` → 顶层 `test/<源层>/` | +0 | ✅ |
| G2 | 更新 `vitest.config.js` include → `test/**/*.spec.js`；修 coverage 路径 | +1 | ✅ |
| G3 | 端到端 `test/integration/fullSessionFlow.spec.js` | +50 | ⏸️ 留 v3.1 |

**实测**:
- `npx vitest run` — 49/50 通过（1 预存失败: `analysis.spec.js:247` 与本改动无关）
- 浏览器 `/reset` 加载正常，`__psm_debug.state()` 完整返回
- 顺手修复: coverage 路径 `src/utils/services/analysis.js` → `src/services/analysis.js`（拼写错误）

**新结构**:
```
test/
├ services/analysis.spec.js
├ utils/score.spec.js
└ utils/database/migration.spec.js
```

**预计**: 净增 1 行（config），1 PR

---

## 8. H 组：验证 + 文档 → ✅ **2026-06-08 完成**

| 编号 | 任务 | 风险 | 状态 |
|------|------|------|------|
| H1 | 跑全链路 build + test + 浏览器手测 | 🟢 | ✅ |
| H2 | 更新 ARCHITECTURE.md / PROGRESS.md 标"全部 ✅" | 🟢 | ✅ |

**H1 实测**:
- `node ./node_modules/vitest/vitest.mjs run` — **49/50 通过**（1 预存失败: `analysis.spec.js:247` 与 v3 改动无关）
- `node ./node_modules/vite/bin/vite.js build` — 编译成功，1024 KB index.js + 449 KB Layout.js + 315 KB css
- 浏览器手测完整流程：评估 5 题 → `completeAssessment` → `saveAdaptiveFinal` → `persistSession` + 触发 `useStatsQuery.refreshAll`
  - sessions=2, answers=8, questions=16, snapshots=62
  - `__psm_debug.state()`: phase=practice, hasProfile=true, groupIdx=1, totalQuestions=4

**H2 同步**:
- `00-README.md` 头部进度改为 "v3 全部完成"
- `01-ARCHITECTURE.md` 树结构标 usePrintPreview 跳过 / app.js 删除 / "下一步" → "✅ 全部完成"
- `04-PLAN-v2-architecture-refactor.md` 7 阶段表全 ✅ / useStatsQuery/usePrintPreview 行更新 / "下一步" → "✅ 全部完成"
- `05-PLAN-v3-architecture-tuning.md`（本文件）状态行 + 8 大组总览 H ✅ + 本 H 段
- `02-PROGRESS.md` 头部 + v3 H 段（详见 PROGRESS）

**未在 v3 范围修改的文档**（与架构 v3 不同维度，不动）：
- `03-PLAN-v2-roadmap.md` — 业务路线图 P0-P5（v2.3.0 P0/P2/P5 ✅，P1/P3 待开始）
- `06-PLAN-v2-ability-analysis.md` — P2 阶段详细设计（v2.2.0 实施，DB schema v2 → v3 升级）
- `07-PLAN-v2-ui-roadmap.md` — 业务 UI 路线图（v2.2.0 → v3.0.0 业务版本，UI 强化/学习曲线/profile）

---

## 9. 不在 v3 范围

### 9.1 业务拆分（留 v2.4）

- `Practice.vue` 923 行仍偏大（→ v2.4）
- `composables/useAbilityAnalysis` 接入调用链

### 9.2 bug 修复（独立排期）

- `totalDuration` 显示异常
- `responseTime` 兜底逻辑统一
- 旧 `practiceSessions.totalDuration` 数据迁移

### 9.3 死代码清理 v2 路径

- 路径统一 stub 8 个已在 §2 (B 组)
- 死 export `utils/paperGenerator.js:64` `console.log` 已决议留 v2.4+
- `views/Print.vue:56,71,75,80` 4 处 `console.log` 同上
- `utils/database.js:215` 同上

---

## 10. 执行顺序与依赖

```
A (✅) → B → C → D → (D 完成后) E + F + G (平行) → H
                  ↑
              都依赖 D 落地
```

**总预计**: 6-8 PR, 2-3 周, 净减 ~120 行

---

## 12. 已知遗留 + 下阶段规划（v3.1 / v4 / v2.4）

> **v3 架构调优（§1-8）全部完成**。本节列出 v3 收尾（2026-06-08）后剩余工作，按"下一个产品节奏"分组到 3 个 phase。

### 12.1 状态总览

| Phase | 编号 | 任务 | 估行 | 风险 | 建议起点 | 关联文档 |
|-------|------|------|------|------|----------|----------|
| **v3.1 测试收尾** | G3 | 端到端集成测试 `test/integration/fullSessionFlow.spec.js` | +50 | 🟢 简单 | 立即可做（v3 收尾）| [05-PLAN-v3 § 7 G 组](05-PLAN-v3-architecture-tuning.md) |
| **v4.1 错题注入专项** | P1.6 | 干扰项错题库（`generateDistractors(correct, count, userId)`）| +30 | 🟢 | 用户指定下一目标 | [03-PLAN-v2-roadmap § P1](03-PLAN-v2-roadmap.md) |
| **v4.1 错题注入专项** | P1.8 | 20% 错题注入（`adjustNextQuestion` 步骤 A 前 20% 概率）| +25 | 🟡 | 与 P1.6 同步 | [03-PLAN-v2-roadmap § P1](03-PLAN-v2-roadmap.md) |
| **v4.2 难度等级专项** | P3 | L2.5 难度等级（`DIFFICULTY_LEVELS` 12→13）| +50 | 🟡 | 独立业务功能 | [03-PLAN-v2-roadmap § P3](03-PLAN-v2-roadmap.md) |
| **v2.4.1 chart 增强** | D3 | `useChart` composable（响应式 chart.js 包装）| +30 | 🟢 | chart 渲染增强 | [05-PLAN-v3 § 4 D 组](05-PLAN-v3-architecture-tuning.md) |
| **v2.4.2 出题领域聚合** | C6 | paperGenerator + psm + EquationSolver + equationParser + diagnostic + adaptiveBatch + formDefaults 7 文件聚合到 `services/questionGen/` | +10 净（路径迁移） | 🟡 | 出题领域服务化 | [05-PLAN-v3 § 3 C 组](05-PLAN-v3-architecture-tuning.md) |
| **v2.4.3 业务拆分** | — | `Practice.vue` 923 行偏大，业务可读性 | -100+ 净（拆分） | 🟠 | 可读性提升 | — |

### 12.2 推荐执行顺序与依赖

```
v3 收尾 (✅ 06c1a29)
    ↓
v3.1 (G3 端到端)               ← 立即可做，1-2 天
    ↓
v4.1 (P1.6 + P1.8 错题注入)    ← 错题注入专项，1 周
    ↓
v4.2 (P3 L2.5 难度等级)        ← 独立业务功能，2-3 天
    ↓ (可平行)
v2.4.1 (D3 useChart)           ← chart 增强，1 天
v2.4.2 (C6 出题聚合)           ← 7 文件迁移，1 周
v2.4.3 (Practice.vue 拆分)     ← 业务可读性，2-3 天
```

**关键依赖**：
- v4.1 (P1.6 + P1.8) **无前置依赖**，可立即开始
- v4.2 (P3) **无前置依赖**，与 v4.1 平行
- v2.4.1 (D3) **无前置依赖**，独立
- v2.4.2 (C6) **依赖 services/index.js 桶设计稳定**（✅ 已稳定）
- v2.4.3 (Practice.vue 拆分) **依赖 v4.1 + v4.2 业务稳定**（否则拆分后又重写）

### 12.3 各子任务详细规格

#### 12.3.1 v3.1 G3 端到端集成测试

| 维度 | 详情 |
|------|------|
| **目标** | 覆盖完整会话流：评估 → 答题 → stats 持久化 → 删除 |
| **范围** | 1 个文件 `test/integration/fullSessionFlow.spec.js` |
| **风险** | 🟢 简单（v3 G1+G2 已落 `test/` 顶层目录）|
| **净行** | +50 |
| **验收** | `npx vitest run` 通过；模拟用户完整 session 后 IndexedDB 数据正确 |
| **依赖** | 无 |
| **PR 拆分** | 单 PR |

#### 12.3.2 v4.1 P1.6 干扰项错题库

| 维度 | 详情 |
|------|------|
| **目标** | `generateDistractors(correct, count, userId)` 升级：先从 `getWrongAnswers` 取错题答案作候选，不足再 fallback 规则数 |
| **范围** | 1 处改 `adaptiveEngine.js:71` + 新增单测 |
| **风险** | 🟢 低（formula 独立，失败易回退） |
| **净行** | +30（含单测）|
| **验收** | 错题库有数据时，干扰项 60% 来自错题；无数据时 fallback 规则数 |
| **依赖** | `services/analysis.js#getWrongAnswers` 已存在（v2.2.0 P2 阶段落地）|
| **PR 拆分** | 与 P1.8 同 PR（错题注入专项）|

#### 12.3.3 v4.1 P1.8 20% 错题注入

| 维度 | 详情 |
|------|------|
| **目标** | `adjustNextQuestion` 步骤 A 前加 20% 概率分支 → 调 `prioritizeWrongAnswers` 替换下一题 |
| **范围** | 1 处改 `adaptiveEngine.js:738` + 新增单测 |
| **风险** | 🟡 中（影响每答一题，需确保不破坏 P1.7 已有 3 步骤）|
| **净行** | +25（含单测）|
| **验收** | 100 题答完统计：约 20 题是错题复用；不影响 P1.7 的换题/Mastery/调辅助 |
| **依赖** | `services/analysis.js#prioritizeWrongAnswers` 已存在；P1.6 可独立（priority 不同）|
| **PR 拆分** | 与 P1.6 同 PR（错题注入专项）|

#### 12.3.4 v4.2 P3 L2.5 难度等级

| 维度 | 详情 |
|------|------|
| **目标** | `DIFFICULTY_LEVELS` 12→13 级，在 L2 和 L3 之间新增 L2.5（针对大数加法过渡）|
| **范围** | 1 处改 `constants/practice.js` + 1 处改 `algorithm/EquationSolver.js`（13 处出题器）+ 1 处改 `adaptiveEngine.js`（难度切换判断）|
| **风险** | 🟡 中（13 处出题器需要保证每道题 `result ≤ 20`）|
| **净行** | +50（含诊断 + 测试用例）|
| **验收** | 12→13 级；L2.5 题目 result ≤ 20；自适应能切到 L2.5 级别 |
| **依赖** | 无（独立业务功能）|
| **PR 拆分** | 独立 PR（难度等级专项）|

#### 12.3.5 v2.4.1 D3 useChart composable

| 维度 | 详情 |
|------|------|
| **目标** | `services/chartBuilder.js` 是无状态 chart.js 封装；composable 加响应式 Vue 包装（自动 rebuild） |
| **范围** | 1 处新建 `composables/useChart.js` |
| **风险** | 🟢 低（chartBuilder 现有 110 行稳定，composable 薄包装）|
| **净行** | +30 |
| **验收** | StatsDrawer 改用 useChart 替代直接调 chartBuilder；chart 数据响应式更新 |
| **依赖** | chartBuilder.js 已稳定（v2.3.0）|
| **PR 拆分** | 独立 PR（chart 增强）|

#### 12.3.6 v2.4.2 C6 paperGenerator 聚合

| 维度 | 详情 |
|------|------|
| **目标** | 7 个"出题领域"文件聚合到 `services/questionGen/` 子目录：paperGenerator + psm + EquationSolver + equationParser + diagnostic + adaptiveBatch + formDefaults |
| **范围** | 7 个 git mv + 7+ import 站点改路径 +桶设计 |
| **风险** | 🟡 中（跨多层，import 站点多；algorithm/ 内 internal 路径需修）|
| **净行** | +10 净（路径迁移 + 桶；可能删除部分 internal 错误路径）|
| **验收** | services/questionGen/ 子目录落地，桶导出；与 v3 C1+C2+C3 的 services/ 顶层平级 |
| **依赖** | services/index.js 桶设计稳定 |
| **PR 拆分** | 独立 PR（出题领域服务化）|

#### 12.3.7 v2.4.3 Practice.vue 923 行业务拆分

| 维度 | 详情 |
|------|------|
| **目标** | 拆分 `Practice.vue` 923 行偏大文件，按"功能"分：自评弹窗逻辑 / 答题计时 / 调试接口 / 状态机 |
| **范围** | 1 个 923 行文件 → 3-4 个 composable 或子组件 |
| **风险** | 🟠 高（核心业务文件，改动易影响主流程）|
| **净行** | -100+ 净（拆出去后 Practice.vue 减到 ~500 行；新文件 +50）|
| **验收** | Practice.vue 业务可读性提升；端到端测试覆盖主流程不破 |
| **依赖** | v4.1 + v4.2 业务稳定（否则拆分后又重写）|
| **PR 拆分** | 独立 PR（业务可读性，**放最后做**）|

### 12.4 与 v3 整合关系

| 维度 | 关系 |
|------|------|
| **架构合规** | v3 落地后 6 层模型稳定；下阶段工作**不重新洗牌架构**，只做业务功能新增 + 内部可读性 |
| **C 桶设计** | `services/` 桶稳定；v2.4.2 引入 `services/questionGen/` 子桶 |
| **D composables** | 9 个 composables 稳定；v2.4.1 加 1 个 useChart（与 useDisplayStrategy 同级）|
| **E stores** | 退化为状态层（stats 113 行 + practice ~200 行）；v2.4.3 拆 Practice.vue 不动 store |
| **F components** | 8 个子目录稳定；下阶段无新增组件 |
| **G 测试** | test/ 顶层 + 4 个子目录；v3.1 G3 加 integration/ |
| **H 文档** | 6 份主文档全 ✅；下阶段每个 PR 同步 PROGRESS + 关联 PLAN |

### 12.5 节奏建议

| 阶段 | 估时 | 累计 | 备注 |
|------|------|------|------|
| v3 收尾 (2026-06-08) | — | 0 | ✅ 本次完成 |
| **v3.1 G3 集成测试** | 1-2 天 | 1-2 天 | 立即可做（独立、无前置）|
| **v4.1 P1.6 + P1.8 错题注入** | 1 周 | 1.5-2 周 | 用户指定下一目标 |
| **v4.2 P3 L2.5 难度** | 2-3 天 | 2.5-3 周 | 独立业务功能 |
| **v2.4.1 D3 useChart** | 1 天 | 3 周 | chart 增强（可与 v4.1 平行）|
| **v2.4.2 C6 出题聚合** | 1 周 | 4 周 | 7 文件迁移 |
| **v2.4.3 Practice.vue 拆分** | 2-3 天 | 4-5 周 | 业务可读性（放最后）|

### 12.6 元信息

- 编制时间：2026-06-08
- 编制者：v3 收尾（ui 分支合 06c1a29）
- 下次更新：每次子任务完成后
- 关联：[03-PLAN-v2-roadmap § v3 业务阶段收尾](03-PLAN-v2-roadmap.md) | [02-PROGRESS § 已知遗留](02-PROGRESS.md)

---

## 11. 元信息

- 文档关系: v2 plan = 7 阶段整改, v3 plan = 整改后调优
- 关联: [01-ARCHITECTURE.md](01-ARCHITECTURE.md) § 3 死代码目录是 A/B/C/D 输入
- 关联: [04-PLAN-v2-architecture-refactor.md](04-PLAN-v2-architecture-refactor.md) § 3 文件总表是路径迁移总账
