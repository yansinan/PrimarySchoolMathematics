# AbilityCard 真实浏览器 Smoke Test 计划

> 文档性质：测试设计 (Test Plan)
> 范围：在真实浏览器中验证 `AbilityCard` 4 个 v2 props 的端到端行为
> 父文档：[PLAN-v2-ability-analysis.md](PLAN-v2-ability-analysis.md) § 5 § 7
> 维护人：项目组
> 日期：2026-06-05
> 阶段定位：**v2.2 准备期 smoke test**（UI 尚未接线，验证数据流不破 + props 接收不出错）

---

## 0. 关键前置事实（影响测试设计的硬约束）

> ⚠️ **这 4 条事实决定本次 smoke test 只能验证"数据流"，无法验证"渲染正确性"**。具体见 § 4 风险。

| # | 事实 | 证据 | 对测试的影响 |
|---|------|------|-------------|
| F1 | **4 个 v2 props 在 `AbilityCard` 模板中完全未渲染** | `AbilityCard.vue` `<template>` 块没有引用 `statsMasteryByNumber` / `statsWeaknessV2` / `statsStrengthV2` / `statsWrongPriority` 任何一处 | smoke test 只能断言"props 接收/不报错"，不能断言"DOM 出现 X" |
| F2 | **没有 `/profile` 路由** | `src/router/index.js` 只有 `/` / `/home` / `/print` / `/test` / `/reset` | 用户描述的"访问 /profile 触发 4 props"在当前代码中**不存在**，必须在 § 4 重定向测试入口 |
| F3 | **AbilityCard 唯一调用点 = `PracticeSummaryDialog.vue:45`**，且**4 个 v2 props 一个都没传** | grep 全文仅此一处 | 测试入口必须选 `PracticeSummaryDialog`（弹窗模式），需先完成一轮答题 |
| F4 | **4 props 的 JSDoc 形状与 composable 实际暴露的形状不一致** | 见 § 1 形状对比表 | smoke test 用例要按"composable 实际形状"造数据，避免用 JSDoc 假形状误导 |

**JSDoc vs 实际形状对比**：

| Prop | JSDoc 声称的元素形状 | composable 实际形状（来自 `_aggregateQuestions` / `prioritizeWrongAnswers`） |
|------|----------------------|----------------------------------|
| `statsMasteryByNumber` | `Object<number, number>` ✅ 一致 | `Object<number, number>`，key=0-9，value=accuracy ∈ [0,1] |
| `statsWeaknessV2` | `{ key, accuracy, sample, ...}` ❌ | `Array<{ questionId, equation, total, correct, accuracy, avgResponseTime, lastSeenAt }>` |
| `statsStrengthV2` | `{ key, score, sample, ...}` ❌ | `Array<{ questionId, equation, total, correct, accuracy, avgResponseTime, lastSeenAt, score }>` |
| `statsWrongPriority` | `{ questionId, equation, priority, lastWrong, ...}` ⚠️ 接近 | `Array<{ questionId, equation, operator, difficulty, wrongCount, totalAttempts, lastWrongAt, lastCorrectAt, isResolved, priority }>` |

---

## 1. 测试目标

### 1.1 主目标（本次）
验证 AbilityCard 接收 4 个 v2 props 时**不报错、不破坏旧 props 渲染**——为阶段 9+（UI 真正接线）扫清"接数据"的烟雾。

### 1.2 次目标（铺路）
- 锁住 composable 实际暴露的形状（防止后续重构悄悄改字段）
- 暴露 JSDoc 注释与实际形状的偏差（推动修正 JSDoc）
- 验证向后兼容：旧 props 用法（`statsTotal/Strong/Weak/Level...`）0 改动也能跑

### 1.3 非目标（明确不做）
- ❌ 验证 DOM 渲染细节（事实 F1：模板没渲染，DOM 必然为空）
- ❌ 验证 UI 接线（设计文档明确 v2.0 不接入）
- ❌ 性能 / 大数据量（单测 `analysis.spec.js` 已覆盖 5000 answers 性能目标）

---

## 2. 测试架构

### 2.1 工具选型

