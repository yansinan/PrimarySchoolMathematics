# 自定义练习分组 + 自评：可行性评估

> 2026-11-26 · 状态：**已实施**（见文末「实施结果」） · 关联 TODO U1
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

---

## 七、实施结果（2026-11-26）

按本文顺序全部落地：

| 步骤 | 提交内容 |
|---|---|
| R1 统计口径 | `PracticeSession.computeSessionStats`：`cfg.mode === 'manual'` → 「自定义」，优先于旧的 evaluations 推断；新增 `test/services/practiceType.spec.js`（5 条） |
| 分组计划 | 新增 `src/utils/groupPlan.js`（buildGroupRanges / groupIndexOf / isLastOfGroup / rangeOfGroup / hasMultipleGroups）+ `test/utils/groupPlan.spec.js`（8 条） |
| 组会话 | 新增 `src/composables/useManualSession.js`：`setGroupPlan` / `completeManualGroup`（组反馈 → 自评 → checkpoint → 跳到下一组，**不清 session.answers**、**不碰引擎**） |
| 落库 | `usePracticeSaver.saveManualGroupCheckpoint`：evaluations 与自适应同格式 `[{group, score, count}]`，`completed:false`，同 pid |
| 接线索 | `Generate.vue`：`setConfigSnapshot({...formData, mode:'manual'})` + `setManualGroupPlan(papers.map(p => p.formulas.length))` |
| 组徽标 | `Practice.vue` 复用 `.stage-badge`：新增 `.stage-badge--group`（同尺寸同圆角，只换底色），文案 `第 2/3 组` |
| 卷子数量 | 从对话框移回共用区（`AutoGenerateFormulas`），与「口算题数」**并排同一行**：两个输入框各占一半，只保留前置标签（口算题数 / 卷子份数），不再加后缀与提示文字 |

**实测（真实 Chromium，3 张卷子 × 3 题）**

- `第 1/3 组` → 答完 3 题 → 自评弹窗 → `第 2/3 组` → … → `第 3/3 组` → 自评 → 整轮汇总
- 汇总：**9 共答 / 9 正确 / 100%**（三组之和，不是末组）
- DB：同轮 **1 个 practiceSessionId、5 条记录**（1 条初始 + 3 条组 checkpoint + 1 条最终结算）
- 类型：全部显示「自定义」，`config.mode === 'manual'` 已落库
- 单张卷子（1 组）：`hasMultipleGroups=false` → 直接整轮汇总，不弹组间自评

**踩到的两个坑（已在实现里注明）**

1. `useManualSession()` 必须传入 Practice.vue 里同一个 `dialogs` / `saver` 实例 —— 否则自评弹窗的 ref 与模板不互通，弹窗永远不显示（`Practice.vue:408` 早有同类注释）。
2. 收尾分支的判据是「**还有下一组**」，不是「不是本组最后一题」—— 走到收尾分支时一定已在本组最后一道，写成后者会直接跳到整轮总结。

**遗留**：TODO U1 的「卷子数量与自定义练习共用分组」已顺带完成（一张卷子 = 一组）；剩下的是 `generateFormulas` 仍按 `numberOfPapers` 展平题单，分组语义已对齐，无需再改。

### 收尾排版（同日追加）

- 「口算题数」与「卷子份数」并排一行，`xs=12 / sm=12`，行高 32px（原先是两个整行 form-item）
- 去掉后缀「题 / 份」和「练习按卷子分组」的提示文字：那行太占地方，语义改由练习中的 `第 2/3 组` 徽标体现
- 输入区宽度：390px 下 ≈77px / 69px（数字完整可见），1280px 下 ≈144px
- 校验照旧：两个单元格各自保留 `ElFormItem :prop/:rules`，错误信息绝对定位不撑行高

### 进度展示按组算（同日修正）

问题：分组后顶部进度仍按**整轮题数**算（第 2 组显示「第 5 题 / 共 12 题」，步骤条也是 12 个），
与自适应不一致 —— 自适应每组就是一个题单，总题数天然是组大小。

修正（`Practice.vue`）：新增 `progressRange / progressTotal / progressCurrent / progressAnswers`
三个 computed，多组自定义练习时：

- 总题数 = 本组题数（步骤条只画本组）
- 当前题号 = 题号 - 本组起点 + 1（每组从 第1题 重新开始）
- 进度点/对错统计只取本组答案（第 2 组不会再显示第 1 组的绿灯）

非多组场景（自适应 / 单张卷子 / 诊断）返回 null，行为与原来完全一致。

实测（3 卷 × 4 题）：
`第 1/3 组 ✅0/4 → 1/4 → 4/4`（自评）`→ 第 2/3 组 ✅0/4 → 1/4` ✔

---

## 八、题目多时的进度展示（2026-11-26）

问题：进度用逐题 steps 渲染，30 题就是 30 个「第N题」，**横向溢出卡片**。

方案对比出图（[mockups/progress/](mockups/progress/)）：省略号窗口 / 细条 / 10 段格子。
采纳的组合（dr 确认）：

