# PrimarySchoolMathematics 进度记录

| 跟踪版本、阶段、UI 可见性。最后更新：2026-06-07（v2.3 A 组 A4b 落地 + v3 调优计划草拟）

---

## v2.3 A 组死代码清理（2026-06-07）

### 范围
A 组 6 个子任务：A6/A7/A3/A1/A2 + A4b（升 service）全部落地。**A5 与 A4 合并、A8 不执行**。

分支：`chore/cleanup-a-group`（2 个 commits）

### Commits
| hash | 范围 |
|------|------|
| `793056e` | A6 删 `views/Home.vue` + A7 删 `apis/paper.js` + `utils/request.js` + `utils/download.js` + A3 清 Generate.vue 死 import + A1 删 `components/index.js` + A2 删 `utils/enum.js` 死导出 + router 调试注释 |
| `b69aac4` | A4b 升 `utils/abilityProfile.js` → `services/abilityProfile.js` (R 79%) |

### 净增 / 减
**9 files changed, 3 insertions(+), 459 deletions(-)**

| 类型 | 详情 |
|------|------|
| 整文件删 | `views/Home.vue` (147) + `apis/paper.js` (59) + `utils/request.js` (61) + `utils/download.js` (168) + `components/index.js` (10) |
| 死导出删 | `utils/enum.js` 的 `httpContentTypeExtensionsMappingEnum` |
| 死 import 删 | `Generate.vue:81-83` 共 3 行（`httpContentTypeExtensionsMappingEnum` / `download` / `generatePaper`）|
| 调试残留清 | `router/index.js:33` `// console.log(baseUrl)` |
| 依赖补 | `views/Layout.vue` 由 `@/components` 桶 → `@/components/Generate.vue` + `@/components/Practice.vue` 直接路径 |

### UI 可见性：**🟡 0 视觉变化**（删的全是非活跃引用）

### 验证状态
- ✅ `npx vitest run` 44/45 通过（1 预存失败无关）
- ✅ 浏览器实测：评估→自适应→答题正常（已用 `__psm_debug` 验证 groupIdx 推进）
- ✅ 0 JS error，0 死 import 残留

### 关键发现与决策
1. **`utils/download.js` 仍被 Generate.vue:82 引用**：原审计数据陈旧，实际是 `download` 和 `generatePaper` 都被 Generate.vue import 但**从未在 body 中调用**。A7 删除源文件后必须立即清理 A3 的死 import（已合并处理）。
2. **`stores/app.js` 仍被 Generate.vue:84 引用**（`useAppStore().navigateToPrint` 在 line 157 实际使用），`printPreviewPapers` 字段活。`app.js` 不能删，需等 D1（`usePrintPreview` composable）落地。
3. **Layout.vue 是 `@/components` 桶的唯一用户**：A1 删桶时直接改 Layout.vue 为 `Generate` + `Practice` 两个直接路径 import。

### 已知遗留（A4 已落地，A8 不执行）
- ✅ ~~A4 删 `utils/abilityProfile.js` (91 行重复实现)~~ **2026-06-07 已升 `services/abilityProfile.js`**
- ~~A8 删 §3.4 调试残留 6 处 console.log~~ **已从计划中删除**（用户 2026-06-07 决议：低优先级，跳过）

---

## v3 调优计划草拟（2026-06-07）

### 范围
在 v2.3 A 组死代码清理基础上，向目标态推进。**仅文档可见**——未开始执行。

详细计划见 [05-PLAN-v3-architecture-tuning.md](05-PLAN-v3-architecture-tuning.md)。

### 8 大组（按建议执行顺序）
| 组 | 任务 | 行数影响 | 依赖 |
|----|------|----------|------|
| B | 路径统一（删 8 个根目录 stub + 简化 `utils/index.js` 桶） | ~ -90 | 无 |
| C | services 升顶层（`analysis.js` 从 `utils/services/` 迁到 `services/`） | ~ ±0 + 单测 | 无 |
| D | composables 补齐（`usePrintPreview` / `useStatsQuery` / `useChart`） | ~ +100 | 无 |
| E | stores 瘦身（依赖 D1，拆业务到 composable） | ~ -50 | D1 |
| F | components 归位（`home/` → `generate/`，测试组件到 `dev/`） | ~ ±0 | 无 |
| G | 测试分区（`tests/` 目录建立） | ~ +5 | 无 |
| H | 验证 + 文档更新 | — | B/C/D/E/F/G |

