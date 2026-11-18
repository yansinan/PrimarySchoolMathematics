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

---

## 十一、全键盘操作 + 诊断跳级修复

### 1. 全键盘答题（原实现完全没有键盘监听）

`grep keydown|keyup src/` 只有一个无关的 `@keydown.enter`（自定义算式输入框），
答题区从来没有任何键盘绑定 —— 键盘操作是缺失，不是回归。

实现位置在 `Practice.vue`（V 层）而不是 `NumberKeypad` 内部：答题区可能是数字键区也可能是
选择题，放在这一层才能统一处理「反馈态按回车翻页」，不用每个输入组件各写一份。

| 键 | 键区模式 | 选择题模式 | 反馈态 / 准备界面 |
|---|---|---|---|
| `0-9` | 追加一位（竖式右对齐填格） | 选第 n 项 | — |
| `Backspace` | 删一位 | — | — |
| `Enter` | 提交 | 提交 | 反馈态：下一题；准备界面：开始练习 |
| `Space` | — | 提交 | 反馈态：下一题 |

带 `Ctrl/Alt/Meta` 的组合键直接放行；焦点在 `INPUT/TEXTAREA/contentEditable` 时不拦截，
避免和抽屉里的数字输入框抢键。实测竖式 `5+5=` 按 7→3 得 `_37`、退格回 `_3_`、
回车提交、反馈态回车翻到下一题、准备界面回车进题。

### 2. 诊断 5 题全对后直接进乘法（两个 bug 叠加）

**bug A — `matchLevel` 把 `carry:'2'`（允许）当成「必须进位」**

```js
if (level.carry === '2' && !hasCarry) continue   // 旧代码
```

`51+52=`（个位 1+2 不进位）因此跳过所有 carry='2' 的两位数档位（进退位入门/巩固），
一路掉到「综合挑战」（索引 15）。

**bug B — `computeDifficultyIdx` 全对时无条件 +1**

「综合挑战」15 + 1 = 16，正好是「两位数×一位数」（三上乘法）→ 用户看到跳级到乘法。

修法：
- 三态语义拉回文档所述：`'3'` 禁止（硬约束）、`'2'` 允许、`'1'` 鼓励（不作匹配约束）
- `_matchLevel` 改两遍扫描：先让 `carry/abdication === '3'` 的硬约束档位命中，再按顺序接受其余档位
- `computeDifficultyIdx` 的 +1 增加**同运算类型**限制（新增 `Profile._opKind`）：
  加减 → 乘法这种跨学段推档直接返回原档；真实升档交给引擎「连续多组成绩稳定」机制

### 实测

| 场景 | 修复前 | 修复后 |
|---|---|---|
| `51+52=` 档位 | 综合挑战（15） | **进退位巩固（8）** |
| 诊断 5 题全对 → 档位 | 两位数×一位数（16，乘法） | **进退位巩固（8，二上）** |
| 开始界面 | `Lv.17 两位数×一位数 三上` | `Lv.9 进退位巩固 二上` |
| 键盘数字/退格/回车 | 无任何键盘监听 | 键区与选择题均可用 |

单测 **186 通过（13 文件）**，其中新增 `test/services/levelMatch.carry.spec.js` 9 条：
进位三态语义 6 条 + 诊断不跨运算类型推档 3 条。

### 3. 选择题改左右键选择

`OptionButtons` 新增 `focusIndex` prop + `.option-btn--focus` 描边高亮（4px `#176ebf` + 轻微上浮），
`Practice.vue` 维护 `optionFocusIdx`（每题重置为 0）：

| 键 | 行为 |
|---|---|
| `←` / `→` | 焦点在选项间循环移动 |
| `Enter` / `Space` | 提交当前焦点项 |
| `1-9` | 直接选第 n 项（保留为快捷方式） |

### 4. 横式多位数输入从左侧开始的 bug

根因不在 `DigitInput`，而在布局参数：`HorizontalLayout.vue` 三处填空都写死
`initial-focus="0"`（最左侧），而 `VerticalLayout` 三处都是 `-1`（最右/个位）。
所以**竖式正常、横式从左填**，用户观感就是「有时候不是从右边开始」。

配套修 `DigitInput` 的补位方向（原来一律 `fullPad` 左补）：

