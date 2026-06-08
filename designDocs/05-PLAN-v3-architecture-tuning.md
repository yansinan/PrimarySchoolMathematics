# PLAN-v3: 架构调优

> 文档性质: 执行计划 (Action Plan) - 调优阶段
> 范围: v2 arch 重构之后的"扫尾 + 深化"工作
> 配套: [01-ARCHITECTURE.md](01-ARCHITECTURE.md) 是"是什么"，[04-PLAN-v2-architecture-refactor.md](04-PLAN-v2-architecture-refactor.md) 是 v2 阶段 1-7
> 状态: 📐 草案 (2026-06-07 起点)
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
| **E** | stores 瘦身 + 删 app.js | 🟠 | -70 | ⏸️ 依赖 D1（你跳过 D1 故暂停）；stats store 已 244→113 行（-54%）|
| **F** | components 目录归位 | 🟡 | -63 | ✅ 完成 (`4829643`) — home→generate + Test*→dev/ + 删 3 死文件 |
| **G** | 测试分区 | 🟢 | +1 | ⬜ 未开始 |
| **H** | 验证 + 文档 | 🟢 | 0 | ⬜ |

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
| C6 | 升 `utils/paperGenerator.js` → `services/paperGenerator.js` | 0 | 🟡（待 v3 后续 batch）|

**预计**: 净增 30 行，2 PR

---

## 4. D 组：composables 补齐

**目标**: 完成规划中的 3 个 composable

| 编号 | 任务 | 净行 | 风险 |
|------|------|------|------|
| D1 | 新增 `composables/usePrintPreview.js`，替代 `stores/app.js` 业务 | +20 | 🟡 |
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

| 编号 | 任务 | 减行 | 风险 |
|------|------|------|------|
| E1 | `stores/practice.js` 拆 `saveSessionToDB` → `usePracticeSaver`（已抽，待迁）| -47 | 🟠（核心路径）|
| E2 | `stores/stats.js` 拆 `load*` 方法 → `useStatsQuery`（D2 落地后）| -50 | 🟠 |
| E3 | 删 `stores/app.js`（D1 落地后）| -20 | 🟠（验证 Generate/Home/Print 路径改完）|

**预计**: 净减 117 行，2 PR

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

**目标**: 顶层 `tests/` + 集成测试

| 编号 | 任务 | 净行 | 风险 |
|------|------|------|------|
| G1 | 新增 `tests/stores/` `tests/composables/` `tests/services/` | +1 | 🟢 |
| G2 | 更新 `vitest.config.js` include 增 `tests/**/*.spec.js` | +1 | 🟢 |
| G3 | 新增 `tests/integration/fullSessionFlow.spec.js` 端到端 | +50 | 🟡 |

**预计**: 净增 52 行，1 PR

---

## 8. H 组：验证 + 文档

| 编号 | 任务 | 风险 |
|------|------|------|
| H1 | 跑全链路 build + test + 浏览器手测 | 🟢 |
| H2 | 更新 ARCHITECTURE.md / PROGRESS.md 标"全部 ✅" | 🟢 |

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

## 11. 元信息

- 文档关系: v2 plan = 7 阶段整改, v3 plan = 整改后调优
- 关联: [01-ARCHITECTURE.md](01-ARCHITECTURE.md) § 3 死代码目录是 A/B/C/D 输入
- 关联: [04-PLAN-v2-architecture-refactor.md](04-PLAN-v2-architecture-refactor.md) § 3 文件总表是路径迁移总账
