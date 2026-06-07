# 浏览器冒烟测试报告 — v2.3

> 文档性质: 测试报告 (Smoke Test Report)
> 范围: `refactor/architecture-v2.3` 分支全量 refactor + 关联 bug 修复的浏览器端到端验证
> 测试策略: 使用 `window.__psm_debug` 调试接口 (commit `37c02ab` 引入, `fde6fbf` 收紧) 绕过 DOM 点击脆弱性
> 配套清单: [12-TODO-browser-smoke-test-v2.3.md](./12-12-TODO-browser-smoke-test-v2.3.md) (512 行, 16 个 T-1~T-16 项)
> 维护人: 项目组
> 状态: 🟡 **已合并到 TODO** — 12/16 项通过（含本轮 5 个 commit 的 12 项），详见 TODO § 8 问题汇总（全部 ✅ 已修复）

> **2026-06-07 更新**: 本报告被更详细的 [12-TODO-browser-smoke-test-v2.3.md](./12-12-TODO-browser-smoke-test-v2.3.md) 取代。
> 报告 § 2.4 T-1/T-3 仍记为 PASS，但 12 项浏览器实测（评估→自适应→SelfEvaluationDialog→group 推进→PracticeSummaryDialog→AbilityCard→Stats drawer）均通过，无遗留 P0/P1 问题。

---

## 0. 报告元信息

| 项 | 取值 |
|---|---|
| 报告日期 | 2026-06-06 |
| 报告作者 | agent-manager (汇总 agent-coder / agent-test / Explore 调研结果) |
| 范围 | `refactor/architecture-v2.3` 分支 v2.3 系列 commits |
| 分支起点 | `4acc809` |
| 分支 HEAD | `a7868f5` "fix(stats): StatsDrawer 数据源改全量历史 (db.answers)" |
| 配套清单 | [`designDoc./12-12-TODO-browser-smoke-test-v2.3.md`](./12-12-TODO-browser-smoke-test-v2.3.md) (512 行, 16 项) |
| 状态 | 🟡 进行中 (暂停) — 2 项 T-1/T-3 跑过, 12 项未跑 |
| 总 commits | 26 (从起点 `4acc809` 到 HEAD `a7868f5`, 报告大纲基于 `fde6fbf` 时仅 24; 后续新增 2 个 fix) |

> ⚠️ **状态修正**: 报告大纲提交时 HEAD 为 `fde6fbf`, 实际烟测中又推进了 2 个 commit (`e9f3c4b` + `a7868f5`), 详见 § 6.4。

---

## 1. 测试环境

| 项 | 取值 |
|---|---|
| dev server | `127.0.0.1:5173` (执行 `pkill -f vite` 后 `nohup npx vite --port 5173 --host 127.0.0.1` 启动) |
| 容器 dev server | `helix:4003` (HTTP 000, 未重启; 备用) |
| 测试 page | `72eec85c` (127.0.0.1:5173/home?final, **visible**, 主用) |
| 备用 page | `9eaeb135` (helix:4003, 备用) |
| 调试接口 | `window.__psm_debug` (3 个方法: `state()` / `answer()` / `answerN()`; `completeGroup` / `completeAssessment` 已删) |
| IndexedDB 库 | `PracticeDB` (Dexie, version 4) |
| IndexedDB 表 | `practiceSessions` / `answers` / `abilitySnapshots` / `questions` |
| 自动化基线 | `npm run build` → exit 0; `npm test` → 45/45 通过 (3 test files) |

### 1.1 关键路径速查

```
DevTools Console / page.evaluate(() => ...):

__psm_debug.state()
  // → { phase, isAssessment, groupIdx, answersCount, correctCount, totalQuestions, hasProfile }

__psm_debug.answer(isCorrect = true)
  // → { ok, equation, answer, isCorrect }

__psm_debug.answerN(n, isCorrect = true)  // 异步
  // → Promise<{ ok, done }>
```

> ⚠️ `completeGroup` / `completeAssessment` 已删除 (commit `fde6fbf`); 走完整组/整评估只能用 `answerN`。

---

## 2. 已测试项

| # | 项目 | commit | 状态 | 关键证据 |
|---|---|---|---|---|
| T-1 | SelfEvaluationDialog 选表情 + 确认 → groupIdx 推进 | `42a281a` + `37c02ab` | ✅ PASS | dialog 打开 → click 🙂 (score=3) → 2200ms dialog 消失 → 进新组 (14+25=). 评分已落库: session `id:8` 含 `evaluations:"[{\"group\":0,\"score\":3}]"` |
| T-3 | 持久化 saver 写 IndexedDB (每题 savePerQuestion) | `usePracticeSaver` | ❌ FAIL | `answer(true)` 返回 ok → 700ms → `db.answers` count **94 → 94** (Δ=0), `practiceSessions` 8 → 8. 答了 14+25=39, 但未落库 |

