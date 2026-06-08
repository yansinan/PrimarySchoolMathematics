<!-- filepath: designDocs/01-ARCHITECTURE.md -->
# 系统架构文档

> **性质**: 基础架构文档(Architecture Constitution)  
> **维护**: 项目组 / 所有 agent 必须遵守  
> **版本**: v2.3 (2026-06-06)  
> **作用**: 后续所有重构 / 新功能 / 修 bug 的**基础依据**. 违反本文档的 PR 需在描述中显式说明.  
> **配套**: 执行计划见 [PLAN-v2-architecture-refactor.md](./PLAN-v2-architecture-refactor.md)

---

## 1. 分层模型

### 1.1 六层职责

```
┌────────────────────────────────────────────────────────────────┐
│ V (View)         components/*.vue  views/*.vue                 │
│ ────────         UI 渲染 + 事件转发, 零业务规则                │
│ 约束: 不直接 import database / services, 只经 composable       │
└────────────────────────┬───────────────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────────────┐
│ C (Composable)   composables/*.js                              │
│ ────────         响应式编排: ref 状态 + 触发器方法              │
│                  把"用户意图"翻译成"对 services/store 的调用"  │
└────────────────────────┬───────────────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────────────┐
│ S (Service)      services/*.js        ← 升到 src/ 顶层         │
│ ────────         领域规则(纯函数优先 + 少量副作用可)           │
│                  现行: analysis.js (read-only query)          │
└────────────────────────┬───────────────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────────────┐
│ U (Util)         utils/{algorithm,form,store,time}/*.js       │
│ ────────         无状态算法 / IO 适配 / 解析                    │
└────────────────────────┬───────────────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────────────┐
│ M (Model)        stores/*.js                                   │
│ ────────         Pinia 跨组件状态, 只放字段, 不放业务规则      │
└────────────────────────┬───────────────────────────────────────┘
                         │
                  IO 边界: Dexie / localStorage / fetch
```

**辅助层**:
- `K (Constants)` — `constants/*.js` 纯常量, 任意层引用
- `T (Tests)` — 顶层 `test/` 集中（单数；按源文件位置分子目录: `test/utils/` `test/services/` 等）

### 1.2 跨层规则(Enforcement)

| 调用方 ↓ \ 被调方 → | V | C | S | U | M | K |
|---|---|---|---|---|---|---|
| **V** (View) | — | ✅ | ❌ | ❌ | ✅ 只读 | ✅ |
| **C** (Composable) | ❌ | — | ✅ | ✅ | ✅ | ✅ |
| **S** (Service) | ❌ | ❌ | — | ✅ | ✅ 只读 | ✅ |
| **U** (Util) | ❌ | ❌ | ❌ | — | ❌ | ✅ |
| **M** (Model) | ❌ | ❌ | ❌ | ✅ | — | ✅ |

**铁律**:
1. **V 不直接 import `database` 或 `services/*`**, 必须经 composable
2. **M 只放字段**, 不做"按业务规则变换数据"
3. **S 可引 U 和 M(只读), 绝不引 V**
4. **U/M 不引 S** (避免循环)
5. 跨层跳调用(V→S, V→U, M→S) → PR review 打回

### 1.3 何时用哪个抽象

```
要写一段逻辑?
  ├─ 纯函数, 无状态, 无 IO              → utils/*
  ├─ 业务规则, 可能被多处用, 需单测      → services/*
  ├─ 需要响应式状态 + 编排异步           → composables/*
  ├─ 跨组件共享字段                     → stores/*
  └─ 渲染 UI                           → components/*
```

---

## 2. 目录结构

### 2.1 目标树(v2.3)