| 工具 | 状态 | 优势 | 劣势 | 推荐 |
|------|------|------|------|------|
| **Playwright MCP 工具**（`open_browser_page` / `click_element` / `screenshot_page` 等） | ✅ 已可用，VS Code agent 集成 | 零安装；复用 IDE 调试面板；带 a11y snapshot；脚本化（`run_playwright_code` 可注入 JS） | 受限于 MCP 协议字段；不能直接做 visual diff；不是 CI 友好 | ⭐ **首推**（smoke test 场景够用） |
| Puppeteer（npm install） | ❌ 需新增依赖 | 灵活；headless 友好；可写 CI | 需维护 `puppeteer.config.js`；Chromium 130MB+；与 MCP 工具功能重叠 | ✗ 舍弃：MCP 工具已覆盖 |
| `vitest --browser`（`@vitest/browser` + playwright provider） | ❌ vitest.config.js 是 `environment: 'node'`，需新增 provider 配置 | 与单测同源；可共用 `fake-indexeddb` | 需装 `webdriverio` / `playwright` 全栈；首次配置成本高；仍是"半模拟"（无真实路由） | ✗ 舍弃：MCP 工具已覆盖 + 不需要单测集成 |
| Cypress | ❌ 未安装 | 业界标准；E2E 强 | 体积大；不与 MCP 工具联动；项目未铺基础 | ✗ 舍弃：MCP 工具已覆盖 |

**最终决策**：
> **推荐 Playwright MCP 工具**。理由：MCP 工具已在 IDE 内开箱即用、覆盖了 smoke test 所需的所有操作（打开/点击/截图/快照）、且不增加项目依赖。舍弃 Puppeteer/vitest-browser/Cypress 都因为"为本次临时需求新增重型依赖不值得"。

### 2.2 截图与证据存放

| 类型 | 路径 | 命名约定 |
|------|------|----------|
| 截图 | `docs/smoke-screenshots/ability-card/<scenario>-<step>.png` | `<scenario>` 见 § 3 编号；`<step>` 编号从 1 开始 |
| 失败截图 | 同上，前缀 `FAIL-` | CI 失败时覆盖写入 |
| 文本快照 | 截图时附 `.txt`（a11y snapshot） | `<scenario>-<step>.snapshot.txt` |

> 不入版本控制（加进 `.gitignore`：`docs/smoke-screenshots/`），保留 14 天自动清理。

---

## 3. 测试场景

### 场景 1：4 新 props 全传（数据流验证）

**目的**：证明 4 个 prop 可以从 `useAbilityAnalysis` 经由 `PracticeSummaryDialog` 流入 `AbilityCard` 而不抛错。

**前置数据**（在浏览器 console 注入，模拟 composable 真实输出）：

```js
// 模拟 useAbilityAnalysis.refresh() 的产物
const mockProps = {
  statsMasteryByNumber: { 0: 0.85, 1: 0.6, 2: 0.7, 3: 0.55, 4: 0.9, 5: 0.65, 6: 0.7, 7: 0.8, 8: 0.75, 9: 0.6 },
  statsWeaknessV2: [
    { questionId: 101, equation: '23+47=', total: 5, correct: 1, accuracy: 0.2, avgResponseTime: 4200, lastSeenAt: 1717000000000 },
    { questionId: 102, equation: '15-8=', total: 4, correct: 1, accuracy: 0.25, avgResponseTime: 3800, lastSeenAt: 1717050000000 },
  ],
  statsStrengthV2: [
    { questionId: 201, equation: '5+5=', total: 8, correct: 8, accuracy: 1.0, avgResponseTime: 1200, lastSeenAt: 1717100000000, score: 0.95 },
    { questionId: 202, equation: '3+2=', total: 6, correct: 6, accuracy: 1.0, avgResponseTime: 900, lastSeenAt: 1717150000000, score: 1.0 },
  ],
  statsWrongPriority: [
    { questionId: 101, equation: '23+47=', operator: '+', difficulty: 7, wrongCount: 4, totalAttempts: 5, lastWrongAt: 1717000000000, lastCorrectAt: null, isResolved: false, priority: 50 },
  ],
}
```