| 位置 | 改前 | 改后 |
|---|---|---|
| `slots` 显示 | `toSlots(modelValue)` 直接切分，`'7'` 显示在第 1 格 | 自由模式 `rightPad` → `'7'` 显示在第 3 格 |
| `acceptDigit` 自由模式 | `fullPad('7', 3)` = `'7__'`，从左边填 | `rightPad` = `'__7'`，填最右空格 |
| `acceptBackspace` 自由模式 | `fullPad`，退格删高位 | `rightPad`，退格删个位 |

点击模式（`activeSlot >= 0`，用户点了中间格）仍用 `fullPad` 保留空格位置。

**实测**（CDP 真实按键，答案 2 位）：
`4×6=__` 按 7 → `_7`（个位）→ 按 3 → `37` → 按 5 → `75`（满位左移）→ 退格 → `7_`（删最右）。

### 踩坑：patch 模糊匹配改错函数名

给 `handleKeydown` 插入代码时，`old_string` 写成 `const handleKeydown = (e) => {`，
模糊匹配命中了 `const handleNext = () => {` 并把它改名成 `handleKeydown`，
导致 `Identifier 'handleKeydown' has already been declared`，**整个页面白屏**。
vitest 仍然 186 全绿（测试不 import Practice.vue），浏览器测试拿到的全是空状态。
教训：改 Vue 单文件组件后用 `curl http://127.0.0.1:4003/src/components/X.vue` 看
Vite 是否返回错误覆盖页，比等 e2e 失败快得多。

---

## 十二、三位数排版、退格吞键、音效

### 1. 三位数以上算式的数字/符号重叠

**根因是字号用视口单位**：`$math-font-size-large: clamp(3rem, 8vw, 8rem)` 在 1440px 屏上算出
115px，一个「946」就占 200px 宽；再加上 4 个答案格（`1.05em` 各 83px）和运算符，
算式行内容宽 859px 撑爆 710px 的容器，溢出部分压到相邻元素上。屏幕越窄 `vw` 越小但也一样挤。

修法（`HorizontalLayout.vue` + `DigitInput.vue`）：

| 改动 | 前 | 后 |
|---|---|---|
| 字号基准 | `clamp(3rem, 8vw, 8rem)`（跟着视口） | `clamp(1rem, 7cqw, 2.7rem)`（跟着**容器宽度**，`container-type: inline-size`） |
| 列宽 | `el-col :span="4 / 2 / 5 / 2 / 6"` 固定栅格 | `flex: 0 1 auto; width: auto`（按内容撑开） |
| 数字 `min-width` | `2em` 硬撑 | 去掉，改 `padding: 0 0.1em` |
| 数字格 | `width: 1.05em` 固定 | `flex: 0 1 1.05em; min-width: 0.78em`（可压缩） |
| 算式行间距 | `gutter=20`（负 margin） | `gap: clamp(1px, 0.6cqw, 6px)` |

实测 `946+243=`（结果 1189，4 位答案格）：

| 视口 | 行宽 | 内容宽 | 重叠 | 页面横向溢出 |
|---|---|---|---|---|
| 1440 | 710 | 711 | 无 | 否 |
| 390 | 300 | 298 | 无 | 否 |
| 320 | 246 | 246 | 无 | 否 |

竖式（`946-243`）本来就是按 `--digits-width` 算的，桌面/320 均无越界无重叠。

### 2. 退格后要按两次才输入

```js
const handleBackspace = () => {
  bsLock = true                       // 原代码无条件置锁
  ...
}
```

`bsLock` 是给屏幕键盘的「退格」按钮设计的 —— 那个按钮会连着
`emit('backspace')` 和 `emit('input', 截断值)` 两次事件，需要用锁吞掉紧随其后的 `input`。
但物理键盘的 `Backspace` 只走这一个入口，没有后续 `input`，锁就一直留着，
下一次真实按键被 `handleInput` 里的 `if (bsLock) { bsLock = false; return }` 吃掉。

修法：`handleBackspace(fromKeypad = false)`，模板里屏幕键盘的 `@backspace` 传 `true`，
键盘路径不传。实测：按 7 → `__7` → 退格 → `___` → 按一次 3 → `__3`。

### 3. 音效

新建 `src/utils/sound/sfx.js`，用 **Web Audio API 实时合成**（不引入任何音频文件）：

