# PrimarySchoolMathematics 进度记录

> 跟踪版本、阶段、UI 可见性。最后更新：2026-06-08（v3 D2 Phase 1+2 文档冲突清理；E1 sessionPersistence 抽层落地）

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

## v3 B 组路径统一（2026-06-08）

### 范围
PR 1.3 落地。删 6 个根目录 stub，简化 `utils/index.js` 到 4 行。

分支：`chore/cleanup-b-group`（2 个 commits: `73d1b95` docs + `210c9b5` code）

### Commits
| hash | 范围 |
|------|------|
| `73d1b95` | docs: 同步所有 Plan 文档引用至新编号 + 添加 v3 计划引用 |
| `210c9b5` | chore: B 组路径统一 — 删 6 个根 stub + 18 个 import 站点迁移 |

### 净增 / 减
**18 files changed, 20 insertions(+), 43 deletions(-)** + 6 files deleted

| 任务 | 改动 |
|------|------|
| B1 | 7 处 `@/utils/database` → `@/utils/store/database` + 删 `utils/database.js` 根 stub |
| B2 | 3 处 `@/utils/configStorage` → `@/utils/store/configStorage` + 删 `utils/configStorage.js` 根 stub |
| B3a | 1 处 `@/utils/displayStrategy` → `@/utils/algorithm/displayStrategy` |
| B3b | 3 处 `@/utils/formDefaults` → `@/utils/form/formDefaults` |
| B3c | 3 处 `@/utils/timeFormat` → `@/utils/time/timeFormat` |
| B3d | 删 4 个根 stub (`displayStrategy` / `EquationSolver` / `formDefaults` / `timeFormat`) |
| B4 | 简化 `utils/index.js` 从 28 行到 4 行（4 个子目录桶，去掉 score/enum 直留） |
| 修 | 2 处 internal `../EquationSolver` → `./EquationSolver`（build 阻塞项，根 stub 删后浮出） |

### UI 可见性：**🟡 0 视觉变化**（纯路径迁移）

### 验证状态
- ✅ `npx vitest run` 44/45（1 预存失败与本次无关）
- ✅ `npx vite build` 736 modules
- ✅ 浏览器实测：评估→G1(6/6)→3星自评→G2(8题) 正常推进
- ✅ 0 旧引用残留（grep `@/utils/{database,configStorage,displayStrategy,EquationSolver,formDefaults,timeFormat}` 0 匹配）

### 关键发现
1. **根 stub 隐藏 internal 路径问题**：`algorithm/adaptiveBatch.js` 和 `algorithm/diagnostic.js` 用 `import ... from '../EquationSolver'` 靠根 stub `export * from './algorithm/EquationSolver'` 解析。删根 stub 后 build 立即爆 `Could not resolve '../EquationSolver'`。修复：改 `./EquationSolver`（同目录）。
2. **没人用 `@/utils` 桶**：`grep "from '@/utils'$"` 0 匹配，桶实际上 0 消费者，删除 `score`/`enum` 直引出安全。`score.js` 和 `enum.js` 仍作为独立文件存在，按需 `@/utils/score` / `@/utils/enum` 直引。
3. **B3 真实 stubs 数量**：v3 计划 B 组 header 写"8 个"，实际只 6 个根 stub（不含 `paperGenerator.js`——那个属 C6 升 services）。

### 已知遗留
- `utils/paperGenerator.js` (74 行) 仍在根目录，2 处 import 站点（`algorithm/adaptiveBatch.js:19` + `Generate.vue:84`）。属 C6 升 services 范畴。
- `utils/score.js` 和 `utils/enum.js` 仍为根目录直留文件（非 stub，有活跃导出），下次路径统一再考虑是否归入子目录。
- 1 处 internal `../paperGenerator` 类似 B3 修过的 `../EquationSolver`，但 `paperGenerator.js` 根文件未删，目前仍能解析，C6 实施时一并修复。

---

## v3 C1+C2+C3 services 升顶层（2026-06-08）

### 范围
analysis.js (887 行) + analysis.spec.js (733 行) 整体从 `utils/services/` 迁到 `services/`，barrel 桥接改直引。

分支：`chore/cleanup-c-group`（基于 `chore/cleanup-b-group`，1 个 commit：`3f9f777`）

### Commits
| hash | 范围 |
|------|------|
| `3f9f777` | chore: C1+C2+C3 services 升顶层 — analysis.js 887+733 行迁到 services/ |