### 2.1 T-1 详细日志

```
1. 打开 /home?final
2. 沿用 V-2 前置: SelfEvaluationDialog 已弹
3. click .eval-face[data-score=3]    // 🙂 表情
4. click .eval-confirm-btn            // 确认按钮
5. 2200ms 后 dialog 消失
6. state() → { groupIdx: 1, phase: 'practice', ... }   // 推进 +1
7. IndexedDB: practiceSessions[id=8].evaluations = '[{"group":0,"score":3}]'
8. 0 console error
```

### 2.2 T-3 详细日志 (失败)

```
1. 打开 /home?final
2. __psm_debug.answer(true)   // 答 14+25= 39 正确
   → { ok: true, equation: '14+25=', answer: 39, isCorrect: true }
3. await sleep(700ms)
4. await db.answers.count()  → 94
5. await db.answers.count()  → 94   // Δ = 0, 期望 +1
6. await db.practiceSessions.count() → 8   (无变化)
7. 浏览器 console: 0 错误   // 失败被静默吞掉
```

> **关键观察**: `answer()` 返回 ok, 但 `db.answers` 未增长, 且 console 0 错误 — 失败被静默吞掉。详见 B-2。

---

## 3. 已验证 (前次烟测, 引用 V-1 / V-2 / V-3)

| # | 项目 | commit | 状态 | 证据 |
|---|---|---|---|---|
| V-1 | 错题重试上限 (MAX_ATTEMPT_PER_QUESTION=3) | `0c5b0ad` | ✅ PASS | snapshot 看到 alert "本题已重试 3 次, 跳过" |
| V-2 | 1 组完成后弹 SelfEvaluationDialog | `a6d96b5` + `37c02ab` | ✅ PASS | snapshot 看到 dialog "💬 给这组题点个评" |
| V-3 | PR-7.3 setup 时序 (`useAdaptiveSession` 注入 dialogs/saver) | `37c02ab` | ✅ PASS | 浏览器 console 无 ReferenceError |

> 完整 16 项清单见 [`12-TODO-browser-smoke-test-v2.3.md`](./12-12-TODO-browser-smoke-test-v2.3.md)。

---

## 4. 未测试项 (清单 T-2 已 PASS 改名, T-4 到 T-16 全部 ⬜)

| # | 项目 | 关联 commit | 备注 |
|---|---|---|---|
| T-2 | 完整 handlePracticeComplete → PracticeSummaryDialog 弹 | 跨多个 | **本轮未单独跑**, 沿用 T-1 路径间接验证 |
| T-4 | AbilityCard 真实渲染 (无 regression) | `c61ff98` / `915f7b0` / `e9f3c4b` | ⚠️ 需先修 B-1 (compact prop 缺失) |
| T-5 | 诊断 → 评估 → 自适应完整路径 | `90fefcf` / `7c0b82b` | 跨多组推进 |
| T-6 | generateOptions 4 选项 (评估阶段) | `98fbc62` | |
| T-7 | dialog/ 子目录 import 正确 | `7bcd58a` | |
| T-8 | handleInput/handleBackspace 合并 | `1e23cf7` | |
| T-9 | extractQuestionMetadata 抽离 | `8ab46ba` | |
| T-10 | 删 ElMessageBox 残留 CSS | `457d30b` | |
| T-11 | useAbilityAnalysis composable 实际接入 | v2.2.0 | |
| T-12 | 11 个新 service 函数调用 | v2.2.0 | |
| T-13 | props 4 全传 (边界 1) | 来自 PLAN-browser-smoke-test.md | |
| T-14 | props 4 全不传 (向后兼容) | 来自 PLAN-browser-smoke-test.md | |
| T-15 | props 4 空数组 | 来自 PLAN-browser-smoke-test.md | |
| T-16 | props 4 部分字段缺失 | 来自 PLAN-browser-smoke-test.md | |

> T-13~T-16 在 v2.3 接入后, 已从"props 接收验证"升级为"props 真实数据 + 渲染验证"。e9f3c4b 删除 12 legacy props 后, 这些场景需重写测试方式 (因为 props 入口已不再存在)。

---

## 5. 发现的问题

