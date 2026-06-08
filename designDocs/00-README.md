# PrimarySchoolMathematics 设计文档总目录

> 设计文档入口。版本化、编号化、可逐项 review。

---

## 当前进度（2026-06-08）

**v3 架构调优已全部完成**（A/B/C/D/E/F/G/H 8 大组）。详见 [02-PROGRESS.md](02-PROGRESS.md) "v3 调优"段。
**下一目标**：回归 [03-PLAN-v2-roadmap.md](03-PLAN-v2-roadmap.md) 业务/UI 改进（P0-P3 任务），或合并 v3 分支入主干。
**详见**：[02-PROGRESS.md](02-PROGRESS.md)。

---

## 推荐阅读顺序

按以下顺序读，能形成完整 V2 → V3 的进度图：

| # | 文档 | 性质 | 何时读 |
|---|------|------|--------|
| 1 | **[01-ARCHITECTURE.md](01-ARCHITECTURE.md)** | 架构宪法 | 必读 — 任何 PR 前看一遍 |
| 2 | **[02-PROGRESS.md](02-PROGRESS.md)** | 进度跟踪 | 必读 — 知道现在在哪 |
| 3 | **[03-PLAN-v2-roadmap.md](03-PLAN-v2-roadmap.md)** | v2 路线图总图 | 选读 — 理解 P0-P4 优先级 |
| 4 | **[04-PLAN-v2-architecture-refactor.md](04-PLAN-v2-architecture-refactor.md)** | arch 重构 7 阶段 | 选读 — 实施 v2 整改用 |
| 5 | **[05-PLAN-v3-architecture-tuning.md](05-PLAN-v3-architecture-tuning.md)** | v3 调优（A/B/C/D 等）| 选读 — 实施 v3 整改用 |
| 6 | [06-PLAN-v2-ability-analysis.md](06-PLAN-v2-ability-analysis.md) | P2 阶段 | 归档参考 |
| 7 | [07-PLAN-v2-ui-roadmap.md](07-PLAN-v2-ui-roadmap.md) | UI 路线图 | 归档参考 |
| 8 | [08-PLAN-v2-自适应出题.md](08-PLAN-v2-自适应出题.md) | 自适应出题（已暂缓）| 归档参考 |
| 9 | [09-DESIGN.md](09-DESIGN.md) | 出题流程产品设计 | 业务必读 |
| 10 | [10-IdeaByUser.md](10-IdeaByUser.md) | 用户原始创意 | 业务必读 |
| 11 | [11-PLAN-browser-smoke-test.md](11-PLAN-browser-smoke-test.md) | smoke test 计划（旧）| 历史参考 |
| 12 | [12-TODO-browser-smoke-test-v2.3.md](12-TODO-browser-smoke-test-v2.3.md) | smoke test 清单 | 已完成项参考 |
| - | [_ARCHIVED_13-SMOKE-TEST-REPORT-v2.3.md](_ARCHIVED_13-SMOKE-TEST-REPORT-v2.3.md) | **已归档**（被 12 取代）| 不读 |

---

## 文档关系图

```
[01-ARCHITECTURE]   ← 宪法性，所有文档的上位
       │
       ↓ 引用
[02-PROGRESS]  ← 当前在哪步
       │
       ├──→ [03-PLAN-v2-roadmap]            v2 路线图（P0-P4）
       │         │
       │         ├──→ [06-PLAN-v2-ability-analysis]   P2 阶段
       │         ├──→ [07-PLAN-v2-ui-roadmap]          UI 路线图
       │         └──→ [08-PLAN-v2-自适应出题]          （已暂缓）
       │
       ├──→ [04-PLAN-v2-architecture-refactor]   v2 arch 7 阶段
       │         │
       │         └──→ [09-DESIGN] / [10-IdeaByUser]   业务必读
       │
       └──→ [05-PLAN-v3-architecture-tuning]   v3 调优（A/B/C/D/E/F/G/H）
                 │
                 ├──→ [12-TODO-browser-smoke-test]   smoke 清单
                 └──→ [_ARCHIVED_13-...-report]      已合并
```

---

## 编号规范

- **`00-README.md`** — 入口
- **`01-09-*.md`** — 主线（架构 + 进度 + 计划）
- **`10-99-*.md`** — 历史 / 业务 / 测试
- **`_ARCHIVED_XX-*.md`** — 归档（不读，仅保留历史）

字母后缀无序（按阅读顺序排）— 如需进一步分类，加数字小数位（如 `04.1-...`）

---

## 速查表

| 想看什么？ | 看哪份 |
|-----------|--------|
| 当前架构 + 死代码 | 01 |
| 已经做了哪些 | 02 |
| v2 整体规划 | 03 |
| 怎么把代码迁成目标态 | 04 |
| 怎么清死代码 / 调优 | 05 |
| P2 阶段细节 | 06 |
| UI 规划 | 07 |
| 出题流程业务 | 09 |
| 浏览器实测细节 | 12 |
