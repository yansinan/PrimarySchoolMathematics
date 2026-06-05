<!-- filepath: designDocs/PLAN-v2-architecture-refactor.md -->
# 架构重构执行计划(v2.3)

> **性质**: 执行计划(Action Plan)  
> **范围**: 把 `src/` 从现状迁移到 [ARCHITECTURE.md](./ARCHITECTURE.md) 定义的目标态  
> **配套**: 架构文档 [ARCHITECTURE.md](./ARCHITECTURE.md) 是"是什么", 本文档是"怎么做"  
> **状态**: 📐 草案(待审)  
> **本轮范围**: 架构梳理 + 路径迁移 + 必要脚手架. **死代码不在本轮实施**(见 [ARCHITECTURE.md § 3](./ARCHITECTURE.md))

---

## 0. TL;DR

按 **7 阶段** 渐进迁移, 每阶段独立可发布. 总预计 **7-10 个 PR**, 跨度 4-6 周.

| 阶段 | 内容 | 风险 | 净行数 |
|---|---|---|---|
| 1 | utils 内部子目录化 | 🟡 路径变动 | 0 |
| 2 | services 升顶层 + 新增 | 🟡 需补单测 | +200 |
| 3 | composables 补齐 | 🟠 续抽 250 行 | +300 |
| 4 | stores 瘦身 + 删 app.js | 🟠 业务迁移 | -20 |
| 5 | components 目录归位 | 🟡 纯移动 | 0 |
| 6 | 测试分区 | 🟢 加目录 | 0 |
| 7 | 验证 + 文档更新 | 🟢 | 0 |

> **不在本轮**:
> - 死代码清理(见 [ARCHITECTURE.md § 3](./ARCHITECTURE.md))
> - bug 修复(totalDuration 等单独排期)
> - 大型 `Practice.vue` 拆分(放 v2.4)

---

## 1. 现状盘点

### 1.1 路由入口

```
/         → /home (Layout.vue)         ← 渲染根
/print    → Print.vue                  ← 生产
/reset    → ResetData.vue              ← 生产
/test     → TestView.vue               ← 开发测试页
```

### 1.2 目录结构(当前)

```
src/
├ App.vue (3 行)
├ main.js (29 行)
├ apis/paper.js (59 行)               ← 形同虚设
├ assets/
├ components/  (11 vue + 6 子目录)
├ composables/ (4 js)
├ constants/   (2 js)
├ router/index.js (4 路由)
├ stores/      (3 js: app/practice/stats)
├ styles/
├ utils/       (12 js 平铺 + services/ 子目录)
└ views/       (5 vue)
```

### 1.3 主要"层泄漏"

| 症状 | 位置 | 期望位置 |
|---|---|---|
| `Practice.vue` 1025 行, UI/编排/计时/持久化全混 | `components/Practice.vue` | 拆为 V + C(放 v2.4) |
| `apis/` 仅 1 个文件 | `apis/paper.js` | 死代码(见架构 § 3) |
| `utils/services/` 应升顶层 | `utils/services/analysis.js` | `services/analysis.js` |
| `utils/` 12 文件平铺 | `utils/*` | 按子域分目录 |
| `stores/practice.js` 含 `saveSessionToDB` 业务 | `stores/practice.js` | `composables/usePracticeSaver` |
| `stores/stats.js` 含 load 业务 | `stores/stats.js` | `composables/useStatsQuery` |
| `stores/app.js` 角色不清 | `stores/app.js` | 拆为 `composables/usePrintPreview` |
| `components/home/` 命名不清晰 | `components/home/*` | 改 `components/generate/` |
| 顶层 dialog 组件应下沉 | `components/PracticeSummaryDialog.vue` | `components/dialog/` |
| 顶层 dev 组件应隔离 | `components/TestComponentView.vue` | `components/dev/` |
| 测试无顶层 `tests/` | `src/**/__tests__/` | 加顶层 `tests/` |

### 1.4 关键文件(按行数降序 Top 15)

| 行 | 文件 | 性质 |
|---:|---|---|
| 1025 | `components/Practice.vue` | 🐘 V/C 混合 |
| 831 | `utils/services/analysis.js` | S(只读 query) |
| 709 | `utils/services/__tests__/analysis.spec.js` | 单测 |
| 676 | `utils/database.js` | U(IO) |
| 595 | `utils/psm.js` | U(第三方遗产) |
| 563 | `components/stats/StatsDrawer.vue` | V |
| 561 | `components/profile/AbilityCard.vue` | V |
| 446 | `utils/adaptiveEngine.js` | U(算法) |
| 429 | `utils/EquationSolver.js` | U(算法) |
| 365 | `components/home/AutoGenerateFormulas.vue` | V |
| 305 | `utils/database/__tests__/migration.spec.js` | 单测 |
| 301 | `composables/useAbilityAnalysis.js` | C |
| 279 | `components/PracticeSummaryDialog.vue` | V |
| 273 | `utils/diagnostic.js` | U(算法) |
| 268 | `stores/practice.js` | M(混入业务) |

