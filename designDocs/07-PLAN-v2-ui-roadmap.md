# P2 UI 路线图（v2.2.0 → v3.0.0）

> 跟踪 P2 用户能力数据**在 UI 上的呈现**。
> 创建：2026-06-05（v2.2.0 收口 + 阶段 10 UI 接线完成）

---

## 0. 当前状态（v2.2.0 收口时）

| 能力 | 数据层 | UI 呈现 |
|------|--------|---------|
| 等级 + 准确率 | ✅ 旧 | ✅ 旧 UI 不动 |
| 强项/薄弱（diagAnswers） | ✅ 旧 | ✅ 旧 UI 不动 |
| 数字 0-9 掌握度 | ✅ v2 `getMasteryByNumber` | ✅ 阶段 10 新加 10 格 grid |
| 错题优先级 top 5 | ✅ v2 `prioritizeWrongAnswers` | ✅ 阶段 10 新加列表 |
| 弱项 v2（动态） | ✅ v2 `getDynamicWeakness` | ❌ 未渲染（数据形态不直观） |
| 强项 v2（综合评分） | ✅ v2 `getDynamicStrength` | ❌ 未渲染（同上） |
| 学习曲线 | ✅ v2 `getLearningCurve` | ❌ 未渲染（chart.js 留 v3） |
| 1-strike 软规则 | ❌ 未实施 | ❌ 数据层缺 |
| 遗忘检测 | ❌ 未实施 | ❌ 数据层缺 |
| 时间桶对比 | ❌ 未实施 | ❌ 数据层缺 |
| 强化出题 | ❌ 未实施 | ❌ 改动出题流程 |

---

## 1. 已完成（✅）

### v2.2.0 阶段 10：UI 接线（commit `6c282a5`）

**目标**：让 4 个 v2 props 在弹窗里看到。

**实际**：
- `PracticeSummaryDialog.vue` 调 `useAbilityAnalysis()` + watch `visible` 触发 `refresh()` + `refreshMastery()`
- `AbilityCard.vue` 加 2 个 v2 block：
  - 数字 0-9 掌握度（10 格 grid，4 档颜色：empty/weak/mid/strong）
  - 错题优先级 top 5（带 priority 分数 + resolved 状态）
- 保留 v2.1 全部 UI（向后兼容）
- compact 模式不显示 v2（不污染答题时）

**UI 改动范围**：2 文件 / +223 / -1 行

---

## 2. 短期（v2.2.x）

### v2.2.1：弱项/强项 v2 渲染 + 测试覆盖率（无破坏性）

**目标**：补齐数据已有但 UI 没渲染的 2 个 v2 block。

**前置**：✅ v2.2.0 阶段 10

**工作**：
1. **弱项 v2 渲染**（P1-1）：
   - 位置：AbilityCard v2 block 区（在错题优先级后）
   - 元素：top 3 列表
   - 形态：`{ equation, accuracy%, sample(作答 N 次) }`
   - 触发：与现有 v2 块共用 `analysis.refresh()` 触发链
   - 风险：用户可能困惑"弱项 vs 错题优先级"区别 → 改文案"⚠ 持续薄弱"区分
2. **强项 v2 渲染**（P1-1）：
   - 形态：top 3 列表
   - 元素：`{ equation, score, accuracy%, avgResponseTime }`
3. **测试覆盖率**（P1-3）：
   - `npm run test:coverage`（v8 provider）
   - 目标：analysis.js ≥ 80% 行覆盖
   - 缺：分支覆盖（if/else 三元）
   - 补 5-8 个 case（边界 + 异常路径）

**UI 改动**：1 文件（AbilityCard.vue）+50 行 / 1 文件（spec）+50 行
**触发时机**：你测试 v2.2.0 反馈 OK 后

---

### v2.2.2：browser smoke test 实施

**目标**：用 Playwright MCP 在真浏览器跑 6 个 smoke 场景，防止 UI 回归。

**前置**：v2.2.0 阶段 10 + ✅ 用户测试反馈

**计划文档**：`designDocs/PLAN-browser-smoke-test.md`（agent-test 出品，已 commit `ee1fae6`）

**6 场景**：
1. 4 新 props 全传（数据流）
2. 4 新 props 全不传（向后兼容）
3. 空数组（边界）
4. 部分字段缺失（健壮性）
5. 极值 Unicode（边界）
6. compact 模式

**工具**：Playwright MCP（零安装）
**数据**：console 注入 + 临时 patch 接收口
**入口**：PracticeSummaryDialog 弹窗

**工作**：~2 小时
**触发时机**：v2.2.1 完成

---

## 3. 中期（v2.3.x ~ v2.5.x）— 数据层面

### v2.3.0：1-strike 软规则（数据层）

**目标**：弱项判定"1 次错题即列入"。

**设计**（来自 PLAN-v2-ability-analysis.md § 3.4）：
- 当前：`getDynamicWeakness({ minSample: 3 })` — 至少 3 次作答
- 改进：1 次"真错"（非 isTimeout/快错）即列入
- 过滤：必须 ≥ 1 次对题作对比（避免"全错"被高估）
- 形态：`getDynamicWeakness({ mode: 'strict' | 'normal', minSample })`

**实现**：
- `_aggregateQuestions` 加 `realWrongCount` 字段（复用 `getEffectiveResponseTime.isTimeout`）
- `getDynamicWeakness` 加 `mode` 参数
- 边界 case 测试（isTimeout 题不算）

