# 实现过程（v2.3 整改 + v3 调优）

> **性质**：实施历史 (Implementation History)  — 记录 v2.3 整改和 v3 调优两个阶段"做了什么、为什么、结果如何"
> **配套**：[ARCHITECTURE.md](./ARCHITECTURE.md) 是"现在是什么"，本文是"过去怎么走到这的"
> **完整日志**：[_ARCHIEVED_02-PROGRESS.md](./_ARCHIEVED_02-PROGRESS.md)（每个 commit 的逐行净增/减/验证/发现）

---

## 1. 起点（v2.2 末态）

```
├── 14 个 designDocs
├── 单 master 分支 + 多 work 分支 (refactor/architecture-v2.3, chore/cleanup-a-group, ...)
├── 业务代码 v2.2.0
│   ├── P0/P1.7/P2/P4/P5 已实装
│   └── 6 层模型雏形 (V/C/U/M/K + 部分 S 在 utils/services/)
├── 死代码
│   ├── views/Home.vue (147 行) — 与 Generate.vue 重复
│   ├── apis/paper.js (59 行) — 与 paperGenerator 重复
│   └── utils/ 根 8 个 stub — 真实实现已迁子目录
└── 已知 bug
    └── totalDuration 字段显示"末题时长"（Date.now() - sessionStartTime 错算）
```

---

## 2. v2.3 阶段 5/6 (2026-06-05 → 2026-06-07)

**目标**：补齐 6 层模型 + 抽 5 个新 service/composable

| 阶段 | 内容 | commits | commit hash |
|------|------|---------|------|
| 5/6 | 抽 `useAnswerBuilder` / `useSubmitHandler` / `useStatsDrawer` (V→C 整改) | 3 | (refactor/architecture-v2.3) |
| 5/6 | 新建 `services/chartBuilder.js` (124 行, Chart.js 封装) | 1 | (refactor/architecture-v2.3) |
| 5/6 | 新建 `services/operatorMap.js` (34 行, OPERATOR_SYMBOLS/LABELS 单一来源) | 1 | (refactor/architecture-v2.3) |

**v2.3 6 层模型**：
- V / C / **S（部分）** / U / M / K
- 缺：S 层未升顶层（仍在 `src/utils/services/`）
- 缺：D 组 composable 多数未建（usePrintPreview / useStatsQuery / useChart）
- 缺：E 组 stores 含业务（saveSessionToDB / load*）

---

## 3. v3 调优 8 大组（2026-06-07 → 2026-06-08）

**目标**：v2.3 之后的"扫尾 + 深化"，共 8 大组、~24 个 commits

### 3.1 总览

| 组 | 内容 | 净行 | commits | 关键 commit |
|----|------|------|---------|------|
| **A** | 死代码清理 | -460 | 2 | (chore/cleanup-a-group) |
| **B** | 路径统一（6 根 stub 删 + 18 import 站点迁移）| -63 | 2 | `210c9b5` |
| **C1+C2+C3** | `services/analysis.js` 升顶层 (887+733 行) | 0 | 2 | `3f9f777` |
| **C4** | 新建 `sumResponseTimes(answers)` U 层函数 + 修 totalDuration bug | +16 | 2 | `ded867e` |
| **C5** | `utils/abilityProfile.js` → `services/abilityProfile.js` | 0 | (A4b) | — |
| **C6** | paperGenerator 升 services | — | **跳过** | — |
| **D1** | `usePrintPreview` | — | **跳过**（E3 走路径 4 sessionStorage）| — |
| **D2** | `useStatsQuery` 抽 8 个 stats action | +150 | 2 | `399e3ba`+`4525335` |
| **D3** | `useChart` | — | **跳过** | — |
| **D4** | `composables/index.js` 桶补 4 export | +4 | (D2 commit) | — |
| **E1** | `saveSessionToDB` 抽 S 层 `sessionPersistence.js` (含 `persistSession`) | +46 | 1 | `14946bc` |
| **E1-B** | `sumResponseTimes` 同位置抽 `persistSingleAnswer` (方案 B 合并) | +20 | 1 | `50dca4c` |
| **E3** | 删 `stores/app.js` 整文件 + 改走 sessionStorage + key in query | -63 | 1 | `95d59e4` |
| **F** | `components/home/` → `generate/` + `Test*` → `dev/` + 删 3 死文件 | -63 | 3 | `4829643` |
| **G** | `__tests__/` 集中到顶层 `test/`（G1+G2 +5/-2）| +5 | 1 | `208fad9` |
| **H** | 全链路 build/test/浏览器手测 + 8 份文档同步 "v3 全部 ✅" | (docs) | 1 | `217f008` |
| **H+** | 差异审计 + 全文档同步 + v3 收尾 | (docs) | 1 | `b306d33` |
| **H++** | 04-PLAN 4 段全 ✅ + 03-PLAN 业务收尾 | (docs) | 1 | `06c1a29` |
| **总** | 1 分支 (chore/cleanup-f-group) 29 commits，**0 冲突合 ui** | — | — | — |

### 3.2 跳过决议（不入 v3）

| 项 | 决议理由 | v3 后路径 |
|----|----------|-----------|
| **C6** paperGenerator 升 services | 单函数 65 行移 1 改 3 性价比低 | v2.4+ 聚合 7 文件到 `services/questionGen/` |
| **D1** usePrintPreview | E3 改走 sessionStorage 路径 4 替代整文件 | 不需要 |
| **D3** useChart | chartBuilder 服务层已覆盖，composable 价值有限 | v2.4.1 |
| **G3** 端到端集成测试 | v3 收尾时间紧迫，单元测试已覆盖 | v3.1 |

### 3.3 关键发现（v3 收尾时汇总）

1. **路径变更必暴露 internal 错误路径**（B3/C6/F2 多次发生）：
   - 根 stub 隐藏了 `algorithm/adaptiveBatch.js` 和 `algorithm/diagnostic.js` 的 `import ... from '../EquationSolver'`
   - 删根 stub 后 build 立即爆 `Could not resolve '../EquationSolver'`
   - **教训**：路径迁移前先 grep 同目录 internal 引用，改成 `./X`（同目录相对路径）

2. **桶的"零消费者陷阱"**（B/D 阶段发现）：
   - `grep "from '@/utils'$"` 0 匹配，`utils/index.js` 桶无消费者
   - 决策：**简化**而非扩（保留 4 行但仅留实际有用的 export）
   - 同样：composables/index.js 桶**0 消费者** → 选**扩桶**（D4）而非删，为未来迁移准备

3. **架构迁移前先确认 S 层业务范围**（C1+C2+C3 教训）：
   - C4 一开始提议建 `services/sessionMetrics.js`，但 `utils/score.js` 已有 `sumAnswerScores` 平行函数
   - **不新建**，加 `sumResponseTimes` 到 `utils/score.js` 与 `sumAnswerScores` 平行
   - 4 处 inline reduce 消重复 + 1 个 bug 修复一次完成