**操作步骤**：
1. 启动 dev server（已运行：`http://helix:4003/home`）
2. `open_browser_page` 打开 `/home`
3. 验证页面渲染（`<el-button>` "开始" 等）
4. **Mock 注入**：在 console 执行
   ```js
   // 利用 Vue devtools / Pinia 注入：因为 4 props 当前没接，需用测试钩子
   // 详见 § 4 风险 R3 — 需要在 PracticeSummaryDialog 临时加 prop 接收口
   window.__mockAbilityData = mockProps
   ```
5. 通过 UI 操作（点开始 → 答对 N 题 → 触发 `PracticeSummaryDialog` 弹窗）
6. 在弹窗出现后，通过 devtools 给 `<AbilityCard>` 实例注入 mock props：
   ```js
   document.querySelector('.ability-card').__vueParentComponent.props.statsMasteryByNumber = mockProps.statsMasteryByNumber
   // 同样 4 个 prop
   ```
7. 截图保存 `ability-card/scenario-1-1-dialog.png` + `scenario-1-2-card.png`
8. `read_page` 拿 a11y snapshot 存为 `scenario-1.snapshot.txt`

**断言**（基于 F1，DOM 必然为空，但仍要断言 props 正确接收）：

| 断言 ID | 描述 | 通过条件 |
|---------|------|----------|
| A1.1 | 页面无 console error | `run_playwright_code` 监听 `page.on('console')` 收集，0 个 `error` 级日志 |
| A1.2 | AbilityCard 旧 props 渲染正常 | `.ability-card__title` 文本 === "📊 我的数学能力" |
| A1.3 | AbilityCard 接收的 props 包含 4 个 v2 key | `__vueParentComponent.props` 包含 `statsMasteryByNumber`/`statsWeaknessV2`/`statsStrengthV2`/`statsWrongPriority` 4 个 key |
| A1.4 | props 值与注入的 mock 一致 | `props.statsMasteryByNumber[0]` === 0.85；`props.statsWeaknessV2.length` === 2；以此类推 |
| A1.5 | props 类型符合 defineProps 声明 | `Array.isArray(props.statsWeaknessV2)` 为 true；`typeof props.statsMasteryByNumber === 'object'` 为 true |
| A1.6 | 旧 UI 区域（level / accuracy / strong / weak 标签）不受影响 | 截图对比 baseline 视觉无回归 |

**失败行为**：任一断言不通过 → 截图加 `FAIL-` 前缀，写入 `docs/smoke-screenshots/ability-card/FAIL-scenario-1-*.png` 并生成失败报告。

---

### 场景 2：4 新 props 全不传（向后兼容）

**目的**：验证现有调用方 `PracticeSummaryDialog`（只传 7 个旧 props）行为 0 变化。

**操作步骤**：
1. 打开 `/home`
2. 触发 `PracticeSummaryDialog`（同场景 1 步骤 5）
3. **不注入任何 mock**，完全走生产路径
4. 截图 `ability-card/scenario-2-default.png`

**断言**：

| 断言 ID | 描述 | 通过条件 |
|---------|------|----------|
| A2.1 | props 全部为 defineProps 的 default 值 | `props.statsMasteryByNumber` 深度等于 `{}`；`props.statsWeaknessV2/StrengthV2/WrongPriority` 都是 `[]` |
| A2.2 | 旧 UI 渲染与 v2.0 完全一致 | 视觉与 git HEAD 截图无 diff（用 git 历史 baseline 或注释标记位置） |
| A2.3 | 0 console warning | 不出现 "missing required prop" 类警告 |

---

### 场景 3：空数组（边界）

**目的**：composable 在 DB 无数据时会返回 `[]` / `{}`，验证 AbilityCard 不因空数据崩。

**操作**：注入
```js
mockEmpty = {
  statsMasteryByNumber: {},
  statsWeaknessV2: [],
  statsStrengthV2: [],
  statsWrongPriority: [],
}
```

**断言**：
| 断言 ID | 描述 | 通过条件 |
|---------|------|----------|
| A3.1 | props 接收成功 | 4 个 key 都在 |
| A3.2 | 0 console error | 同 A1.1 |
| A3.3 | 旧 UI 不变 | 同 A2.2 |

