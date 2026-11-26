# PrimarySchoolMathematics 设计文档

> 设计文档入口。版本化、可逐项 review。

---

## 当前状态（2026-11-25）

**多设备快照同步** ✅ — 接入自建 `indexDB-snapshot-sync`（分支 `feat/snapshot-sync`）：
练习轮次/答案、出题配置（含练习量）、档位配比、起点档位、挑战题、自动升档、音效、保存的配置全部同步；
双设备配对 + 首绑、自动同步 + 页头状态点、重置前断开同步。
详见 [IMPLEMENTATION_HISTORY.md](./IMPLEMENTATION_HISTORY.md) §19–§24 与 [15-PLAN-snapshot-sync.md](./15-PLAN-snapshot-sync.md)。

**升档方式** ✅ — 默认手动，家长点「升一档」才推进（[14-FIX-level-ladder.md](./14-FIX-level-ladder.md) §九）。

**v3 架构调优** ✅ — A/B/C/D/E/F/G/H 8 大组完成，已合 ui。

**v4 业务阶段** ✅ v4.0a/b/c + P1.6 + P1.8 完成：
- v4.0a 数据库代理（已删，直引 databaseInit）
- v4.0b 错题模块 `wrongAnswerService.js`
- v4.0c 循环解耦 + Getter-First 重构（databaseInit 叶子模块、Answer/Question 域类、死代理清理、串行化锁）
- P1.6 干扰项错题库（选择题优先用错题答案）
- P1.8 3 连对触发复习题（方案 B）

详见 [IMPLEMENTATION_HISTORY.md](./IMPLEMENTATION_HISTORY.md) §8 和 [v4-PLAN-error-injection.md](./v4-PLAN-error-injection.md)。

**准备开始页改版 + 分组练习** ✅（2026-11-26，分支 `feat/start-page-redesign`）：
- 准备开始页：去重复（删「这次练什么」）、历史正确率→**上次正确率**、自适应设置进页内（默认折叠）、
  档位 **降/升一档**、档位配比迁入设置区（24 档限高滚动）、灰说明改 ⓘ 气泡
- 出题抽屉：练习档位区 / 自适应练习量隐藏（观察期到 2026-12-30）、「其他设置」二级抽屉**删除**
  （出题规则内联）、数字范围表格化、卷子五项进「生成卷子」对话框、口算题数+卷子份数同一行
- 自定义练习**按卷子分组**：一张卷子 = 一组，每组结束自评一次，进度按本组算（与自适应对齐）
- 题目多时进度改**细条**；题组可单个删除；练习全流程**可全键盘操作**
详见 [17-start-page-redesign.md](./17-start-page-redesign.md)、[18-PLAN-manual-groups.md](./18-PLAN-manual-groups.md)。

**下一目标**：
- **v4.2** P3 L2.5 难度等级
- **v3.1** G3 端到端集成测试
- **v2.4.1-3** D3 useChart / C6 出题聚合 / Practice.vue 拆分

---

## 推荐阅读顺序

| # | 文档 | 性质 | 何时读 |
|---|------|------|--------|
| 1 | **[ARCHITECTURE.md](./ARCHITECTURE.md)** | 架构宪法 | 必读 — 任何 PR 前看一遍 |
| 2 | **[DESIGN.md](./DESIGN.md)** | 产品设计 | 业务必读 — 出题流程、profile、stats 三套设计 |
| 3 | **[IMPLEMENTATION_HISTORY.md](./IMPLEMENTATION_HISTORY.md)** | 实施过程 | 选读 — 了解 v2.3+v3 "过去怎么走到这" |
| 4 | [v4-PLAN-error-injection.md](./v4-PLAN-error-injection.md) | v4 业务规划（错题注入 + L2.5）| 必读 — 当前活跃 |
| 5 | [15-PLAN-snapshot-sync.md](./15-PLAN-snapshot-sync.md) | 多设备同步（规划 + 实施记录）| 必读 — 同步相关改动前 |
| 6 | [10-IdeaByUser.md](./10-IdeaByUser.md) | 用户原始创意 | 业务必读 |
| 7 | [17-start-page-redesign.md](./17-start-page-redesign.md) | 准备开始页改版 + 抽屉调整 | 近期改动必读 |
| 8 | [18-PLAN-manual-groups.md](./18-PLAN-manual-groups.md) | 自定义练习分组 + 自评 + 进度 + 键盘 | 练习流程改动必读 |

**v3 调优计划完整版**（archived）：[_ARCHIEVED_05-PLAN-v3-architecture-tuning.md](./_ARCHIEVED_05-PLAN-v3-architecture-tuning.md)

---

## 文档结构