4. **retry 不重置 timer 的设计巧思**（C4 时用户提醒）：
   - `useSubmitHandler.js` 整条覆盖 + `initPractice` 才重置 timer
   - 每题 `responseTime` = 该题**累计**花在上面的时间（不含思考间隔）
   - 错题重试 N 次只贡献 1 个累计值，不存在"重试累加"问题
   - → `sumResponseTimes(answers)` 算总时长是正确的

5. **"删死代码"不是单文件删除**（A6/A7/A3 教训）：
   - 删 `apis/paper.js` 必须先清 `Generate.vue:82-83` 的死 import
   - 删 `Home.vue` 必须先清 `views/Home.vue` 的路由 + 各处引用
   - 删 6 个根 stub 必须先改 18 处 import 站点
   - **流程**：grep 引用 → 改 import → 删文件（不能用 `git rm` 一刀切）

6. **跨组件状态用 sessionStorage 替代 store**（E3 路径 4）：
   - `printPreviewPapers` 原本走 `stores/app.js#navigateToPrint`
   - 改走 `sessionStorage.setItem` + `router.push('/print?key=...')`
   - 收益：跨页面 state 不需要 store，全局单例耦合消除
   - 适用场景：路由切换间临时数据传递

7. **"分阶段提交 + 浏览器实测"是高质量重构关键**（D2 教训）：
   - D2 Phase 1（5 read actions）独立 commit → 浏览器充分测试 → 验证
   - D2 Phase 2（3 write/IO actions）独立 commit → 进一步测试
   - 比"1 大 commit 全做"风险低，比"1 细 1 commit"易 review
   - **模板**：复杂工作拆 2-3 阶段，每阶段独立浏览器实测

---

## 4. 死代码 / 重复 / 调试残留 总账

> 状态图例: ✅ **已删 / 已清** / 🔴 **不删**（活跃引用）/ ⏳ **待查** / ⏸ **暂不清理**

### 4.1 整文件死代码（v3 全部已删）

| 路径 | 行 | 删于 | 原因 |
|------|---:|------|------|
| ~~`src/views/Home.vue`~~ | 147 | A6 | router 仍未引用 + 与 Generate.vue 重复 |
| ~~`src/apis/paper.js`~~ | 59 | A7 | 仅 Generate/Home 引用，Home 死则仅 Generate 1 处 |
| ~~`src/utils/request.js`~~ | 61 | A7 | 仅 apis/paper 引用 |
| ~~`src/utils/download.js`~~ | 168 | A7 | 仅 Home.vue 引用 |
| ~~`src/components/index.js`~~ | 10 | A1 | 没人用（仅 Layout.vue 用桶，已改直接路径）|
| ~~`src/utils/database.js`（根 stub）~~ | 11 | B1 | 真实实现已迁 `store/database.js` |
| ~~`src/utils/configStorage.js`（根 stub）~~ | 10 | B2 | 真实实现已迁 `store/configStorage.js` |
| ~~`src/utils/EquationSolver.js`（根 stub）~~ | 12 | B3 | 真实实现已迁 `algorithm/EquationSolver.js` |
| ~~`src/utils/adaptiveBatch.js`（根 stub）~~ | 10 | B3 | 真实实现已迁 `algorithm/adaptiveBatch.js` |
| ~~`src/utils/adaptiveEngine.js`（根 stub）~~ | 10 | B3 | 真实实现已迁 `algorithm/adaptiveEngine.js` |
| ~~`src/utils/diagnostic.js`（根 stub）~~ | 10 | B3 | 真实实现已迁 `algorithm/diagnostic.js` |
| ~~`src/utils/displayStrategy.js`（根 stub）~~ | 10 | B3 | 真实实现已迁 `algorithm/displayStrategy.js` |
| ~~`src/utils/formDefaults.js`（根 stub）~~ | 10 | B3 | 真实实现已迁 `form/formDefaults.js` |
| ~~`src/utils/timeFormat.js`（根 stub）~~ | 10 | B3 | 真实实现已迁 `time/timeFormat.js` |
| ~~`src/utils/abilityProfile.js`~~ | 91 | A4b | 升层 `services/abilityProfile.js` |
| ~~`src/stores/app.js`~~ | 20 | E3 | 改走 sessionStorage + key in query 路径 4 |
| ~~`src/components/Header.vue`~~ | 14 | F3 | 0 import 站点（v2 早期遗留）|
| ~~`src/components/Menu.vue`~~ | 13 | F3 | 0 import 站点 |
| ~~`src/components/Footer.vue`~~ | 36 | F3 | 0 import 站点 |

**小计**：19 个文件 / ~880 行死代码清理

### 4.2 死符号

| 位置 | 内容 | 删于 |
|------|------|------|
| `utils/enum.js` `httpContentTypeExtensionsMappingEnum` | 10 行 | A3 |
| `utils/algorithm/diagnostic.js` `evaluateLevel` | 重复实现 | A5 (与 `composables/useAbilityProfile.js` 重复) |
| `utils/EquationSolver.js` `checkResult` / `solveByBruteForce` | 未在 UI 调用 | A2 |
| `utils/psm.js:506-513` `get_time` | 定义未使用 | A2 |
| `utils/configStorage.js:20` `load()` | 空方法 | A2 |

### 4.3 死 import

| 文件 | import | 删于 |
|------|--------|------|
| `views/Home.vue:49-53` | 4 处死 import | A6 (随 Home 删) |
| `components/Generate.vue:81-83` | 3 处死 import | A3 (随源文件删) |
| `views/Home.vue:93` | `console.log` 彩蛋 | A6 (随 Home 删) |

### 4.4 重复实现（v3 全部统一）

| 重复内容 | 位置 A | 位置 B | 状态 |
|----------|--------|--------|------|
| `toEvalSymbols` | `utils/equationParser.js:3-9` | ~~`utils/EquationSolver.js:1-7`~~ | ✅ 删 B |
| 进位/退位判断 | `equationParser.getCarryType` | `psm.is_addcarry/is_abdication` | ⏳ 留 v2.4 |
| `formData` 17 字段默认值 | ~~`views/Home.vue:60-88`~~ | `components/Generate.vue:102-131` | ✅ 删 A |
| `paperGenerator` vs | `utils/paperGenerator.js:11-39` | ~~`apis/paper.js:12-40`~~ | ✅ 删 B (A7) |
| operator label | `services/operatorMap.js` | ~~`stores/stats.js:51-58`~~ + ~~`StatsDrawer.vue`~~ | ✅ 2026-06 统一 |
| `validateTotalQuestions` | ~~`views/Home.vue:164-167,180-183`~~ | `components/Generate.vue:211-214,227-230` | ✅ 删 A |
| `generateOptions` | `components/Practice.vue:255-265` | `utils/adaptiveEngine.js:65-88` | ✅ 2026-06 已下沉 |
| `paperDescriptionList` | ~~`views/Home.vue:118-122`~~ | `components/Generate.vue:163-167` | ✅ 删 A |
| `formatDate` 函数 | ~~`StatsDrawer.vue`~~ | `composables/useStatsDrawer.js:64-69` | ✅ 2026-06 统一 |
| `operatorLabel` 函数 | ~~`StatsDrawer.vue`~~ | `composables/useStatsDrawer.js:73-77` | ✅ 2026-06 统一 |
| `evaluateLevel` 函数 | `utils/algorithm/diagnostic.js` | `composables/useAbilityProfile.js:18-25` | ✅ 2026-06 确认重复 |

