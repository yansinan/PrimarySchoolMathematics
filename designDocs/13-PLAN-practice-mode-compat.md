# 13-PLAN · 诊断 / 自适应 / 手动出题 三者的边界

> 状态：**已实施并验证**（2026-11-18）
> 分支：`feat/mul-div-levels`
> 结论：**不再给手动出题加难度档位。** 两套东西彻底分开，用流程边界而非共享状态来划界。

---

## 一、三层职责（按 dr 的定调）

```
第一次打开
   ↓
【诊断】5 道题摸底 —— 准入门槛
   ↓ 完成
【自适应】系统出题，自动升降 24 级 —— 主模式，永远可回
   ↓ 用户主动去抽屉
【手动出题】= 生成一张试卷，但不打印，改成交互答题
             细粒度自定义，和 24 级无关
   ↓ 练完
回到【自适应】
```

四条边界规则（dr 原话转写）：

| # | 规则 | 实现层面 |
|---|------|---------|
| 1 | 诊断完成，系统才开始正式使用 | 没画像就不给抽屉入口 |
| 2 | 手动练完回自适应，是合理行为 | 保持现状，不动 `listPracticesGuard` 的 START_ADAPTIVE 分支 |
| 3 | 不标记题目来源 | 不加 `mode` 字段 |
| 4 | 手动出题的题组设置本来就应该能分开 | **需要核实并修正**，见第四节 |
| 5 | 手动不指定难度级别 | 24 档位只服务自适应；手动走自己的细粒度配置 |

---

## 二、为什么"档位进抽屉"这个方向被放弃

上一轮做的 24 级档位（`DIFFICULTY_LEVELS`）本质是**自适应引擎的刻度**：它的用途是"当前该给多难"，是引擎内部状态，不是用户要配置的参数。

手动出题是**试卷逻辑**：用户想的是"我要 30 道 10 加个位数的进位加法"，这比"档位 0 起步"更精确、更自由。

两者强行合流只会得到两个都不讨好的东西：
- 档位没法表达"10 加个位数但要求进位"这种组合（档位 0 是"禁止进位"）
- 手动配置会被档位的固定范围反向约束

**分开就清晰了**：档位是引擎的私事，抽屉是用户的私事。唯一需要打通的地方是"手动出的题照样进统计"——这个已经天然成立，因为 `Answer` 存的是题目本身，`matchLevel` 会把题目映射回档位。

---

## 三、要改的三处（都很小）

### 改动 1（必做）：`assessmentCompleted` 不该从 `phase` 推导

**现状问题**：`stores/practice.js:80`
```js
assessmentCompleted: (state) => state.phase === 'practice',
```
而 `Generate.vue` 的 `generateFormulas()` 里有一行 `practiceStore.setPhase('practice')`。

后果链：用户一次都没做过诊断，只要手动出过题 → `phase` 变成 `practice` → `assessmentCompleted` 为真 → 系统认为诊断已完成。加上门禁后这个洞会直接变成"门禁形同虚设"。

**改法**：判定改成看 DB 里有没有真实画像，与 `Practice.vue onMounted` 已经在用的判据一致：
```js
const profile = await Profile.load()
const hasAssessment = profile.difficultyIdx > 0 || profile.strongLevelIndices.length > 0
```
把这段抽成一个函数（如 `services/abilityProfile.js` 导出的 `hasRealProfile()`），`Practice.vue` 和抽屉门禁共用，避免两处各写一份。

### 改动 2（必做）：抽屉加门禁

`Generate.vue:7` 的按钮现在无条件可点：
```html
<el-button ... @click="practiceStore.setGenerateDrawerVisible(true)" class="coffee-me"/>
```

改成无真实画像时不显示（或禁用并提示"先完成能力评估"）：
```html
<el-button v-if="hasRealProfile" ... />
```

效果：第一次使用只能做诊断，诊断完才出现抽屉。这就是 dr 说的"诊断完成系统才开始正式使用"。

