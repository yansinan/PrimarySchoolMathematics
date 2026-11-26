# 自定义练习分组 + 自评：可行性评估

> 2026-11-26 · 状态：**评估（未实施）** · 关联 TODO U1
> 目标：自定义练习（手动题单）分成 N 组（= N 张卷子）时，**每组结束的流程与自适应练习一致**：组反馈 → 自评 → 下一组；最后一组结束再出整轮总结。

## 一、现在的行为（代码事实）

| 环节 | 现状 | 位置 |
|---|---|---|
| 题单生成 | `generateFormulas()` 把所有 `papers` 的题目**拍平成一个数组**塞进 `listPractices` | `Generate.vue:293-350` |
| 题单来源标记 | `setListSource('manual')` | `Generate.vue:346` |
| 逐题推进 | `handleNext()` → `practiceStore.nextQuestion()` | `Practice.vue:654` |
| 收尾判定 | `isLastQuestion` 是**整轮**最后一题 | `stores/practice.js:86` |
| 完成分支 | 手动题单走 `handlePracticeComplete()`：**一次汇总弹窗 → 跳首页**，**没有自评、没有组边界** | `Practice.vue:676-681`、`703` |
| 自评 | 只在自适应 `completeGroup()` 里调 `dialogs.showSelfEvaluationDialog()` | `useAdaptiveSession.js:288-300` |
| 分组信息 | `papers` 里**本来就有**：`paperGenerator` 按 `numberOfPapers` 生成 N 个 paper，每个带自己的 `formulas` | `utils/paperGenerator.js:50-62` |
| 答案累计 | 自适应靠「组间不清 `session.answers`，`shouldRestoreAnswers` 恢复」实现跨组累计；手动目前全程不清 | `Practice.vue:759-771`、`494-497` |

结论：**分组数据已经存在（papers），缺的是「组边界」概念 + 手动路径的自评调用**。

## 二、目标流程

```
第 1 组（第 1 张卷子）12 题
   └─ 组反馈音 → 自评弹窗（本组正确率 / 用时 / 评语，1~5 星）
        └─ 第 2 组（清空当前组状态，currentIndex 跳到第 13 题）
             └─ 自评 …
                  └─ 第 3 组 …
                       └─ 组反馈 → 自评 → 整轮总结弹窗（合计 36 题）→ 首页
```

界面上只在题号区加一个 `第 2/3 组` 的小徽标，其余答题交互**不变**。

## 三、实现方案

### 3.1 分组来源（单一事实源）

`Generate.vue` 在 `setListPractices` 之前，把每张卷子的题数写成组计划：

```js
practiceStore.setManualGroupPlan(papers.map(p => p.formulas.length))  // [12, 12, 12]
```

- **以 `papers` 为准**，不是 `paperList`（题组）—— 一张卷子里可以有多道题组，但仍是「一组练习」。这与 U1「几张卷子 = 几组练习」一致。
- 存 store（不落盘）：`manualGroupPlan: []`、`manualGroupIndex: 1`。

### 3.2 组边界判定

新增纯函数（可单测）：

```js
// utils/groupPlan.js
buildGroupRanges(plan)        // [12,12,12] → [{start:0,end:12},{start:12,end:24},{start:24,end:36}]
groupIndexOf(ranges, index)   // 当前题号属于第几组
isLastOfGroup(ranges, index)  // 是否本组最后一题
```

`handleNext()` 的收尾分支改为：

```js
if (isAssessment) fn = completeAssessment
else if (adaptiveEngine && listSource !== 'manual') fn = completeGroup
else if (listSource === 'manual' && manualGroupPlan.length > 1) fn = completeManualGroup  // 新
else fn = handlePracticeComplete
```

`completeManualGroup()`（新，放 `useManualSession.js`，与 `useAdaptiveSession` 平级）：

1. 取本组答案切片 → 正确率 / 用时 / 组评语（复用 `getGroupComment`）
2. `playSfx('group', { perfect })`
3. `dialogs.showSelfEvaluationDialog({ groupIndex, correctCount, totalCount, timeText, comment })`
4. 写 checkpoint：`saver.saveGroupCheckpointManual({ groupIndex, score, count, correctRate })`
5. 若还有下一组 → `manualGroupIndex++`、`session.currentIndex = 下一组起点`、`initPractice()`；否则 `handlePracticeComplete()`

### 3.3 关键约束：手动路径**不能**清空 `session.answers`

- 自适应靠 `resetGroupAnswers()` + 恢复实现「当前组 vs 累计」
- 手动若照做，`correctCount`（= `Answer.sumScores(session.answers)`）和整轮汇总会**只剩最后一组**
- 所以手动只在组边界做：`resetCurrentIndex` 式跳题 + `initPractice()`，**不动 `session.answers`**