```
src/
├ App.vue
├ main.js
│
├ assets/
├ router/index.js
├ styles/{tailwind.css, shared.scss}
│
├ constants/                            K 层
│  ├ practice.js
│  ├ storageKeys.js
│  ├ enums.js
│  ├ thresholds.js
│  └ index.js
│
├ utils/                                U 层(按子域分目录)
│  ├ algorithm/     adaptiveEngine / adaptiveBatch / diagnostic /
│  │                displayStrategy / equationCore / equationParser /
│  │                EquationSolver / paperGenerator / psm
│  ├ form/          formDefaults / formValidation
│  ├ store/         database / configStorage
│  ├ time/          timeFormat / timeConstants
│  └ index.js       ⭐ 兼容桶 (PR 1.3 路径统一后删)
│
├ services/                             ⭐ S 层(顶层,与 utils/components 同级)
│  ├ analysis.js                        ✅ 2026-06-08 C2 升层(从 utils/services/)
│  ├ sessionPersistence.js              ✅ 2026-06-08 E1 抽层(从 stores/practice.js#saveSessionToDB)
│  ├ sessionMetrics.js                  📋 规划
│  ├ chartBuilder.js                    ✅ 2026-06 arch-v2.3 新建
│  ├ operatorMap.js                     ✅ 2026-06 arch-v2.3 新建
│  ├ abilityProfile.js                   ✅ 2026-06-07 A4b 升层(从 utils/)
│  └ index.js                           ✅ 桶导出
│
├ composables/                          C 层
│  ├ useAdaptiveSession.js               ✅ 现有 (含 completeAssessment / completeGroup)
│  ├ useAbilityAnalysis.js               ✅ 现有 (P2 阶段 6)
│  ├ useAbilityProfile.js                ✅ 现有
│  ├ usePracticeSaver.js                 ✅ 现有 (含 savePerQuestion / saveAdaptiveFinal)
│  ├ usePracticeDialogs.js               ✅ 现有
│  ├ useDisplayStrategy.js               ✅ 现有 (PR-4.2)
│  ├ useAnswerBuilder.js                 ✅ 2026-06 arch-v2.3 新建 (V→U 整改)
│  ├ useSubmitHandler.js                 ✅ 2026-06 arch-v2.3 新建 (V→C 整改)
│  ├ useStatsDrawer.js                   ✅ 2026-06 arch-v2.3 新建 (V→M 整改)
│  ├ useChart.js                         📋 规划
│  ├ usePrintPreview.js                  ⛔ 跳过 (E3 改走路径 4 sessionStorage + key in query)
│  ├ useStatsQuery.js                    ✅ 2026-06-08 D2 落地（5 个 DB actions 拆出）
│  └ index.js                           ✅ 桶导出
│
├ stores/                               M 层(只放字段)
│  ├ practice.js                         ✅ 2026-06-08 E1 删 saveSessionToDB action
│  ├ stats.js                            ✅ 2026-06-08 D2 删 8 个 DB actions
│  └ index.js                           📋 规划
│
├ components/                           V 层(按角色 group)
│  ├ index.js                            🟡 顶层桶没人用(待删)
│  ├ layout/        Header / Footer / Menu / ProgressSteps
│  ├ question/      HorizontalLayout / VerticalLayout / DigitInput
│  ├ input/         NumberKeypad / OptionButtons
│  ├ dialog/        PracticeSummaryDialog / SelfEvaluationDialog   ✅ 已归位
│  ├ stats/         StatsDrawer / SessionDetail
│  ├ profile/       AbilityCard / StrengthV2Card / WeaknessV2Card / MidV2Card
│  ├ generate/      Generate / AutoGenerateFormulas / ...  📋 规划 (改名 home→generate)
│  └ dev/           TestComponentView / TestHorizontalLayout  ✅ 已归位
│                  DebugPanel / QuestionDetail
│
└ views/                                路由级页面
   ├ Layout.vue
   ├ Print.vue
   └ ResetData.vue
```

### 2.2 布局原则

| 原则 | 说明 |
|---|---|
| **按"层"分顶层** | `constants/ utils/ services/ composables/ stores/ components/ views/` |
| **不按"业务域"分** | 组件按角色 group, 不按业务 |
| **`utils/` 二次分类** | 按子域(algorithm / form / store / time) |
| **`services/` 顶层化** | 与 utils/components 同级 |
| **dev 隔离** | `components/dev/` 放调试用 |
| **每个子目录有 `index.js`** | 统一导出 |

### 2.3 命名规范

| 类别 | 规范 | 例 |
|---|---|---|
| 常量 | `UPPER_SNAKE` | `FEEDBACK_DELAYS` |
| 工具 / Service 函数 | `camelCase` 动词 | `parseEquation` / `getMasteryByNumber` |
| Composable | `use` 前缀 + 角色 | `useAdaptiveSession` |
| Store | `use` 前缀 + 角色 + `Store` | `usePracticeStore` |
| Store ID | 与 store 同名(单数) | `'practice'` |
| 组件 | `PascalCase` | `PracticeSummaryDialog` |
| 测试文件 | `*.spec.js` 顶层 `test/` | `test/services/analysis.spec.js` |
| 测试目录 | 顶层 `test/<源层>/<源名>.spec.js` | `test/services/` |

### 2.4 导入路径规范

