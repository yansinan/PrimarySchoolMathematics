# PLAN-V2: 自适应出题策略优化

> 基于用户画像的多维度选举方案（方案C）
> 目标：让出题从"只认难度等级"变为"等级 × 运算符 × 数字"三级协同

---

## 1. 现有逻辑总结

### 核心流程

```
[用户画像] → strongLevelIndices / weakLevelIndices (matchLevel 实时计算)
     ↓
[generateQuestionPlan] → 按组类型比例生成排列数组
  组1 confidence: strong 60%, weak 20~40%, challenge 15%
  组2 repair:     strong 40%, weak 40~60%, challenge 0%
  组3~N-1 mixed:  strong 40%, weak 40%,    challenge 20%
  组N confidence: 同组1
     ↓
[按排列逐题生成 → reserve pool 3题]
     ↓
[每答一题 adjustNextQuestion]
  步骤A: 换题 — 下一题不匹配任何类型 → 从 pool 替换
  步骤B: 横式掌握验证 — 连续答对2题非横式 → 下一题进横式
  步骤C: 调辅助力度 — 弱项变强→减辅助; 强项变弱→加辅助
     ↓
[evaluateGroup] → 下一组大小/难度/是否结束
```

### 当前使用的画像维度

| 维度 | 数据来源 | 出题中是否使用 |
|------|---------|:---:|
| **等级强项 (strongLevelIndices)** | `groupAnswersByLevel(diagAnswers).filter(≥0.95)` | ✅ 用于 strong slot 选级 |
| **等级弱项 (weakLevelIndices)** | `groupAnswersByLevel(diagAnswers).filter(<WEAK_THRESHOLD)` | ✅ 用于 weak slot 选级 |
| **当前难度 (difficultyIdx)** | 诊断评估 + evaluateGroup 升降级 | ✅ 出题参数 |
| **组内实时准确率** | roundAnswers 实时计算 | ✅ 步骤B |

### 未使用的画像维度

| 维度 | 数据来源 | 位置 | 出题中是否使用 |
|------|---------|------|:---:|
| **数字掌握度 (0-9)** | `_getMasteryByNumberFromAnswers` | `analysis.js` | ❌ |
| **运算符正确率** | `operatorBreakdown` | `stats.js` store | ❌ |
| **连续练习数据** | 多年累积的 Profile | IndexedDB | ❌ |

---

## 2. 现有策略的问题

### P1: WEAK_THRESHOLD 实际值疑似 0.95 → 弱项区分度为零

```
// constants/practice.js:147
export const WEAK_THRESHOLD = 0.95  // 实际含义：<95% 即弱项
```

使用：`weakLevelIndices = diagGroups.filter(g => g.accuracy < WEAK_THRESHOLD)`

**后果**：accuracy < 95% 的全部被算作弱项。正常用户大部分难度等级在 70-100% 之间，导致几乎每个 level 都是"弱项"，失去区分度。

**需核实**：此前 B7/B9 修复目标是 WEAK_THRESHOLD=0.5，当前代码为 0.95，可能是修复遗留或后续修改导致。

### P2: 题目运算符纯随机，不感知用户弱项

`pickStrongLevel`/`pickWeakLevel` 只选了 DIFFICULTY_LEVELS 索引，不关心该 level 下 operator 的选择。如果用户对减法明显弱于加法，出题器不会做任何倾斜。

### P3: 数字粒度完全缺失

用户画像是有的（数字 0-9 准确率，统计面板已展示），但出题环节不参考。例如用户数字 7 准确率 40%，但出题器仍按随机 operand 出题，可能连续 10 题都不碰 7。

### P4: generateOneQuestion 接口不接收 hints

`paperGenerator.js` 的 `generateOneQuestion(levelIdx, config)` 只接受 levelIdx 和基本配置，没有入口传入 operator / number 偏好。

---

## 3. 优化方案：三级选举（方案C）

### 3.1 原理

```
传统：
  [选等级] → [随机operator] → [随机operand] → 出题

方案C：
  [选等级] ─→ [选operator权重] ─→ [选number权重] ─→ 出题
     ↑             ↑                   ↑
  strong/weak    operatorBreakdown   weakNumberMap
  (已有)          (stats store)       (analysis.js)
```

### 3.2 各维度选举规则

#### 等级维度（不变）

- `pickStrongLevel(indices, currentDifficulty)` — 索引越高权重越大
- `pickWeakLevel(indices, currentDifficulty)` — 索引越低权重越大
- 约束范围：strong [current-1, +3], weak [current-2, current]

#### 运算符维度（新增）

每一题在选定等级后，根据 slot 类型加权选择 operator：

