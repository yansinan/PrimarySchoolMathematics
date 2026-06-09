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
|---

## 8. 元信息

- 编制时间：2026-06-08（v3 收尾 + ui 合并后）
- 关联：[ARCHITECTURE.md](./ARCHITECTURE.md) — "现在是什么"
- 关联：[README.md](./README.md) — 文档索引
- 完整日志（archived）：[_ARCHIEVED_02-PROGRESS.md](./_ARCHIEVED_02-PROGRESS.md)
- 完整计划（archived）：[_ARCHIEVED_04-PLAN-v2-architecture-refactor.md](./_ARCHIEVED_04-PLAN-v2-architecture-refactor.md) | [_ARCHIEVED_05-PLAN-v3-architecture-tuning.md](./_ARCHIEVED_05-PLAN-v3-architecture-tuning.md)