**UI 影响**：暂不接入（留 v2.3.1 渲染 strict 结果）
**风险**：strict 模式可能产生噪声弱项（要 UI 文案解释）
**文档**：1 文档（更新 § 3.4 设计）
**测试**：+3 cases
**预计工时**：2 小时

---

### v2.4.0：遗忘检测（数据层）

**目标**：30 天未练的题不参与弱项计算（或加权降权）。

**设计**：
- 当前：`_aggregateQuestions` 无 lastSeenAt 过滤
- 改进：`getDynamicWeakness({ staleDays: 30, staleMode: 'exclude' | 'downweight' })`
- 实现：
  - `staleMode: 'exclude'` → 过滤 lastSeenAt < now - staleDays * 86400e3
  - `staleMode: 'downweight'` → weight = max(0.1, 1 - staleDays / 90)
- 数据迁移：旧数据 lastSeenAt 缺失，迁移时反推为 max(timestamp)

**UI 影响**：暂不接入
**风险**：旧数据迁移可能漏
**预计工时**：3 小时

---

### v2.5.0：`getDynamicWeakness({ buckets })` 时间桶

**目标**：多时段对比弱项（"近 7 天 vs 近 30 天"）。

**设计**（来自 PLAN-v2-ability-analysis.md § 3.4 v2.x 扩展）：
```js
getDynamicWeakness({ minSample: 3, buckets: [['近 7 天', 7], ['近 30 天', 30]] })
```

**实现**：
- `_bucketStats(buckets, minSample)` 内部 helper
- 返回结构：`[{ bucket: '近 7 天', days: 7, weakness: [...] }, ...]`
- 复用 `_aggregateQuestions` 内部逻辑，加时间窗口参数

**UI 接入**（v2.5.1）：弱项卡里显示"近 7 天 65% / 近 30 天 80%"对比

**预计工时**：4 小时

---

## 4. 长期（v3.0.x）

### v3.0.0：强化练习 + 学习曲线 + profile 页

**3 个并列子项目**：

#### v3.0.1：`useAdaptiveQuestionPicker`（强化出题）
- 错题 > 已掌握 → 优先出错题
- 比例：70% 旧 + 30% 错题（避免挫败感）
- 触发位置：Practice.vue 出题逻辑
- **风险**：核心交互路径，必须 A/B 测
- 预计工时：1 天

#### v3.0.2：学习曲线 UI
- 错题列表点击 → 弹窗显示趋势小图
- 工具：chart.js（项目已有）
- 元素：折线图（X：attemptIndex，Y：responseTime）
- 预计工时：1 天

#### v3.0.3：路由 `/profile`（独立"我的能力"页）
- 路由：router/index.js 加 `/profile`
- 页面：views/Profile.vue
- 内容：AbilityCard 全屏版 + 错题列表 + 学习曲线
- 预计工时：1 天

---

## 5. 风险与回滚

| 阶段 | 风险 | 回滚 |
|------|------|------|
| v2.2.x | 弱项 v2 渲染 UI 拥挤 | AbilityCard 用 `v-if` 控制 |
| v2.3.x | 1-strike 噪声弱项 | mode='normal' fallback |
| v2.4.x | 旧数据迁移漏 | 迁移 dry-run + UI "未检测" 兜底 |
| v2.5.x | 时间桶性能 | 复用 _aggregateQuestions 索引 |
| v3.0.1 | 强化出题挫败感 | 70/30 比例可配 |
| v3.0.2 | chart.js 包大小 | tree-shaking + 按需 import |
| v3.0.3 | /profile 路由冲突 | 老路由不动 |

---

## 6. 验收标准（UI 部分）

- [ ] v2.2.0 弹窗显示数字 0-9 掌握度 + 错题 top 5
- [ ] v2.2.1 弹窗显示弱项/强项 v2 top 3
- [ ] v2.2.2 真浏览器 smoke 6 场景全过
- [ ] v2.3.0 strict 模式可调，测试覆盖 isTimeout 过滤
- [ ] v2.4.0 stale 题不参与弱项
- [ ] v2.5.0 时间桶返回结构清晰，UI 渲染对比
- [ ] v3.0.x 三项全部发布，每个有 1 个 e2e 用例

---

## 7. 推进顺序（推荐）

```
v2.2.0（已 commit 6c282a5）
   ↓ 你测
v2.2.1（P1-1 弱项 v2 + P1-3 覆盖率）— 半天
   ↓
v2.2.2（P1-2 browser smoke）— 2 小时
   ↓
v2.3.0（1-strike 数据）— 2 小时
   ↓
v2.3.1（1-strike UI 渲染）— 1 小时
   ↓
v2.4.0（遗忘检测数据）— 3 小时
   ↓
v2.5.0（时间桶数据）— 4 小时
   ↓
v2.5.1（时间桶 UI）— 2 小时
   ↓
v3.0.0（强化出题 + 曲线 + profile）— 3 天+
```

---

## 8. 跨文档引用

- [PLAN-v2-ability-analysis.md](06-PLAN-v2-ability-analysis.md) — 数据层设计（§ 3.4 弱项/强项）
- [PLAN-browser-smoke-test.md](11-PLAN-browser-smoke-test.md) — 真浏览器测试计划
- [IdeaByUser.md](10-IdeaByUser.md) — 用户原始设计
- [PROGRESS.md](02-PROGRESS.md) — 进度记录