### 改动 3（建议，需确认）：把 4 个全局参数下沉到题组

核实结果 —— 现在的分层是：

| 参数 | 现在的来源 | 能否按题组分开 |
|------|-----------|--------------|
| `step` 几步运算 | `paperList` 项 | ✅ 能 |
| `numberOfFormulas` 题数 | `paperList` 项 | ✅ 能 |
| `whereIsResult` 求解位置 | `paperList` 项 | ✅ 能 |
| `formulaList` 每步范围+运算符 | `paperList` 项 | ✅ 能（这就是"10 多加个位数""2-6 乘法"） |
| `resultMin/MaxValue` 结果范围 | `paperList` 项 | ✅ 能 |
| `enableBrackets` 是否带括号 | **`formData` 全局** | ❌ 不能 |
| `carry` 加法进位 | **`formData` 全局** | ❌ 不能 |
| `abdication` 减法退位 | **`formData` 全局** | ❌ 不能 |
| `remainder` 除法余数 | **`formData` 全局** | ❌ 不能 |

证据：`AutoGenerateFormulas.vue:299-306` push 题组时只带 6 个字段；`paperGenerator.js:27-38` 里 `add.carry` / `sub.abdication` / `div.remainder` / `is_bracket` 全部读 `options.…`（options 是 formData）。

**所以 dr 的印象大体是对的**——大部分设置确实是每题组一份，但进位/退位/余数/括号这 4 项是全局的。

实际影响举例：想在一次练习里混"两位数加法（进位）20 道" + "两位数加法（不进位）10 道"，现在做不到，因为 `carry` 只能填一个值。

**改法**（若要做）：
1. `AutoGenerateFormulas.vue` 的 `append()` 里多带 4 个字段
2. `paperGenerator.js` 改成 `parseInt(p.carry ?? options.carry)`（`??` 保证旧配置向后兼容）
3. UI 上把这 4 项从「其他设置」抽屉挪到题组卡片内（或在题组标签里显示，让用户看到每组各自的进位要求）

风险：低。旧配置没有这 4 个字段，`??` 会回落到全局值，行为不变。

---

## 四、明确不做的

| 项 | 原因 |
|----|------|
| 在抽屉里选 24 级档位 | 两套体系分开，档位是引擎的私事（dr 定调 5） |
| `Engine.fixedLevelIdx` / 定向练习模式 | 同上 |
| 统一 PracticePlan 重构 | 收益不足以抵消动状态机的风险 |
| 会话 `mode` 字段 | 统计口径本来就一致，谁出题不重要（dr 定调 3） |
| 改 `listPracticesGuard` 的 START_ADAPTIVE 分支 | 手动练完回自适应是合理行为（dr 定调 2） |
| 给 `listPractices` 加来源标记 | 同上 |

---

## 五、验收

改动 1+2：
- 全新环境（清空 DB）打开 app → 只有诊断 5 题，**看不到抽屉按钮**
- 诊断完成 → 抽屉按钮出现，自适应开始
- 手动出题练完 → 自动回自适应（现在的行为，不能变）
- 清空数据后重新进入 → 又要重新诊断，且手动出题无法绕过门禁

改动 3（若做）：
- 一次练习里加两个题组：A 组进位加法、B 组不进位加法 → 生成结果 A 组全进位、B 组全不进位
- 旧配置文件（无这 4 个字段）加载后行为与改前一致
- 打印功能正常

---

## 六、实施记录（已完成，2026-11-18）

dr 拍板：门禁**完全不显示**按钮；改动 3 做；顺手修重复判断。全部落地：