- **总题数 ≤ 10**：一排**数字小格**（`1 2 3 … 10`，对绿/错红/当前蓝）—— 这个量级一格一题最直观
  - 早期用 `el-steps simple`，它在 8~10 题时会把「第1题」挤成**竖排三个字**（dr 报的"文字换行"），
    已换成自绘小格，且去掉了按视口切换圆点/步骤的两套实现
- **总题数 > 10**：换成**细条 + `当前 / 总数`**
  - 每段按对错着色：绿 = 对、红 = 错、灰 = 未答
  - 宽度与题数无关，30 题、100 题都不溢出

实现收在 `components/layout/ProgressSteps.vue` 内部（`BAR_THRESHOLD = 10`），
props 不变（total / current / answers / correctCount），练习页无需改动。

实测：
- 12 题 → `.bar-progress` 生效、文本 `1 / 12`、12 段、`scrollWidth-clientWidth = 0`
- 5 / 8 / 10 题 × 4 档宽度（390 / 768 / 900 / 1280）→ 进度区高度恒定（45 / 48 / 52px），
  **零溢出、零换行**，数字小格始终单行

## 九、已添加题组的单个删除（2026-11-26）

`Generate.vue` 的题组列表原本是只读字符串标签（`buildPaperDescriptionList`），没法删单组。

改为对 `paperList` 按下标渲染 `<ElTag closable @close="removePaper(i)">`：

- ElTag 自带的 ✕ 即「删除第 N 个题组」，hover 有 title 说明
- 删完重新渲染，题组描述随索引更新
- 删到空 → 提示「题组已清空，请重新添加口算题」

实测：2 组 → 点第一个 ✕ → 剩 1 组且文本为第二组 ✔

## 九之二、选择题干扰项按「真实错因」生成（2026-11-26）

问题：原来的干扰项是 `正确答案 ±1 / ±2 / ±5 / ±10` 的机械数列，四个选项看起来一样"平"，
孩子靠数感就能排除，起不到诊断作用。

改成每种错因对应一个干扰项（`utils/algorithm/distractors.js`）：

| 运算 | 干扰项（按常见度排序） |
|---|---|
| 加法 | 忘进位（c − 10^k）· 多进一位（c + 10）· 个位 ±1 · 十位 ±10 · 把 + 看成 −（a − b）· 漏算十位 |
| 减法 | 忘退位（c + 10^k）· 「大减小」错位（c + 2b）· 个位 ±1 · 十位 ±10 · 多借一位 · 把 − 看成 + |
| 乘法 | 口诀串行（(a±1)×b、a×(b±1)）· 忘进位（c − 10）· 把 × 当 +（a + b）· 多算/少算一组（c ± a、c ± b） |
| 除法 | 试商偏差（c ± 1）· 余数当商（a % b）· 口诀反向（(c±1)×b、(b±1)×c）· 多/少算一组（c ± b） |

取舍：

- **错题库优先**：`adaptiveEngine.generateDistractors` 先用孩子在同一算式上错过的答案，再用错误模型补齐
- 进位/退位位置按真实竖式逐位计算（`addCarryPosition` / `subBorrowPosition`），不是猜的
- 全部干扰项保证：正整数、去重、不含正确答案；错误模型解析不出算式时退回邻近值（随机化，不回到固定数列）
- 单元测试 22 条（含引擎侧集成：错题库优先、与错误模型重复时不重复占位）

## 十、全键盘操作（2026-11-26）

目标：整轮练习不碰鼠标也能走完（答题 → 自评 → 汇总）。

| 位置 | 键位 | 说明 |
|---|---|---|
| 准备开始页 | `Enter` | 等于点「开始练习」（原有） |
| 答题（数字键盘模式） | `0-9` / `Backspace` / `Enter` | 原有 |
| 答题（选择题模式） | `←` `→` 移动 / `Enter`·`Space` 提交 / `1-9` 直选 | 原有 |
| **自评弹窗** | `←` `→` 移动表情，`Enter`·`Space` 确认，`1-5` 直选 | 新增（`SelfEvaluationDialog`） |
| **整轮汇总弹窗** | `←` `→` 在「首页 / 分析」间切换，`Enter`·`Space` 确认，`Esc` 关闭 | 新增（`PracticeSummaryDialog`，按钮带 `.is-key-focus` 焦点环） |

实现要点：

- 两个弹窗都在 `visible` 变为 true 时挂 `window.addEventListener('keydown', …, true)`（捕获阶段），关闭即移除
- `Practice.vue` 的全局按键处理开头加守卫：`evalVisible || summaryVisible` 时直接返回，避免同一按键既操作弹窗又操作题目
- 焦点态有可见样式（蓝框），不只是逻辑上的选中

实测：自评弹窗默认停在「刚刚好」，`←←` 到「😩」、`→` 回「😟」、`Enter` 选择并进入第 2 组；
汇总弹窗 `←` → 「🏠 首页」、`→` → 「📊 分析」、`Enter` → 跳首页并打开分析抽屉。

### 组徽标文案（同日）

`第 2/3 组` → **`第 2 组，共 3 组`**（`Practice.vue#groupBadgeText`），更符合中文口语，也不用猜斜杠含义。
