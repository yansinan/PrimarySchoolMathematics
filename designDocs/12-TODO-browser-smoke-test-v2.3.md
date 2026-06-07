# TODO — 浏览器冒烟测试清单 (refactor/architecture-v2.3)

> 文档性质：测试执行清单 (Smoke Test Checklist)
> 范围：refactor/architecture-v2.3 分支上 refactor 引入的所有改动 + 2 bug 修复的浏览器端到端验证
> 测试策略：使用 `window.__psm_debug` 调试接口（commit 37c02ab 在 `src/components/Practice.vue` L542-617 引入），绕过 DOM 点击的脆弱性
> 父文档：[PLAN-v2-architecture-refactor.md](04-PLAN-v2-architecture-refactor.md) § 验收标准
> 维护人：项目组
> 日期：2026-06-06

---

## 0. 关键事实

| # | 事实 | 取值 |
|---|------|------|
| F1 | 当前分支 | `refactor/architecture-v2.3` |
| F2 | 当前 HEAD | `fde6fbf` (chore(debug): 删 completeGroup / completeAssessment 调试入口) |
| F3 | 规则 | **仅测试 + 记录问题，不修代码** |
| F4 | dev server | `http://127.0.0.1:5173` （容器 4003 已挂载转发） |
| F5 | 测试 page | `72eec85c` (127.0.0.1:5173/home?final，**visible** — 主用) |
| F6 | 备用 page | `9eaeb135` (helix:4003，HTTP 000 需重启容器 — 备用) |
| F7 | 开始时间 | _待填_ |
| F8 | 状态图例 | ⬜ 待测 / 🟡 测中 / ✅ 通过 / ❌ 失败 / ⏭️ 跳过 |

---

## 1. `__psm_debug` 调试接口速查

> 引入于 commit `37c02ab`，定义在 `src/components/Practice.vue` L542-617。
> 在 DevTools Console 或 `page.evaluate(() => ...)` 中调用。

```js
// 1) 查询当前状态（同步、纯读、无副作用）
__psm_debug.state()
// → {
//   phase: 'idle' | 'assessment' | 'practice',
//   isAssessment: boolean,
//   groupIdx: number,           // 当前自适应组序号（0 = 第 1 组；评估阶段固定 0）
//   answersCount: number,       // session.answers 长度
//   correctCount: number,       // session.answers 分数求和
//   totalQuestions: number,
//   hasProfile: boolean        // 是否有能力画像（评估完成才有，诊断阶段为 false）
// }

// 2) 答当前题（同步）
__psm_debug.answer(isCorrect = true)
// → { ok, equation, answer, isCorrect }

// 3) 连续答 N 题（异步，串行等反馈动画）
__psm_debug.answerN(n, isCorrect = true) → Promise<{ ok, done }>
```

> ⚠️ `completeGroup` / `completeAssessment` 已删除 (commit `fde6fbf`); 现在只能用 `answerN` 模拟答完整组/整评估.

**典型组合**：

```js
// 场景 A: 走完整个评估（5 道诊断题全对）
await __psm_debug.answerN(5, true)
// 评估完成 → 弹 AssessmentSummaryDialog → 关弹窗 → 自动进自适应第 1 组

// 场景 B: 走完一组（10 题）
await __psm_debug.answerN(10, true)
// 答完 → 弹 SelfEvaluationDialog → 选表情 + 确认 → groupIdx + 1
```

---

## 2. 已验证项（前次烟测确认）

> 来自 commit 37c02ab 之前的前置烟测；snapshot/截图证据存档在 `docs/smoke-screenshots/pre-v2.3/`。

| # | 项目 | commit | 状态 | 证据 | 备注 |
|---|------|--------|------|------|------|
| V-1 | 错题重试上限（MAX_ATTEMPT_PER_QUESTION=3） | `0c5b0ad` | ✅ | snapshot 看到 alert "本题已重试 3 次, 跳过" | Bug 1 修复 |
| V-2 | 1 组完成后弹 SelfEvaluationDialog | `a6d96b5` + `37c02ab` | ✅ | snapshot 看到 dialog "💬 给这组题点个评" | Bug 2 修复 |
| V-3 | PR-7.3 setup 时序（`useAdaptiveSession` 注入 dialogs/saver） | `37c02ab` | ✅ | 浏览器 console 无 ReferenceError | 调试接口本体的 setup 验证 |

---

## 3. P0 — 本次 refactor 端到端流程

