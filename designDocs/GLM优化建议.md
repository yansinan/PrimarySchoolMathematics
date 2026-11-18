# PrimarySchoolMathematics — 全量代码审查 & 优化建议

> **审查基准**: `designDocs/ARCHITECTURE.md`（v4.3）+ `designDocs/DESIGN.md` + `DESIGN.md`
> **审查日期**: 2026-06-21
> **项目版本**: v2.3+（A1/D2/P2 多轮重构后）
> **状态更新**: 2026-11-18

## 实施状态（2026-11-18 复核）

| 编号 | 问题 | 状态 |
|---|---|---|
| C8 | 生产环境 console.log 残留 | ✅ 已修：`EquationSolver` / `PrintPreviewDialog` 等处加 `import.meta.env.DEV` 守卫 |
| N1 | `CONSECUTIVE_GOOD_TO_ADVANCE` 命名误导（也用于降级） | ✅ 已改为 `MIN_CONSECUTIVE_FOR_TRANSITION` |
| N2 | `Question.toJSON()` 缺 `blankMode` / `inputMode` | ✅ 已补 |
| A1 | `analysis.js` 文件头路径注释过时 | ✅ 已修 |
| D1 | `GROUP_SIZES` 与 DESIGN.md 不符 | ✅ DESIGN.md 已同步 `[6, 10, 14, 18, 22]` |
| D2 | 难度等级数 | ⚠️ **结论已过时**：审查时为 12 级，2026-11 已按人教教材进度重排为 **24 级**；DESIGN.md 已按 24 级更新 |
| D3 | DESIGN.md 缺常量引用 | ✅ 已补 `ASSESSMENT_ABORT_WRONG_STREAK` |
| V1 | `Practice.vue` 直引 U 层（`listPracticesGuard`） | ❌ 未修，仍在 `Practice.vue:181` |
| U1 | `utils/score.js` 直引 S 层（`@/services`） | ❌ 未修 |
| N3 | `PracticeSession.create` 无重试/幂等 | ❌ 未修 |

> D2 的教训值得记一笔：审查结论有时效性。**改动文档前先跑一遍代码核实当前值**，
> 别照着旧报告的结论改 —— 这次把「16 级」改成「12 级」时，代码已经是 24 级了。

---

## 一、架构合规 (ARCHITECTURE.md §1.2)

### 六层跨层规则速查

| 调用方 ↓ \\ 被调方 → | V | C | S | U | M | K |
|---|---|---|---|---|---|---|
| **V** (View) | — | ✅ | ❌ | ❌ | ✅ 只读 | ✅ |
| **C** (Composable) | ❌ | — | ✅ | ✅ | ✅ | ✅ |
| **S** (Service) | ❌ | ❌ | — | ✅ | ✅ 只读 | ✅ |
| **U** (Util) | ❌ | ❌ | ❌ | — | ❌ | ✅ |
| **M** (Model/Store) | ❌ | ❌ | ❌ | ✅ | — | ✅ |

---

### 🔴 V1: Practice.vue 直引 U 层（V→U 违规）

**文件**: `src/components/Practice.vue:108`

```js
import { decideListPracticesTransition } from '@/utils/listPracticesGuard'
```

**问题**: `Practice.vue` 是 V 层（View），`@/utils/` 是 U 层（Util）。跨层规则表中 V→U = ❌。

**依赖链现状**:

```
Practice.vue (V)
  └→ utils/listPracticesGuard.js (U)  ← 违规直引
      └→ 纯函数：根据 listPractices 状态变化决定 transition 类型
```

`listPracticesGuard.js` 本身是一个纯函数模块（95 行），内容不含副作用，职责是封装 Practice.vue watch(listPractices) 中的防御性逻辑。

**修正方向**（两种方案）:

**方案 A（推荐）**: 将 `listPracticesGuard.js` 升层到 `services/`。
   - `listPracticesGuard.js` 虽然是纯函数，但逻辑上属于"业务编排"——决定当题目列表变化时应该执行什么转换
   - 迁至 `src/services/listPracticesGuard.js`
   - `services/index.js` 桶导出
   - Practice.vue 改引 `@/services`