| 文件 | 改动 |
|------|------|
| `services/abilityProfile.js` | 新增导出 `hasRealProfile(profile)`：画像有难度索引/强项/弱项任一即为真 |
| `stores/practice.js` | 新增 state `hasRealProfile` + action `setHasRealProfile()`；`assessmentCompleted` 从 `phase === 'practice'` 改为 `state.hasRealProfile` |
| `components/Practice.vue` | onMounted 改用 `hasRealProfile()`（删掉内联重复判断），并写入 store |
| `composables/useAdaptiveSession.js` | `completeAssessment` 里按 DB 画像写 `setHasRealProfile()` |
| `components/Generate.vue` | 抽屉按钮（含 tooltip）加 `v-if="practiceStore.hasRealProfile"`，未评估时完全不显示 |
| `views/ResetData.vue` | 清空数据后 `$reset()`，否则内存态仍认为「已评估」 |
| `utils/paperGenerator.js` | `carry`/`abdication`/`remainder`/`enableBrackets` 改取 `p.xxx ?? options.xxx` |
| `components/generate/AutoGenerateFormulas.vue` | 添加题组时把这 4 个字段一并快照进 paperList 项 |
| `utils/algorithm/psm.js` | `is_addcarry` 从 `> 10` 改为 `>= 10`（与 `Question._isCarry` 口径统一，修 4+6=10 漏判） |

### 验证结果（真实浏览器 + 真实 IndexedDB + 真实生成器）

| 场景 | 结果 |
|------|------|
| 清空数据后打开 /home | 抽屉按钮数 **0**，自动进入「能力评估 0/5」 |
| 诊断 5 题全对 | hasProfile=true、engineDifficultyIdx=9、强项 5 个；抽屉按钮数 **1** |
| 题组 carry='2'（必须进位） | 生成 12 题，进位 **12/12** |
| 题组 carry='3'（禁止进位） | 生成 12 题，进位 **0/12**（修复 psm.js 前是 1/12） |
| 题组不带 carry（回落到全局随机） | 12 题中 7 题进位，符合随机 |
| UI 设置「没有进位」后出题 | 30 题中进位 **0 题**（题组级设置经 UI 生效） |
| 手动 30 题答完 + 点评价表情 | listPractices 清空 → 自动起自适应第 2 组（6 题） |
| 清空数据 | hasRealProfile=false、phase=idle、total=0；回 /home 按钮数 **0**，重新进诊断 |
| 全量单测 | `npx vitest run` → **162 通过**（含新增 42 个乘除用例） |
| console 错误 | 无 |

### 一个已知且符合设计的行为

手动练习答完最后一题会弹「给这组题点个评」评价框，**必须选表情才会继续**（之后才清空题单 → 起自适应）。这是既有 UI 流程，不是阻塞问题；“回自适应”依赖用户完成这一步评价。

---

## 七、审核结论与第二组修复

### 第一组审核结果（独立 agent 复核）

A–E 五项全部实测生效，F/G/H 回归未受影响；反向对照证明 `afterAnswer` 早退守卫是承重的（拆掉后第 3 题立刻从 `27+35=` 变成 `6×3=`）。审核新发现 5 项，处理如下：

| 审核发现 | 处理 |
|---|---|
| 生成 0 题时静默停在加载态 | 已修：`generateFormulas` 检查 `listFormulas.length === 0` 明确报错 |
| 「随机余数」成了无效选项 | 已修：只留「结果整除」可点，另两个置灰并标「（暂不支持）」 |
| 生成不足只有 console.warn | 由上面那条报错覆盖；旧配置 remainder=1/3 自动回落 2 |
| 标签只显示最后一步范围（除法丢被除数） | 已修：改为每步范围 `10~99→2~9` |
| 手动题组完成只评 4/6 题 | 已修（见下 ③） |

审核的代码意见另采纳两条：`paperGenerator` 的 `??` 改 `||`（挡旧配置空字符串 → `parseInt('')` 得 NaN）；新单测断言由 `toBeLessThanOrEqual(50)` 收紧为 `toBe(0)` + spy warn。

### 第二组改动（4 项）

