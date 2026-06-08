# PrimarySchoolMathematics 设计文档

> 设计文档入口。版本化、可逐项 review。

---

## 当前状态（2026-06-08）

**v3 架构调优已全部完成**（A/B/C/D/E/F/G/H 8 大组 + 收尾审计 + ui 分支合并）。详见 [IMPLEMENTATION_HISTORY.md](./IMPLEMENTATION_HISTORY.md)。

**下一目标**（[_ARCHIEVED_05-PLAN-v3-architecture-tuning.md § 12](./_ARCHIEVED_05-PLAN-v3-architecture-tuning.md) 完整规划）：
- **v4.1** 错题注入专项（P1.6 干扰项错题库 + P1.8 20% 注入）— 用户指定下一目标
- **v3.1** G3 端到端集成测试
- **v4.2** P3 L2.5 难度等级
- **v2.4.1-3** D3 useChart / C6 出题聚合 / Practice.vue 拆分

---

## 推荐阅读顺序

| # | 文档 | 性质 | 何时读 |
|---|------|------|--------|
| 1 | **[ARCHITECTURE.md](./ARCHITECTURE.md)** | 架构宪法 | 必读 — 任何 PR 前看一遍 |
| 2 | **[DESIGN.md](./DESIGN.md)** | 产品设计 | 业务必读 — 出题流程、profile、stats 三套设计 |
| 3 | **[IMPLEMENTATION_HISTORY.md](./IMPLEMENTATION_HISTORY.md)** | 实施过程 | 选读 — 了解 v2.3+v3 "过去怎么走到这" |
| 4 | [03-PLAN-v2-roadmap.md](./03-PLAN-v2-roadmap.md) | 业务路线图 | 选读 — P0-P5 业务优先级 + 状态 |
| 5 | [10-IdeaByUser.md](./10-IdeaByUser.md) | 用户原始创意 | 业务必读 |

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
│   ├── 03-PLAN-v2-roadmap.md              P0-P5 业务路线图
│   ├── 07-PLAN-v2-ui-roadmap.md           UI 业务 v3.0+ 规划
│   └── 10-IdeaByUser.md                   用户原始创意汇总
│
├── 实施历史（参考）
│   └── IMPLEMENTATION_HISTORY.md          v2.3+v3 实施过程（合并历史）
│
│   └── _ARCHIEVED_*.md                         已落地计划 / 报告 / smoke test（不读）
    ├── _ARCHIEVED_02-PROGRESS.md          v3 收尾前的逐行 commit 日志
    ├── _ARCHIEVED_04-PLAN-v2-architecture-refactor.md   v2.3 7 阶段计划（已落地）
    ├── _ARCHIEVED_05-PLAN-v3-architecture-tuning.md    v3 8 大组计划（已落地）
    ├── _ARCHIEVED_06-PLAN-v2-ability-analysis.md       P2 阶段（已落地）
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
       │         ↓ 业务规划
       │         [03-PLAN-v2-roadmap]            v2 路线图（P0-P4）
       │              │
       │              ├──→ [07-PLAN-v2-ui-roadmap]   UI 路线图
       │              └──→ [10-IdeaByUser]           用户原始创意
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
| v2 整体规划 | [03-PLAN-v2-roadmap.md](./03-PLAN-v2-roadmap.md) |
| 怎么把代码迁成目标态 | [_ARCHIEVED_04-PLAN-v2-architecture-refactor.md](./_ARCHIEVED_04-PLAN-v2-architecture-refactor.md) |
| 怎么清死代码 / 调优 | [_ARCHIEVED_05-PLAN-v3-architecture-tuning.md](./_ARCHIEVED_05-PLAN-v3-architecture-tuning.md) |
| 产品设计 | [DESIGN.md](./DESIGN.md) |
| P2 阶段细节 | [_ARCHIEVED_06-PLAN-v2-ability-analysis.md](./_ARCHIEVED_06-PLAN-v2-ability-analysis.md) |
| UI 规划 | [07-PLAN-v2-ui-roadmap.md](./07-PLAN-v2-ui-roadmap.md) |
| 出题流程业务 | [DESIGN.md](./DESIGN.md) |
| 浏览器实测细节 | [_ARCHIEVED_12-TODO-browser-smoke-test-v2.3.md](./_ARCHIEVED_12-TODO-browser-smoke-test-v2.3.md) |