```js
// 伪代码
function pickOperator(engine, slotType) {
  const opBreakdown = getOperatorBreakdown()   // { '+': 95%, '-': 60% }
  const opWeights = { '+': 1, '-': 1 }

  if (slotType === 'weak') {
    // weak slot: 倾向用户薄弱的运算符 ×2
    Object.keys(opWeights).forEach(op => {
      const acc = opBreakdown[op] || 0.5
      if (acc < 0.5) opWeights[op] *= 2       // 极度薄弱 → 高强度练习
      else if (acc < 0.8) opWeights[op] *= 1.5 // 较弱 → 适度倾斜
      else opWeights[op] *= 0.8               // 擅长的 → 减少占用
    })
  } else if (slotType === 'strong') {
    // strong slot: 倾向用户擅长的 ×1.5
    Object.keys(opWeights).forEach(op => {
      const acc = opBreakdown[op] || 0.5
      if (acc >= 0.95) opWeights[op] *= 1.5   // 强项 → 保持手感
      else opWeights[op] *= 1                 // 中等 → 不倾斜
    })
  }
  // challenge slot: 不倾斜，保持中性

  return weightedRandom(['+', '-'], [opWeights['+'], opWeights['-']])
}
```

#### 数字维度（新增）

选定 operator 后，从 weakestNumberMap 中取最弱的数字提高出现概率：

```js
// 伪代码
function pickNumberTarget(slotType, weakNumberMap) {
  // weakNumberMap: [{ number: 7, accuracy: 0.42 }, { number: 8, accuracy: 0.55 }, ...]
  // 按准确率升序排列

  if (slotType === 'weak' && weakNumberMap.length > 0) {
    // 取 top-3 最弱数字，权重按弱度分配
    const top3 = weakNumberMap.slice(0, 3)
    const weights = top3.map(n => 1 - n.accuracy)
    return weightedRandom(top3, weights).number
  }

  // strong/challenge slot: 返回 null（不限制数字）
  return null
}
```

### 3.3 接口改造

#### paperGenerator.generateOneQuestion 补充 hints 参数

```js
// 原接口
generateOneQuestion(levelIdx, config)

// 新接口（向后兼容）
generateOneQuestion(levelIdx, config, hints = {})
// hints: { preferredOperator: '+' | '-', preferredNumber: 7 }
// 实现方式：
//   1. operator 偏好 → formulaList 过滤时优先匹配
//   2. number 偏好 → 在已有的 formulaList 中，提高包含该数字的 operand 生成概率
//   3. 不强制，允许 fallback（当无法生成满足 hint 的题时，回退到无 hint 逻辑）
```

### 3.4 adaptiveBatch 调用链改造

```
generateAdaptiveBatch(engine, profile, config)
  ↓
for each slot in plan:
  levelIdx = pickStrongLevel / pickWeakLevel / challenge
  operator  = pickOperator(engine, slotType)           ← 新增
  number    = pickNumberTarget(slotType, weakNumberMap) ← 新增
  q         = generateOneQuestion(levelIdx, config, { preferredOperator, preferredNumber })
  ↓
diversifyBatch → adjustNextQuestion
```

### 3.5 影响范围

| 文件 | 改动 | 架构层 |
|------|------|:------:|
| `src/constants/practice.js` | **修 WEAK_THRESHOLD = 0.5**（如确认为遗留问题） | K |
| `src/utils/algorithm/adaptiveEngine.js` | 新增 pickOperator / pickNumberTarget 导出；generateQuestionPlan/pickStrongLevel/pickWeakLevel 接口不变 | U |
| `src/utils/algorithm/adaptiveBatch.js` | generateAdaptiveBatch 中逐题调用 pickOperator/pickNumberTarget，传 hints | U |
| `src/utils/paperGenerator.js` | generateOneQuestion 接受 hints 参数，优先匹配 preferredOperator/preferredNumber | U |
| `src/utils/services/analysis.js` | 导出 getWeakNumberMap 按准确率升序返回数字 0-9 列表 | S |
| `src/stores/stats.js` | 确认 operatorBreakdown 导出接口 | S |

### 3.6 不变的部分

- ❌ `generateQuestionPlan` 排列逻辑（组类型/比例不变）
- ❌ `evaluateGroup` 结束条件
- ❌ `adjustNextQuestion` 换题/横式/辅助力度逻辑
- ❌ `ASSIST_LEVELS` / 输入模式系统
- ❌ 不新增组件/页面/API

---

## 4. 验证方式

1. 诊断后进入自适应，DebugPanel 查看每题的 `preferredOperator / preferredNumber` 是否按画像倾斜
2. 注入减法弱画像 → weak slot 应看到更多减法题
3. 注入数字 7 弱画像 → weak slot 应看到更多含 7 的 operand
4. WEAK_THRESHOLD 修后，等级强弱项应有明显区分（不再全弱）

---

## 5. 待定项

- [ ] WEAK_THRESHOLD 当前值 0.95 确认：是 B7/B9 修后遗留 bug 还是有意识设计？
- [ ] `pickOperator` / `pickNumberTarget` 的权重系数是否需要从 constants 导出以供调参？
- [ ] preferredNumber hint 的"提高出现概率"具体算法：+50%？+100%？随机选取？