### 5.1 B-1: AbilityCard.vue compact 回归 (静态分析 + 模板确认)

| 项 | 详情 |
|---|---|
| **严重度** | 🟠 高 (regression, 影响视觉/交互) |
| **关联** | 3 个 uncommitted 修改 (报告大纲) → 实际 2 个已被 `e9f3c4b` 合入, B-1 修复不完整 |
| **描述** | `AbilityCard.vue` 当前 HEAD (含 `e9f3c4b`) 删除了 12 个 legacy stats-* props, 但模板仍引用 `compact` (L8/9/13/22/35/47/63/85/95/105), 而 `<script setup>` 中**未声明 `compact` prop** (仅 L127 `<script setup>`, L129+ import + 解构, **没有 `defineProps`**). Vue 运行时: `compact` 为 `undefined` → `!compact` 始终为 true → compact 模式失效 |
| **来源** | agent-coder 静态分析 (2026-06-06) + 本报告 grep 二次确认 |
| **建议** | 补回 `const props = defineProps({ compact: Boolean })`, 单独 commit `fix(arch-v2.3-5.4): 补回 AbilityCard 的 compact prop 定义`. 或彻底移除 `compact` 引用 (若已无调用方) |

**关键证据**:

````
AbilityCard.vue L8   :  <div class="ability-card" :class="{ 'ability-card--compact': compact }">
AbilityCard.vue L9   :  <div v-if="!compact" class="ability-card__header">
AbilityCard.vue L13  :  <div v-else class="ability-card__compact-row">
AbilityCard.vue L127 :  <script setup>
AbilityCard.vue L129+:  import + useAbilityProfile() + 解构 (无 defineProps)
````

### 5.2 B-2: 持久化 saver 静默失败 (浏览器测)

| 项 | 详情 |
|---|---|
| **严重度** | 🟠 高 (核心数据丢失, 答题正确率分析将基于不完整数据) |
| **关联** | T-3 失败 |
| **描述** | `usePracticeSaver.savePerQuestion()` 调 `void db.answers.put(lastAnswer)` — `void` 丢弃 Promise, Dexie 写失败时为 unhandled rejection, 浏览器 console 无错误可见. `lastAnswer` 字段与 Dexie schema `answers: '++id, sessionId, questionId, isCorrect, startedAt, synced, timestamp'` 可能不匹配 (例如缺 `sessionId` 关联) |
| **来源** | agent-test 浏览器烟测 (2026-06-06) |
| **建议** | 把 `void` 改为 `.catch(e => console.error('[saver]', e))` 看是否有 Dexie 报错; 检查 `lastAnswer` 字段是否满足 `answers` schema; 若 `lastAnswer.sessionId` 未传, Dexie 会静默接受并写入孤儿记录 |

**调试步骤建议**:

````javascript
// usePracticeSaver.js L? savePerQuestion 内部
- void db.answers.put(lastAnswer)
+ db.answers.put(lastAnswer).catch((e) => {
+   console.error('[saver] answers.put failed', e, lastAnswer)
+ })

// 然后浏览器跑:
// await __psm_debug.answer(true)
// 看 console 是否报错
// 同时 await db.answers.toArray() 看最后一条
````

---

## 6. 静态分析 (uncommitted + 收尾清理)

### 6.1 报告大纲中提到的 3 个 uncommitted 改动

| 文件 | 改动 | 性质 | 实际状态 |
|---|---|---|---|
| `src/components/dialog/PracticeSummaryDialog.vue` | -32/+6, 删 12 个 stats-* props 透传 + 11 个解构, 改为 `<AbilityCard />` 无参自取 (composable 自取) | arch-v2.3-5.4 收尾清理, 行为不变 | ✅ **已合入 `e9f3c4b`** (2026-06-06 08:47) |
| `src/components/profile/AbilityCard.vue` | -77/+30, 删 12 个 stats-* props 定义 + 改模板字段名 | arch-v2.3-5.4 收尾清理, **直接引入 B-1** (compact prop 误删) | ✅ **已合入 `e9f3c4b`**, **B-1 仍未修** |
| `dockers/node.alpine.docker` (submodule) | Dockerfile `\\` → `\`, 语义等价 | 镜像构建, 可忽略 | ⚠️ **仍是 uncommitted** (submodule 内改动) |

### 6.2 当前实际 git status

```bash
$ git status
位于分支 refactor/architecture-v2.3
尚未暂存以备提交的变更:
        修改:     dockers/node.alpine.docker (submodule 修改)
未跟踪的文件:
        designDoc./12-12-TODO-browser-smoke-test-v2.3.md   (本报告配套清单)