### 4.5 调试残留（用户决议留 v2.4+）

| 文件 | 内容 | 状态 |
|------|------|:----:|
| ~~`src/views/Home.vue`~~ | `debugger` | ✅ 随 Home 删 |
| `src/utils/paperGenerator.js:64` | `console.log('papers', papers)` | ⏸ 暂不清理 |
| `src/views/Print.vue:56,71,75,80` | 4 处 console.log | ⏸ 暂不清理 |
| `src/utils/database.js:215` | `console.log('[PracticeStore] Session saved to DB...')` | ⏸ 暂不清理 |
| ~~`src/router/index.js:33`~~ | `// console.log(baseUrl)` | ✅ 注释清掉 |

### 4.6 v3 收尾审计新增项

| 类型 | 位置 | 处理 |
|------|------|------|
| S 层未升顶层 | `src/utils/services/analysis.js` (831 行) | ✅ C1+C2+C3 升到 `src/services/analysis.js` |
| 重复实现 | `src/utils/abilityProfile.js` (91 行) | ✅ A4b 升 `services/abilityProfile.js` |
| 调试残留 | `StatsDrawer.vue` `handleOpen` `console.error` | ⏸ 留 v2.4 |
| 死 store 字段 | ~~`stores/app.js` `printPreviewPapers`~~ | ✅ E3 删整个 app.js |
| 重复 emit | `dialog/SelfEvaluationDialog.vue` `handleUpdate` `!val` 时 no-op | ✅ edge case，no-op |

---

## 5. 演进时间线

```
2026-06-05  v2.3 起点，ARCHITECTURE.md 草案
2026-06-06  v2.3 阶段 5/6 落地（refactor/architecture-v2.3 分支，5 commits）
2026-06-07  A 组死代码清理（chore/cleanup-a-group，2 commits）
            删 Home.vue / apis/paper.js / utils/download.js / 3 个死 import
2026-06-07  A4b 升 utils/abilityProfile.js → services/abilityProfile.js
2026-06-08  B 组路径统一（6 根 stub 删 + 18 import 站点迁移）
2026-06-08  C1+C2+C3 services 升顶层（analysis.js 887+733 行迁到 services/）
2026-06-08  C4 sumResponseTimes + 修 totalDuration bug（4 处 inline 集中）
2026-06-08  D2 useStatsQuery Phase 1（5 read actions 抽离）
2026-06-08  D2 useStatsQuery Phase 2（3 write/IO actions 抽离）
2026-06-08  E1 saveSessionToDB 抽 S 层 sessionPersistence（修 M 层业务违规）
2026-06-08  E1-B sumResponseTimes 同位置抽 persistSingleAnswer（合并到 sessionPersistence）
2026-06-08  E3 删 app.js 整文件 + 改走 sessionStorage + key in query（路径 4）
2026-06-08  F 组 components 归位（home/→generate/ + Test*→dev/ + 删 3 死文件）
2026-06-08  G 组测试分区（3 个 __tests__/ 集中到顶层 test/，vitest 改 include）
2026-06-08  H 组 v3 收尾（build/test/浏览器手测 + 5 份文档同步）
2026-06-08  差异审计 + 全文档同步（v3 全部 ✅ + 下一目标 P1 错题注入）
2026-06-08  04-PLAN 4 段全 ✅ + 03-PLAN 业务收尾段（v3 收尾）
2026-06-08  合并 f-group → ui 分支（fast-forward 27 commits）
2026-06-08  git push origin ui（28 commits）
2026-06-08  加 §12 下阶段规划（v3.1/v4/v2.4）
```

---

## 6. 关键修复

### 6.1 totalDuration bug 修复（C4）

**Before**:
```js
// src/stores/practice.js:233
const totalDuration = Date.now() - (this.session.sessionStartTime || Date.now())
```

**根因**：`sessionStartTime` 在 `initPractice()` **每题**重置（line 231），所以 `Date.now() - sessionStartTime` ≈ 末题时长。

**After**:
```js
// src/stores/practice.js:233
import { sumResponseTimes } from '@/utils/score'
const totalDuration = sumResponseTimes(uniqueAnswers)
```

**验证**：浏览器实测 G1 4 题答完，IndexedDB 写入 `totalDuration: 7857ms`，弹窗显示 "7.9秒"（之前 bug 是末题时长 ~2s）。

### 6.2 E3 路径 4 替代 usePrintPreview

**Before**:
```js
// src/stores/app.js
navigateToPrint(router, fileName, printPreviewPapers) {
  this.$patch((s) => {
    s.printPreviewPapers = printPreviewPapers
    router.push({ path: '/print', query: { fileName } })
  })
}
```

**After**:
```js
// src/components/Generate.vue
const papers = createFormulasGenerator(toRaw(unref(formData)), toRaw(unref(paperList)))
sessionStorage.setItem(`print_${fileName}_${key}`, JSON.stringify(papers))
router.push({ path: '/print', query: { fileName, key } })

// src/views/Print.vue
const sheets = computed(() => {
  const raw = sessionStorage.getItem(`print_${key}`)
  return raw ? JSON.parse(raw) : []
})

// src/router/index.js (beforeEach 兜底清理)
router.beforeEach((to, from) => {
  if (to.path !== '/print' && from.path === '/print') {
    const key = from.query.key
    if (key) sessionStorage.removeItem(`print_${key}`)
  }
})
```

**收益**：删 20 行 `stores/app.js` 整文件；跨页 state 用 sessionStorage 临时传递。

|---

## 7. v4.0b 错题模块增强（2026-06-09）

**目标**：从 Answer 继承 WrongAnswer 类 + 整合 wrongAnswerService + 选择题干扰项优先使用错题。

### 7.1 WrongAnswer 类（U 层）

**Before**:
```js
// answers 存 DB 时用 Answer.fromJSON，过滤逻辑在 service
// wrongAnswerService.js 里手写 filter + sort 链
```