> 跑通 5 个跨组件/跨阶段的端到端路径，确认 refactor 没把数据流/控制流打散。

### T-1 · SelfEvaluationDialog 选表情 + 确认 → groupIdx + 1

**目的**
验证 `SelfEvaluationDialog`（PR-7.2 注入）确认后，自适应引擎正确推进到下一组，`groupIdx` 自增 1。

**方法**
> 入口上游条件：当前 `SelfEvaluationDialog` 已打开 (snapshot 确认 — 见 V-2 已通过项). 测试本节**仅验证表情选择 + 确认的交互**。
1. 等待 SelfEvaluationDialog 弹出，截图存证
2. 通过 DOM 操作点击表情（如 "👍"）+ 确认按钮
3. 调用 `state()` 断言 `groupIdx === 1`（或 +1），`phase === 'practice'`，新一组题已加载

**预期**
- `SelfEvaluationDialog` 弹出（snapshot 含 "💬 给这组题点个评"）
- 选表情 + 确认后，`state().groupIdx` 自增 1
- 浏览器 console 0 个 `error` 级日志

**状态**：⬜

---

### T-2 · 完整 handlePracticeComplete → PracticeSummaryDialog 弹

**目的**
验证一组完成后 `handlePracticeComplete` 流程完整跑通，最终弹 `PracticeSummaryDialog`（含 AbilityCard）。

**方法**
1. 打开 `/home?final`（或上游沿用 T-1/T-3 已就绪的自适应阶段）
2. 调 `__psm_debug.answerN(20, true)` 模拟答完 20 题 (跨多组, 覆盖完整 handlePracticeComplete 流程)
3. 看 PracticeSummaryDialog 是否在最后一组答完时弹出
4. 截图存证
5. 验证 dialog 内含 AbilityCard 元素（`.ability-card`）
6. 验证 AbilityCard 旧 props 渲染（标题 "📊 我的数学能力"）

**预期**
- `PracticeSummaryDialog` 弹出（snapshot 含 dialog 标题）
- 内含 `.ability-card` 节点
- AbilityCard 旧 UI 区域（level / accuracy / strong / weak）正常
- console 0 error

**状态**：⬜

---

### T-3 · 持久化 saver 写 IndexedDB

**目的**
验证 PR-7.2 注入的 saver 把 `session.answers` 持久化到 IndexedDB（questions 表 + answers 表）。

**方法**
1. 打开 `/home?final`
2. `answerN(5, true)` 走完评估
3. 用 `indexedDB.databases()` 或 `indexedDB.open('PSM_DB')` 查看数据库
4. 验证 `questions` 表新增了 5 条记录（去重后）
5. 验证 `answers` 表新增了 ≥ 5 条记录
6. 截取 IndexedDB 内容存证

**预期**
- IndexedDB schema version = 3
- `questions` 表有 `equation` 唯一约束生效（重试时 upsert）
- `answers` 表 `questionId` 外键关联到 `questions.id`
- 记录条数与 `state().answersCount` 一致

**状态**：⬜

---

### T-4 · AbilityCard 真实渲染（无 regression）

**目的**
验证 AbilityCard 在 refactor 后未引入渲染 regression（旧 props 仍能正常出 UI）。

**方法**
1. 打开 `/home?final`
2. 沿用 T-2 步骤触发 `PracticeSummaryDialog`
3. 截图存证：`smoke-screenshots/ability-card-real-1.png`
4. 对照 `PLAN-browser-smoke-test.md` 场景 2 的"全不传" baseline，视觉 diff
5. 验证 7 个旧 props（`statsTotal/Strong/Weak/Level/...`）渲染正常

**预期**
- 7 个旧 props 渲染的 UI 区域与 v2.2 baseline 一致
- console 0 warning（特别是"missing required prop"类）
- DOM 中无 v-for 报错 / 无 `<template>` 未闭合警告

**状态**：⬜

---

### T-5 · 诊断 → 评估 → 自适应完整路径

**目的**
验证从诊断（5 题）到评估完成到自适应多组推进的完整路径，包含中间所有 dialog 弹窗。

**方法**
1. 清 IndexedDB (访问 `/reset` 或 devtools → Application → IndexedDB → Delete database)
2. navigate `/home?final`
3. 用 `__psm_debug.answerN(4, true)` 答完 4 题评估 (沿用 commit fde6fbf 之前的 4 题评估配置; 旧文档里评估是 5 题, 实际当前是 4 题 — 以 `state().totalQuestions` 为准)
4. 看 phase 切到 `practice`, 题目从 4 选项变数字键盘, `groupIdx === 0`
5. 继续 `answerN(10, true)` 走完第 1 组 → SelfEvaluationDialog → 选表情
6. 继续 `answerN(10, false)` 走完第 2 组 → SelfEvaluationDialog → 选表情
7. 断言 `state().groupIdx === 2`
8. 完整截图 + 4 个 dialog 出现时各一张