| 项 | 文件 | 改动 |
|---|---|---|
| e 组内混合失效 | `services/Question.js` | `_parseOperands` 缺 operator 时从算式自动识别符号；`_matchLevel` 用 `> 0` 而非 `!= null` 采信 getter |
| f 诊断门禁可绕过 | — | **已回退**：dr 判定「答 1 题能出画像就是能用」，接受跳过诊断。要求诊断满 5 题的门槛已移除 |
| g 答错重试污染画像 | `services/Answer.js` | `save()` 写入前按「练习会话 + 题号」复用已有行 id，重试只更新不新增 |
| ③ 手动组只评一半 | `composables/useAdaptiveSession.js` | `completeGroup` 在 `listSource === 'manual'` 时用 `allAnswers.length` 切片 |
| 打印被门禁锁住 | `components/Generate.vue` | 门禁从「抽屉入口」下移到「开始练习」按钮：出题与打印卷子不再要求画像 |

### 第二组验证（真实浏览器）

| 场景 | 结果 |
|---|---|
| e 第 1 组档位分布 | `{5:4, 7:2}` 混合；答 2 题后题目逐字未变、档位仍混合 |
| f 答 1 题后刷新 | `phase=assessment`、抽屉 0、`diagnosticCount=1`、判据 false |
| f 答满 5 题后刷新 | `phase=practice`、抽屉 1、判据 true |
| g 同一题答错 3 次 | DB 只新增 **1 行**（修复前 3 行）；再答对 1 次不新增；按（会话, 题号）分组零重复 |
| ③ 手动 6 题答完 | 评价弹窗显示 **6/6 正确**（修复前按上次自适应组大小显示 4/4） |
| 全量单测 | 169 通过（11 文件） |
| console 错误 | 零 |

### 一处既有测试被修正

`test/utils/algorithm/answer.spec.js` 原本断言 `new Question({equation:'5+3='})` 的 `operandMin/Max` 为 0 —— 那是把 `_parseOperands` 缺 operator 直接返回 null、getter 兜底成 0 的**错误行为**当成预期。该字段是从算式派生的，改为断言 3/5。

### 剩余未做

1. **历史脏数据不自动清理**：修复前产生的重复 answer 行仍在，需在设置页清一次数据才干净。
2. **升档不可达**：`MIN_GROUPS_PER_DIMENSION=5` 与一轮 30 题上限（只够 2-3 组）冲突，需先定"一轮做多少题"再调。

### 门禁的最终形态（dr 拍板后）

- **不加诊断也能用**：抽屉常显，「生成卷子」（打印）不依赖画像；「开始练习」在无画像时隐藏并提示「先做完能力评估才能这里开练」。
- **诊断不要求答满**：答 1 题能算出画像就算可用，允许跳过剩余诊断题。理由：画像有值就是有依据，强制答满并不提高正确性。

---

## 八、练习页体验修复（汇总用时 / 正确率取整 / 开始界面）

### 1. 汇总弹窗「用时」不是总时间

**根因**：`Practice.vue` 的 `initPractice()` 每题都把 `session.sessionStartTime` 重置成当前时刻，
该字段的语义本是「整轮开始时间」，被覆盖后汇总只能拿到最后一题的时长。
另外 `sumResponseTimes(answers)` 只累加逐题 `responseTime`，不含组间自我评价弹窗、页面生成等待。

**改法**：
| 文件 | 改动 |
|---|---|
| `components/Practice.vue` | `initPractice()` 不再重置 `sessionStartTime`（单题计时走 `startQuestionTimer()` 的 `session.startTime`） |
| `composables/useAdaptiveSession.js` | 汇总用时改为 `Date.now() - sessionStartTime`，字段缺失时回落 `sumResponseTimes` |
| `utils/time/timeFormat.js` | `formatDuration` 增加 `{ roundSeconds }`，整轮用时秒数取整（不再出现「1分3.5秒」） |