### 状态
⏳ **待用户审阅 05-PLAN-v3，决定 B/C/D/E/F/G 执行顺序**

---

## v2.3 arch-v2.3 阶段 5/6（2026-06-07）

### 范围
架构合规整改 + 浏览器烟测 bug 修复。**仅文档可见**：V→C/V→M 整改后，UI 行为不变。

分支：`refactor/architecture-v2.3`（5 个 commits）

### Commits
| hash | 范围 |
|------|------|
| `0cbcdce` | B-1/B-2/B-3 烟测 bug + Practice.vue 违规①②（V→U 整改）|
| `51e6478` | Practice.vue 违规③④（V→M/V→C 业务下沉 useSubmitHandler）|
| `be7aabc` | StatsDrawer.vue 违规①②③⑤（useStatsDrawer + operatorMap）|
| `f9d235e` | StatsDrawer.vue 违规④（chartBuilder service + openDrawer 编排）|
| `cfcfdad` | StatsDrawer openDrawer 未解构（1 行 fix）|

### 新建文件
- `src/composables/useAnswerBuilder.js` (C, 41 行) — 封装 `extractQuestionMetadata` + `buildAttemptScore`
- `src/composables/useSubmitHandler.js` (C, 113 行) — 封装 handleSubmit 编排
- `src/composables/useStatsDrawer.js` (C, 102 行) — 封装 stats drawer 状态/操作/格式化
- `src/services/chartBuilder.js` (S, 124 行) — 封装 Chart.js 构造/销毁
- `src/services/operatorMap.js` (S, 34 行) — 单一来源消除 operator label 重复

### 浏览器烟测结果
12/12 项通过，0 遗留 P0/P1 问题。详见 [12-TODO-browser-smoke-test-v2.3.md](12-TODO-browser-smoke-test-v2.3.md)。

### UI 可见性：**🟡 0 视觉变化**（纯底层/服务层）
详见 § "UI 可见性清单"。

### 关键决策
1. **C 层服务化**：违规整改不直接调 U/M/S，全部经 composable 委托
2. **service 升顶层**：`chartBuilder` / `operatorMap` 创建于 `src/services/`，未沿 `utils/services/` 旧路径
3. **B-3 时序修复**：在 `onEvalSelect`（C 层）同步关 dialog 而非在 dialog 内 nextTick 异步关
4. **dialog 嵌套 ref**：`stats.isDrawerOpen` 需 `.value` 解包（用 `useStatsDrawer` 时模板不自动解嵌套 ref）
5. **路径统一延后**：`utils/` 8 个根 stub 保留为过渡兼容，未做"硬切换"

### 验证状态
- ✅ `npx vitest run` 45/45 全过
- ✅ 浏览器手测：评估→自适应→SelfEvaluationDialog→group 推进→PracticeSummaryDialog→AbilityCard 正常
- ✅ questions 表从 0 → 14 条（B-2 修复有效）
- ✅ Stats drawer `openDrawer` 编排后图表正常

### 已知遗留（arch-v2.3 阶段 7+）
详见 [PLAN-v2-architecture-refactor.md](04-PLAN-v2-architecture-refactor.md)：
1. 阶段 1.3 路径统一 — 删 utils 8 个根 stub
2. 阶段 2 `services/analysis.js` 升顶层
3. 阶段 3 `useChart` / `usePrintPreview` / `useStatsQuery` 未建
4. 阶段 4 stores 瘦身 + 删 `app.js`（需先建 `usePrintPreview`）
5. 阶段 5 components 目录归位（`home/` → `generate/`）
6. 死代码清理：`Home.vue` / `apis/paper.js` / `utils/request.js` / `utils/download.js` / `utils/enum.js` 内 `httpMapping` / `utils/abilityProfile.js` 重复实现
7. 大组件拆分：`Practice.vue` 923 行仍偏大（→ v2.4）