---

### 场景 4：部分字段缺失（健壮性）

**目的**：composable 可能在某次返回中缺 `lastSeenAt` / `score` 等字段（DB 数据稀疏），验证 AbilityCard 不崩。

**操作**：注入
```js
mockPartial = {
  statsMasteryByNumber: { 0: 0.5, 1: 0.5 },  // 只有 2 个数字
  statsWeaknessV2: [
    { questionId: 1, equation: '1+1=' },  // 缺 total/correct/accuracy 等
  ],
  statsStrengthV2: [],
  statsWrongPriority: [
    { questionId: 1, equation: '1+1=' },  // 缺 operator/difficulty/priority
  ],
}
```

**断言**：
| 断言 ID | 描述 | 通过条件 |
|---------|------|----------|
| A4.1 | props 接收成功 | 4 个 key 都在 |
| A4.2 | 0 console error | 不因 undefined 字段报错 |
| A4.3 | 元素访问不抛错 | 访问 `props.statsWeaknessV2[0].accuracy` 返回 `undefined` 而非抛错 |

---

### 场景 5：超长 + Unicode（边界）

**目的**：用户可能在 equation 中遇到特殊字符 / 极长字符串（小学口算罕见但 defensive）。

**操作**：注入
```js
mockLong = {
  statsMasteryByNumber: {},
  statsWeaknessV2: [
    { questionId: 1, equation: '999+999=', total: 1, correct: 0, accuracy: 0, avgResponseTime: 99999, lastSeenAt: Date.now() },
  ],
  statsStrengthV2: [],
  statsWrongPriority: [
    { questionId: 2, equation: '12345+67890=', operator: '+', difficulty: 12, wrongCount: 999, totalAttempts: 1000, lastWrongAt: Date.now(), lastCorrectAt: null, isResolved: false, priority: 9999 },
  ],
}
```

**断言**：
| 断言 ID | 描述 | 通过条件 |
|---------|------|----------|
| A5.1 | props 接收不抛错 | 0 console error |
| A5.2 | 极端值（accuracy=0, priority=9999）不引发 NaN/Infinity | `props.statsWrongPriority[0].priority === 9999` 严格等于 |

---

### 场景 6（可选）：4 新 props + compact 模式

**目的**：当 AbilityCard 在 compact 模式（`compact: true`）下接收 4 props，不影响 compact 的一行简版渲染。

**操作**：在场景 1 基础上额外把 `:compact="true"` 注入，截图对比 compact 模式视觉。

**断言**：compact 行的等级 / 准确率文本不变；4 v2 props 接收正常。

> ⏭️ 此场景依赖 AbilityCard 有使用方传 `compact=true`，当前 `PracticeSummaryDialog` 永远传 `false`。本场景可暂时降级为**手动测试**记录在 README，不进 CI。

---

## 4. 风险与缓解