**实测**：整轮 8 题 → 弹窗「16秒」，脚本墙上时间同为 16 秒。跨组验证：第 1 组开始
`sessionStartTime=1794993806710`，进第 2 组后数值不变、组号 1→2、已用 21.5 秒（含第一组答题与评价弹窗）。

### 2. 练习中上方正确率带小数

**根因**：`ProgressSteps` 直接把 `Answer.sumScores()` 显示出来。`score` 是掌握分
（一次答对=1，错一次再对=0.667，错两次再对=0.333），于是出现 `✅ 4.667 / 8`；四舍五入又会把
「错两次再答对」算成 0 题。

**改法**：`components/layout/ProgressSteps.vue` 不再用 `correctCount`（分值和），改为按
`answers` 逐题判对错计数。
**实测**：某题故意答错 2 次再答对 → store `sumScores=0.333`，界面显示 `✅ 1`。

### 3. 练习开始界面

**新增准备态** `practiceStore.readyToStart`：有画像进入练习页时不立刻出题，先展示
「目前学习情况 / 这次练什么 / 练习重点」，点「开始练习」才生成第一组题。

| 文件 | 改动 |
|---|---|
| `stores/practice.js` | 新增 `readyToStart` state + `setReadyToStart()` |
| `components/Practice.vue` | 新增开始卡片（模板+样式）；`loadStartInfo()` 读画像/正确率/连续天数；`handleStartPractice()` 才启动会话；`onMounted` 与 `readyToStart` watcher 联动 |
| `composables/useAdaptiveSession.js` | `completeAssessment` 完成后置 ready 并清空诊断题单（否则 `currentQuestion` 仍是最后一道诊断题）；整轮完成后回准备界面 |
| `components/Generate.vue` | 手动出题时 `setReadyToStart(false)`，直接进题 |

**数据来源里的两个坑**：
- 正确率不能用 `getAggregatedStats()` —— 它按 `practiceSessionId` 统计，诊断答案没有该字段，刚诊断完会显示 0%。
  改为 `Answer.getAllByStudent()` 全量算，并且必须用 `Answer.isCorrect(row)` 静态方法
  （该方法返回数据库原始行，没有 `isCorrect` getter）。
- 连续天数为 0 时显示「—」，避免新用户看到「0天」。

**实测**：
| 场景 | 结果 |
|---|---|
| 诊断 5 题全对后 | 卡片显示 `Lv.13 乘法口诀·2~6` / `100% 历史正确率` / `— 连续练习`；`10~30 题`、`每组 4~10 题` |
| 点「开始练习」 | 出题（8 题），卡片消失 |
| 手动出题 30 题 | 直接进题，不显示准备界面 |
| 打印卷子 | 仍跳 `/print` 并渲染 30 题 |
| 手机 390 / 320 | 三个指标并排（99px / 81px），无横向溢出，按钮 52px 高 |

单测 169 通过（11 文件），console 零错误。

---

## 九、自定义练习与响应式修复（第二轮反馈）

| 问题 | 根因 | 修法 | 实测 |
|---|---|---|---|
| 自定义练习有重复题 | `psm.js` 的 `generate()` 循环里直接 `slist.push(formula)`，完全没有去重 | 加 `Set` 去重；题池不足（如 1~5 加法只有 20 种组合却要 30 题）时用重复题补齐并 `console.warn` | 手动出 30 题 → 30 唯一，0 重复 |
| 自定义练习结束自动进自适应 | `Practice.vue` 的 `handleNext` 判定是 `else if (adaptiveEngine.value)`，有画像时手动题单也会走 `completeGroup` | 判据改为 `adaptiveEngine && listSource !== 'manual'`；`watch(listPractices)` 的 COMPLETION 分支也对 manual 提前 return 并复位 listSource | 手动 30 题答完 → 弹汇总（30/30）→ 关闭后停在 `/home`，不出新题 |
| 总题数超过「最多 X 题」 | `completeAssessment` 里 `targetMin=10 / targetMax=30` 硬编码，忽略抽屉里设的自适应练习量 | 改读 `session.adaptiveConfig` → `configSnapshot` → 默认值 | `targetMax=12` → 共答 12，不多不少 |
| 进度条不是真响应式 | `ProgressSteps.vue` 的 `isMobile` 写成 `return true; return window.innerWidth <= 768`，第二行永远不执行 | 改为 `ref(window.innerWidth)` + `resize` 监听（`passive`），`onUnmounted` 解绑 | 1440px → `el-steps`；缩到 390px → 圆点；拉回 1440px → 恢复 `el-steps` |