```
designDocs/
├── README.md                              ← 本文件（入口）
│
├── 固定核心（项目必读）
│   ├── ARCHITECTURE.md                   架构宪法（分层 + 目录 + 规则）
│   └── DESIGN.md                          产品设计（业务流程）
│
├── 业务规划（活跃）
│   ├── v4-PLAN-error-injection.md       v4.1 错题注入 + v4.2 L2.5 难度
│   ├── 15-PLAN-snapshot-sync.md         多设备快照同步（可行性 + 阶段计划）
│   ├── 17-start-page-redesign.md        准备开始页改版 + 出题抽屉调整
│   └── 18-PLAN-manual-groups.md         自定义练习分组 + 自评 + 进度 + 全键盘
│
├── 设计图（PNG，随改动一起更新）
│   └── mockups/{start-page,ratio-title,drawer-compact,progress}/
└── 实施历史（参考）
    └── IMPLEMENTATION_HISTORY.md          v2.3+v3 实施过程（合并历史）

└── _ARCHIEVED_*.md                         已落地计划 / 报告 / smoke test（不读）
    ├── _ARCHIEVED_02-PROGRESS.md          v3 收尾前的逐行 commit 日志
    ├── _ARCHIEVED_03-PLAN-v2-roadmap.md   v2 业务路线图（已落地）
    ├── _ARCHIEVED_04-PLAN-v2-architecture-refactor.md   v2.3 7 阶段计划（已落地）
    ├── _ARCHIEVED_05-PLAN-v3-architecture-tuning.md    v3 8 大组计划（已落地）
    ├── _ARCHIEVED_06-PLAN-v2-ability-analysis.md       P2 阶段（已落地）
    ├── _ARCHIEVED_07-PLAN-v2-ui-roadmap.md   v3.0+ UI 业务规划
    ├── _ARCHIEVED_08-PLAN-v2-自适应出题.md              暂缓
    ├── _ARCHIEVED_11-PLAN-browser-smoke-test.md        smoke test 计划（旧）
    ├── _ARCHIEVED_12-TODO-browser-smoke-test-v2.3.md   smoke test 清单（12/12 通过）
    └── _ARCHIEVED_13-SMOKE-TEST-REPORT-v2.3.md         smoke test 报告
```

---

## 文档关系图

```
[ARCHITECTURE]   ← 宪法性，所有文档的上位（"现在是什么"）
       │
       ↓ 引用
[README]  ← 当前在哪步（入口索引）
       │
       ├──→ [DESIGN]                          产品设计（业务流程）
       │         │
       │         ↓ 业务规划（活跃）
       │         [v4-PLAN-error-injection]       v4.1 错题注入 + v4.2 L2.5
       │              │
       │              └──→ [_ARCHIEVED_03-PLAN-v2-roadmap]   历史 P0-P5 路线
       │              └──→ [_ARCHIEVED_05-PLAN-v3-architecture-tuning § 12.3.2-4]  粗略规划
       │
       ├──→ [IMPLEMENTATION_HISTORY]        v2.3+v3 实施过程（"过去怎么走"）
       │         │
       │         └──→ [_ARCHIEVED_02-PROGRESS]  逐行 commit 日志
       │         └──→ [_ARCHIEVED_04/05/06-PLAN-*]  已落地的计划
       │
       └──→ [_ARCHIEVED_05-PLAN-v3]          v3 调优 8 大组（含 § 12 下阶段规划）
                │
                ├──→ [_ARCHIEVED_12-TODO-browser-smoke-test]  smoke 清单
                └──→ [_ARCHIEVED_13-...-report]              smoke 报告
```

---

## 编号规范

- **`README.md`** — 入口（无编号）
- **`ARCHITECTURE.md` / `DESIGN.md`** — 核心文档（无编号，长期保留）
- **`IMPLEMENTATION_HISTORY.md`** — 实施历史（无编号）
- **`0X-NAME.md`** — 主线计划 / 业务路线（X 为顺序号，保留以便交叉引用）
- **`_ARCHIEVED_XX-NAME.md`** — 已落地 / 历史（不读，仅保留备查）

字母后缀无序（按阅读顺序排）— 如需进一步分类，加数字小数位（如 `04.1-...`）

---

## 速查表

| 想看什么？ | 看哪份 |
|-----------|--------|
| 当前架构 + 死代码 | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 已经做了哪些 | [IMPLEMENTATION_HISTORY.md](./IMPLEMENTATION_HISTORY.md) |
| v2 整体规划（archived）| [_ARCHIEVED_03-PLAN-v2-roadmap.md](./_ARCHIEVED_03-PLAN-v2-roadmap.md) |
| v4 业务（错题注入 + L2.5）| [v4-PLAN-error-injection.md](./v4-PLAN-error-injection.md) |
| 怎么把代码迁成目标态 | [_ARCHIEVED_04-PLAN-v2-architecture-refactor.md](./_ARCHIEVED_04-PLAN-v2-architecture-refactor.md) |
| 怎么清死代码 / 调优 | [_ARCHIEVED_05-PLAN-v3-architecture-tuning.md](./_ARCHIEVED_05-PLAN-v3-architecture-tuning.md) |
| 产品设计 | [DESIGN.md](./DESIGN.md) |
| P2 阶段细节 | [_ARCHIEVED_06-PLAN-v2-ability-analysis.md](./_ARCHIEVED_06-PLAN-v2-ability-analysis.md) |
| UI 业务 v3.0+ | [_ARCHIEVED_07-PLAN-v2-ui-roadmap.md](./_ARCHIEVED_07-PLAN-v2-ui-roadmap.md) |
| 出题流程业务 | [DESIGN.md](./DESIGN.md) |
| 浏览器实测细节 | [_ARCHIEVED_12-TODO-browser-smoke-test-v2.3.md](./_ARCHIEVED_12-TODO-browser-smoke-test-v2.3.md) |
| 多设备同步（规划） | [15-PLAN-snapshot-sync.md](./15-PLAN-snapshot-sync.md) |