| 音效 | 构成 | 触发点 |
|---|---|---|
| `tap` | 880Hz 正弦 45ms，增益 0.035 | 屏幕键盘按键、选项点击、物理键盘数字 |
| `correct` | C6 → E6（上行大三度） | 答对 |
| `wrong` | A3 滑到 F3，三角波 | 答错 |
| `group` | G5 → C6 | 完成一组（弹自我评价前） |
| `complete` | C6 → E6 → G6 琶音 | 完成整轮（汇总弹窗） |
| `start` | G5 → C6 | 点「开始练习」 |

设计取舍：
- 全部用 `exponentialRampToValueAtTime` 做快起慢落，避免爆音（增益不能到 0，用 0.0001）
- 主增益 0.035~0.075，很轻，不打扰家长
- 同音效 70ms 内节流，连续答对不叠成噪音
- 开关存 `localStorage`（`psm_sfx_enabled`），关掉时 `AudioContext.suspend()`
- 练习页 header 有 44px 的喇叭按钮切换

### 4. 顺手修的细节

| 项 | 说明 |
|---|---|
| 音效开关按钮 | 34px → **44px**（触屏最小可点尺寸） |
| 键盘操作提示 | 输入区下方加一行「0-9 输入 · ⌫ 退格 · Enter 提交」/「← → 选择 · Enter 提交」，只在 `@media (hover: hover) and (pointer: fine)` 显示 —— 触屏上不占地方 |
| 输入方向按运算类型区分 | 乘除（心算/口诀）**从左往右**，符合「先读高位」的口算顺序；加减（笔算思维）**从右往左**，照顾进位退位 |
| 方向残留 | `DigitInput` 在多题间复用，`onMounted` 只跑一次，`focusSlot` 会带着上一题的方向。加 `watch(modelValue)` / `watch(initialFocus)` 在输入清空时重置 |

实测四个方向：

```
3×4=     按 1 → 1_     按 2 → 12     PASS 从左
24÷6=    按 1 → 1      按 2 → 2      PASS 从左
946+243= 按 1 → ___1   按 2 → __21   PASS 从右
72-58=   按 1 → _1     按 2 → 21     PASS 从右
```

### 5. 审查过的、确认没问题的

- 竖式三位数（`946-243`）：桌面 1440 / 移动 320 均无越界、无重叠
- 4 个选项在 320 屏：2×2 换行，每个 109~115 × 44px，无横向溢出
- 弹窗场景按回车不会误跳题（`currentQuestion` 为空时 handler 直接返回）

单测 **186 通过（13 文件）**。

---

## 十三、档位配比系数（可调各档出题占比）

### 需求

多位数加减法一次出太多、耗时太长，但**不想动选题基础逻辑**，只想要一个能在基准比例上加系数的旋钮。

### 现状诊断（改之前先找到"比例"长在哪）

选题链路：

```
generateQuestionPlan(groupSize)        按 PROFILE_RATIOS 产出 ['strong','weak','challenge',...]
  ↓
generateAdaptiveBatch(engine, n, plan) 逐 slot 选档
  ├─ strong    → engine.pickStrongLevel()
  ├─ weak      → engine.pickWeakLevel()
  └─ challenge → difficultyIdx + 1
```

问题在 `pickStrongLevel()`：

```js
const filtered = indices.filter(i => i <= this.difficultyIdx + MAX_ADVANCE)
const weights = Array.from({ length: n }, (_, i) => Math.pow(1.5, i))
```

`filtered` 是**升序**的，权重是下标（不是档位号）的 `1.5^i` —— 下标越大 = 档位越高 = 权重越大。
强项若集中在 [大数加法, 大数减法]，权重 1 : 1.5，最高档独占 1.5^(n-1)；
而 strong 类占每组 40~60%，于是「高档多位数题」的占比被双倍放大。

实测默认分布（difficultyIdx=15，strong=[13,14,15]，3000 次采样）：
`13:20.8%  14:32.9%  15:46.3%` —— 最高档几乎占一半。

### 方案：系数只做缩放，不碰基准

新建 `src/utils/store/levelCoefficients.js`（localStorage，键 `psm_level_coefficients`）：