**方案 B**: 在 `composables/` 层包装。
   - 在 `useSubmitHandler.js` 或新建 `useListPracticesGuard.js` 中封装
   - Practice.vue 通过 composable 调用
   - 优点是保持 U 层纯净（纯算法不放业务规则）

---

### 🔴 U1: `src/utils/score.js` 直引 S 层（U→S 违规）

**文件**: `src/utils/score.js:1`

```js
import { Answer } from '@/services'
```

**问题**: `utils/score.js` 是 U 层（Util），`@/services/` 是 S 层（Service）。跨层规则表中 U→S = ❌。

**依赖链现状**:

```
utils/score.js (U 层)
  └→ services/Answer.js (S 层)  ← 违规直引
      └→ Answer.score getter（实例方法）
```

`score.js` 中的三个函数涉及此违规：

| 函数 | 是否使用 Answer | 层级 | 
|------|-----------------|------|
| `computeScore(attemptCount)` | 纯函数，无依赖 | ✅ 可留 U 层 |
| `buildAttemptScore(prev, answer, solution)` | 纯函数，无依赖 | ✅ 可留 U 层 |
| `getAnswerScore(answer)` | 是—`new Answer(answer).score` | ❌ 应迁 S 层 |
| `sumAnswerScores(answers)` | 是—依赖 `getAnswerScore` | ❌ 应迁 S 层 |
| `sumResponseTimes(answers)` | 纯函数，无依赖 | ✅ 可留 U 层 |

**修正方向**（两种方案）:

**方案 A（推荐）**: 分割 `score.js`。
   - 保留纯函数 `computeScore`、`buildAttemptScore`、`sumResponseTimes` 在 `utils/score.js`（U 层）
   - 将 `getAnswerScore`、`sumAnswerScores` 迁至 `services/score.js`（S 层）
   - 改动面：
     - 新建 `src/services/score.js`，移入 `getAnswerScore` + `sumAnswerScores`
     - `services/index.js` 桶导出 `export * from './score'`
     - 更新所有 import：`adaptiveEngine.js`、`useAdaptiveSession.js`、`PracticeSession.js` 等

**方案 B**: 重构 `getAnswerScore` 消除 Answer 依赖。
   - 改为接受一个可选的 `scoreFn` 回调参数（DI 模式）
   - 保留 `sumAnswerScores` 在 U 层，调用者传入 `(answers, scoreFn)` 
   - 优点：不动文件位置
   - 缺点：接口变复杂，所有调用方需调整

---

### 🟡 A1: `analysis.js` 文件头路径注释过时

**文件**: `src/services/analysis.js:1`

```js
// filepath: src/utils/services/analysis.js
```

**问题**: 注释声明文件在 `utils/services/`，但实际在 `services/`。这是从 U 层升到 S 层后的残留注释。

**修正**: 改为 `// filepath: src/services/analysis.js`

---

## 二、设计文档 vs 实现偏差

### 🔴 D1: GROUP_SIZES 与 DESIGN.md 不符

| 来源 | 值 | 
|------|-----|
| DESIGN.md §三 分组练习 | `[4, 5, 6, 7, 8, 10, 12]` |
| `adaptiveEngine.js:37` | `[6, 10, 14, 18, 22]` |

**分析**: DESIGN.md 定义的序列从 4 题起步，增幅小（+1 → +2）。代码的序列从 6 题起步，增幅大（+4）。经确认，`[6, 10, 14, 18, 22]` 是当前实际使用的值，DESIGN.md 未同步更新。

**修正**: 更新 DESIGN.md 中的序列为 `[6, 10, 14, 18, 22]`。

---

### 🟡 D2: 难度等级数：文档声称 vs 实际

| 来源 | 数量 |
|------|------|
| DESIGN.md 设计哲学 "共 16 级" | 16 |
| DESIGN.md §二 详细表格合计 | 12 |
| `DIFFICULTY_LEVELS` 常量 | 12 |