---

## v2.2.0（2026-06-05）

### 范围
用户画像（P2）细化：能力分析与错题强化 — 9 阶段全部完成，10 commits 收口在 `feat/p2-refinement`。

### UI 可见性：**🟡 0 视觉变化**（纯底层/服务层）
详见 § "UI 可见性清单"。

### Commits（`feat/p2-refinement` vs `ui`）
| hash | 范围 |
|------|------|
| `de80eeb` | DB schema v3 + questions 表 + 迁移 |
| `9e7d02f` | 阶段 2：findEquivalent / findRelated / getMasteryByNumber |
| `5c3bf73` | 阶段 3：错题分析（getWrongAnswers / evaluateCorrectionEffect / prioritizeWrongAnswers）|
| `f4ee1b9` | 阶段 4：学习曲线（getLearningCurve / getNumberCurve）|
| `bdea0eb` | 阶段 5：动态弱项/强项（getDynamicWeakness / getDynamicStrength）|
| `74bc8f4` | 阶段 6：useAbilityAnalysis composable |
| `bd44b8e` | 阶段 7：AbilityCard 4 新 props（向后兼容）|
| `52c62cd` | 阶段 8+9：vitest + fake-indexeddb + 2 spec files + review A/B/D/E 清理 |
| `48fab82` | 修 3 个 vitest fail（2 product + 1 test）|
| `ee1fae6` | AbilityCard 真实浏览器 smoke test 计划（agent-test 出品）|

### 关键决策
1. **DB 只存元数据**：聚合结果（弱项/强项/曲线）现算符合原架构
2. **向后兼容**：AbilityCard 4 新 props 有 default，老调用方不破
3. **1-strike 软规则留 v2.x**：v2.2.0 用 minSample=3 过滤弱项判定
4. **schema 命名**：questions 表用 `&equation` unique（去重）
5. **测试策略**：vitest 单测 33 个 + agent-test 真浏览器 smoke test（计划阶段）

### UI 可见性清单（merge 后用户能直接看到的变化）
| 改动 | 用户能看到？ | 备注 |
|------|--------------|------|
| DB schema 升级到 v3 | ❌ | 浏览器后台自动跑迁移 |
| questions 表数据积累 | ❌ | devtools 可见 |
| 11 个新 service 函数 | ❌ | 没人调（composable 空转）|
| useAbilityAnalysis composable | ❌ | 没人 import |
| AbilityCard 4 新 props | ❌ | **template 完全没引用** |
| 33 个单测 | ❌ | 开发者视角（`npm test`）|
| **总计** | **🟡 0 视觉变化** | |

### 验证状态
- ✅ `npx vite build` 通过
- ✅ `npm test` 33/33 全过
- ✅ 3 个 agent-review 阶段通过（PASS / PASS-WITH-MINOR）
- ❌ **未在真浏览器测过**（dev server 在跑但用户没走完流程验收）

### 已知遗留（v2.x）
详见 [PLAN-v2-ability-analysis.md](06-PLAN-v2-ability-analysis.md) § 8 "未来扩展" + [PLAN-browser-smoke-test.md](11-PLAN-browser-smoke-test.md)：
1. AbilityCard 4 v2 props 在 UI 接线（**未做，是 P2 阶段 10**）
2. `getDynamicWeakness({ buckets })` 时间桶参数
3. 1-strike 软规则实现
4. 遗忘检测（30 天未练 → stale）
5. `useAdaptiveQuestionPicker` 强化出题器
6. browser smoke test 实施（6 场景）

---

## 历史版本

### v2.1.x → v2.2.0 之间
无中间版本（v2.2.0 是 P2 阶段首次发版）。

### v2.0.0（基线）
见 git log `ui` 分支起点。
见 git log `ui` 分支起点。