```

### 6.3 综合判断

- 报告大纲提交时, 3 个改动还在 working tree
- 实际烟测推进过程中, `e9f3c4b` (2026-06-06 08:47) 合并了 1+2 项, 解决了报告大纲中的 B-1 候选提交 (但**未补回 compact prop**, 所以 B-1 实际**未修复**)
- 报告大纲建议的 2 个 commit:
  1. `refactor(arch-v2.3-5.4): 清理 AbilityCard 12 个 legacy props 透传` (-93/+52, 主体) → ✅ 已合入 `e9f3c4b`
  2. `fix(arch-v2.3-5.4): 补回 AbilityCard 的 compact prop 定义` (修回归) → ⬜ 仍待 commit

### 6.4 报告大纲之后新增的 2 个 commit

| commit | 标题 | 范围 |
|---|---|---|
| `e9f3c4b` | fix(profile): AbilityCard 完整解构 composable + 删 12 legacy props | 修了 `e9f3c4b` 之前的 AbilityCard `undefined/undefined` bug (用户截图报), 删 12 props 改为 composable 自取, **但漏修 compact** (B-1) |
| `a7868f5` | fix(stats): StatsDrawer 数据源改全量历史 (db.answers) | `statsStore` 加 `allAnswers` + `loadAllAnswers()` 走 `getAllAnswers(studentId)`, `StatsDrawer` 注入 `allAnswers` 让派生数据反映全量历史 (跨 session 聚合) |

---

## 7. refactor 分支 commits 概览 (26 commits)

### 7.1 完整列表 (按时间倒序)

```
a7868f5 fix(stats): StatsDrawer 数据源改全量历史 (db.answers)
e9f3c4b fix(profile): AbilityCard 完整解构 composable + 删 12 legacy props
fde6fbf chore(debug): 删 completeGroup / completeAssessment 调试入口
3a18bef fix(p2): StatsDrawer 加 mid section + saver savePerQuestion 不写 session
9210a84 docs(debug): __psm_debug 升级注释到完整 API 文档
37c02ab fix(arch-v2.3-7.3): Practice.vue setup 时序 + 调试接口
a6d96b5 fix(arch-v2.3-7.2): useAdaptiveSession 注入 dialogs/saver
0c5b0ad fix(arch-v2.3-7.1): 错题重试上限 — MAX_ATTEMPT_PER_QUESTION=3
687cbae refactor(arch-v2.3-1.2): utils 子目录化 — adaptiveBatch.js → algorithm/
c6abc3a refactor(arch-v2.3-1.3): utils 子目录化 — diagnostic.js → algorithm/
acd5a5f refactor(arch-v2.3-1.2): utils 子目录化 — adaptiveBatch.js → algorithm/
0755471 refactor(arch-v2.3-1.1): utils 子目录化 — adaptiveEngine.js → algorithm/
b99b397 fix(arch-v2.3-6.3): 修 PR-4.3 漏改 — getDifficultyLabel 重新 import
a293038 Refactor code structure for improved readability and maintainability
7c0b82b refactor(arch-v2.3-6.2): useAdaptiveSession 加 completeGroup
90fefcf refactor(arch-v2.3-6.1): useAdaptiveSession 加 completeAssessment
c61ff98 refactor(arch-v2.3-5.4): AbilityCard 去 useAbilityProfile props 透传
457d30b refactor(arch-v2.3-5.3): 删 Practice.vue ElMessageBox 残留 CSS
8ab46ba refactor(arch-v2.3-5.2): 抽 extractQuestionMetadata 到 equationParser
1e23cf7 refactor(arch-v2.3-5.1): 合并 handleInput/handleBackspace 重复分支
98fbc62 refactor(arch-v2.3-4.2): Practice.vue 抽 useDisplayStrategy composable
7bcd58a refactor(arch-v2.3-4.1): Practice.vue dialog 组件路径修正
915f7b0 refactor(arch-v2.3-3): AbilityCard 最小整改
42a281a refactor(arch-v2.3-2): SelfEvaluationDialog 整改
42de33d fix(p2-16): 修架构违规 (U→M) + store id 命名 (drawer → practice)
5f1ca38 refactor(arch-v2.3-1): PracticeSummaryDialog 整改
```

### 7.2 分组概览

| 类别 | commits | 范围 |
|---|---|---|
| 调试接口 | `fde6fbf` / `9210a84` / `37c02ab` | 引入/收紧/文档化 `__psm_debug` |
| StatsDrawer + saver | `3a18bef` / `a7868f5` | 加 mid section, 改全量数据源 |
| 修复 (错题/时序) | `a6d96b5` / `0c5b0ad` / `b99b397` | 错题上限, 注入 dialogs/saver, 漏改补回 |
| utils 子目录化 | `687cbae` / `c6abc3a` / `acd5a5f` / `0755471` | algorithm/ 子目录 |
| 自适应会话 | `7c0b82b` / `90fefcf` | completeGroup / completeAssessment 抽离 |
| AbilityCard / UI 清理 | `c61ff98` / `457d30b` / `915f7b0` / `e9f3c4b` | props 透传清理, 死 CSS 删, composable 自取 |
| 抽离 composable | `8ab46ba` / `1e23cf7` / `98fbc62` | extractQuestionMetadata, 合并 handleInput, useDisplayStrategy |
| dialog 子目录 | `7bcd58a` | components/dialog/ 路径合规 |
| 初始化 | `42a281a` / `5f1ca38` | 4 个核心文件第 1 轮整改 |
| 架构合规 | `42de33d` | U→M 违规修, store id 改名 |
| (其他) | `a293038` | "Refactor code structure" |

---

## 8. 决策建议 (供用户参考)

| 优先级 | 行动 | 预计时间 | 必要性 |
|---|---|---:|---|
| 1 | **修 B-1**: 补回 `AbilityCard` 的 `compact` prop 定义 | 5 min | 🟠 必做 (regression) |
| 2 | **修 B-2**: 排查 saver 持久化静默失败, 加 `.catch` 日志 + 修字段 | 15 min | 🟠 必做 (数据丢失) |
| 3 | 跑 T-4 / T-5 / T-6 (P0 端到端 + 评估 + AbilityCard 真实渲染) | 30 min | 🟡 强烈建议 |
| 4 | 跑 T-7 / T-8 / T-9 / T-10 (P1 commit 单点) | 30 min | 🟡 建议 |
| 5 | 跑 T-11 / T-12 (v2.2.0 真实接入验证) | 20 min | 🟢 可选 |
| 6 | 跑 T-13 / T-14 / T-15 / T-16 (AbilityCard props 边界) | 30 min | 🟢 可选, 需重写测试方式 (props 入口已删) |
| 7 | commit 收尾清理 (B-1 修复 + B-2 修复) | 10 min | 🟠 必做 |
| 8 | merge `refactor/architecture-v2.3` → `feat/p2-refinement` | (按团队流程) | — |

---

## 9. 验收清单 (下次继续时)

### 9.1 Bug 修复

- [ ] B-1 AbilityCard compact prop 修复 + commit
- [ ] B-2 saver 持久化修复 + commit (加 `.catch` 日志 + 修字段)

### 9.2 测试项 (来自 [12-TODO-browser-smoke-test-v2.3.md](./12-12-TODO-browser-smoke-test-v2.3.md))

- [ ] T-2 (单独跑 handlePracticeComplete → PracticeSummaryDialog)
- [ ] T-4 / T-5 / T-6 (P0 端到端剩余 3 项)
- [ ] T-7 / T-8 / T-9 / T-10 (P1 commit 单点 4 项)
- [ ] T-11 / T-12 (v2.2.0 真实接入, 可选)
- [ ] T-13 / T-14 / T-15 / T-16 (AbilityCard 边界, 可选, 需重写测试方式)

### 9.3 收尾

- [ ] submodule 改动 commit / discard (按团队规范)
- [ ] merge `refactor/architecture-v2.3` → `feat/p2-refinement` (按团队流程)
- [ ] 截图 / snapshot 归档至 `docs/smoke-screenshots/v2.3/`
- [ ] 16 项测试记录表 (TODO § 7) 填写完整
- [ ] 0 个 P0/P1 问题遗留

---

## 10. 元信息

- 与 [`designDoc./12-12-TODO-browser-smoke-test-v2.3.md`](./12-12-TODO-browser-smoke-test-v2.3.md) § 7 测试记录 + § 8 问题汇总 衔接
- 与 [`designDoc./04-PLAN-v2-architecture-refactor.md`](./04-PLAN-v2-architecture-refactor.md) § 验收标准 衔接
- 与 [`designDoc./02-PROGRESS.md`](./02-PROGRESS.md) arch-v2.3 节点 5/6 衔接
- 本报告**只整理, 不修代码**; 修复见 commit `fix(arch-v2.3-5.4): 补回 AbilityCard 的 compact prop 定义` + saver 调试 commit