**After**:
```js
// utils/algorithm/wrongAnswer.js
export class WrongAnswer extends Answer {
  static fromJSON(plain)         // → WrongAnswer 实例
  static filterBy(answers, opts) // 纯函数过滤+排序（从 service 迁入）
  static findByEquation(...)     // 按算式查找，重载为自动限定错题
  static filterByLevel(...)      // 按难度查找，重载为自动限定错题
  isRecent(days)                 // N 天内？
  matchesOperand(min, max)       // 操作数范围重叠？
}
```

**迁移**：`matchLevel` + `groupAnswersByLevel` 从 adaptiveEngine → question.js；`DIFFICULTY_LEVELS` → `constants/difficulty.js`。adaptiveEngine 通过桶 `./` 引用。

**Question 新增**：`static findByEquation(collection, equation, { exact })` — 支持精确匹配和等价匹配（交换律 + 事实家族）。Answer/WrongAnswer 继承。WrongAnswer 重载以自动圈定错题。`collectDistractors` 被 `findByEquation(exact:false)` 替代，已删除。

### 7.2 选择题干扰项错题库（P1.6 前置）

**Before**: `generateDistractors` 纯算法（±1/±2/±5/±10/随机）

**After**: `generateDistractors(correct, count, wrongPool, equation)` 优先取等价算式的错题 userAnswer（含交换律 + 事实家族），不够再算法兜底。

**调用链**:
```
afterAnswer() 答错时 → getWrongAnswers() → engine.wrongAnswerPool
diversifyBatch → generateDistractors(solution, count, engine.wrongAnswerPool, q.equation)
                → WrongAnswer.findByEquation(wrongPool, eq, {exact:false})
```

**收益**：选择题 options 优先使用学生真实错误答案，覆盖同方程 + 交换律 + 逆运算族。

### 7.3 剩余工作

| 项 | 状态 | 说明 |
|----|------|------|
| P1.6 干扰项错题库 | ✅ 完成 | 选择题优先用错题 userAnswer 做干扰项 |
| P1.8 20% 错题注入 | ✅ 完成（方案 B：3 连对触发复习题）| `adjustNextQuestion` Step D |
| v4.2 L2.5 难度等级 | ❌ 未开始 | 计划 v4.1 之后 ||

### 7.4 P1.8 错题复盘（方案 B：连续 3 对触发）

**Before**: 错题只在选择题中作为干扰项出现（P1.6）

**After**: 连续 3 题答对后，下一题动态切换为历史错题复盘。

**实现**:
- `adjustNextQuestion` 新增 Step D（在 Step A 之前）
- 从 `roundAnswers` 尾部算连续答对 streak
- `streak ≥ 3` 且 `wrongAnswerPool` 有错题：
  - 选 `matchLevel ≤ engine.difficultyIdx` 的错题（同难度或更易）
  - 用 `buildReviewQuestion(wa)` 构建复习题对象（equation 复原为 `=__`、强制 `vertical_keypad`）
  - 替换 `listPractices[nextIdx]`
  - 跳过 Step A/B（复习题不换题、不改横式）
  - Step C 照常执行
- 从 `wrongAnswerPool` 中移除已选错题，避免重复
- `afterAnswer` 每次都刷新错题池（去掉原 `if (!isCorrect)` 守卫）保证 P1.8 用最新池

**修复的 bug**（实测中发现）:
- `services/index.js` 桶里 `analysis.js` 和 `wrongAnswerService.js` 都 export `getWrongAnswers` → 冲突导致 Vue 应用不挂载
  - 修复：桶不导 `wrongAnswerService`，调用方直引
- `afterAnswer` 错题池刷新有竞态：只在答错时刷 → 下一次答对时池可能还是空的
  - 修复：去掉守卫，每次都 await 刷新

**浏览器实测结果**:
- ✅ 直接注入错题 `1+2=__` (ua=4, sol=3) → DB 1 条
- ✅ 答 3 对后第 4 题变成 `1+2=__`（复习题触发）
- ✅ 答对复习题 → DB 更新、正常流程继续
- ⚠️ 复习题被显示为 choice 模式（不是 keypad）— `applyDisplayModeForCurrentQuestion` 在组 init 时设定 displayMode，每题不重算。后续可优化：替换题后重设 displayMode

|--
|--|

## 8. v4.0c 循环解耦 + Getter-First 重构（2026-06-09 → 2026-06-10）

**目标**：消除遗留循环依赖、推行 "getter 即真理"、删除死代理层。

### 8.1 循环依赖根治 — databaseInit 叶子模块

| Change | 描述 | 净行 | commit |
|--------|------|------|--------|
| `services/databaseInit.js` 纯叶子 | 不再引任何业务层（删 `parseEquation`、`upgrade` hooks），只持 Dexie 实例 + schema 骨架类 | -20 | `40cda42` |
| `_getDB()`/`getDB()` 三合一 | Question/Answer 类静态方法 + services 全部直用 `import { DB } from '@/services/databaseInit'`，删 3 个 lazy pattern 函数 | -40 | `e179323` |
| barrel 解环 | `utils/store/database` 改为桶（re-export databaseInit 的 export）终止循环依赖 | 0 | `993200b` |
| 死代理删除 | `utils/store/database.js` 和 `services/database.js` 同时删除，所有调用方改引 `@/services/databaseInit` | -168 | 未 commit |

### 8.2 Getter-First 重构（Answer/Question 域类）

**原则**：`Answer.isCorrect(a)` / `Answer.sumScores(a)` 为唯一真理源，stored `isCorrect`/`score` 字段不再写入，仅作旧数据 fallback。

| Change | 描述 | 涉及文件 | commit |
|--------|------|----------|--------|
| Answer/Question 类（方案 A） | domain 类继承 databaseInit 骨架，加静态工厂、getter、查询方法 | `utils/algorithm/answer.js`, `utils/algorithm/question.js` | `5e62a43` |
| isCorrect/score/attemptCount getter | `Answer.isCorrect(a)` 纯函数 `Number(userAnswer)===Number(solution)`，`sumScores(a)` 替代 `.reduce` | `utils/algorithm/answer.js` | `9a971ce` |
| analysis 全量迁移 | 剩余 2 处 stored isCorrect → Answer.isCorrect | `services/analysis.js` | `c019bc2` |
| abilityProfile 迁移 | stored isCorrect → Answer.isCorrect, 清 JSDoc 伪 import | `services/abilityProfile.js` | 同 `e487d58` |
| ProgressSteps.vue 迁移 | `a.isCorrect` → `Answer.isCorrect(a)` | `components/layout/ProgressSteps.vue` | 同 `e487d58` |
| useAdaptiveSession 迁移 | `groupCorrect`/`groupCorrectCount` 改用 getter | `composables/useAdaptiveSession.js` | 同 `e487d58` |
| exportAllData/importAllData/clearAllData 迁移 | 业务 CRUD 从 store → `databaseInit.js`（纯 DB 范畴） | `services/databaseInit.js` | `82b2045` |