| 语义 | 行为 |
|---|---|
| 未配置某档 | 该档沿用原基准权重（等价 ×1），**候选池也不扩大** |
| 空表 | 选题行为与改动前逐位一致（纯 opt-in） |
| 系数 0 | 该档不出题 |
| 系数 >1 | 提高该档占比 |
| 给非强项档配系数 | 该档被拉进候选池（想补低档复习时用） |

作用点三处：

1. `adaptiveEngine.pickStrongLevel()` — `base × coef`，并用 `Object.keys(coeffs)` 扩展候选池
2. `adaptiveEngine.pickWeakLevel()` — 跳过系数 0 的弱项档
3. `adaptiveBatch.pickLevelForSlot()` — challenge 档系数 0 时退回当前档

兜底：所有权重被调成 0 时不调 `weightedRandom`（全 0 会返回最后一项或死循环），直接退回 `difficultyIdx`。

系数优先从实例读（`engine.levelCoefficients`，测试可注入），否则实时读 localStorage ——
这样用户改完不需要重建引擎。

### UI

`generate/OptionsDrawer.vue`（出题抽屉 → 其他设置）末尾新增可折叠段「档位配比」：

- 24 档逐行一个 `el-input-number`（0~3，步进 0.1），按年级分组标题（一上 / 一下 / 二上 / 二下 / 三上 / 三下 / 四上）
- 默认收起；有自定义时标题显示「N 档已自定义」标签 + 「恢复全部默认」按钮
- 值等于 1 时不落库（删掉该键），保证空表 = 默认行为

### 实测

| 项 | 结果 |
|---|---|
| 24 档渲染 | 输入框 24 个，年级分组 7 个，默认值全 1.0 |
| UI 改值落盘 | 第 16 档改 0.3 → `localStorage = {"15":0.3}` |
| 系数 0 生效 | 15 档占比 46.3% → **完全消失** |
| 系数 0.2 生效 | 15/13 比 **2.23 → 0.40**（降权后该档只剩 14.1%） |
| 移动端 390 | 抽屉 358px，面板 326px，越界 0，内部溢出 0 |
| 移动端 320 | 抽屉 288px，面板 256px，越界 0，内部溢出 0 |
| 默认不影响 | 空表时采样分布仍为 20.8 / 32.9 / 46.3（= 原 1:1.5:2.25） |

`test/services/levelCoefficients.spec.js` 11 项锁住「默认不改变行为」这条约束：
空表候选池只含强项、上限仍是 `difficultyIdx+2`、系数 0 该档消失、全 0 退回当前档、弱项顺延。

单测 **197 通过（14 文件）**。

---

## 十四、练习量输入框被压扁 + 配置改了不生效

### 1. 桌面端「自适应练习量」输入框只剩 3px

实测（改之前）：

| 视口 | 输入框实际宽度 | 数字是否被裁 |
|---|---|---|
| 1440 | **3px** | 是（scroll 16 / client 3） |
| 390 | 162px | 否 |
| 320 | 92px | 否 |

**越是桌面越难看** —— 因为移动端早就被 `@media (max-width: 480px)` 覆盖成整行，
桌面还留着原始的 `ElCol :sm="8"` 三列布局：抽屉 520px 减去 padding，
每列只有 147px，而输入框带两个前后缀（`最少` / `题`，约 12 个字符宽），
扣完前后缀留给 input 主体只剩个位数像素。

修法：三列 → 两列

```diff
- <ElCol :xs="12" :sm="8">   最少
- <ElCol :xs="12" :sm="8">   最多
- <ElCol :xs="24" :sm="8">   提示文字
+ <ElCol :xs="12" :sm="12">  最少
+ <ElCol :xs="12" :sm="12">  最多
+ <ElCol :xs="24" :sm="24">  提示文字（整行）
```

改后：1440 下 83px，390 下 162px，320 下 92px，三档均无裁切，提示文字也单独成行不再挤。

### 2. 抽屉里改了配置，开始界面没反应

根因是**快照式配置**：

```
诊断完成那一次：
  cfg = adaptiveConfig || configSnapshot          ← 在这里把 targetMin/Max 抄进 adaptiveConfig
  practiceStore.completeAssessment(..., {targetMin, targetMax})
        ↓
  之后在抽屉里改 targetMin/Max → 只改 formData，adaptiveConfig 纹丝不动
        ↓
  loadStartInfo() 读 adaptiveConfig → 显示的永远是诊断时的旧值
  引擎启动也读 adaptiveConfig → 用的是旧值
```