---

## 2. 迁移路线(7 阶段)

### 阶段 1 — utils 内部子目录化(🟡 路径变动)

**目标**: `utils/` 内部分目录, 加桶导出兜底兼容旧 import

```
src/utils/  (12 文件平铺)
   ↓
src/utils/
├ algorithm/   adaptiveEngine / adaptiveBatch / diagnostic / displayStrategy /
│              equationParser / EquationSolver / paperGenerator / psm
├ form/        formDefaults
├ store/       database / configStorage
├ time/        timeFormat
└ index.js     ⭐ 桶导出(兼容旧 `import { xxx } from '@/utils/xxx'`)
```

**关键**:
- `utils/index.js` 用桶导出, **老的 `import { xxx } from '@/utils/xxx'` 全部仍可用**
- 旧文件**先复制**到子目录, **暂不删**, 验证通过后再删
- 渐进式: 一个文件一个 PR(避免一次 12 个文件改路径)

**验证**:
```bash
npm run build   # exit 0
npm test        # 33/33 通过
grep -r "from '@/utils/" src/   # 应仍能找到
```

**预计**: 0 净增(纯移动)

### 阶段 2 — services 升顶层 + 新增(🟡 需补单测)

**目标**: 把 `utils/services/` 升为 `src/services/`, 新增 4 个 service

```
src/utils/services/  (1 文件)
   ↓
src/services/                          ⭐ 升到顶层
├ analysis.js                          沿用
├ sessionMetrics.js                    ⭐ 新增
├ chartBuilder.js                      ⭐ 新增
├ operatorMap.js                       ⭐ 新增
├ abilityProfile.js                    ⭐ 升级: 从 utils/abilityProfile.js 升来
├ __tests__/
└ index.js                             桶导出
```

**新增 service 落点**:
| Service | 职责 | 现有调用方 |
|---|---|---|
| `sessionMetrics.js` | `computeSessionTotalDuration` / `formatSessionDuration` | 后续(totalDuration bug 修复时) |
| `chartBuilder.js` | `buildTrendChart` / `buildOperatorChart` | StatsDrawer.vue 内联 |
| `operatorMap.js` | `OPERATOR_DISPLAY` / `OPERATOR_NAME` | stats.js + StatsDrawer.vue 重复 |
| `abilityProfile.js` | (从 utils/ 升来) | useAbilityAnalysis |

**验证**:
```bash
npm run build
npm test
grep -r "from '@/utils/services" src/   # 应只剩历史引用, 全部迁完后应 0
```

**预计**: +200 行(含新 service + 单测)

### 阶段 3 — composables 补齐(🟠 续抽 250 行)

**目标**: 新增 4 个 composable, 把"散在组件/ store 的编排"抽出来

```
src/composables/  (当前 4 文件)
   ↓
src/composables/
├ useAdaptiveSession.js                现有(续抽 completeGroup/handleAssessmentComplete, 250 行)
├ useAbilityAnalysis.js                现有(接入调用链, P2 阶段 10)
├ usePracticeSaver.js                  现有(改用 services/sessionMetrics)
├ usePracticeDialogs.js                现有
├ useDisplayStrategy.js                ⭐ 新增
├ useChart.js                          ⭐ 新增
├ usePrintPreview.js                   ⭐ 新增: 替代 stores/app.js
├ useStatsQuery.js                     ⭐ 新增: 替代 stats.js 业务规则
├ __tests__/                           ⭐ 新增
└ index.js                             桶导出
```

**新增 composable 职责**:
| Composable | 替代/抽取 | 优先级 |
|---|---|---|
| `usePrintPreview` | `stores/app.js` (23 行) | P0 |
| `useStatsQuery` | `stores/stats.js` 内 load* 方法 | P0 |
| `useDisplayStrategy` | 响应式 displayStats(目前 Practice.vue 内) | P1 |
| `useChart` | chart.js 通用封装(StatsDrawer 内) | P2 |

**预计**: +300 行, 组件瘦身

### 阶段 4 — stores 瘦身 + 删 app.js(🟠 业务迁移)

**目标**: 业务规则从 store 移到 composable; 拆 `stores/app.js`