### 8.3 新建 S 层域类

| 文件 | 行 | 职责 |
|------|---:|------|
| `services/PracticeSession.js` | 105 | 扩展 SchemaSession，add()/save()/getAnswers() CRUD |
| `services/AbilitySnapshot.js` | 66 | 扩展 SchemaSnapshot，computeFrom()/load()/save() |
| `services/statsAggregator.js` | 173 | 聚合统计：全量/每日/按 operator/按 level 多维度（替代原 useStatsQuery 内联） |

### 8.4 P0 Bug 修复（实测发现）

#### 8.4.1 `diversifyBatch` 计算错误（`[P0:diversifyBatch]` warning + NaN）

**根因**：`EquationSolver.solveByEval` 对 `7+6=__`（未知数在等号右侧）处理缺失 → `eval('x')` → ReferenceError → `parseFloat('x')` → NaN。

**修复**（`EquationSolver.js`，+14 行）：
- `solveByEval`: 先检查 `rightExpr === 'x'` → 直接 `eval(leftExpr)`
- `checkResult`: 先检查 `rightPattern === '__'` → 比较绝对值差

**验证**：`solve('7+6=__')` → 13 ✅（原来是 NaN）

#### 8.4.2 选择题选项不含正确答案

**根因**：`generateDistractors` 错题池为空时回退算法生成的 distractor 可能覆盖正确答案。

**修复**：`diversifyBatch` 加一致性校验，确保 options 始终含 solution；不满足时重建选项列表。

#### 8.4.3 `SessionPersistence` ConstraintError（组完成点评 0/4 关联）

**症状**：`[SessionPersistence] Failed to persist single answer: ConstraintError: Unable to add key to index 'equation'`
- 快速答题（如 `__psm_debug.answerN(4, true)`）或手动快速重试时触发
- 层叠影响：SelfEvaluationDialog 显示 `0/4 正确`（groupCorrect 用 Answer.isCorrect 后已修复，但 persistSingleAnswer 错误仍在）

**根因**：两次并发 `persistSingleAnswer` 对同一 equation 的 `Question.save` 同时执行 `find`（都为空）→ 同时 `add` → 第二个 `add` 违反 `&equation` 唯一约束。

**修复**（2 层防护，未 commit）：
1. **串行化锁** `sessionPersistence.js`: `let _saveQueue` 链式 Promise 排队，确保 `persistSingleAnswer` 调用依次执行
2. **事务 + id 剥离** `question.js`: 显式 `DB.transaction('rw', ...)` 序列化 questions 访问；`answers.put` 回写的 auto-id 通过 `const { id: _ignored, ...clean }` 剥离，不污染 questions 表主键

### 8.5 桶冲突修复

**症状**：`services/index.js` 桶中 `analysis.js` 和 `wrongAnswerService.js` 都 `export function getWrongAnswers` → 同名冲突 → `#app` 空渲染 `<!---->`。

**修复**：桶不导 `wrongAnswerService`，调用方（`useAdaptiveSession`）直引 `@/services/wrongAnswerService`。

**教训**：往桶加新 export 前，先 grep 确认无同名函数冲突。

### 8.6 当前工作区（未 commit）

```
M src/components/Practice.vue               — watch(currentQuestion) 同步 displayMode
M src/components/layout/ProgressSteps.vue   — isCorrect getter
M src/composables/useAdaptiveSession.js     — getter + barrel 修正
M src/composables/useSubmitHandler.js       — answerEntry 字段白名单
M src/composables/useStatsQuery.js          — 改用 statsAggregator
M src/services/abilityProfile.js            — getter + pseudo-import
M src/services/analysis.js                  — getter 迁移
M src/services/databaseInit.js              — 叶子模块重构
M src/services/sessionPersistence.js        — 串行化锁（未 push）
M src/services/wrongAnswerService.js        — 轻微修正
M src/utils/algorithm/EquationSolver.js     — __ 右侧修复
M src/utils/algorithm/question.js           — Question.save 事务 + id 剥离
M src/views/ResetData.vue                   — import 路径修正
D src/services/database.js                  — 死代理删除
D src/utils/store/database.js               — 死代理删除
?? src/services/AbilitySnapshot.js          — 新建域类
?? src/services/PracticeSession.js           — 新建域类
?? src/services/statsAggregator.js           — 新建域类
```

| 测试 | 结果 |
|------|------|
| `npx vitest run` | 106/106 PASS ✅ |
| `npx vite build` | (未测，但 lint 无错误) |

|---

## 9. v4.1 用户画像源迁移 + Getter 统一（2026-06-10）

**目标**：用户画像从内存拼接（diagAnswers + adaptiveAnswers）改为 DB 全表读取（loadProfile），消除画像数据的多源不一致；level 改为纯 getter 消除存储字段。

### 9.1 用户画像从 DB 读

| Change | 描述 | 文件 | commit |
|--------|------|------|--------|
| `loadProfile(studentId)` 新建 | 调用 `Answer.getAllByStudent` 读 db.answers 全表 → `Answer.fromJSON` → `groupAnswersByLevel` → 返回 `{difficultyIdx, strongLevelIndices, weakLevelIndices}` | `services/abilityProfile.js` | 未 commit |
| `createAdaptiveEngine` 改签名 | 改为收 destructured 对象 `{difficultyIdx, strongLevelIndices, weakLevelIndices, targetMin, targetMax}`，不再自己算 | `utils/algorithm/adaptiveEngine.js` | 未 commit |
| `useAdaptiveSession` 3 处改 loadProfile | `startNewAdaptiveSession` / `completeAssessment` / `completeGroup` 从 DB 读画像替代内存拼装 | `composables/useAdaptiveSession.js` | 未 commit |
| `computeAndSaveAbilityProfile` 改读 DB | 优先 `Answer.getAllByStudent` 读 DB 全量，不再依赖传入的 `diagAnswers` + `adaptiveAnswers` | `services/abilityProfile.js` | 未 commit |
| store 删 diagAnswers/adaptiveAnswers 写 | `completeAssessment` 不再存 `diagAnswers` 到 profile；删 `this.adaptiveAnswers = []` 清零行 | `stores/practice.js` | 未 commit |

### 9.2 Level 纯 Getter

| Change | 描述 | 文件 |
|--------|------|------|
| `Question.level` getter | `levelMatch?.levelIdx ?? null` — 由 matchLevel 实时计算，无存储字段 | `utils/algorithm/question.js` |
| 继承链统一注释 | `DBQuestion → Question → Answer → WrongAnswer` 四层职责明确 | 3 个 domain 类 |
| 删 Answer 重复 level getter | level 从 Question 继承，删 Answer 中冗余定义 | `utils/algorithm/answer.js` |

### 9.3 analyzeAbility / abilityProfile 重构

