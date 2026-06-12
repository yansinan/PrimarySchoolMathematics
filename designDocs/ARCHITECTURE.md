# 系统架构文档

> **性质**: 基础架构文档 (Architecture Constitution)
> **维护**: 项目组 / 所有 agent 必须遵守
> **版本**: v4.3 (2026-06-12 Q/A/W 迁 S 层 + wrongAnswerService 清理 + 类注释补齐)
> **作用**: 后续所有重构 / 新功能 / 修 bug 的**基础依据**. 违反本文档的 PR 需在描述中显式说明.
> **配套**:
> - [IMPLEMENTATION_HISTORY.md](./IMPLEMENTATION_HISTORY.md) — 实施过程（v2.3 + v3 调优的"做了什么、为什么"）
> - [README.md](./README.md) — 文档索引
> - [DESIGN.md](./DESIGN.md) — 产品设计（业务必读）

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
                  IO 边界: Dexie / localStorage / fetch
```

**辅助层**:
- `K (Constants)` — `constants/*.js` 纯常量, 任意层引用
- `T (Tests)` — 顶层 `test/` 集中（单数；按源文件位置分子目录: `test/utils/` `test/services/` 等）

### 1.2 跨层规则 (Enforcement)

| 调用方 ↓ \\ 被调方 → | V | C | S | U | M | K |
|---|---|---|---|---|---|---|
| **V** (View) | — | ✅ | ❌ | ❌ | ✅ 只读 | ✅ |
| **C** (Composable) | ❌ | — | ✅ | ✅ | ✅ | ✅ |
| **S** (Service) | ❌ | ❌ | — | ✅ | ✅ 只读 | ✅ |
| **U** (Util) | ❌ | ❌ | ❌ | — | ❌ | ✅ |
| **M** (Model) | ❌ | ❌ | ❌ | ✅ | — | ✅ |

**铁律**:
1. **V 不直接 import `database` 或 `services/*`**, 必须经 composable
2. **M 只放字段**, 不做"按业务规则变换数据"
3. **S 可引 U 和 M（只读）, 绝不引 V**
4. **U/M 不引 S** (避免循环)
5. 跨层跳调用 (V→S, V→U, M→S) → PR review 打回

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

### 2.1 目标树 (v2.3 + v3 调优后)

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
├ utils/                                U 层（按子域分目录）
│  ├ paperGenerator.js                  算式生成器（顶层 util，不归 algorithm）
│  ├ algorithm/     adaptiveBatch / diagnostic /
│  │                displayStrategy / equationCore / equationParser /
│  │                EquationSolver / psm /
│  │                （Question/Answer/WrongAnswer 已迁至 services/）
│  ├ form/          formDefaults / formValidation
│  ├ store/         database / configStorage
│  ├ time/          timeFormat / timeConstants
│  ├ score.js       ⭐ sumAnswerScores + sumResponseTimes
│  └ index.js       ⭐ 兼容桶
│
├── services/                             ⭐ S 层（顶层，与 utils/components 同级）
│  ├── analysis.js                        ⭐ C1+C2+C3 升层
│  ├── abilityProfile.js                  ⭐ Profile 类（load / computeDifficultyIdx / 强弱项查询）
│  ├── adaptiveEngine.js                  ⭐ Engine 类（2026-06-10 升层自 utils/algorithm）
│  ├── PracticeSession.js                 ⭐ session 域类（save / getAnswers / computeStats / CRUD）
│  ├── Question.js                        ⭐ 领域模型：题目元数据 + 查询（2026-06-12 迁自 utils/algorithm，文件名大写）
│  ├── Answer.js                          ⭐ 领域模型：答题数据 + getter + DB.answers CRUD（同上）
│  ├── WrongAnswer.js                     ⭐ 领域模型：错题过滤 + 聚合（同上）
│  ├── chartBuilder.js                    ⭐ arch-v2.3 新建
│  ├── operatorMap.js                     ⭐ arch-v2.3 新建
│  ├── statsAggregator.js                 ⭐ 聚合统计
│  ├── databaseInit.js                    ⭐ DB schema + 骨架类
│  └── index.js                           ✅ 桶导出（含 Question / Answer / WrongAnswer / DB / analysis / ...）
│
├ composables/                          C 层
│  ├ useAdaptiveSession.js               ⭐ 含 completeGroup / afterAnswer / adjustNextQuestion
│  ├ useAbilityAnalysis.js               ⭐ P2 阶段 6
│  ├ useAbilityProfile.js                ⭐
│  ├ usePracticeSaver.js                 ⭐ 含 savePerQuestion / saveAdaptiveFinal
│  ├ usePracticeDialogs.js               ⭐
│  ├ useDisplayStrategy.js               ⭐ PR-4.2
│  ├ useAnswerBuilder.js                 ⭐ arch-v2.3 新建（V→U 整改）
│  ├ useSubmitHandler.js                 ⭐ arch-v2.3 新建（V→C 整改）
│  ├ useStatsDrawer.js                   ⭐ arch-v2.3 新建（V→M 整改）
│  ├ useStatsQuery.js                    ⭐ D2 抽 8 个 stats action
│  └ index.js                           ✅ 桶导出
│
├ stores/                               M 层（只放字段）
│  ├ practice.js                         ⭐ E1 删 saveSessionToDB action
│  └ stats.js                            ⭐ D2 删 8 个 DB actions（244→113 行）
│
├ components/                           V 层（按角色 group）
│  ├ layout/        ProgressSteps
│  ├ question/      HorizontalLayout / VerticalLayout / DigitInput
│  ├ input/         NumberKeypad / OptionButtons
│  ├ dialog/        PracticeSummaryDialog / SelfEvaluationDialog
│  ├ stats/         StatsDrawer / SessionDetail
│  ├ profile/       AbilityCard / StrengthV2Card / WeaknessV2Card / MidV2Card
│  ├ generate/      Generate / AutoGenerateFormulas / ConfigurationList
│  │                CustomFormulas / OptionsDrawer / PaperDownloadDialog / PrintPreviewDialog
│  │                ⭐ F 组从 home/ 改名
│  ├ dev/           DebugPanel / QuestionDetail
│  │                TestComponentView / TestHorizontalLayout  ⭐ F 组从根目录归位
│  └ (无 index.js — 顶层桶已删，V 层全部走 @/components/<role>/Foo.vue)
│
└ views/                                路由级页面
   ├ Layout.vue
   ├ Print.vue
   ├ TestView.vue  (测试用，保留)
   └ ResetData.vue
```

### 2.2 布局原则

| 原则 | 说明 |
|---|---|
| **按"层"分顶层** | `constants/ utils/ services/ composables/ stores/ components/ views/` |
| **不按"业务域"分** | 组件按角色 group，不按业务 |
| **`utils/` 二次分类** | 按子域 (algorithm / form / store / time) |
| **`services/` 顶层化** | 与 utils/components 同级 |
| **dev 隔离** | `components/dev/` 放调试用 |
| **顶层无 `components/index.js` 桶** | V 层走 `@/components/<role>/Foo.vue` |

### 2.3 命名规范

| 类别 | 规范 | 例 |
|---|---|---|
| 常量 | `UPPER_SNAKE` | `FEEDBACK_DELAYS` |
| 工具 / Service 函数 | `camelCase` 动词 | `parseEquation` / `getMasteryByNumber` / `sumResponseTimes` |
| Composable | `use` 前缀 + 角色 | `useAdaptiveSession` |
| Store | `use` 前缀 + 角色 + `Store` | `usePracticeStore` |
| Store ID | 与 store 同名（单数） | `'practice'` |
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
| 测试 → 源码 | 显式路径，不用桶 | `import { xxx } from '@/services/analysis'` |
| 旧 import 兼容 | `@/utils/xxx` 仍可用（桶兜底） | `import { formatDuration } from '@/utils/timeFormat'` |

### 2.5 何时更新本架构文档

- 新增 / 删除一个**层** → 更新 § 1
- 新增 / 删除一个**目录**或子目录 → 更新 § 2
- 跨层规则出现新边界情况 → 更新 § 1.2
- 重大 refactor 落地后 → 同步更新 § 2.1 状态图例

### 2.6 与执行计划的关系

- **本文档**: "是什么" — 分层 + 目录 + 规则
- **[README.md](./README.md) § 文档索引**: 列出全部 11 个 doc
- **[IMPLEMENTATION_HISTORY.md](./IMPLEMENTATION_HISTORY.md)**: "过去怎么走到这" — v2.3 + v3 实施过程

新 PR 应该: 先看本文档确定目标态, 再看 IMPLEMENTATION_HISTORY 了解演进，再看 README 找关联计划。

### 2.7 引用

- Vue 3 架构指南: https://cn.vuejs.org/guide/scaling-up/tooling.html
- Pinia 风格指南: https://pinia.vuejs.org/cookbook/options-api.html
- 现行服务层样板: `src/services/chartBuilder.js` (Chart.js 封装)
 `src/services/operatorMap.js` (34 行, 单一来源)
 `src/services/analysis.js` (887 行, 升层)
 `src/services/PracticeSession.js` (域类 + save / getAnswers / computeStats)
 `src/services/databaseInit.js` (Dexie 实例 + schema 骨架类, 纯叶子模块)
 `src/services/Question.js` / `Answer.js` / `WrongAnswer.js` (领域模型, 2026-06-12 迁入)
 `src/services/adaptiveEngine.js` (Engine 类)
 `src/services/statsAggregator.js` (聚合统计, 替代 useStatsQuery 内联)

> **已删除死代理**：`src/utils/store/database.js` 和 `src/services/database.js` 已清理。所有调用方直引 `@/services/databaseInit`。
- 现行 composable 样板: `src/composables/useAdaptiveSession.js` (358 行, 含 completeGroup / afterAnswer / adjustNextQuestion)
  `src/composables/useStatsDrawer.js` (102 行, V→M 整改样板)
  `src/composables/useSubmitHandler.js` (113 行, V→C 整改样板)
  `src/composables/useStatsQuery.js` (273 行, D2 抽 8 个 stats action)
- 现行常量样板: `src/constants/practice.js` (191 行)
- P2 体系: [_ARCHIEVED_06-PLAN-v2-ability-analysis.md](./_ARCHIEVED_06-PLAN-v2-ability-analysis.md)
- P0-P4 路线（archived）: [_ARCHIEVED_03-PLAN-v2-roadmap.md](./_ARCHIEVED_03-PLAN-v2-roadmap.md) → 业务阶段在 [v4-PLAN-error-injection.md](./v4-PLAN-error-injection.md)
- 实施过程: [IMPLEMENTATION_HISTORY.md](./IMPLEMENTATION_HISTORY.md)
- v3 调优计划（已落地）: [_ARCHIEVED_05-PLAN-v3-architecture-tuning.md](./_ARCHIEVED_05-PLAN-v3-architecture-tuning.md)
