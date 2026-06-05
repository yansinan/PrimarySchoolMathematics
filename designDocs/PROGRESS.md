# PrimarySchoolMathematics 进度记录

> 跟踪版本、阶段、UI 可见性。最后更新：2026-06-05（v2.2.0 P2 收口）

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
| `5c3bf73` | 阶段 3：错题分析（getWrongAnswers / evaluateCorrectionEffect / prioritizeWrongAnswers） |
| `f4ee1b9` | 阶段 4：学习曲线（getLearningCurve / getNumberCurve） |
| `bdea0eb` | 阶段 5：动态弱项/强项（getDynamicWeakness / getDynamicStrength） |
| `74bc8f4` | 阶段 6：useAbilityAnalysis composable |
| `bd44b8e` | 阶段 7：AbilityCard 4 新 props（向后兼容） |
| `52c62cd` | 阶段 8+9：vitest + fake-indexeddb + 2 spec files + review A/B/D/E 清理 |
| `48fab82` | 修 3 个 vitest fail（2 product + 1 test） |
| `ee1fae6` | AbilityCard 真实浏览器 smoke test 计划（agent-test 出品） |

### 关键决策
1. **DB 只存元数据**：聚合结果（弱项/强项/曲线）现算，符合原架构
2. **向后兼容**：AbilityCard 4 新 props 有 default，老调用方不破
3. **1-strike 软规则留 v2.x**：v2.2.0 用 minSample=3 过滤弱项判定
4. **schema 命名**：questions 表用 `&equation` unique（去重）
5. **测试策略**：vitest 单测 33 个 + agent-test 真浏览器 smoke test（计划阶段）

### UI 可见性清单（merge 后用户能直接看到的变化）

| 改动 | 用户能看到？ | 备注 |
|------|--------------|------|
| DB schema 升级到 v3 | ❌ | 浏览器后台自动跑迁移 |
| questions 表数据积累 | ❌ | devtools 可见 |
| 11 个新 service 函数 | ❌ | 没人调（composable 空转） |
| useAbilityAnalysis composable | ❌ | 没人 import |
| AbilityCard 4 新 props | ❌ | **template 完全没引用** |
| 33 个单测 | ❌ | 开发者视角（`npm test`） |
| **总计** | **🟡 0 视觉变化** | |

### 验证状态
- ✅ `npx vite build` 通过
- ✅ `npm test` 33/33 全过
- ✅ 3 个 agent-review 阶段通过（PASS / PASS-WITH-MINOR）
- ❌ **未在真浏览器测过**（dev server 在跑但用户没走完流程验收）

### 已知遗留（v2.x）
详见 [PLAN-v2-ability-analysis.md](PLAN-v2-ability-analysis.md) § 8 "未来扩展" + [PLAN-browser-smoke-test.md](PLAN-browser-smoke-test.md)：
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
