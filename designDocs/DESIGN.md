# 掌握值（Mastery）设计

## 动机

错题反复出现、无法区分"刚错的"和"快练会的"。需要一个**掌握度**量化每道题的真实掌握程度。

## 核心规则

- 每道 equation 独立计算掌握值
- **答错**：`mastery -= 100`
- **改正**（之前答错过，这次答对）：`mastery += 30 + modeBonus`
- **阈值**：`>= 100` → 完全掌握，从错题池排除
- **下限**：`-999`

### 题型加成（modeBonus）

| inputMode        | bonus |
|------------------|-------|
| horizontal_keypad| +20   |
| vertical_keypad  | +10   |
| choice4          | +5    |
| choice2          | +0    |

竖式/横式改正含金量更高 → 分更高。

## 计算 vs 存储

**纯计算**（当前方案）：每次加载错题池时从所有 answer 记录中归算。输入字段全在 `db.answers`：
- `userAnswer === solution` → 是否正确
- `previousAttemptCount > 0` → 是否是改正（非首次答）
- `inputMode` → 题型加分

**不存 DB**，无同步问题。

## 与强弱项结合（TODO）

### ① 强弱项加权（已记入 TODO）
- 弱项 level 内 mastery 低的题目 → 加重该 level 的弱项权重
- 强项 level 内 mastery ≥ 100 占多数 → 标记"已巩固"，降低出现频率

### ② 引擎选题参考 mastery（已记入 TODO）
- `pickWeakLevel()` 返回最低弱项后，选该 level 内 mastery 最低的 equation
- `pickStrongLevel()` 排除 mastery ≥ 100 的题目

### ③ 错题池按 mastery 升序（✅ 已实现）
- `WrongAnswer.dedup()` 返回结果按 mastery 升序排列，最不熟的排最前面

### ④ adjustNextQuestion 选最低 mastery（✅ 已实现）
- 连对 3 题触发复习时，从候选中选 mastery 最低的题，而非随机

## 配置（可调）

```js
MASTERY_WRONG_PENALTY   = -100
MASTERY_CORRECT_REWARD  = 30
MASTERY_THRESHOLD       = 100
MASTERY_MODE_BONUS      = { horizontal_keypad: 20, vertical_keypad: 10, choice4: 5, choice2: 0 }
```

---

## 未来考虑

### 评估（assessment）阶段不显示在 session 列表

评估题（前 5 题诊断）通过 `savePerQuestion` → `Answer.save()` 以游离记录（无 `sessionId`）写入 `db.answers`，不创建 `practiceSessions` 行。因此：
- 评估记录不显示在「最近练习」列表
- 评估数据计入聚合统计（`getAggregatedStats` 有专门的 `orphans` 处理）
- 如需显示为独立 session，需在评估完成时额外调用 `PracticeSession.save()`
- 决策记录：2026-06-12 暂不加，留待以后考虑