### 3.4 自评数据落库

`PracticeSession.evaluations` 现格式：`[{ group, score, count }]`（`usePracticeSaver.js:32-38`）。
手动组 checkpoint 沿用同一格式：

```js
JSON.stringify([{ group: 2, score: 4, count: 12 }])
```

- 每组的 checkpoint 行 `completed: false`，最后一组完成时 `saveSessionFinal` 写 `completed: true`
- 同轮所有行共用同一个 `practiceSessionId`（`usePracticeSaver.getPracticeSessionId`），`PracticeSession.list` 会按 pid 合并 → **轮次数不变**

### 3.5 统计口径要改一处（必改）

`services/PracticeSession.js:151`：

```js
if (session.evaluations || cfg?.mode === 'adaptive') practiceType = '自适应'
```

手动有了 evaluations 后，这一轮会被**标成自适应**，历史列表与统计都会错。
改为尊重显式标记：

```js
if (cfg?.mode === 'manual') practiceType = '自定义'
else if (session.evaluations || cfg?.mode === 'adaptive') practiceType = '自适应'
```

配套：`Generate.vue` 里 `setConfigSnapshot({ ...formData, mode: 'manual' })`。

## 四、风险清单

| # | 风险 | 影响 | 规避 |
|---|---|---|---|
| R1 | `evaluations` 存在 → 被判定成「自适应」 | 历史列表/统计分类错乱 | **必改** §3.5，用 `configSnapshot.mode` 显式优先 |
| R2 | 组边界切片靠 `evaluations[last].count` | 详情页按组展开会切错 | 手动 checkpoint 写入准确 `count`；切片逻辑已有兜底（均分） |
| R3 | 组间误清 `session.answers` | 整轮正确数只剩末组 | §3.3 明确「手动不清」；加单测锁住 |
| R4 | `isLastQuestion` 语义被改坏 | 「最后一题」判定影响到自适应 | 只**新增** `isLastOfGroup`，不改原 getter |
| R5 | 无画像时自评不可用 | 自定义练习本来就允许无画像（出题/打印不受限） | 自评弹窗不依赖 profile/engine（`showSelfEvaluationDialog` 只吃统计量），实测确认 |
| R6 | 中断的手动轮次出现 `evaluations` 行 | 记录列表多出「未完成」行 | checkpoint 显式 `completed: false`；`list()` 已按 pid 合并取最新行 |
| R7 | 误复用 `completeGroup` | 会调 `evaluateGroup` / 升降档，手动题单被引擎改写 | 新建 `completeManualGroup`，**不碰 engine**；`adjustNextQuestion` 已在 `listSource==='manual'` 时短路 |
| R8 | 题号显示跳变 | 「第 13/36 题」但用户以为「第 1/12 题」 | 题号仍显示全轮进度 + 组徽标；不改成组内进度，避免两套数字 |
| R9 | 分组与 U1 语义不一致 | 2 个题组 × 3 张卷子 = 6 组还是 3 组？ | 以 `papers`（= 卷子数）为准，一张卷子 = 一组 |
| R10 | 自评弹窗连点/重复触发 | 重复写 checkpoint | 复用 `nextLocked` 守卫（`handleNext` 已有） |

**没有发现阻塞性风险。** R1、R3 是必须做对的点，其余都是可控的实现细节。

## 五、工作量与验收

| 项 | 估算 |
|---|---|
| `utils/groupPlan.js` + 单测 | 0.2 天 |
| `useManualSession.completeManualGroup` | 0.3 天 |
| `Practice.vue` 收尾分支 + 组徽标 | 0.2 天 |
| 统计口径修正（R1）+ 单测 | 0.2 天 |
| 浏览器实测（3 组 × 各 12 题，走完自评） | 0.3 天 |
| **合计** | **约 1 天** |

**验收**

1. 3 张卷子 → 走完第 1 组弹自评，第 2 组、第 3 组各弹一次，共 3 次
2. 整轮总结的正确数 = 三组之和（不是末组）
3. 记录列表里该轮**只有 1 条**，类型显示「自定义」而不是「自适应」
4. 自适应路径行为完全不变（组大小、升降档、自评次数）
5. 单张卷子（1 组）时**不弹**组间自评，直接整轮总结（保持现状）

## 六、建议顺序

1. 先做 R1 的统计口径修正（独立、小、可先合）
2. 再做 groupPlan + completeManualGroup
3. 最后加组徽标等 UI 细节

> 需要动 UI 的部分只有「组徽标」一处，如果要做，先出一张设计图再动代码。