| ID | 风险 | 等级 | 缓解 |
|----|------|------|------|
| **R1** | F1（4 props 未渲染）使得 smoke test 只能验证"接收不报错"，验证强度有限 | 高 | 文档中明确标注"准备期 smoke test"；真正的"DOM 渲染测试"留到阶段 9+ UI 接线后 |
| **R2** | 场景 1 步骤 5-6 需答完一轮题才能触发 `PracticeSummaryDialog`，真流程慢（每组 5-10 题 × N 组） | 中 | 在 `Practice.vue` 临时加 `?devFast=1` query 跳过诊断/调短组数；或 `__VUE_PROD_DEVTOOLS__` + devtools API 直接改 store 状态触发弹窗 |
| **R3** | 4 props 当前无接线，注入 mock 后 props 值会被 Vue 响应式系统校验"是否与组件内 reactive 路径绑定"——单纯覆盖 `__vueParentComponent.props` 可能无效 | 中 | 方案 A：临时 patch `PracticeSummaryDialog.vue` 接收 4 个 props（接受 1 个 commit、跑完测试后 revert）；方案 B：直接修改 `AbilityCard.vue` template 在 `<script setup>` 里 `console.log` 验证接收（侵入大，不推荐） |
| **R4** | JSDoc 注释形状与实际形状不一致（F4）会让造数据的人踩坑 | 中 | 本计划用"composable 实际形状"为唯一真源；在 § 0 表格里直接对照；smoke test 通过后单独开 1 个 cleanup commit 修正 JSDoc |
| **R5** | dev server 是 `vite --host 0.0.0.0`（含 HMR），注入的 mock props 在 HMR 触发时丢失 | 中 | 测试脚本一次性完成"注入 → 验证 → 截图"原子操作；不依赖跨 reload 状态 |
| **R6** | 截图证据在多分辨率下基线对比困难 | 低 | 固定 1280×800 viewport；截图保存完整 viewport + 关键区域 2 张 |
| **R7** | 浏览器 MCP 工具和真实浏览器渲染可能因字体/anti-aliasing 像素级差异导致"视觉断言"误报 | 低 | 视觉断言改为 a11y snapshot 文本比对（`read_page`），不依赖像素 diff |
| **R8** | `PracticeSummaryDialog` 是 Element-Plus `el-dialog`，关闭后 DOM 销毁，再次打开需重新挂载 | 低 | 每次断言都重新打开弹窗，断言 props 在新实例上的值 |
| **R9** | 测试数据可能污染 IndexedDB（如果用真答题路径） | 中 | 测试前在 `/reset` 页清空 DB；测试后恢复 baseline |

---

## 5. 实施步骤（按依赖排序）

> 每步产出明确、可独立 review。

### Step 1：环境与基线（30 min）
- [ ] 确认 dev server 跑在 `http://helix:4003/home`（curl 探活）
- [ ] `git stash` 当前工作区（防止污染）
- [ ] 拉一个分支 `test/p2-smoke-ability-card`
- [ ] 创建 `docs/smoke-screenshots/.gitignore`（含 `*.png` / `*.snapshot.txt`）
- [ ] 在 `dev` 模式下用 `open_browser_page` 打开 `/home` 截图作 **baseline**（场景 2 用）

### Step 2：测试入口改造（R3 缓解，1-2h）
- [ ] **方案 A（推荐）**：在 `PracticeSummaryDialog.vue` 临时加 4 个 prop 接收，标记 `// [SMOKE-TEST-ONLY] revert before merge`：
  ```js
  const props = defineProps({
    // ... 旧 props ...
    // [SMOKE-TEST-ONLY] 4 个 v2 props 临时加进来以便注入
    statsMasteryByNumber: { type: Object, default: () => window.__mockAbilityData?.statsMasteryByNumber ?? ({}) },
    statsWeaknessV2: { type: Array, default: () => window.__mockAbilityData?.statsWeaknessV2 ?? [] },
    statsStrengthV2: { type: Array, default: () => window.__mockAbilityData?.statsStrengthV2 ?? [] },
    statsWrongPriority: { type: Array, default: () => window.__mockAbilityData?.statsWrongPriority ?? [] },
  })
  ```
- [ ] template 内 `<AbilityCard>` 同步绑定 4 个 prop
- [ ] ⚠️ 此 PR **不 merge**到主分支；smoke test 通过后 revert

### Step 3：写 smoke test 脚本（2-3h）
- [ ] 在 `scripts/` 下创建 `smoke-ability-card.mjs`（用 Playwright Node API 而非 MCP，复现性更好；但启动仍走 MCP 工具的 chromium 二进制）
- [ ] 脚本分 6 个 scenario 函数，每个返回 `{ passed, failures, screenshots }`
- [ ] 失败时自动加 `FAIL-` 前缀并保存 console 日志

### Step 4：执行 + 截图（30 min）
- [ ] 运行 `node scripts/smoke-ability-card.mjs`（或 MCP 工具链交互式）
- [ ] 收集截图到 `docs/smoke-screenshots/ability-card/`
- [ ] 输出 markdown 报告到 `docs/smoke-screenshots/ability-card/REPORT.md`