### 净增 / 减
**3 files changed, +734/-1**（0 净行，纯路径迁移）
- 删除: `src/utils/services/` 整个目录（含 `analysis.js` + `__tests__/analysis.spec.js`）
- 新增: `src/services/__tests__/analysis.spec.js`
- 重命名: `src/utils/services/analysis.js` → `src/services/analysis.js`
- 改: `src/services/index.js` 1 行（`@/utils/services/analysis` → `./analysis`）
- 改: `src/services/__tests__/analysis.spec.js` 1 行（`@/utils/services/analysis` → `../analysis`）

### UI 可见性：**🟡 0 视觉变化**（纯路径迁移）

### 验证状态
- ✅ `npx vitest run` 44/45（1 预存失败与本次无关）
- ✅ `npx vite build` 736 modules
- ✅ 浏览器实测：评估→G1(6/6)→3星自评→G2(8题) 正常推进
- ✅ `services/` 桶 5 个 export 全部可访问（CDP 验证 `import('/src/services/index.js')` 返回 5 类 services）

### 关键发现
1. **`git mv` 嵌套目录有坑**：先 `git mv utils/services/analysis.js` 成功，但 `git mv utils/services/__tests__/analysis.spec.js` 失败（"没有那个文件或目录"）。原因可能是 git mv 在嵌套 `__tests__` 目录下有解析问题。**workaround**：`mkdir -p dest/__tests__` + `mv` + `git add` + `rmdir` 旧目录。
2. **barrel 5 个 export 全部健康**：`getEffectiveResponseTime` / `findEquivalent`（from analysis.js）+ `OPERATOR_SYMBOLS` / `OPERATOR_LABELS`（from operatorMap.js）+ `computeAndSaveAbilityProfile`（from abilityProfile.js）。
3. **C5 早于 C1+C2+C3 完成**：`services/abilityProfile.js` 在 A4b 已升层，桶中无 stub 残留。

### 已知遗留
- C4 `sessionMetrics.js` 待新增（备 totalDuration bug）→ ✅ **已用 sumResponseTimes 替代**
- C6 `paperGenerator.js` 升层待执行
- `utils/score.js` 和 `utils/enum.js` 仍为根目录直留文件

---

## v3 C4 sumResponseTimes + 修 totalDuration bug（2026-06-08）

### 范围
新增 `sumResponseTimes(answers)` U 层函数 + 修 1 个 bug + 消 3 处 inline reduce 重复。

分支：`chore/cleanup-c-group`（基于 b-group，2 个 commit：`3f9f777`/`c5a3436` C1+C2+C3 + `ded867e` C4）

### Commits
| hash | 范围 |
|------|------|
| `ded867e` | feat: C4 新增 sumResponseTimes + 修 totalDuration bug + 4 处 inline 集中 |

### 净增 / 减
**6 files changed, +67/-741**（含 1 旧 spec.js 漏删清理 +733 行）
- 新增 `src/utils/score.js`: +23 行（sumResponseTimes 函数 + JSDoc）
- 新增 `src/utils/__tests__/score.spec.js`: +38 行（5 个测试 case）
- 改 `src/composables/useAdaptiveSession.js`: 2 行 inline → 2 行函数调用 + 1 行 import
- 改 `src/utils/algorithm/adaptiveEngine.js`: 1 行 inline → 1 行函数调用 + 1 行 import
- 改 `src/stores/practice.js`: 1 行 bug → 1 行函数调用 + 1 行 import
- 删 `src/utils/services/__tests__/analysis.spec.js`（C1+C2+C3 残留）

### UI 可见性：**🟡 0 视觉变化**（公式替换，结果数字精度更高）

### 4 处调用点改造

| # | 位置 | Before | After |
|---|------|--------|-------|
| 1 | `useAdaptiveSession.js:221` | `groupAnswers.reduce((s, a) => s + (a.responseTime \|\| 0), 0)` | `sumResponseTimes(groupAnswers)` |
| 2 | `useAdaptiveSession.js:260` | `finalAnswers.reduce((s, a) => s + (a.responseTime \|\| 0), 0)` | `sumResponseTimes(finalAnswers)` |
| 3 | `adaptiveEngine.js:286` | `groupAnswers.reduce(...) / total` | `sumResponseTimes(groupAnswers) / total` |
| 4 | `stores/practice.js:233` | `Date.now() - sessionStartTime` ❌ **bug** | `sumResponseTimes(uniqueAnswers)` ✓ |