| 从 → 到 | 路径 | 例 |
|---|---|---|
| 组件 → composable | `@/composables` (桶) | `import { useXxx } from '@/composables'` |
| Composable → service | `@/services` (桶) | `import { xxx } from '@/services'` |
| 任意 → 常量 | `@/constants` (桶) | `import { XXX } from '@/constants'` |
| 组件 → 同目录组件 | 相对 | `import Foo from './Foo.vue'` |
| 组件 → 跨目录组件 | `@/components/<role>/Foo.vue` | `import Foo from '@/components/dialog/Foo.vue'` |
| 测试 → 源码 | 显式路径, 不用桶 | `import { xxx } from '@/services/analysis'` |
| 旧 import 兼容 | `@/utils/xxx` 仍可用(桶兜底) | `import { formatDuration } from '@/utils/timeFormat'` |

---

## 3. 死代码记录(只记录, 不参与实施)

> 本节是**目录**, **不在本轮实施**. 后续清理时按 § 3 顺序逐项处理.

### 3.1 整文件

> 状态图例: ✅ **已确认死**（2026-06 审计） / ⏳ **待查** / 🔴 **不删**（活跃引用）

| 状态 | 路径 | 行 | 原因 |
|:----:|------|---:|------|
| ✅ ~~**🟠 留 v2.4+**~~ | `src/views/Home.vue` | 147 | router 仍未引用 + 与 Generate.vue 重复。**2026-06-07 chore/cleanup-a-group 删除** |
| ✅ | `src/apis/paper.js` | 59 | 仅 Generate/Home 引用，Home 死则仅 Generate 1 处，**2026-06-07 chore/cleanup-a-group 删除**（Generate 中 import 但从未调用）|
| ✅ | `src/utils/request.js` | 61 | 仅 apis/paper 引用，**2026-06-07 随 apis/paper 删除** |
| ✅ | `src/utils/download.js` | 168 | 仅 Home.vue 引用（Home 死则它也死）。**2026-06-07 随 Home 删除** |
| 🔴 | `src/views/TestView.vue` | 51 | **router 仍引用** — 测试页保留 |
| 🔴 | `src/components/TestComponentView.vue` | 209 | **TestView 引用** — 布局组件测试页 |
| 🔴 | `src/components/TestHorizontalLayout.vue` | 115 | **TestComponentView 引用** — 布局测试用例 |
| 🔴 | `src/components/home/index.js` | 5 | **未列入**（桶仍被 Generate.vue 等引用）|
| ✅ | `src/stores/app.js` | 20 | E3 改走路径 4 (sessionStorage + key in query)，**2026-06-08 chore/cleanup-f-group 删除** |
| ✅ ~~**⏳ 待查**~~ | `src/utils/paperGenerator.js` | 65 | Generate+Home 引用；Home 死则 Generate 单引用，可迁 services。**2026-06-07 确认**：仅 Generate 1 处，可迁到 `services/paperGenerator.js` 后删 |
| ✅ | `src/components/index.js` | 10 | 没人用（仅 Layout.vue 用了桶，已改直接路径），**2026-06-07 chore/cleanup-a-group 删除** |

### 3.2 死符号

| 状态 | 路径 | 内容 | 原因 |
|:----:|------|------|------|
| ✅ | `src/utils/enum.js` 的 `httpContentTypeExtensionsMappingEnum` | 10 | 仅 Home/Generate import, 未实际用 |
| ✅ | `src/utils/EquationSolver.js`（根目录 stub） | 12 | 真实实现已迁 `algorithm/EquationSolver.js`，本文件仅 `export *` 兜底 |
| ✅ | `src/utils/database.js`（根目录 stub） | 11 | 真实实现已迁 `store/database.js`，本文件仅 `export { default }` 兜底 |
| ✅ | `src/utils/configStorage.js`（根目录 stub） | 10 | 真实实现已迁 `store/configStorage.js` |
| ✅ | `src/utils/adaptiveBatch.js`/`adaptiveEngine.js`/`diagnostic.js`/`displayStrategy.js`/`formDefaults.js`/`timeFormat.js`（6 个根 stub） | 各 10 | 真实实现已迁对应子目录 |
| ✅ | `src/utils/abilityProfile.js` | 91 | **新确认**（2026-06）— 已升 `services/abilityProfile.js`（A4b 落地，仅 1 处引用同步改）|
| ✅ | `src/utils/algorithm/diagnostic.js` 的 `evaluateLevel` 函数 | — | 与 `composables/useAbilityProfile.js:18-25` `evaluateLevelByScore` 重复实现 |
| ✅ | `src/utils/EquationSolver.js` 的 `checkResult` | — | 未在任何 UI 路径调用 |
| ✅ | `src/utils/EquationSolver.js` 的 `solveByBruteForce` | — | 兜底, 正常路径不走 |
| ✅ | `src/utils/psm.js:506-513` 的 `get_time` | — | 定义未使用 |
| ✅ | `src/utils/configStorage.js:20` 的 `load()` | — | 空方法, 无调用 |