### Step 5：回滚 + cleanup（30 min）
- [ ] `git revert` Step 2 的临时 commit
- [ ] 提交 JSDoc 修正 commit（如果 Step 0 表格确认有偏差）
- [ ] 把 `scripts/smoke-ability-card.mjs` + `docs/smoke-screenshots/REPORT.md` 合入主分支

### 依赖关系
```
Step 1 ──→ Step 2 ──→ Step 3 ──→ Step 4 ──→ Step 5
   │           │           │
   └─── baseline 临时 patch  实际执行
```

---

## 6. 与 vitest 单测的边界

| 维度 | vitest 单测（`src/utils/services/__tests__/analysis.spec.js`） | browser smoke test（本次新增） |
|------|--------------------------------------|------------------------------|
| **运行时机** | `npm test`（CI） | 手动 + 关键节点时（手动触发） |
| **环境** | Node + `fake-indexeddb`（模拟） | 真实 Chromium + 真实 IndexedDB |
| **覆盖** | services 层 11 个函数 + 1 helper（`getEffectiveResponseTime` 等纯逻辑） | AbilityCard 4 props 端到端接收 + 不报错 |
| **数据准备** | 内存 mock question/answer（`mkQuestion`/`mkAnswer`） | console 注入 mock props + 真 IndexedDB（场景 2 不注入） |
| **失败信号** | Jest-style assertion | 截图 + a11y snapshot + console error 计数 |
| **回归基线** | 单元函数行为 | 旧 UI 视觉无变化 + 0 console error |
| **重叠区** | 无（services 层只测计算，不涉及 props 接收） | 无 |
| **互补性** | 覆盖大量数据组合（5000 answers 性能） | 覆盖"组件 mounted + 接 props"的整链路 |

> **结论**：两者**完全不重叠**。vitest 已测"composable 的计算正确性"，smoke test 测"组件 props 链路通畅"。本次不重复造单测。

---

## 7. 验收标准

> 本次 smoke test 通过的客观依据。

- [ ] 6 个 scenario（场景 1-6）全部 `passed: true`
- [ ] 共产生 ≥ 10 张截图（每场景 ≥ 1 张 baseline + 1 张实测）
- [ ] 0 console error（所有 scenario 累积）
- [ ] 0 console warning（"missing required prop" 之类）
- [ ] 旧 UI 视觉无回归（场景 2 与 baseline 截图无功能差异）
- [ ] REPORT.md 生成，列出每个 scenario 的断言通过情况
- [ ] 临时 commit（Step 2）已 revert，主分支 0 改动
- [ ] JSDoc 修正 commit（可选）已合入

---

## 8. 未来扩展（阶段 9+ UI 接线后）

本计划是"准备期"测试。**当阶段 9+ 真正在 AbilityCard 模板中渲染 4 个 v2 props 时**，应扩展本计划为：

| 扩展项 | 内容 |
|--------|------|
| 渲染断言 | DOM 包含 `.ability-card__weakness-v2 > .tag` 等新选择器 |
| 视觉基线 | 与 design mock 对齐（设计文档待补） |
| 交互断言 | 点击"强项"标签 → 弹窗 / 跳题等 |
| 路由断言 | 新增 `/profile` 路由后断言直接访问生效 |
| 视觉回归 | 用 `pixelmatch` 做像素级 diff（不再仅 a11y snapshot） |
| CI 集成 | 配合 GitHub Actions + `playwright/test` 跑全套 |

---

## 9. 决策摘要（执行时按此清单）

> 1 行 = 1 个不可逆决策。

1. **工具**：Playwright MCP 工具（已可用）✅
2. **测试入口**：`PracticeSummaryDialog` 弹窗（唯一 AbilityCard 调用点）
3. **数据准备**：console 注入 `window.__mockAbilityData` + 临时 patch 接收口
4. **断言维度**：props 接收 + 0 console error + 旧 UI 无回归（不验 DOM 渲染）
5. **截图位置**：`docs/smoke-screenshots/ability-card/`（不入版本控制）
6. **commit 策略**：Step 2 的临时 patch **不 merge**，测试完 revert
7. **失败处理**：截图加 `FAIL-` 前缀，REPORT.md 列出失败断言
8. **CI**：本次不进 CI；阶段 9+ UI 接线后再考虑
