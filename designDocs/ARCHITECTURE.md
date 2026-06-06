<!-- filepath: designDocs/ARCHITECTURE.md -->
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
- `T (Tests)` — 单元测试贴源码(`src/**/__tests__/`), 集成/契约放顶层(`tests/`)

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
│  ├ services/      analysis                   // 只读 query 服务层
│  ├ store/         database / configStorage / persistedState
│  ├ time/          timeFormat / timeConstants
│  └ index.js
│
├ services/                             ⭐ S 层(顶层,与 utils/components 同级)
│  ├ chartBuilder.js
│  ├ operatorMap.js
│  ├ __tests__/
│  └ index.js
│
├ composables/                          C 层
│  ├ useAdaptiveSession.js
│  ├ useAbilityAnalysis.js
│  ├ useAbilityProfile.js
│  ├ usePracticeSaver.js
│  ├ usePracticeDialogs.js
│  ├ useDisplayStrategy.js
│  ├ useChart.js
│  ├ usePrintPreview.js
│  ├ useStatsQuery.js
│  ├ __tests__/
│  └ index.js
│
├ stores/                               M 层(只放字段)
│  ├ practice.js
│  ├ stats.js
│  └ index.js
│
├ components/                           V 层(按角色 group)
│  ├ index.js
│  ├ layout/        Header / Footer / Menu / ProgressSteps
│  ├ question/      HorizontalLayout / VerticalLayout / DigitInput
│  ├ input/         NumberKeypad / OptionButtons
│  ├ dialog/        PracticeSummaryDialog / SelfEvaluationDialog
│  ├ stats/         StatsDrawer / SessionDetail
│  ├ profile/       AbilityCard / StrengthV2Card / WeaknessV2Card
│  ├ generate/      Generate / AutoGenerateFormulas / ...
│  └ dev/           TestComponentView / TestHorizontalLayout
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
| 测试文件 | `*.spec.js` 贴源码 | `analysis.spec.js` |
| 测试目录 | `__tests__/` | `src/services/__tests__/` |

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

| 路径 | 行 | 原因 |
|---|---:|---|
| `src/apis/paper.js` | 59 | 零调用 |
| `src/utils/request.js` | 57 | 仅 apis/paper 引用 |
| `src/utils/download.js` | 168 | 零调用 |
| `src/views/Home.vue` | 151 | router 未引用 |

### 3.2 死符号

| 路径 | 内容 | 原因 |
|---|---|---|
| `src/utils/enum.js` 的 `httpContentTypeExtensionsMappingEnum` | 10 | 仅 Home/Generate import, 未用 |
| `src/views/TestView.vue` | 32 | 路由可删(看 TestComponentView 是否需) |
| `src/stores/app.js` | 23 | 拆为 usePrintPreview |
| `src/utils/EquationSolver.js` 的 `checkResult` | — | 未在任何 UI 路径调用 |
| `src/utils/EquationSolver.js` 的 `solveByBruteForce` | — | 兜底, 正常路径不走 |
| `src/utils/psm.js:506-513` 的 `get_time` | — | 定义未使用 |
| `src/utils/configStorage.js:20` 的 `load()` | — | 空方法, 无调用 |

### 3.3 死 import

| 文件 | import | 备注 |
|---|---|---|
| `src/views/Home.vue:49-51` | `download` / `generatePaper` / `httpMapping` | 3.1 删 Home.vue 后自动消失 |
| `src/components/Generate.vue:81` | `httpContentTypeExtensionsMappingEnum` | import 但未用 |
| `src/views/Home.vue:93` | `console.log('少年，我看你骨骼精奇...')` | 彩蛋, 删 Home.vue 后消失 |

### 3.4 调试残留

| 文件 | 内容 |
|---|---|
| `src/views/Home.vue` | `debugger`(近末尾) |
| `src/utils/paperGenerator.js:64` | `console.log('papers', papers)` |
| `src/views/Print.vue:56,71,75,80` | 4 处 console.log |
| `src/utils/database.js:215` | `console.log('[PracticeStore] Session saved to DB...')` |
| `src/router/index.js` | 潜在 `console.log(baseUrl)` |

### 3.5 重复实现

| 内容 | 位置 A | 位置 B |
|---|---|---|
| `toEvalSymbols` | `utils/equationParser.js:3-9` | `utils/EquationSolver.js:1-7` |
| 进位/退位判断 | `equationParser.getCarryType` | `psm.is_addcarry/is_abdication` |
| `formData` 17 字段默认值 | `views/Home.vue:60-88` | `components/Generate.vue:102-131` |
| `paperGenerator` vs | `utils/paperGenerator.js:11-39` | `apis/paper.js:12-40` |
| operator label | `stores/stats.js:51-58` | `components/stats/StatsDrawer.vue:195-198` |
| `extractOperandNumbers` | `utils/database.js:6-25` | `utils/equationParser.parseEquation` |
| `validateTotalQuestions` | `views/Home.vue:164-167,180-183` | `components/Generate.vue:211-214,227-230` |
| `generateOptions` | `components/Practice.vue:255-265` | `utils/adaptiveEngine.js:65-88` |
| `paperDescriptionList` | `views/Home.vue:118-122` | `components/Generate.vue:163-167` |

### 3.6 注释噪音

| 位置 | 内容 | 处理 |
|---|---|---|
| `utils/psm.js` | 每函数顶部 `Author: J.sky / Mail: bosichong@qq.com` | 保留 1 行文件头, 删函数顶部重复 |

---

## 4. 文档演进

### 4.1 何时更新本架构文档

- 新增 / 删除一个**层** → 更新 § 1
- 新增 / 删除一个**目录**或子目录 → 更新 § 2
- 新增 / 确认一个死代码项 → 更新 § 3
- 跨层规则出现新边界情况 → 更新 § 1.2

### 4.2 与执行计划的关系

- **本文档**: "是什么" — 分层 + 目录 + 死代码目录
- **[PLAN-v2-architecture-refactor.md](./PLAN-v2-architecture-refactor.md)**: "怎么做" — 7 阶段迁移路线 + 文件总表 + 实施顺序

新 PR 应该: 先看本文档确定目标态, 再看执行计划确定本次步进.

### 4.3 引用

- Vue 3 架构指南: https://cn.vuejs.org/guide/scaling-up/tooling.html
- Pinia 风格指南: https://pinia.vuejs.org/cookbook/options-api.html
- 现行服务层样板: `src/services/analysis.js` (read-only query)  
- 现行 composable 样板: `src/composables/useAdaptiveSession.js` (98 行)