**顺带修掉的崩溃**：手动题单改走 `handlePracticeComplete` 后暴露 —— `adaptiveEngine.value.profile.snapshot()` 中
`profile` 可能是数据库原始行（没有 `snapshot` 方法），调用即抛 `TypeError`，导致整个收尾流程中断
（不弹汇总、不跳首页）。已加 `typeof ... === 'function'` 判断。

单测 169 通过（11 文件），console 零错误。

---

## 十、档位阶梯按教材进度重排（A 方案）

**问题**：原 24 级把乘除整体排在加减之后 —— 「表内乘法/除法」（人教**二年级**上/下）排在
「三位数加减」（三年级上）后面，违背教材进度。

**为什么不用数据迁移**：`difficultyIdx` 不是靠持久化的索引值生效的，它每次都由
`Profile.computeDifficultyIdx(answers)` 拿答题历史重新匹配当前档位表算出
（`abilityProfile.js:141`）。重排后老用户下次加载画像即自动对齐，画像表里的旧值会被覆盖。
`matchLevel` 只按范围匹配 label，加减内部顺序未变，所以同一道题的匹配结果不变，只是索引值换了位置。

**新顺序**（数组下标 = difficultyIdx）：

| 索引 | 档位 | 年级 |
|---|---|---|
| 0-4 | 起步 / 个位数巩固 / 个位数进阶 / 混合进退位①② | 一上 |
| 5-6 | 两位数入门 / 两位数巩固 | 一下 |
| 7-8 | 进退位入门 / 进退位巩固 | 二上 |
| 9-10 | 乘法口诀·2~6 / 7~9 | 二上 |
| 11-12 | 表内除法·2~6 / 7~9 | 二下 |
| 13-15 | 大数加法 / 大数减法 / 综合挑战 | 三上 |
| 16-17 | 两位数×一位数 / 三位数×一位数 | 三上 |
| 18 | 两位数×两位数 | 三下 |
| 19-20 | 两位数÷一位数 / 三位数÷一位数 | 三下 |
| 21 | 三位数×两位数 | 四上 |
| 22-23 | 两位数÷两位数 / 三位数÷两位数 | 四上 |

**配套改动**：
- `difficulty.js` 每级新增 `grade` 字段（一上/一下/二上/二下/三上/三下/四上）
- 开始界面「目前学习情况」与「这次练什么」显示年级徽标（`Lv.12 表内除法·2~6 [二下]`）
- `test/services/matchLevel.muldiv.spec.js` 的 `mulDiv` 从 `slice(12)` 改为按运算符 3/4 过滤
  （旧写法依赖「乘除都在加减之后」的布局）
- 新增 `test/constants/difficultyOrder.spec.js`（8 条）：锁 24 级、grade 合法、年级不倒退、
  表内乘法先于三位数加减、乘除各自「一位数 → 两位数」递进

**实测**：
- 注入 6 道乘法答题史（全对）→ `groupAnswersByLevel` 归到索引 9/10，`strong=[9,10]`，
  全强项按规则推到 11（表内除法·2~6）—— 索引与名称完全一致，无错位
- 开始界面渲染：`Lv.12 | 表内除法·2~6 [二下]`，chip 同样带年级徽标，console 零错误
- 单测 **177 通过（12 文件）**