```
src/stores/  (当前 3 文件)
   ↓
src/stores/
├ practice.js                          状态字段, 业务规则 → usePracticeSaver
├ stats.js                             状态字段, 业务规则 → useStatsQuery
└ index.js                             桶导出
(删除 stores/app.js)
```

**预计**: -20 行

### 阶段 5 — components 目录归位(🟡 纯移动)

**目标**: 顶层 `components/` 收敛为"通用 widget"目录

```
src/components/
├ index.js                             统一导出
├ layout/        (现有 4 文件)
├ question/      (现有 4 文件)
├ input/         (现有 2 文件)
├ dialog/        ⭐ 新建: PracticeSummaryDialog / SelfEvaluationDialog
├ stats/         (现有 2 文件)
├ profile/       (现有 3 文件)
├ generate/      ⭐ 新建: Generate + 原 home/* 全部
└ dev/           ⭐ 新建: TestComponentView / TestHorizontalLayout
```

**移动清单**:
| 当前 | 目标 |
|---|---|
| `components/PracticeSummaryDialog.vue` | `components/dialog/PracticeSummaryDialog.vue` |
| `components/SelfEvaluationDialog.vue` | `components/dialog/SelfEvaluationDialog.vue` |
| `components/Generate.vue` | `components/generate/Generate.vue` |
| `components/home/*` (7 文件) | `components/generate/*` |
| `components/TestComponentView.vue` | `components/dev/TestComponentView.vue` |
| `components/TestHorizontalLayout.vue` | `components/dev/TestHorizontalLayout.vue` |

**预计**: 0 净增(纯移动), 改 import 路径

### 阶段 6 — 测试分区(🟢 加目录)

**目标**: 测试目录统一组织, 顶层 `tests/` 放集成/契约

```
tests/                                 ⭐ 新建顶层
├ stores/                              ⭐ 新增
├ composables/                         ⭐ 新增
├ services/
└ integration/
   └ fullSessionFlow.spec.js           ⭐ 新增
```

**vitest.config.js** 增:
```js
include: [
  'src/**/__tests__/**/*.spec.js',     // 沿用
  'src/**/*.spec.js',
  'tests/**/*.spec.js',                // 新增
]
```

**预计**: 0 净增(加目录)

### 阶段 7 — 验证 + 文档更新(🟢)

**目标**: 跑全链路验证, 更新架构文档"已落地"标记

- `npm run build` exit 0
- `npm test` 全过
- 浏览器手测: 诊断 → 评估 → 自适应 → 持久化 → 打印
- 更新 [ARCHITECTURE.md](./ARCHITECTURE.md) § 4.1 演进记录

---

## 3. 文件迁移总表

### 3.1 移动(不删, 改路径)

| 当前 | 目标 |
|---|---|
| `src/utils/services/analysis.js` | `src/services/analysis.js` |
| `src/utils/services/__tests__/analysis.spec.js` | `src/services/__tests__/analysis.spec.js` |
| `src/utils/database.js` | `src/utils/store/database.js` |
| `src/utils/database/__tests__/migration.spec.js` | `src/utils/store/database/__tests__/migration.spec.js` |
| `src/utils/configStorage.js` | `src/utils/store/configStorage.js` |
| `src/utils/adaptiveEngine.js` | `src/utils/algorithm/adaptiveEngine.js` |
| `src/utils/adaptiveBatch.js` | `src/utils/algorithm/adaptiveBatch.js` |
| `src/utils/diagnostic.js` | `src/utils/algorithm/diagnostic.js` |
| `src/utils/displayStrategy.js` | `src/utils/algorithm/displayStrategy.js` |
| `src/utils/equationParser.js` | `src/utils/algorithm/equationParser.js` |
| `src/utils/EquationSolver.js` | `src/utils/algorithm/EquationSolver.js` |
| `src/utils/paperGenerator.js` | `src/utils/algorithm/paperGenerator.js` |
| `src/utils/psm.js` | `src/utils/algorithm/psm.js` |
| `src/utils/formDefaults.js` | `src/utils/form/formDefaults.js` |
| `src/utils/timeFormat.js` | `src/utils/time/timeFormat.js` |
| `src/utils/abilityProfile.js` | `src/services/abilityProfile.js` (升层) |
| `src/utils/enum.js` | `src/constants/enums.js` (升层) |
| `src/components/PracticeSummaryDialog.vue` | `src/components/dialog/PracticeSummaryDialog.vue` |
| `src/components/SelfEvaluationDialog.vue` | `src/components/dialog/SelfEvaluationDialog.vue` |
| `src/components/Generate.vue` | `src/components/generate/Generate.vue` |
| `src/components/home/*` | `src/components/generate/*` |
| `src/components/TestComponentView.vue` | `src/components/dev/TestComponentView.vue` |
| `src/components/TestHorizontalLayout.vue` | `src/components/dev/TestHorizontalLayout.vue` |

