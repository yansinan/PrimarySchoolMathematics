# P0-2 诊断等级体系说明 + P2 计划（2026-06-10）

> 来源：浏览器测试报告（2026-06-10 subagent 全量实测）

---

## 一、P0-2 — 诊断等级体系设计说明

### 现状

`utils/algorithm/diagnostic.js` 用 5 级 `DIAG_LEVELS`（L1-L5）出 5 道诊断题，映射到 12 级 `DIFFICULTY_LEVELS`：

| 诊断级 | 数字范围 | carry/abdication | 映射到 12 级 |
|--------|----------|-------------------|-------------|
| L1 | ≤9 | 禁 | L1 起步 |
| L2 | ≤9 | 鼓励 | L2-L3 个位数巩固/进阶 |
| L3 | 11-89 | 禁 | L6 两位数入门 |
| L4 | 11-89 | 鼓励 | L8-L9 两位数进退位 |
| L5 | 混合 | 混合 | 不可控 |

**L10-L12（大数 50-999）永远不会被诊断到**，依赖自适应引擎后续"摸黑"探测。

### 设计决策

**P0-2 不修代码**，原因：
1. 诊断只有 5 道题，统计效力本来就低（n=1 时 accuracy ∈ {0, 1}），不宜加难度
2. 加到 L10-L12 会让用户首屏就面对 999+999 这种劝退题
3. L10-L12 由自适应引擎在用户熟练后自动推入，**这才是合理路径**

**未来如果想覆盖 L10-L12**，可以：
- 评估时把诊断扩到 10 题（含 L1-L4 + L6-L9 各 1 题，L5-L12 由自适应摸黑）
- 或新增"L10 挑战卷"作为可选诊断

### 用户文档（写到 README 或 ARCHITECTURE）

- **诊断定位**：5 题粗筛，定位基本盘（个位数 / 两位数 / 进退位），不测综合挑战
- **难度阶梯**：诊断起手 → 自适应摸 L10+ → 综合挑战

---

## 二、P2 实施计划

### P2-1 — reserve pool 按 weakSeverity 加权

**当前问题**：
`adaptiveBatch.js:67` 用 `['strong', 'weak', 'challenge'][i % 3]` 简单均分，与 `engine.profile.weakSeverity` 无关。

**修复方向**：
1. 引入 `RESERVE_POOL_RATIOS` 常量（类似 `PROFILE_RATIOS`）
2. `RESERVE_POOL_SIZE = 3` 时按 `[strong, weak, challenge] = [1, 1, 1]` 均分作为基础
3. 若 `weakSeverity > 0.5` → 调整为 `[0, 2, 1]`（双 weak）
4. 若无 weak 等级 → 调整为 `[2, 0, 1]`（双 strong）

**影响**：P2-2 难度自适应时响应弱项更敏锐。

---

### P2-2 — `completeAssessment` 清空 session.answers 数据流

**当前问题**：
`stores/practice.js#completeAssessment` 把 `session.answers = []`，注释提到 "125% bug" 是历史设计反复出问题的征兆。statsDrawer 在自适应完成后读 `session.answers`，会拿到空。

**修复方向**：
1. 审计 `session.answers` 的生命周期
2. 改为：诊断阶段答完保留到 snapshot，再清
3. 或：snapshot 存的是 questionId 列表，session 只存"当前题"
4. 写 unit test 覆盖"诊断完→adaptive 起手"的过渡态

**影响**：statsDrawer 在自适应做完展示的题数与实际答题数一致。

---

### P2-3 — `watch(listPractices)` 防御性修复 + unit test

**当前问题**：
`components/Practice.vue:479-491` 的 watch 分支没有 unit test 覆盖。

**修复方向**：
1. 把 watch 内部逻辑抽成 `composables/useListPracticesGuard.js` 纯函数
2. 加 unit test 覆盖：
   - `setListPractices` 时机
   - `setListPractices([])` 时的兜底
   - `setListPractices([q1, q2])` 时只复制末尾 N 道
3. 抽取后 Practice.vue 模板保持简洁

**影响**：防御性代码可测、可维护。

---

## 三、执行顺序

| 优先级 | 任务 | 工作量 | 风险 |
|--------|------|--------|------|
| 1 | P0-2 文档（README/ARCHITECTURE 加段落） | 10 分钟 | 无 |
| 2 | P2-3 watch 抽函数 + unit test | 1 小时 | 低（只移动代码） |
| 3 | P2-1 reserve pool 加权 | 30 分钟 | 低（数学公式） |
| 4 | P2-2 session.answers 生命周期审计 | 2 小时 | 中（涉及多个 store/composable） |

## 四、相关文件

- `src/components/Practice.vue:479-491` — P2-3 watch 位置
- `src/utils/algorithm/adaptiveBatch.js:67` — P2-1 reserve pool
- `src/stores/practice.js#completeAssessment` — P2-2 会话状态
- `src/composables/usePracticeSaver.js` — P2-2 调用方