### 3.3 死 import

| 文件 | import | 备注 |
|------|--------|------|
| ~~`src/views/Home.vue:49-53`~~ | ~~`download` / `generatePaper` / `httpContentTypeExtensionsMappingEnum` / `createFormulasGenerator`~~ | ~~Home 删后自动消失（2026-06-07）~~ |
| ✅ ~~`src/components/Generate.vue:81`~~ | ~~`httpContentTypeExtensionsMappingEnum`~~ | import 但未用，**2026-06-07 已删** |
| ✅ ~~`src/components/Generate.vue:82`~~ | ~~`download`~~ | import 但未用，源文件已删，**2026-06-07 已清** |
| ✅ ~~`src/components/Generate.vue:83`~~ | ~~`generatePaper`~~ | import 但未用，源文件已删，**2026-06-07 已清** |
| ~~`src/components/Generate.vue:86`~~ | ~~`createFormulasGenerator` from `@/utils/paperGenerator`~~ | 待迁移到 services（留 v2.4） |
| ~~`src/views/Home.vue:93`~~ | ~~`console.log('少年，我看你骨骼精奇...')`~~ | 彩蛋，Home 删后消失（2026-06-07）|

### 3.4 调试残留

> 状态更新（2026-06-07）：Home.vue 死代码清理后，剩 4 个文件含 `console.log` 调试输出。
> 用户决议（2026-06-07）：**§3.4 调试残留清理从计划中删除**（低优先级，dev 价值可接受，留 v2.4+）。
> 下面仅作历史记录，不作执行项。

| 文件 | 内容 | 状态 |
|------|------|:----:|
| ✅ ~~`src/views/Home.vue`~~ | ~~`debugger`(近末尾)~~ | 随 Home 删（2026-06-07）|
| `src/utils/paperGenerator.js:64` | `console.log('papers', papers)` | ⏸ 暂不清理 |
| `src/views/Print.vue:56,71,75,80` | 4 处 console.log | ⏸ 暂不清理 |
| `src/utils/database.js:215` | `console.log('[PracticeStore] Session saved to DB...')` | ⏸ 暂不清理 |
| ✅ ~~`src/router/index.js:33`~~ | ~~`// console.log(baseUrl)`~~ | 注释清掉（2026-06-07）|

### 3.5 重复实现

| 内容 | 位置 A | 位置 B | 状态 |
|------|--------|--------|:----:|
| `toEvalSymbols` | `utils/equationParser.js:3-9` | `utils/EquationSolver.js:1-7` | ✅ 删 B 后消 |
| 进位/退位判断 | `equationParser.getCarryType` | `psm.is_addcarry/is_abdication` | ⏳ |
| `formData` 17 字段默认值 | `views/Home.vue:60-88` | `components/Generate.vue:102-131` | ✅ 删 A 后消 |
| `paperGenerator` vs | `utils/paperGenerator.js:11-39` | `apis/paper.js:12-40` | ⏳ 迁 services 后消 |
| operator label | `services/operatorMap.js`（新）| ~~`stores/stats.js:51-58`~~ | ✅ 2026-06 统一 |
| operator label | `services/operatorMap.js`（新）| ~~`components/stats/StatsDrawer.vue`~~ | ✅ 2026-06 统一 |
| `extractOperandNumbers` | `utils/database.js:6-25` | `utils/equationParser.parseEquation` | ⏳ |
| `validateTotalQuestions` | `views/Home.vue:164-167,180-183` | `components/Generate.vue:211-214,227-230` | ✅ 删 A 后消 |
| `generateOptions` | `components/Practice.vue:255-265` | `utils/adaptiveEngine.js:65-88` | ✅ 2026-06 已下沉 |
| `paperDescriptionList` | `views/Home.vue:118-122` | `components/Generate.vue:163-167` | ✅ 删 A 后消 |
| `formatDate` 函数 | ~~`components/stats/StatsDrawer.vue`~~ | `composables/useStatsDrawer.js:64-69` | ✅ 2026-06 统一 |
| `operatorLabel` 函数 | ~~`components/stats/StatsDrawer.vue`~~ | `composables/useStatsDrawer.js:73-77` | ✅ 2026-06 统一 |
| `evaluateLevel` 函数 | `utils/algorithm/diagnostic.js` | `composables/useAbilityProfile.js:18-25` | ✅ 2026-06 确认重复 |

### 3.6 注释噪音

| 位置 | 内容 | 处理 |
|------|------|------|
| `utils/psm.js` | 每函数顶部 `Author: J.sky / Mail: bosichong@qq.com` | 保留 1 行文件头, 删函数顶部重复 |