而且 `loadStartInfo()` 只被两个时机调用：`onMounted` 和 `watch(readyToStart)`。
抽屉改配置不会碰 `readyToStart`，所以界面完全不刷新。

修法：新增一条**实时**通路，优先级高于快照

| 层 | 来源 | 语义 |
|---|---|---|
| 1（最高） | `session.adaptiveTarget` | 抽屉里当前的设置，`watch` 一改就写 |
| 2 | `session.adaptiveConfig` | 诊断完成时的快照 |
| 3 | `session.configSnapshot` | 出题/打印时存的配置 |
| 4 | 默认 | 10 / 30 |

改动：

1. `stores/practice.js` — 新增 state `adaptiveTarget` + action `setAdaptiveTarget(min, max)`（<1 或非数字直接忽略）
2. `generate/AutoGenerateFormulas.vue` — `watch(() => [formData.targetMin, formData.targetMax], ...)`，`immediate: true`
3. `composables/useAdaptiveSession.js` — `startNewAdaptiveSession` 与 `completeAssessment` 都改成 `adaptiveTarget ?? adaptiveConfig ?? ...`
4. `components/Practice.vue` — `loadStartInfo` 读同一优先级，并新增 `watch(adaptiveTarget)` 在准备界面时刷新

### 实测

```
改之前开始界面   10~30 题
抽屉里改成       5 / 12
改之后开始界面   5~12 题           PASS
点「开始练习」   出 6 道题（4+7=…） PASS，落在 5~12 区间
```

排版三档：

```
[桌面1440] 83px / 83px   裁切 false/false
[移动390]  162px / 162px 裁切 false/false
[移动320]  92px / 92px   裁切 false/false
```

单测 **197 通过（14 文件）**。

---

## 十五、乘除号改用数学符号 × ÷

### 现状

`psm.js` 里早就有个 `repSymStr()`（把 `*`→`×`、`/`→`÷`），但**从未被调用** —— 死代码。
所以生成出来的算式一直带 `*` `/`，孩子看到的就是这两个编程符号。

链路上另外三处都已支持数学符号（进来先归一化），所以不用改：

| 位置 | 处理 |
|---|---|
| `equationCore.toEvalSymbols` | `×→*`、`÷→/` 归一化 |
| `EquationSolver.solve` | 入口先 `toEvalSymbols` |
| `Question._parseOperands` / `_OP_TO_NUM` | 正则已含 `×÷`，映射表已有 `'×':3, '÷':4` |

### 改动

**1. 生成出口替换（`psm.js`）**

```diff
- this.__data_list = slist.slice(0, target);
+ this.__data_list = slist.slice(0, target).map(repSymStr);
```

必须放在**最后**：上面所有校验（`validator` / `is_addcarry` / `getXStepstr` / `is_multcarry`）
都依赖 `*` `/` 写法，提前替换会让这些判断全部失效。

**2. 显示层分离（`equationParser.js`）**

发现一个问题：`parseEquation` 第一行就 `toEvalSymbols(equation)`，
然后 `operator` 从这个**归一化后**的串里取 —— 模板渲染 `parsedEquation.operator` 就又显示回 `*` `/`。

所以新增一个只用于显示的字段：

```js
operator,                              // '*' '/' —— 内部逻辑 + 写库用，不能变
displayOperator: toDisplaySymbol(...),  // '×' '÷' —— 只给模板
```

`HorizontalLayout.vue` / `VerticalLayout.vue` 的 `{{ parsedEquation.operator }}` 改用它。

`operator` 必须保持归一化，因为 `extractQuestionMetadata` 会把它写进 `Answer` 记录，
下游统计/档位匹配都按 `*` `/` 认。实测答案记录：`{"equation":"246×3=", "operator":"*"}` —— 符合预期。

**3. 老数据兜底（`AbilityCard.vue`）**

错题回顾直接渲染 `item.equation`。历史数据里存的是 `*` `/`，加 `toDisplaySymbols()`
（`equationCore` 里新增，`toEvalSymbols` 的逆操作）在显示时转换。

### 实测

生成器（各 8 条）：