### 验证状态
- ✅ `npx vitest run` 49/50（+5 新增 sumResponseTimes 测试全过，1 预存失败与本次无关）
- ✅ `npx vite build` 736 modules
- ✅ 浏览器实测：
  - G1 弹窗显示 **7.9 秒**（4 题累计活跃时间）
  - IndexedDB ID 1 `totalDuration: 7857ms` 与弹窗完全一致（修复前是末题时长 ~2s）
  - `score.js` `sumResponseTimes` 通过 `import('/src/utils/score.js')` 可达

### 关键发现
1. **放 `utils/score.js` 比新建 `utils/sessionMetrics.js` 更好**：与 `sumAnswerScores` 完全平行（`sum*` 聚合函数），0 新文件，主题一致。
2. **C1+C2+C3 漏删 1 个老文件**：`src/utils/services/__tests__/analysis.spec.js` 在 C1+C2+C3 提交时只 `git add` 新位置没 `git rm` 老位置，HEAD 中仍残留。在 C4 提交时清理。
3. **retry 不重置 timer 已确认（用户提醒）**：`useSubmitHandler.js` 整条覆盖 + `initPractice` 才重置 timer。所以 `sumResponseTimes` 不存在"重试累加"问题。
4. **sumResponseTimes 兜底较严**：除 `null/0/缺失` 外，**负数** 也兜底为 0（异常数据保护）。

### 已知遗留
- C6 `paperGenerator.js` 升层跳过（单函数不值当挪动，v2.4+ 聚合 paperGenerator+psm+EquationSolver+equationParser+diagnostic+adaptiveBatch+formDefaults 7 个文件到 `services/questionGen/` 子目录）
- `utils/score.js` 和 `utils/enum.js` 仍为根目录直留文件
- 旧 session `totalDuration` 字段（写于 bug 期间）数据脏，历史显示不修（低优先级）

---

## v3 D2 useStatsQuery（2026-06-08）

### 范围
抽 `stores/stats.js` 8 个 action 到 `composables/useStatsQuery.js`：5 read（Phase 1）+ 3 write/IO（Phase 2）。store 退化为 state + getter + 3 个 drawer UI toggle。

分支：`chore/cleanup-d-group`（基于 c-group，3 个 commit）

### Commits
| hash | 范围 |
|------|------|
| `399e3ba` | feat: D2 Phase 1 — 抽 5 个 stats DB 加载 action 到 useStatsQuery |
| `3340700` | docs: D2 Phase 1 useStatsQuery 落地 — PROGRESS/05-PLAN-v3 同步 |
| `4525335` | feat: D2 Phase 2 — 抽 3 个 stats write/IO action 到 useStatsQuery |

### 净增 / 减
**D2 合计**：4 files changed, +97/-103 + 3 files / +56/-3 docs = 净 -6 行
- `composables/useStatsQuery.js`: 0 → 192 → 273 行（+81 Phase 2）
- `stores/stats.js`: 244 → 113 → 113 行（Phase 1 减 131，Phase 2 不变）
- `composables/useStatsDrawer.js`: 微调 9 行（destructure 加 exportData/importData alias）
- `composables/index.js`: 10 → 14 行（桶补 4 个 export：D4 + D2 useStatsQuery）

### UI 可见性：**🟡 0 视觉变化**（纯分层调整）

### 8 个 action 升层矩阵