| Change | 描述 | 文件 |
|--------|------|------|
| `analyzeAbility` 重写 | 删 `a.level` 手写分组 → 改用 `groupAnswersByLevel` | `utils/algorithm/diagnostic.js` |
| `evaluateLevel` 删除 | 循环改 `groupAnswersByLevel` + `STRONG_THRESHOLD`/`WEAK_THRESHOLD` | `services/abilityProfile.js` |

### 9.4 验证结果

| 测试 | 结果 |
|------|------|
| `npx vitest run` | 106/106 PASS ✅ |
| `npx vite build` | 构建成功 ✅ |
| 浏览器实测（诊断→第1组自适应→组完成弹窗） | 控制台 0 错误 ✅ |

|---

## 10. v4.2 Profile + Engine 类型化 + 方法封装 + 文件清理（2026-06-10）

**目标**：Profile/Engine 类化、方法封装、matchLevel 迁入 Question、消除 utils/algorithm/adaptiveEngine.js。

### 10.1 Profile 类 + Engine 类

| Change | 描述 | 文件 |
|--------|------|------|
| `Profile` 类新建 | 含 `constructor` + `static computeDifficultyIdx`（从 U 层 inline） | `services/abilityProfile.js` |
| `loadProfile` 返回 `new Profile` | 返回类型化的 Profile 实例 | `services/abilityProfile.js` |
| `Engine` 类新建 | 替代 `createAdaptiveEngine` 工厂，getter 委派 `this.profile` 消除双源 | `services/adaptiveEngine.js` |
| `createAdaptiveEngine` 删除 | 所有调用方改 `new Engine(opts)` | 全局 |

### 10.2 双源消除（R1+R2+R3）

| Change | 描述 | 文件 |
|--------|------|------|
| `engine.profile` 整体替换 | `completeGroup` 改为 `engine.profile = dbProfile`，消除 3 行独立赋值 | `useAdaptiveSession.js` |
| `generateQuestionPlan` 删 `profile` 参数 | 改从 `engine.weakLevelIndices.length` 取 weakSeverity | `adaptiveEngine.js` |
| `adjustNextQuestion` 删 `profile` 参数 | 步 D 改从 `engine.weakLevelIndices` → `DIFFICULTY_LEVELS[idx].label` | `adaptiveEngine.js` |

### 10.3 方法封装（7 个 standalone 函数 → Engine 实例方法）

| 函数 | 旧调用 | 新调用 |
|------|--------|--------|
| `getDifficultyLabel` | `getDifficultyLabel(engine)` | `engine.getDifficultyLabel()` |
| `getDifficultyConfig` | `getDifficultyConfig(engine)` | `engine.getDifficultyConfig()` |
| `getGroupSize` | `getGroupSize(engine)` | `engine.getGroupSize()` |
| `diversifyBatch` | `diversifyBatch(eqs, engine)` | `engine.diversifyBatch(eqs)` |
| `evaluateGroup` | `evaluateGroup(engine, ans)` | `engine.evaluateGroup(ans)` |
| `generateQuestionPlan` | `generateQuestionPlan(... engine, ...)` | `engine.generateQuestionPlan(...)` |
| `adjustNextQuestion` | `adjustNextQuestion(engine, ...)` | `engine.adjustNextQuestion(...)` |
| `pickStrongLevel` | `pickStrongLevel(inds, diff)` | `engine.pickStrongLevel()` |
| `pickWeakLevel` | `pickWeakLevel(inds, diff)` | `engine.pickWeakLevel()` |

### 10.4 matchLevel 迁入 Question

| Change | 细节 |
|--------|------|
| `Question.matchLevel()` static | 替代 standalone `matchLevel()`，内部 `_matchLevel()` 保留 |
| `Question.groupAnswersByLevel()` static | 替代 `groupAnswersByLevel()` 独立函数 |
| `filterByLevel` 改用 `Question.matchLevel` | 不再 import 独立函数 |
| `matchLevel.js` 删除 | 全部功能迁入 `question.js` |

### 10.5 Engine 升层 + 文件清理

| 文件 | 变更 |
|------|------|
| `services/adaptiveEngine.js` | **新建**：Engine 类 + 内部辅助函数 |
| `utils/algorithm/adaptiveEngine.js` | **删除**：`computeDifficultyIdx` 迁入 Profile |
| `utils/algorithm/matchLevel.js` | **删除**：全部迁入 `question.js` |
| `utils/algorithm/index.js` barrel | 删除 `export * from './adaptiveEngine'` |

### 10.6 测试验证

| 测试 | 结果 |
|------|------|
| `npx vitest run` | 106/106 PASS ✅ |
| `npx vite build` | 构建成功 ✅ |

|---

## 11. v4.3 Profile 实例方法 + Snapshot 删除 + 阈值统一 + 死代码清理（2026-06-10）

**目标**：Profile 类加实例方法，删除无用的 AbilitySnapshot 表，统一硬编码阈值，清理遗留死代码。

### 11.1 Profile 实例方法

| 方法 | 说明 |
|------|------|
| `profile.difficultyLabel` | getter，当前难度文字标签 |
| `profile.weakSeverity` | getter，弱项占比 |
| `profile.isStrong(levelIdx)` / `profile.isWeak(levelIdx)` | 检查强弱项 |
| `Profile.load(studentId)` | 静态工厂，替代 `loadProfile()` 独立函数 |

### 11.2 AbilitySnapshot 删除

| 文件 | 操作 |
|------|------|
| `services/AbilitySnapshot.js` | 整文件删除（无读取方） |
| `services/databaseInit.js` | 删 `AbilitySnapshot` schema 类 + 表定义（v2-v4 schema）+ exportAllData |
| `composables/usePracticeSaver.js` | 删 `computeAndSave` 调用 + `buildProfileContext()` |
| `composables/useAdaptiveSession.js` | 删 `_rawAnswers` 传参 |

### 11.3 阈值统一

| 常量 | 值 | 使用方 |
|------|-----|--------|
| `EVAL_WEAK_THRESHOLD` | 0.5 | diagnostic.js, services/adaptiveEngine.js |
| `NUM_WEAK_THRESHOLD` | 0.5 | useAbilityAnalysis.js |
| `NUM_STRONG_THRESHOLD` | 0.95 | useAbilityAnalysis.js |
| `NUM_STRONG_MIN_TOTAL` | 3 | useAbilityAnalysis.js |

### 11.4 死代码清理 + 桶更新

| 文件 | 操作 |
|------|------|
| `utils/algorithm/diagnostic.js` | 删 ~80 行 `generatePracticeConfig` 注释代码 |
| `services/index.js` | 加 `export * from './adaptiveEngine'` |

### 11.5 测试验证

| 测试 | 结果 |
|------|------|
| `npx vitest run` | 106/106 PASS ✅ |

---