```
乘法样例  6×7= / 9×6= / 5×2=
除法样例  6÷2= / 3÷3= / 8÷2=
仍含 * 或 / 的：无        （16/16 全是 × ÷）
求解抽样  6×7=→42  9×6=→54  5×2=→10  2×2=→4
```

端到端（真实作答）：

```
246×3=   显示 "246 × 3 ="  输入 738 → fb=correct   PASS
936÷8=   显示 "936 ÷ 8 ="  输入 117 → fb=correct   PASS
72-58=   显示 "-"          输入 41→"14" → correct   PASS
39+48=   显示 "+"          输入 78→"87" → correct   PASS
```

> 注意加减那两行「输入 41 得到 14」是**正常行为**：加减从右往左输入（笔算从个位起），
> 先敲个位再敲十位。乘除是从左往右。

排版（`×` `÷` 比 `*` `/` 宽，重点防溢出）：

| 题 | 视口 | 行宽 | 内容宽 | 重叠 | 横向溢出 |
|---|---|---|---|---|---|
| 246×3= | 1440 | 710 | 571 | 无 | 否 |
| 246×3= | 390 | 300 | 248 | 无 | 否 |
| 246×3= | 320 | 246 | 231 | 无 | 否 |
| 936÷8= | 320 | — | — | 无 | 否 |

`test/utils/algorithm/symbol.spec.js` 9 项锁死这条约定：生成器不输出 `*` `/`、
加减不被误改、`EquationSolver` 解得对、`Question.matchLevel` 认得出乘除档、
`displayOperator` 给 × ÷ 而 `operator` 仍是归一化、老数据纯 `*` `/` 也能显示成数学符号。

单测 **206 通过（15 文件）**。

---

## 十六、设置不保存（题目数量 / 练习量刷新后丢失）

### 现状

`Generate.vue` 的初始化是：

```js
const formData = ref({ ...DEFAULT_FORM_DATA })     // 每次都是默认值
onMounted(() => {
  applyConfigToFormData(formData.value, configurations.value[0].data)  // 只从「默认配置行」抄一次
})
```

恢复来源是 `ConfigStorage`（localStorage `customer-config`）里的默认配置行，
而**用户改表单时从不会写回那里** —— 只有手动点「保存配置」才会 `ConfigStorage.save()`。

所以：改题数、改练习量 → 不落任何地方 → 刷新就回默认值。

上一轮做的 `adaptiveTarget`（实时同步到开始界面）也只存在 Pinia store 内存里，
刷新同样丢。

### 改动

新增 `src/utils/store/formPersistence.js`（localStorage 键 `psm_form_state`）：

- 存 **formData + paperList** 两份 —— 题组里每组的题数在 `paperList` 里，
  只存 formData 修不好「题组题数不保存」
- 带 `version`，结构校验不过（缺 `numberOfFormulas` / `step`）就当没存过，回落原逻辑
- 写入 debounce 400ms（deep watch 在连续输入时会高频触发）
- **不动** `ConfigStorage` 的语义：「保存配置 / 选中配置」那套手动流程照旧可用

`Generate.vue` 三处：

```js
const savedFormState = loadFormState()
const formData = ref(savedFormState ? { ...DEFAULT_FORM_DATA, ...savedFormState.formData } : { ...DEFAULT_FORM_DATA })
const paperList = ref(savedFormState?.paperList?.length ? savedFormState.paperList.map(p => ({ ...p })) : [])

onMounted(() => {
  refreshConfiguration()
  if (!savedFormState) {                    // ← 关键：有保存值时不再套用默认配置行
    applyConfigToFormData(formData.value, configurations.value[0].data, { includeAdaptive: true })
  }
})

watch([formData, paperList], () => saveFormState(toRaw(formData.value), toRaw(paperList.value)), { deep: true })
```

`databaseInit.clearAllData()` 里补了 `clearFormState()` 和 `clearLevelCoefficients()`：
「重置数据」应该回到出厂默认，否则会残留上一次的出题设置和档位配比。

### 实测

```
改之前            口算题数量 30   练习量 10/30
改成              口算题数量 7    练习量 5/13
落盘 psm_form_state  {n:7, min:5, max:13}

刷新后            口算题数量 7    练习量 5/13      PASS
开始界面显示      5~13 题                          PASS
```

单测 **206 通过（15 文件）**，console 零错误。