### 3.2 新增

| 路径 | 职责 |
|---|---|
| `src/utils/algorithm/equationCore.js` | 合并 equationParser/EquationSolver 重复段 |
| `src/utils/form/formValidation.js` | validateTotalQuestions |
| `src/utils/store/persistedState.js` | localStorage 安全读写 |
| `src/utils/time/timeConstants.js` | 时区/格式化选项 |
| `src/utils/index.js` | utils 桶导出 |
| `src/services/sessionMetrics.js` | computeSessionTotalDuration |
| `src/services/chartBuilder.js` | buildTrendChart / buildOperatorChart |
| `src/services/operatorMap.js` | OPERATOR_DISPLAY / OPERATOR_NAME |
| `src/services/abilityProfile.js` | 从 utils/ 升来 |
| `src/services/index.js` | services 桶导出 |
| `src/composables/useDisplayStrategy.js` | 响应式 displayStats 状态 |
| `src/composables/useChart.js` | chart.js 通用封装 |
| `src/composables/usePrintPreview.js` | 替代 stores/app.js |
| `src/composables/useStatsQuery.js` | 替代 stats.js 业务规则 |
| `src/composables/index.js` | composables 桶导出 |
| `src/composables/__tests__/` | composable 单测目录 |
| `src/stores/index.js` | stores 桶导出 |
| `src/constants/thresholds.js` | FAST/SLOW/GOOD/BAD/MIN_GROUPS |
| `src/constants/enums.js` | 从 utils/enum.js 升来 |
| `src/constants/index.js` | constants 桶导出 |
| `src/components/dialog/index.js` | dialog 桶导出 |
| `src/components/generate/index.js` | generate 桶导出 |
| `src/components/dev/index.js` | dev 桶导出 |
| `tests/` | 顶层测试目录 |
| `tests/integration/fullSessionFlow.spec.js` | 端到端测试 |

### 3.3 修改(不删不挪, 只改内容)

| 路径 | 改动 |
|---|---|
| `vitest.config.js` | include 增 `tests/**/*.spec.js` |
| `src/components/Practice.vue` | 拆为容器 + 显示(放 v2.4) |
| `src/stores/practice.js` | 删 saveSessionToDB, 挪到 usePracticeSaver |
| `src/stores/stats.js` | 删业务规则, 留纯字段 |
| `src/router/index.js` | 视阶段 5 决定 /test 路由 |

---

## 4. 实施顺序与风险

| 阶段 | 内容 | 风险 | 净行数 | 第一个 PR |
|---|---|---|---|---|
| 1 | utils 内部子目录化 | 🟡 路径变动 | 0 | 拆 1 文件为示范 |
| 2 | services 升顶层 | 🟡 需补单测 | +200 | 先升 analysis.js, 后加 3 个新 |
| 3 | composables 补齐 | 🟠 续抽 250 行 | +300 | 先 usePrintPreview (替 app.js), 风险最低 |
| 4 | stores 瘦身 | 🟠 业务迁移 | -20 | 配合阶段 3 同步 |
| 5 | components 目录归位 | 🟡 纯移动 | 0 | 先 dialog/ 最小子目录 |
| 6 | 测试分区 | 🟢 加目录 | 0 | 与阶段 2 并行 |
| 7 | 验证 + 文档 | 🟢 | 0 | 最后 |

**总预计**: 7-10 个 PR, 跨度 4-6 周

---

## 5. 决策记录

| # | 决策 | 备选 | 选择 | 理由 |
|---|---|---|---|---|
| 1 | `services/` 位置 | ① `utils/services/` ② `src/services/` 顶层 | **②** | 领域服务是独立的一层, 与 utils/components 同级 |
| 2 | `utils/` 是否二次分类 | ① 平铺 ② 按子域分 | **②** | 避免未来膨胀, 桶导出兼容旧 import |
| 3 | `stores/app.js` 拆分 | ① 保留 ② 拆为 composable | **②** | "导航期间临时状态"不是 app 状态 |
| 4 | `components/home/` 改名 | ① 保留 ② 改 `generate/` | **②** | "home" 含义模糊 |
| 5 | 测试目录组织 | ① 全 `__tests__/` ② 顶层 `tests/` + 沿用 | **②** | 单元贴源码, 集成/契约放顶层 |
| 6 | 重构节奏 | ① 一次性 ② 渐进 7 阶段 | **②** | 范围控制, 风险低 |
| 7 | 死代码是否进执行计划 | ① 进 ② 仅记录 | **②** | 死代码梳理独立, 不与本轮重构耦合 |
| 8 | `apis/` 目录 | ① 保留 ② 删 | **②** | 1 文件且死(详见架构 § 3) |
| 9 | 弹窗目录 | ① 顶层 ② `dialog/` 子目录 | **②** | 与 stats/profile/generate 一致 |
| 10 | `utils/` 桶导出 | ① 强制新路径 ② 桶兜底 | **②** | 渐进迁移, 不破坏旧 import |