**分析**: "16 级" 是笔误。表格和实现一致为 12 级。

**修正**: 修正 DESIGN.md "共 16 级" → "共 12 级"。

---

### 🟡 D3: 常量命名偏差

| DESIGN.md | 代码 | 
|-----------|------|
| `ANALYSIS_ABORT_WRONG_STREAK`（不存于 doc） | `ASSESSMENT_ABORT_WRONG_STREAK = 2` |

**分析**: 两者语义一致。DESIGN.md 未提及此常量名，无需代码修改。但 DESIGN.md §一 评估流程中描述的"连续错 2 题 → 提前结束评估"与代码行为一致，只是缺少常量名引用。可选项：在 DESIGN.md 对应位置添加常量名引用。

**修正**: 在 DESIGN.md §一 评估流程中加入常量引用。

---

## 三、生产环境日志残留 (refactor-todo C8)

### 🔴 必须修复：无 `import.meta.env.DEV` 守卫的 console.log

| 文件 | 行号 | 内容 | 处理方式 |
|------|------|------|---------|
| `utils/algorithm/EquationSolver.js` | 57-58 | `console.log('原始方程:', ...)`，`console.log('标准化:', ...)` | 加守卫 |
| `utils/algorithm/EquationSolver.js` | 420-428 | 测试代码块（含 '======== 测试开始 ========'） | **移入 test/** |
| `utils/algorithm/psm.js` | 508 | `console.log(\`程序运行时间:...\`)` | 加守卫 |
| `components/generate/PrintPreviewDialog.vue` | 123 | `console.log('After print')` | 加守卫 |

### ✅ 已合规

以下文件已使用 `import.meta.env.DEV` 守卫：
- `Print.vue:72/82/87`
- `Generate.vue:111/133/213`
- `paperGenerator.js:64`（已注释）
- `Question.js:410-413`（console.debug，合理）

---

## 四、代码质量

### 🟡 N1: `CONSECUTIVE_GOOD_TO_ADVANCE` 用于降级分支（命名误导）

**文件**: `adaptiveEngine.js:271` 和 `:280`

```js
// 升阶（line 271）
engine.consecutiveGood >= CONSECUTIVE_GOOD_TO_ADVANCE && ...
// 降阶（line 280）
engine.consecutiveBad >= CONSECUTIVE_GOOD_TO_ADVANCE && ...
```

两者都用同一常量 `CONSECUTIVE_GOOD_TO_ADVANCE = 3`。功能正确（连续 3 组即可触发方向变化），但降级分支读 `_GOOD_TO_ADVANCE` 语义矛盾。

**修正**: 合并为统一常量 `MIN_CONSECUTIVE_FOR_TRANSITION = 3`，同时用于好路径和差路径。

---

### 🟡 N2: `Question.toJSON()` 未包含 `blankMode`

**文件**: `Question.js:255-261`

```js
toJSON() {
  return {
    id: this.id, equation: this.equation, solution: this.solution,
    operator: this.operator,
    createdAt: this.createdAt, synced: this.synced,
  }
}
```

`blankMode` 字段未在 `toJSON()` 中序列化。由于 `Answer.toJSON()` 通过 `...super.toJSON()` 继承，`blankMode` 会丢失。

**影响**: 低。`blankMode` 默认 `'result'` 在 DB schema 中有默认值。仅当通过 `fromJSON → toJSON` 全链路传输时，`typeLabel` 的 `blankMode !== 'result'` 判定可能失效。

**修正**: 在 `toJSON()` 中添加 `blankMode: this.blankMode`。

---

### 🟡 N3: `PracticeSession.create` 无重试/幂等

**文件**: `PracticeSession.js:32-56`

**问题**: `DB.practiceSessions.add()` 在抛出 Dexie `DataCloneError` 时有 try/catch 日志，但**不做任何重试**。如果 `configSnapshot` 从 Pinia store 传递时仍存在 Vue Proxy 残留，`safeClone` 也无法完全消除时，会静默返回 `null`。

`safeClone` 当前实现：
```js
const safeClone = (v) => {
  if (v == null || typeof v !== 'object') return v
  try { return JSON.parse(JSON.stringify(v)) } catch { return v }
}
```

如果 `JSON.parse(JSON.stringify(v))` 成功但 Dexie 的 structured clone 仍然失败（Dexie 内部对复杂嵌套对象有额外限制），`safeClone` 返回了 clone 后的值，但 `DB.practiceSessions.add()` 仍可能报错。

**修正方案**:

```
1. Issue 根因: Pinia reactive Proxy → JSON.stringify 成功 ≠ Dexie 接受的 structured clone
2. 解决方案: safeClone 成功的基础上，在失败时回退到只保存关键字段
3. 只保存 configSnapshot 的经允许列表挑选的子集（白名单模式）
4. 具体实施:
   - 在 safeClone 后若 add 失败，catch 中尝试只保存 {targetMin, targetMax, difficultyIdx} 等数字字段
   - 这样即使 configSnapshot 无法完整保存，关键统计信息不丢失
5. 可选的进一步: 将 practiceSessionId 的创建过程提升到 callByCreate 中，确保 session 骨架总能创建成功
```

---

## 五、测试覆盖现状

**已有测试**（6 个 spec 文件）：

| 测试 | 文件 |
|------|------|
| score 工具函数 | ✅ `test/utils/score.spec.js` |
| listPracticesGuard | ✅ `test/utils/listPracticesGuard.spec.js` |
| answer 算法 | ✅ `test/utils/algorithm/answer.spec.js` |
| WrongAnswer 服务 | ✅ `test/services/wrongAnswerService.spec.js` |
| analysis 服务 | ✅ `test/services/analysis.spec.js` |
| DB 迁移 | ✅ `test/utils/database/migration.spec.js` |

**缺失的关键测试**（暂跳过的项）：

| 模块 | 建议测试文件 |
|------|-------------|
| adaptiveEngine | `test/services/adaptiveEngine.spec.js` |
| abilityProfile | `test/services/abilityProfile.spec.js` |
| PracticeSession | `test/services/PracticeSession.spec.js` |
| composable | `test/composables/` |

---

## 六、实施优先级

| 级别 | ID | 描述 | 状态 |
|------|-----|------|------|
| 🔴 | V1 | Practice.vue → listPracticesGuard V→U 违规 | ⏳ 待修 |
| 🔴 | U1 | score.js → Answer U→S 违规 | ⏳ 待修 |
| 🟡 | A1 | analysis.js 文件头路径注释过时 | ✅ 已修复 |
| 🔴 | D1 | GROUP_SIZES DESIGN.md 不同步 | ✅ 已修复 |
| 🟡 | D2 | "16 级" 笔误 | ✅ 已修复 |
| 🟡 | D3 | 常量命名偏差（补齐文档引用） | ✅ 已修复 |
| 🔴 | C8 | EquationSolver.js 无守卫 console.log | ✅ 已修复 |
| 🔴 | C8 | psm.js 无守卫 console.log | ✅ 已修复 |
| 🔴 | C8 | PrintPreviewDialog.vue 无守卫 console.log | ✅ 已修复 |
| 🔴 | C8 | EquationSolver.js 测试代码块移入 test/ | ✅ 已修复 |
| 🟡 | N1 | 统一 CONSECUTIVE_GOOD_TO_ADVANCE 命名 | ✅ 已修复 |
| 🟡 | N2 | Question.toJSON() 加 blankMode | ✅ 已修复 |
| 🟡 | N3 | PracticeSession.create 重试方案 | 📋 已详述（见文档 §四） |
| ⏭️ | 测试 | adaptiveEngine/Profile/PracticeSession 单测 | ⏭️ 跳过 |

---

*本文件根据 `designDocs/GLM优化建议.md` 模板生成*