**预期**
- 评估阶段 `phase === 'assessment'`，自适应阶段 `phase === 'practice'`
- 每次组完成 SelfEvaluationDialog 必弹
- 表情选择不抛错，确认后 groupIdx 必 +1
- 0 console error

**状态**：⬜

---

### T-6 · generateOptions 4 选项（评估阶段）

**目的**
验证评估阶段的题目生成器 `generateOptions` 输出 4 个选项（PR-2.x 算法层改动后未跑过真浏览器）。

**方法**
1. 打开 `/home?final`
2. 通过 DOM 抓取评估阶段第 1 题的 4 个选项按钮（`.option` 或类似 selector）
3. 验证 4 个选项互不相同
4. 验证正确答案在 4 个选项中
5. 截图存证

**预期**
- DOM 中恰好 4 个选项按钮
- 4 个数值互异
- 正确答案在 4 个选项内
- 0 console error

**状态**：⬜

---

## 4. P1 — commit 单点验证

> 每个 commit 一项，确认 refactor 单点行为符合预期。

### T-7 · dialog/ 子目录 import 正确（PR-4.1 / 7bcd58a）

**目的**
验证 `Practice.vue` 对 `dialog/SelfEvaluationDialog.vue` 等 dialog 组件的 import 路径在 `dialog/` 子目录化后正确解析。

**方法**
1. 打开 `/home?final`
2. console 执行 `import('/src/components/dialog/SelfEvaluationDialog.vue').then(m => console.log('OK', Object.keys(m)))`
3. 沿用 T-5 触发 SelfEvaluationDialog 弹窗
4. 验证 dialog 内容正常显示

**预期**
- dynamic import resolve 成功
- 弹窗内容与 refactor 前一致
- console 0 error（无 "Failed to resolve component" 类警告）

**状态**：⬜

---

### T-8 · handleInput/handleBackspace 合并（PR-5.1 / 1e23cf7）

**目的**
验证 `handleInput` / `handleBackspace` 合并后，数字输入 + 退格删除的交互路径未破。

**方法**
1. 打开 `/home?final`
2. 进入答题界面（评估或自适应皆可）
3. 模拟键盘输入数字 `5`，断言输入框显示 `5`
4. 按 Backspace，断言输入框清空
5. 连续输入 `1` `2` `3`，断言输入框显示 `123`
6. Backspace 一次，断言输入框显示 `12`
7. 截图存证

**预期**
- 数字输入正常
- Backspace 退格正常
- 数字拼接逻辑（digit 状态机）与 refactor 前一致
- console 0 error

**状态**：⬜

---

### T-9 · extractQuestionMetadata 抽离（PR-5.2 / 8ab46ba）

**目的**
验证 `equationParser.extractQuestionMetadata` 函数抽离后，Practice / StatsDrawer / AbilityCard 等调用方行为不变。

**方法**
1. 打开 `/home?final`
2. 浏览器 console 执行：
   ```js
   const { extractQuestionMetadata } = await import('/src/utils/equationParser.js')
   console.log(extractQuestionMetadata('23+47='))
   // 期望: { operands: [23, 47], operator: '+', result: 70, ... }
   ```
3. 完整答题流程（含错题），断言错题记录含正确的 metadata
4. 验证 `?equation` 解析（带空格、带负号等边界）不抛错

**预期**
- 函数导出正常
- 解析结果字段（`operands` / `operator` / `result`）与抽离前一致
- 错题记录的 metadata 字段在 IndexedDB / AbilityCard 输入都正确
- console 0 error

**状态**：⬜

---

### T-10 · 删 ElMessageBox 残留 CSS（PR-5.3 / 457d30b）

**目的**
验证删除 `ElMessageBox` 相关 CSS 类后，DOM 中无残留 node，build 产物体积未变化（即无死代码未删除）。

**方法**
1. 打开 `/home?final`
2. 完整 UI 走一遍（评估 + 自适应 + dialog 弹窗 + 退格 + 错题重试）
3. console 执行：
   ```js
   document.querySelectorAll('[class*="el-message-box"]').length
   // 期望: 0
   ```