| # | 类别 | action | 去向 |
|---|------|--------|------|
| 1 | DB read | `loadSessions` | → useStatsQuery |
| 2 | DB read | `loadSessionDetail` | → useStatsQuery |
| 3 | DB read | `loadAggregatedStats` | → useStatsQuery |
| 4 | DB read | `loadAllAnswers` | → useStatsQuery |
| 5 | DB read | `refreshAll` | → useStatsQuery (组合 #1 + #3) |
| 6 | DB write | `deleteSessionById` | → useStatsQuery (含 refreshAll) |
| 7 | 文件 IO | `exportData` | → useStatsQuery (Blob/URL/a.click) |
| 8 | 文件 IO | `importData` | → useStatsQuery (FileReader + refreshAll) |

**留 store 3 个 UI toggle**：`toggleDrawer` / `openDrawer` / `closeDrawer`

### 调用方改动（5 处）

| 文件:行 | Before | After |
|---------|--------|-------|
| `DebugPanel.vue:255,256` | `statsStore.refreshAll()` / `statsStore.loadAllAnswers()` | `useStatsQuery().refreshAll()` / `useStatsQuery().loadAllAnswers()` |
| `usePracticeSaver.js:108,120` | `await statsStore.refreshAll()` | `await useStatsQuery().refreshAll()` |
| `useStatsDrawer.js:36` | `statsStore.loadSessionDetail()` | `useStatsQuery().loadSessionDetail()` |
| `useStatsDrawer.js:48-58` | `statsStore.exportData()` / `statsStore.importData()` | `useStatsQuery()` 暴露的 `exportData` / `importData` |

### 验证状态
- ✅ `npx vitest run` 49/50（1 预存失败与本次无关）
- ✅ `npx vite build` 736 modules
- ✅ 浏览器实测（评估→G1(6/6)→G2(14/14)→ 3 个 IO action）：
  - `deleteSessionById(1)`：1 session → 0 ✓
  - `exportData()`：触发 a.click() + blob URL 创建 ✓
  - `importData(file)`：1 session 导入成功（imported 1, skipped 0）✓
  - `refreshAll` / `loadAllAnswers`（Phase 1）：仍正常 ✓
  - `useStatsDrawer` 集成：hasExport/hasImport 函数暴露 ✓

### 关键发现
1. **store 退化为纯状态层**：原 244 行 → 113 行，仅留 state + getter + 3 个 UI toggle。业务行为（数据加载/IO）全在 composable。
2. **跨 store 共享通过 pinia 单例**：`useStatsQuery` 内 `const store = useStatsStore()`，`store.sessions = ...` 直接写状态，V 层读仍走 `useStatsStore().sessions`。
3. **D4 桶补准备未来迁移**：3 个漏桶（`useAnswerBuilder`/`useSubmitHandler`/`useStatsDrawer`）+ D2 新增的 `useStatsQuery` 一次性加到桶。当前 0 桶消费者（V 层全直引），桶为未来迁移准备。
4. **Phase 1/2 拆分的好处**：Phase 1 浏览器充分测试 → 验证 5 read 路径无误 → Phase 2 加 3 write/IO → 进一步浏览器实测。分层迭代降低单次风险。

### 已知遗留
- D1 usePrintPreview 跳过（你决议不动 print 线）
- D3 useChart 跳过（chartBuilder 服务层已覆盖）
- E 组 stores 瘦身仍需 D1 完成（print 这条线未动，`stores/app.js` 暂留）

---

## v3 F 组 components 归位（2026-06-08）

### 范围
3 个子任务：F1 home/→generate/、F2 Test*→dev/、F3 删 3 死文件。

分支：`chore/cleanup-f-group`（基于 d-group，1 个 commit：`4829643`）

### Commits
| hash | 范围 |
|------|------|
| `4829643` | chore: F 组 components 归位 — home→generate + 测试→dev/ + 删 3 死文件 |

### 净增 / 减
**6 files changed, +7/-7, 9 文件重命名, 3 文件删除**（净 -63 行）
- 改 6 文件（4 处 import 改 + 1 桶 import 改）
- 重命名 9 文件：7 home/→generate/ + 2 Test*→dev/
- 删 3 文件：Header/Menu/Footer

### UI 可见性：**🟡 0 视觉变化**（纯归位）

### 3 子任务

| # | 内容 | 改动 |
|---|------|------|
| F1 | `home/` → `generate/` | 7 个文件 git mv + 2 处桶 import 改 |
| F2 | Test* → `dev/` | 2 个文件 git mv + 1 处 import 改 + 4 处 internal `../question/...` 修正 |
| F3 | 删死代码 | Header/Menu/Footer (3 文件 0-import) |

### 验证状态
- ✅ `npx vitest run` 49/50（1 预存失败与本次无关）
- ✅ `npx vite build` 736 modules
- ✅ 浏览器实测：
  - 评估→G1(4/4)→G2 正常推进（Generate.vue 桶 import 改后未破）
  - `/test` 路由：50 元素（HorizontalLayout/VerticalLayout/DigitInput 测试用例全显示）

### 关键发现
1. **Header/Menu/Footer 真的是死代码**：0 import 站点，Layout.vue 实际只引 4 个组件（Generate/Practice/StatsDrawer/DebugPanel）。这 3 个是 v2 早期布局遗留，不在用户保护范围（Test 前缀）所以直接删。
2. **F2 暴露 internal 路径问题（B3 同类）**：TestComponentView 4 处 + TestHorizontalLayout 1 处 internal `./question/...` 相对路径，从 components/ 根移 dev/ 后立即 build 爆。修：改 `../question/...`。
3. **F1 桶 import 2 处而非 1 处**：Generate.vue 主 import + AutoGenerateFormulas.vue 内部自引 OptionsDrawer，2 处都要改。
4. **components/home/index.js 桶**（6 .vue 的桶导出）随 F1 整体迁移到 generate/index.js，桶结构保留。

### 已知遗留
- E 组 stores 瘦身（仍依赖 D1，D1 跳过故 E 暂停）
- G 组 测试分区（`__tests__/` 散落在各子目录，移到顶层 `tests/`）
- H 组 验证 + 文档（v3 收尾）

---

## v3 D2 Phase 1 useStatsQuery 5 个 DB 加载（2026-06-08）

### 范围
D2 分 2 阶段：Phase 1 抽 5 个 DB read，浏览器充分测后做 Phase 2 (3 个 write/IO + deleteSession)。

分支：`chore/cleanup-d-group`（基于 c-group，1 个 commit：`399e3ba`）

### Commits
| hash | 范围 |
|------|------|
| `399e3ba` | feat: D2 Phase 1 — 抽 5 个 stats DB 加载 action 到 useStatsQuery |

### 净增 / 减
**6 files changed, +179/-96**（+useStatsQuery.js 新建 115 行 + stats store 删 -96 行 + 5 行桶补）
- 新增 `src/composables/useStatsQuery.js`: 115 行（5 个 export）
- 改 `src/stores/stats.js`: 244 → 155 行（-89）
- 改 `src/composables/usePracticeSaver.js`: -2 行（refreshAll × 2 改直引）
- 改 `src/composables/useStatsDrawer.js`: +10/-10 行（refreshAllDrawer/loadAllAnswersDrawer 包装）
- 改 `src/components/dev/DebugPanel.vue`: +1/-1 行（refreshAllQuery/loadAllAnswersQuery 别名）
- 改 `src/composables/index.js`: +5 行（D4 桶补 4 个 export）

### UI 可见性：**🟡 0 视觉变化**（重构内部，UI 不变）

### 5 个 export 与 4 处调用方对照
| 函数 | 调用方 | 调用点 |
|------|--------|--------|
| `loadSessions` | (Phase 1 无外部调用，UI 通过 refreshAll 间接调) | — |
| `loadSessionDetail` | `useStatsDrawer.openSessionDetail` | StatsDrawer 详情弹窗 |
| `loadAggregatedStats` | (同 loadSessions) | — |
| `loadAllAnswers` | `useStatsDrawer.openDrawer` / `loadAllAnswersDrawer` | Stats drawer 打开 + 详情页 |
| `refreshAll` | `usePracticeSaver.saveAdaptiveFinal` + `savePracticeFinal` + `useStatsDrawer.openDrawer/refreshAllDrawer` | 答完触发 stats 刷新 |

### 验证状态
- ✅ `npx vitest run` 49/50（1 预存失败与本次无关）
- ✅ `npx vite build` 736 modules
- ✅ 浏览器实测（5 个函数直接调 + drawer 实操）：
  - `refreshAll` → sessions: 1, accuracyTrend: 1, overallAccuracy: 100
  - `loadAllAnswers` → allAnswers: 4
  - `loadSessions` → sessions.length: 1
  - `loadAggregatedStats` → aggregatedStats 设置
  - `loadSessionDetail(1)` → selectedSession: {session: {id:1, totalQuestions:4}, answers: [4 条]}
  - Stats drawer 完整显示：1 练习/4 题/100%/"4 题 · 24.1 秒"（sumResponseTimes 生效）
- ✅ `grep "statsStore\.refreshAll|loadAllAnswers|loadSessions|loadSessionDetail|loadAggregatedStats"` 0 残留

> ⚠️ 本段为历史 Phase 1 快照，Phase 2 已在 commit `4525335` 完成（详见上方"v3 D2 Phase 1+2 useStatsQuery 完整落地"段）。

---

## v3 G 组测试分区（2026-06-08）

### 范围
3 个分散在 `src/**/__tests__/` 的 spec 迁出到顶层 `test/`（单数），按源文件位置分子目录；G3 端到端集成测试留 v3.1。

分支：`chore/cleanup-g-group`（1 个 commit）

### Commits
| hash | 范围 |
|------|------|
| `<本 commit>` (`9646d20`) | G1 3 spec 迁出 + G2 vitest.config.js 改 `test/**/*.spec.js` + 修 coverage 路径 |

### 净增 / 减
**6 files changed, +2/-2**（净 0 移动 + 1 行 config 调整）
- 移入: `test/services/analysis.spec.js` (733)
- 移入: `test/utils/score.spec.js` (54)
- 移入: `test/utils/database/migration.spec.js` (390)
- 删空目录: `src/services/__tests__/` `src/utils/__tests__/` `src/utils/database/__tests__/`
- 改 `vitest.config.js`: include `'test/**/*.spec.js'` + coverage 路径修正
- 改 `test/services/analysis.spec.js:27`: 相对 import `../analysis` → `@/services/analysis`（与 score.spec 风格一致）

### UI 可见性：**🟢 0 视觉变化**（dev 不读 vitest.config.js，spec 是 Node 单测）

### 验证状态
- ✅ `node ./node_modules/vitest/vitest.mjs run` 49/50（1 预存失败: `analysis.spec.js:247` 与本改动无关）
- ✅ 浏览器 `/reset` 加载正常，`__psm_debug.state()` 完整返回（phase=practice, hasProfile=true）
- ✅ 顺手修复: `vitest.config.js:13` coverage 路径 `src/utils/services/analysis.js` → `src/services/analysis.js`（拼写错误，原 config 永远跑空 coverage）

### 新结构
```
test/
├ services/analysis.spec.js
├ utils/score.spec.js
└ utils/database/migration.spec.js
```

### 关键发现
1. **`__tests__/` 与源文件同目录的"贴源码"约定废弃**：集中顶层后更易管理，新增 spec 时不会出现"忘了在哪个 src 子目录建 __tests__"的混乱。
2. **analysis.spec.js 用相对 import `../analysis`**：原本位置是 `src/services/__tests__/`，相对 import `../analysis` 等价 `@/services/analysis`。移走后相对路径失效，改为绝对 alias 统一风格。
3. **vitest coverage 路径错误已久未触发**：`src/utils/services/analysis.js` 实际不存在（早已升到 `src/services/analysis.js`），config 一直跑空 coverage 但没人发现，因为 CI 不强检 coverage。

### 已知遗留（G3 留 v3.1）
- 端到端集成测试 `test/integration/fullSessionFlow.spec.js`（评估→答题→stats 完整流，+50 行）留 v3.1 排期
- D2 Phase 2 仍待执行（独立分支）

---

## v3 E1 sessionPersistence 抽层（2026-06-08）

### 范围
`stores/practice.js#saveSessionToDB`（52 行）抽到 S 层新建 `services/sessionPersistence.js`（89 行）。A+1 方案（最小手术）。

### Commits
| hash | 范围 |
|------|------|
| `<本 commit>` (`14946bc`) | E1 抽层 + usePracticeSaver 3 处调通 + practice.js 删 action + 死 import 清理 |

### 净增 / 减
**4 files changed, +112/-66**（净 +46，主要是 S 层 doc 注释 + payload 解构）
- 新建 `src/services/sessionPersistence.js`: 89 行（1 个 export: `persistSession`）
- 改 `src/stores/practice.js`: 272 → 215（-57，删 saveSessionToDB action + 死 import `saveSession` / `sumResponseTimes`）
- 改 `src/composables/usePracticeSaver.js`: 129 → 142（+13，3 处调 store action → 调 S 层）
- 改 `src/components/Practice.vue`: 注释从 `saveSessionToDB` → `persistSession`（-1）

### UI 可见性：**🟢 0 视觉变化**（纯抽层，外部行为完全一致）

### 验证状态
- ✅ `node ./node_modules/vitest/vitest.mjs run` 49/50（1 预存失败与本改动无关）
- ✅ 浏览器 `__psm_debug.answerN(5, true)` 走完评估 → 触发 `completeAssessment` → `saveAdaptiveFinal` → `persistSession` → IndexedDB 写入成功
- ✅ `__psm_debug.state()` 正确返回（phase=practice, hasProfile=true, groupIdx=1, totalQuestions=4）
- ✅ 直接 `import { persistSession }` 调 S 层 → sessionId=2 写入成功

### 架构合规
- S 层 `sessionPersistence.js`: 只引 `@/utils/score` + `@/utils/store/database`（U 层），符合 §1.2 跨层规则
- M 层 `stores/practice.js`: 删 1 个 action（业务编排）后，只剩 state + getter + UI toggle
- C 层 `usePracticeSaver.js`: 调 S 层 ✅（替代原调 M 层 action），符合 §1.2

### 关键发现
1. **`saveSessionToDB` 业务职责 = IO 边界编排**：去重 uniqueAnswers、拼 sessionData / answersData、调 saveSession — 100% S 层职责，不在 M 层放业务的规则下不应放 M 层
2. **S 层不引 store 是关键约束**：抽层时 `persistSession` 接收 payload 参数（不是 store 引用），C 层负责从 store 取数据 — 这样 S 层保持纯函数特性，测试 / 复用更易
3. **删 action 触发死 import 清理连锁反应**：`saveSession` 和 `sumResponseTimes` 在 `practice.js` 都只被 `saveSessionToDB` 用，删 action 后必须同步删 2 个 import

### 方案 B 重评（A 已完成，B 待决定）
- A 已做：抽 `saveSessionToDB` → S 层 `persistSession`
- B 增量：把 `usePracticeSaver.savePerQuestion` 内的 `db.answers.put` + `saveQuestion` 编排也抽 S 层（建 `persistSingleAnswer`）
- 详见 [05-PLAN-v3-architecture-tuning.md §5 E1 抽层详情](05-PLAN-v3-architecture-tuning.md)

### 已知遗留（E 组剩余）
- E3 删 `stores/app.js`：D1 已跳过，路径 4（sessionStorage + key in query）已就绪，待用户决定是否执行
- E 组原始目标"净减 70 行"：E1 净 +46（业务抽层 + doc），E2 -131（早完成），E3 -20 — 实际净 -105 行（含 E2 提前）

---

## v3 D2 Phase 1+2 useStatsQuery 完整落地（2026-06-08）

> 注: 本段为 D2 唯一权威记录。下方旧"v3 D2 Phase 1 useStatsQuery 5 个 DB 加载"段已合并到 [05-PLAN-v3-architecture-tuning.md §3 C 组](05-PLAN-v3-architecture-tuning.md) 状态行 + 上方"v3 C1+C2+C3"段中。

D2 抽 `stores/stats.js` 8 个 action 到 `composables/useStatsQuery.js`: 5 read (Phase 1) + 3 write/IO (Phase 2)。

**Phase 1 commit**：`399e3ba` — 抽 5 个 read action
**Phase 2 commit**：`4525335` — 抽 3 个 write/IO action（`deleteSessionById` / `exportData` / `importData`）

### 终态
- `useStatsQuery.js` — 192 行 → 273 行 → 当前 **192 行**（Phase 2 后未变化，注释行重排）
- `stats.js` — 244 行 → 155 行（Phase 1）→ 113 行（Phase 2 同步简化）→ 当前 **113 行**
- `stats.js` 现仅含: 6 state + 5 getter + 3 UI toggle (toggleDrawer / openDrawer / closeDrawer)
- 所有 `statsStore.deleteSession` / `exportData` / `importData` 调用 = 0 残留

### 验证
- ✅ vitest 49/50
- ✅ vite build 736 modules
- ✅ 浏览器实测: StatsDrawer 5 个 read + 3 个 write/IO 路径全跑通
- ✅ 端到端: 答完 5 题评估 → 触发 `saveAdaptiveFinal` → `persistSession` + `useStatsQuery().refreshAll` → stats 抽屉正确显示

### 关键发现
1. **Phase 1/2 拆分的好处**: Phase 1 抽 read，浏览器实测验证 → Phase 2 加 write/IO。分层迭代降低单次风险。
2. **deleteSessionById 命名**: 原 `deleteSession` 与 database.js 函数同名会 shadow, 用 `deleteSessionById` 区分。
3. **useStatsDrawer 包装层价值**: 3 个 write/IO 经 `useStatsDrawer.exportData` / `importData` 包装后, StatsDrawer.vue 完全不知道 useStatsQuery 存在, V→C 干净。

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