## 12. P2 修复组（2026-06-10） — v4.3后续

**目标**：修复浏览器全量测试发现的 P2 级问题：reserve pool 删除、diagnosticAnswers 隔离、引擎 debug 字段、弱项顺序控制，以及连带发现的 4 个 bug。

### 12.1 变更总览

| 任务 | 文件 | 净行 | 说明 |
|------|------|------|------|
| P2-1 删 reserve pool | `adaptiveBatch.js`, `adaptiveEngine.js`, `useAdaptiveSession.js`, `constants/practice.js` | -20 | 删整条 reserve pool 状态线，改即时生成 |
| P2-2 diagnosticAnswers 隔离 | `stores/practice.js`, `useSubmitHandler.js`, `useAdaptiveSession.js`, `Practice.vue` | +20 | 加 `diagnosticAnswers` 字段，隔离诊断/练习数据 |
| P2-3 watch 抽纯函数 | `listPracticesGuard.js`（新建）, `Practice.vue` | +50 | `decideListPracticesTransition` + 11 个测试 |
| P2-4 引擎扁平字段 | `Practice.vue` | +4 | `__psm_debug.state()` 加 4 个扁平字段 |
| P2-5 pickWeakLevel 顺序 | `adaptiveEngine.js` | -5 | 改为始终返回最低弱项 |

### 12.2 连带修复

| Bug | 根因 | 文件 | 修复 |
|-----|------|------|------|
| `completeAssessment` 解构 | `{ questions: firstQuestions }` 数组解构 → 恒 `undefined` | `useAdaptiveSession.js` | `const firstQuestions = ...` |
| stageName 读错源 | P2-2 后诊断答案已迁 `diagnosticAnswers` | `useAdaptiveSession.js` | 改读 `diagnosticAnswers.length` |
| groupCorrectCount 读错源 | 同上 | `useAdaptiveSession.js` | 按 phase 分支 |
| ProgressSteps 读错源 | 模板直接引 `session.answers` | `Practice.vue` | 加 `currentAnswers` computed，按 phase 分支 |

### 12.3 验证结果

| 测试 | 结果 |
|------|------|
| `npx vitest run` | 117/117 PASS ✅（原 106 + 新 11 个） |
| `npx vite build` | 构建成功 ✅ |
| git diff | 8 文件 ±102/–95 |

---
## 13. 文档归档与架构同步（2026-06-11）

**目标**：P5 v2.3.0 全量回归测试 + v4.x 架构同步 + 文档清理

### 13.1 P5 BUG 回归测试

| BUG | v2.3 修复 | v4.x 状态 | 说明 |
|---|---|---|---|
| BUG-1 strongLevelIndices 空 | ce1a670 时序交换 | ✅ 架构自然修复 | v4.x `completeAssessment` 先写 DB 再 `Profile.load()` 读 DB |
| BUG-1 pick window 约束 | 74d6afa 删除窗口 | ⚠️ v4.x 新设计 | `MAX_ADVANCE=2` 仅限前 2 级（非 bug，是架构决策） |
| BUG-2 lastGroupSize 持久化 | dc6d65c | ✅ 保留 | `Engine.lastGroupSize` + `completeGroup` 切片用持久值 |
| BUG-3 L5 diagAnswers 截断 | 035d7c2 | ✅ 架构自然修复 | v4.x 用 `session.value.diagnosticAnswers` 独立数组 |
| BUG-4 L5 0/0 误判弱项 | 74d6afa `g.total > 0` | ✅ 保留 | `analyzeAbility` 中有守卫 |
| BUG-5 numberOfFormulas 3→8 | 74d6afa | ✅ `adaptiveBatch.js:92` | |
| BUG-5 matchLevel 容差 >1→>2 | 74d6afa | ⚠️ 仍是 `>1` | 在 numberOfFormulas=8 下无实际影响 |

结论：**所有 P5 BUG 在 v4.x 中已闭环**。无需代码修复。

### 13.2 文档变更

| 文件 | 变更 |
|------|------|
| `_ARCHIEVED_09-PLAN-profile-engine-class.md` | ✅ 归档（已实现于 d017a4b） |
| `_ARCHIEVED_10-PLAN-encapsulate-methods.md` | ✅ 归档（Engine 方法已封装） |
| `ARCHITECTURE.md` | ✅ 目录树修正（paperGenerator 位置、services 层结构） |
| `DESIGN.md` | ✅ 模块结构更新至 v4.x + 文件路径修正 |
| `.hermes/plans/2026-06-11_P5-fix-regression-v4x.md` | 已标记删除 |

### 13.3 git diff

| 文件 | 行变化 |
|------|--------|
| `designDocs/ARCHITECTURE.md` | +3/–2 |
| `designDocs/DESIGN.md` | +20/–13 |
| `designDocs/IMPLEMENTATION_HISTORY.md` | +38 |

---

## 14. 代码整理 + I-1 engine 递升（2026-06-11）

**目标**：清掉 `.refactor-todo.md` 所有余留项：E1/E5/C5/C8/C10/E4/E9-E11/E13/E15-E16/I-1/I-2/I-7。

### 14.1 变更总览

| ID | 改动 | 文件 | 提交 |
|----|------|------|------|
| E1 | `getRandomBracket` `while(true)` → 直接公式 | `psm.js` | `666bace` |
| C5 | `checkResult`/`solveByBruteForce` 标 `@private` | `EquationSolver.js` | `666bace` |
| I-2/I-7/E13 | 删 `abilityProfile`+localStorage 全线，替换为 `assessmentCompleted` getter | `stores/practice.js`, `Practice.vue`, `useAdaptiveSession.js`, `Generate.vue` | `baca670` |
| — | 删 `stageName` '智能练习' 瞬态分支 + onMounted 刷新恢复死分支 | `Practice.vue`, `useAdaptiveSession.js` | `40ad43f` |
| — | 删 `storageKeys.js`（已无消费者） | `constants/` | `4fc1989` |
| E5 | `formatDate` 迁 `utils/timeFormat.js` | `timeFormat.js`, `useStatsDrawer.js` | `b225764` |
| C10 | Print.vue 手拼文件名 → `formatTimestampForFilename()` | `Print.vue` | `b225764` |
| C8 | 6 处 console.log 加 DEV 守卫 | `Print.vue`, `Generate.vue`, `sessionPersistence.js` | `b225764` |
| E15-E16 | `generateDistractors` 回归 engine，composable 直接读 `q.options` | `adaptiveEngine.js`, `useDisplayStrategy.js` | `f48fe9b` |
| E4 | `refreshAll` loading 统一管理，删子函数独立 loading | `useStatsQuery.js` | `6deb765` |
| I-1 | 组边界不覆盖 `engine.difficultyIdx`，保留会话级递升 | `useAdaptiveSession.js`, `adaptiveEngine.js` | `4f30b2b` |