4. 验证 `?final` query 参数仍生效（Practice.vue 留作调试用）

**预期**
- DOM 中无 `el-message-box` 残留节点
- 所有交互流程正常
- console 0 CSS warning（无 "undefined class" 类）

**状态**：⬜

---

## 5. P2 — v2.2 已知未测项

> v2.2.0 (P2) 收口时 0 视觉变化，遗留"未在真浏览器测过"的清单。

### T-11 · useAbilityAnalysis composable 实际接入

**目的**
验证 v2.2.0 阶段 6 引入的 `useAbilityAnalysis` composable 在 v2.3 接入 `useAdaptiveSession` 后能产出真实数据。

**方法**
1. 打开 `/home?final`
2. 走完评估 + 至少 1 组自适应
3. 在 `PracticeSummaryDialog` 弹窗后，console 执行：
   ```js
   // 找 useAbilityAnalysis 实例
   const app = document.querySelector('#app').__vue_app__
   // 实际拿法待确认（agent 需探索 Vue devtools API）
   ```
4. 验证 `statsMasteryByNumber` / `statsWeaknessV2` / `statsStrengthV2` / `statsWrongPriority` 4 个返回字段非空
5. 截图存证

**预期**
- composable 在真实答题后产出非空聚合结果
- 4 个字段与 v2.2 § 7 形状一致
- 0 console error

**状态**：⬜

---

### T-12 · 11 个新 service 函数调用

**目的**
验证 v2.2.0 阶段 2-5 引入的 11 个新 service 函数（`findEquivalent` / `findRelated` / `getMasteryByNumber` / `getWrongAnswers` / `evaluateCorrectionEffect` / `prioritizeWrongAnswers` / `getLearningCurve` / `getNumberCurve` / `getDynamicWeakness` / `getDynamicStrength` / ...）在真实 IndexedDB 数据下被实际调用且返回正确。

**方法**
1. 打开 `/home?final`
2. 走完评估 + 至少 1 组自适应（含错题）
3. console 执行：
   ```js
   const svc = await import('/src/services/abilityAnalysis.js')
   console.log(await svc.getMasteryByNumber())
   console.log(await svc.getDynamicWeakness())
   // ... 11 个
   ```
4. 验证返回数组/对象非空 + 字段完整
5. 截图存证

**预期**
- 11 个函数均可独立调用
- 真实数据下返回结果非空
- 0 console error

**状态**：⬜

---

## 6. P3 — AbilityCard props 边界场景

> 来自 [PLAN-browser-smoke-test.md](11-PLAN-browser-smoke-test.md) § 3 场景 1-4。
> v2.3 接入后，本节从"props 接收验证"升级为"props 真实数据 + 渲染验证"。

### T-13 · props 4 全传

**目的**
验证 4 个 v2 props 全传时，AbilityCard 不抛错且 props 接收正确。

**方法**
1. 打开 `/home?final`
2. 触发 `PracticeSummaryDialog` 弹窗（同 T-2）
3. console 注入 mock props（同 PLAN-browser-smoke-test.md § 3 场景 1）
4. 通过 `__vueParentComponent.props` 读取 4 个 key
5. 截图存证

**预期**
- 4 个 props 接收成功，值与注入 mock 一致
- AbilityCard 旧 UI 不破
- console 0 error

**状态**：⬜

---

### T-14 · props 4 全不传（向后兼容）

**目的**
验证 AbilityCard 4 个 v2 props 全不传时，default 值生效，老调用方行为不变。

**方法**
1. 打开 `/home?final`
2. 触发 `PracticeSummaryDialog` 弹窗
3. **不注入任何 mock**，完全走生产路径
4. 截图存证
5. 读取 `__vueParentComponent.props` 验证 default 值

**预期**
- `statsMasteryByNumber` === `{}`
- `statsWeaknessV2` / `statsStrengthV2` / `statsWrongPriority` 均为 `[]`
- 旧 UI 渲染与 v2.0 完全一致
- 0 console warning

**状态**：⬜

---

### T-15 · props 4 空数组

**目的**
验证 4 个 v2 props 传空数组/空对象（composable 在 DB 无数据时的实际行为）时，AbilityCard 不崩。

**方法**
1. 打开 `/home?final`（先清空 IndexedDB）
2. 触发 `PracticeSummaryDialog` 弹窗
3. 注入空 mock：
   ```js
   const mockEmpty = {
     statsMasteryByNumber: {},
     statsWeaknessV2: [],
     statsStrengthV2: [],
     statsWrongPriority: [],
   }
   ```