### 3.7 2026-06 审计新增项

> 本轮浏览器实测与代码审查中**新发现**的死代码 / 重复 / 待优化项：

| 类型 | 位置 | 原因 |
|------|------|------|
| 重复路径 stub 8 个 | `src/utils/database.js` `configStorage.js` `EquationSolver.js` `adaptiveBatch.js` `adaptiveEngine.js` `diagnostic.js` `displayStrategy.js` `formDefaults.js` `timeFormat.js` | 子目录化后保留的过渡 stub，应在 PR 1.3 路径统一后删除（~90 行可减） |
| 顶层空桶 | `src/components/index.js` (10 行) | 没人用，违反"按角色 group"原则 |
| 重复实现 | `src/utils/abilityProfile.js` (91 行) | 与 `composables/useAbilityProfile.js` 重复 |
| 调试残留 | `src/components/StatsDrawer.vue` `handleOpen` 内 `console.error('[StatsDrawer] handleOpen failed:')` | 可改 dev-only 输出 |
| S 层未升顶层 | `src/utils/services/analysis.js` (831 行) | 应迁到 `src/services/analysis.js`（PR 阶段 2 目标）|
| 死 store 字段 | ~~`src/stores/app.js` `printPreviewPapers` 字段~~ | ✅ **2026-06-08 E3 删除整个 app.js**（路径 4 sessionStorage 替代）|
| 重复 emit | `src/components/dialog/SelfEvaluationDialog.vue` 的 `handleUpdate` 在 `!val` 时 emit 'select' | edge case，evalResolver 已 null 时是 no-op |

---

## 4. 文档演进

### 4.1 何时更新本架构文档

- 新增 / 删除一个**层** → 更新 § 1
- 新增 / 删除一个**目录**或子目录 → 更新 § 2
- 新增 / 确认一个死代码项 → 更新 § 3
- 跨层规则出现新边界情况 → 更新 § 1.2
- 重大 refactor 落地后 → 同步更新 § 2.1 状态图例（✅ / 📋 / ⏳ / 🟡）

### 4.1.1 演进记录
- **v2.3 起点** (2026-06-05): 草案, 待审
- **v2.3 阶段 5/6 部分落地** (2026-06-07): 本轮 `refactor/architecture-v2.3` 分支 5 个 commits
  - § 2.1 标记 `useAnswerBuilder` / `useSubmitHandler` / `useStatsDrawer` / `services/chartBuilder` / `services/operatorMap` 为 ✅
  - § 2.1 标注 utils 8 个根目录 stub 状态
  - § 3 大量更新：✅ 验证 / 🔴 不删 / ⏳ 待查 三态分类
  - § 3.7 新增本轮审计发现项

### 4.2 与执行计划的关系

- **本文档**: "是什么" — 分层 + 目录 + 死代码目录
- **[PLAN-v2-architecture-refactor.md](./PLAN-v2-architecture-refactor.md)**: "怎么做" — 7 阶段迁移路线 + 文件总表 + 实施顺序

新 PR 应该: 先看本文档确定目标态, 再看执行计划确定本次步进.

### 4.3 引用

- Vue 3 架构指南: https://cn.vuejs.org/guide/scaling-up/tooling.html
- Pinia 风格指南: https://pinia.vuejs.org/cookbook/options-api.html
- 现行服务层样板: `src/services/chartBuilder.js` (124 行, Chart.js 封装)  
  `src/services/operatorMap.js` (34 行, 单一来源)
- 现行 composable 样板: `src/composables/useAdaptiveSession.js` (358 行, 含 completeGroup)
  `src/composables/useStatsDrawer.js` (102 行, V→M 整改样板)
  `src/composables/useSubmitHandler.js` (113 行, V→C 整改样板)
- 现行常量样板: `src/constants/practice.js` (191 行)
- 历史: `.refactor-todo.md` A1-A5 / B-E / `.refactor-a1-plan.md`(A1 拆分已完成, 本计划是其续章)
- P2 体系: [06-PLAN-v2-ability-analysis.md](./06-PLAN-v2-ability-analysis.md)
- P0-P4 路线: [03-PLAN-v2-roadmap.md](./03-PLAN-v2-roadmap.md)
- v3 调优计划: [05-PLAN-v3-architecture-tuning.md](./05-PLAN-v3-architecture-tuning.md) ← **✅ 2026-06-08 全部完成**
- 本轮浏览器烟测清单: [12-TODO-browser-smoke-test-v2.3.md](./12-TODO-browser-smoke-test-v2.3.md)