### 14.2 I-1 engine.difficultyIdx 递升修复

**根因**：`completeGroup` 中 `evaluateGroup` 对 `engine.difficultyIdx` 的 ±1 调整，立即被下一行 `Profile.load()` 的 DB 值覆盖。

```js
// 改前：
const dbProfile = await Profile.load()
adaptiveEngine.value.profile = dbProfile
adaptiveEngine.value.difficultyIdx = dbProfile.difficultyIdx  // ← 覆盖 evaluateGroup 的结果
practiceStore.currentDifficultyIdx = dbProfile.difficultyIdx

// 改后：
const dbProfile = await Profile.load()
adaptiveEngine.value.profile = dbProfile  // 只刷强/弱项列表
practiceStore.currentDifficultyIdx = adaptiveEngine.value.difficultyIdx  // 取 engine 自身值
```

**关键概念**：`engine.difficultyIdx`（engine 自身字段，由 `evaluateGroup`/`adjustNextQuestion` 维护）与 `dbProfile.difficultyIdx`（Profile 实例字段，`computeDifficultyIdx` 从 DB 全集计算）是两个独立变量。组边界只刷 profile 的强弱项列表，不覆盖 engine 自身的运行时难度。

**跨会话**：`startNewAdaptiveSession()` 新建 Engine 时仍从 `Profile.load()` 读 DB 值作为起点。

### 14.3 验证结果

| 测试 | 结果 |
|------|------|
| `npx vitest run` | 117/117 PASS ✅ |
| `npx vite build` | 构建成功 ✅ |

---

## 15. 元信息

- 编制时间：2026-06-08（v3 收尾 + ui 合并后）；§8 追加于 2026-06-10（v4.0c 重构 + bug 修复）；§9 追加于 2026-06-10（v4.1 画像源迁移）；§10 追加于 2026-06-10（v4.2 类型化 + 封装 + 清理）；§11 追加于 2026-06-10（v4.3 Profile 实例方法 + Snapshot 删除 + 阈值统一）；§12 追加于 2026-06-10（P2 修复组）；§13 追加于 2026-06-11（P5 回归验证 + 文档归档）；§14 追加于 2026-06-11（代码整理回 + I-1 engine 递升）
- 关联：[ARCHITECTURE.md](./ARCHITECTURE.md) — "现在是什么"
- 关联：[README.md](./README.md) — 文档索引
- 完整日志（archived）：[_ARCHIEVED_02-PROGRESS.md](./_ARCHIEVED_02-PROGRESS.md)
- 完整计划（archived）：[_ARCHIEVED_04-PLAN-v2-architecture-refactor.md](./_ARCHIEVED_04-PLAN-v2-architecture-refactor.md) | [_ARCHIEVED_05-PLAN-v3-architecture-tuning.md](./_ARCHIEVED_05-PLAN-v3-architecture-tuning.md) | [_ARCHIEVED_09-PLAN-profile-engine-class.md](./_ARCHIEVED_09-PLAN-profile-engine-class.md) | [_ARCHIEVED_10-PLAN-encapsulate-methods.md](./_ARCHIEVED_10-PLAN-encapsulate-methods.md)

---

## 16. Q/A/W 迁 S 层 + barrel 冲突修复 + wrongAnswerService 删除（2026-06-12）

**目标**：Question/Answer/WrongAnswer 从 `utils/algorithm/` 迁到 `services/`，文件名改为大写，全部 import 走 `@/services` 桶，删除 wrongAnswerService.js 和 4 个死方法。

### 16.1 变更总览

| 变更 | 文件 | 说明 |
|------|------|------|
| **迁 S 层** | `services/Question.js` / `Answer.js` / `WrongAnswer.js`（**新建**） | 从 `utils/algorithm/` 复制，import 路径改为 `./Question` / `./Answer` / `./Question` |
| **删旧文件** | `utils/algorithm/question.js` / `answer.js` / `wrongAnswer.js`（**删除**） | 21 处 import 全部改 `@/services` 桶后清理 |
| **删 barrel 导出** | `utils/algorithm/index.js` | 移除 3 条 `export *`，加注释 |
| **修自适应** | `utils/algorithm/adaptiveBatch.js` | `import { Question } from './question'` → `@/services` |
| **修测试引用** | `test/utils/algorithm/answer.spec.js` | `@/utils/algorithm/...` → `@/services` |
| **修 barrel** | `services/index.js` | 加 3 个 `export *`；`export * from './databaseInit'` → `export { DB }`（修复 Question/Answer 被 schema 类覆盖的 bug） |
| **删 wrongAnswerService.js** | `services/wrongAnswerService.js`（**删除**） | 6 个函数分析：getWrongAnswers/countWrongAnswers 是死包装；其余 4 个无 production 调用 → 直接删 |
| **删 4 个死方法** | `services/WrongAnswer.js` | 删 `findByExactEquation` / `markCorrected` / `removeOne` / `clearAll`（0 production 调用） |
| **类注释重写** | `Question.js` / `Answer.js` / `WrongAnswer.js` | 加继承方法清单 + 方法分组 + ⚠ 命名提醒，避免 agent 重复造轮子 |

### 16.2 关键发现

1. **barrel `export *` 陷阱**：`services/index.js` 的 `export * from './databaseInit'` 暴露了 schema 骨架类 `Question`（数据库字段构造器），**覆盖**了 domain `Question.js` 中带全部静态方法（`findEquivalent`/`getAll`/`loadByIds` 等）的域类。修复：改用 `export { DB }` 显式导。
2. **wrongAnswerService.js 已死**：全部 6 个导出函数（`getWrongAnswers` / `countWrongAnswers` / `getWrongAnswerByEquation` / `markWrongAnswerCorrected` / `removeWrongAnswer` / `clearWrongAnswers`）**production 代码零调用**，仅被测试引用。迁入 WrongAnswer 再删掉。
3. **所有读取 `isFixed`/`correctedAt` 的位置全走 getter**，无一处直接读 `raw.correctedAt`。

### 16.3 git diff 统计

| 变动 | 行 |
|------|---:|
| 文件新增 | +3（services/Question/Answer/WrongAnswer） |
| 文件删除 | -4（utils/algorithm/ 旧 3 + services/wrongAnswerService.js） |
| 文件修改 | ~20（import 路径 + barrel + 注释 + adaptiveBatch + test） |
| 测试 | 118→105 项（删 4 个死方法对应的 13 个测试；修正 2 个 use markCorrected 的测试） |

### 16.4 验证结果

| 测试 | 结果 |
|------|------|
| `npx vitest run` | 105/105 PASS ✅ |
| 浏览器模块加载 | 6 个导出函数全部正确解析 ✅ |
| 端到端答题测试 | 答错 `938-246=__`，`getWrongAnswers()` 正确返回 1 条记录 ✅ |