4. 验证 props 接收成功
5. 截图存证

**预期**
- 4 个 key 都在
- 旧 UI 不变
- 0 console error

**状态**：⬜

---

### T-16 · props 4 部分字段缺失

**目的**
验证 4 个 v2 props 部分字段缺失时（DB 数据稀疏场景），AbilityCard 不崩。

**方法**
1. 打开 `/home?final`
2. 触发 `PracticeSummaryDialog` 弹窗
3. 注入 sparse mock：
   ```js
   const mockPartial = {
     statsMasteryByNumber: { 0: 0.5, 1: 0.5 },  // 只有 2 个数字
     statsWeaknessV2: [{ questionId: 1, equation: '1+1=' }],  // 缺 total/correct/accuracy
     statsStrengthV2: [],
     statsWrongPriority: [{ questionId: 1, equation: '1+1=' }],  // 缺 operator/difficulty
   }
   ```
4. 截图存证

**预期**
- 4 个 key 都在
- 旧 UI 不变
- 0 console error（无 "Cannot read property of undefined"）

**状态**：⬜

---

## 7. 测试记录

> 测试完成后填写。每行一次测试的执行记录。

| # | 实际开始时间 | 实际结束时间 | 测试项 | 结果 | 截图/snapshot 路径 | 备注 |
|---|--------------|--------------|--------|------|--------------------|------|
| _ | _ | _ | _ | _ | _ | _ |

---

## 8. 问题汇总

> 测试中发现的所有问题在此登记，按发现顺序追加。**不修代码，只描述现象 + 建议。**

| # | 关联测试项 | 问题描述 | 严重度 | 复现步骤 | 建议 |
|---|------------|----------|--------|----------|------|
|| B-1 | T-4（静态分析） | `AbilityCard.vue` 删除了 `defineProps` 整体，但模板仍引用 `compact`，导致 compact 模式失效。`e9f3c4b` 合入了清理但未补回 compact prop。 | 🟠 高（regression） | 在 `e9f3c4b` 中合入 | ✅ **已修复并浏览器实测验证**：补回 `const { compact } = defineProps({ compact: Boolean })`，控制台无 compact 相关 warning |
|| B-2 | T-3（浏览器烟测） | **持久化 saver 不写 questions 表**。`savePerQuestion()` 只写 `db.answers.put(lastAnswer)`，整个 save 链路从未调用 `saveQuestion()`。实测：answers=18, sessions=3, abilitySnapshots=31, **questions=0**。Dexie 静默接受（`void` 丢弃 Promise），console 0 错误。 | 🟠 高（核心数据丢失） | 走完一轮评估→自适应→智能练习后，查 IndexedDB 的 questions 表为 0 | ✅ **已修复并浏览器实测验证**：`savePerQuestion()` 增加 `void saveQuestion(...)`。实测 questions=14（从 0→14）, answers=33, sessions=6 |
|| B-3 | T-1（浏览器烟测） | **SelfEvaluationDialog 关闭时序竞争**。`selectScore()` 的 `setTimeout` 中先后 `emit('select', score)` 和 `emit('update:visible', false)`，前者触发 `completeGroup()` 推进 groupIdx，后者关 dialog 时 groupIdx 已变、watch 把 dialog 重开。现场：groupIdx 成功推进但 dialog 残留不关。 | 🟡 中（UI 交互） | 完成一组 → 选表情 → 800ms 后 dialog 残留 | ✅ **已修复并浏览器实测验证**：改在 `onEvalSelect()`（父组件 C 层 composable）中关 dialog：`evalVisible.value = false`。关发生在 `completeGroup` async 恢复之前，watch 不会再重开。实测 dialog 正常关闭，group 正常推进。
|
|**严重度说明**：
- **P0** — 阻塞流程，无法继续测试
- **P1** — 主要功能 regression，必须修
- **P2** — 次要功能 / UI 细节 / 性能，可延后
- **P3** — 文案 / 注释 / 文档，不影响功能

---

## 9. 验收标准

- [ ] 16 项测试项（T-1 到 T-16）全部状态为 ✅ 或 ⏭️
- [ ] 0 个 P0/P1 问题遗留
- [ ] 测试记录表（§ 7）填写完整
- [ ] 问题汇总表（§ 8）按需填写
- [ ] 截图 / snapshot 归档至 `docs/smoke-screenshots/v2.3/`