---

## 6. 不在本轮范围

### 6.1 死代码(见架构 § 3)

- 整文件死代码(`apis/paper.js` / `utils/request.js` / `utils/download.js` / `views/Home.vue`)
- 死符号(`enum.httpMapping` / `TestView.vue` / `stores/app.js` / `checkResult` / `solveByBruteForce` / `get_time` / `load()`)
- 死 import / 调试残留 / `console.log` 噪音
- 重复实现(9 项)
- 注释噪音

**清理时间**: 后续安排, 不与本轮重构耦合

### 6.2 bug 修复

- `totalDuration` 显示异常(总用时只反映末题时长)
- `responseTime` 兜底逻辑统一
- 旧 `practiceSessions.totalDuration` 数据迁移

**修复时间**: 架构落地后, 每个 bug 在新架构下有明确落点:
| Bug | 落点 |
|---|---|
| `totalDuration` | 新增 `services/sessionMetrics.js` |
| `responseTime` 兜底 | 在 `services/sessionMetrics.js` 复用 `services/analysis.getEffectiveResponseTime` |

### 6.3 大型组件拆分

- `Practice.vue` 1025 行 → 容器 + 显示
- 4 处 `practiceStore.saveSessionToDB` → `usePracticeSaver`(已抽, 待迁移)
- `handleAssessmentComplete` / `completeAdaptiveGroup` 250 行 → `useAdaptiveSession`(已抽, 待迁移)

### 6.4 其他延后项

- `equationCore.js` 抽取(合并 equationParser/EquationSolver/psm 重复段)
- `formDefaults.applyConfigToFormData` 推广(目前 3 处重复用 1 处)
- `useAbilityAnalysis` 接入调用链(PROGRESS.md "未接入调用链"项)
- 切换到 iconify 替代 element-plus/icons-vue
- 引入 vitest jsdom 环境
- i18n 准备

---

## 7. 元信息

### 7.1 文档关系

```
ARCHITECTURE.md (本文档的"上位")
    │ "是什么"
    │ - 分层模型
    │ - 目标目录
    │ - 死代码目录
    ▼
PLAN-v2-architecture-refactor.md (本文)
    │ "怎么做"
    │ - 7 阶段路线
    │ - 文件迁移总表
    │ - 实施顺序
    ▼
单 PR 描述
    │ "本次做了什么"
    │ - 改动了哪些文件
    │ - 验证了哪些场景
    ▼
PROGRESS.md
    │ "已落地状态"
    │ - 每阶段完成时间
    │ - 累计净行数
```

### 7.2 引用

- 架构文档: [ARCHITECTURE.md](./ARCHITECTURE.md)
- 现行服务层样板: `src/utils/services/analysis.js` (831 行, read-only query)
- 现行 composable 样板: `src/composables/useAdaptiveSession.js` (98 行)
- 现行常量样板: `src/constants/practice.js` (148 行)
- 历史: `.refactor-todo.md` A1-A5 / B-E / `.refactor-a1-plan.md`(A1 拆分已完成, 本计划是其续章)
- P2 体系: [PLAN-v2-ability-analysis.md](./PLAN-v2-ability-analysis.md)
- P0-P4 路线: [PLAN-v2-roadmap.md](./PLAN-v2-roadmap.md)

### 7.3 文档演进

- v2.3 起点 (2026-06-05): 草案, 待审
- 阶段 N 落地后: 在 § 2 对应阶段加 "✅" 标记
- 每完成一个阶段: 更新 § 3 文件总表(标记 ✅)
- 大版本变化时: 重新评审整套架构

---

## 8. 立即可做的事

> 本轮是"先修正架构, 文档审完再动". 当前状态是**文档已落地, 等用户审**.

**审完后第一步** (按阶段 1):
```bash
# 在 utils/form/ 下建新位置
mkdir -p src/utils/form
git mv src/utils/formDefaults.js src/utils/form/formDefaults.js
# 写 utils/index.js 桶导出(兼容旧 import)
# 验证 build + test
npm run build
npm test
```

更多 PR 节奏按 § 4 表格.
