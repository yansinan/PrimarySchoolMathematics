# 15 · 音效丰富（成功 / 失败 / 结束）

> 状态：**已实施**（2026-11-25，dr 需求：「再丰富一下音效，尤其是在成功和失败的时候，
> 看看还有什么可以加的地方。对了，还有结束的时候」）
> 实现：`src/utils/sound/sfx.js`（Web Audio 实时合成，零音频文件）

---

## 一、原则（沿用原模块，不变）

- **短**：单个音效 60~420ms，不拖慢答题节奏
- **轻**：峰值增益 0.02~0.08，不打扰家长同学
- **悦耳**：纯正弦 / 三角波 + 指数衰减包络，不用方波硬切
- **不评判**：答错、跳题、成绩一般都用温和提示；没有下滑的悲伤音、没有蜂鸣
- **可关**：开关存 `psm_sfx_enabled`，关闭时不创建 AudioContext

---

## 二、音效表

| 音效 | 触发时机 | 声音设计 |
|---|---|---|
| `tap` | 数字键 / 选项（点击或物理键盘） | 660Hz 短音 + 一点高频「键帽」头，像指尖敲塑料键 |
| `keyBack` | 退格（屏幕键盘 / 物理 Backspace） | A4→330Hz 短下滑，比数字键低一点，好区分 |
| `keyConfirm` | 确认键 / 回车提交 | 660→880Hz 两音快速上行（30+45ms，短到不抢随后的对/错音） |
| `correct` | 答对 | C6→E6 两音 + 一点 C7 高频闪光 |
| `correct`（连对） | 同一轮连对 ≥3 / ≥5 / ≥10 | 依次追加 G6 / C7 / E7 —— 不给文字也能听出「连击」 |
| `wrong` | 答错（attempt 1） | A3→F3 低音下滑，短促 |
| `wrong`（再错） | 同一题 attempt ≥2 | 追加更柔的低音下滑（「再想想」而不是「你又错了」） |
| `skip` | 错满重试上限强制跳题 | D4→A3 温和下行两音 |
| `group` | 完成一组 | G5→C6 |
| `group`（满分） | 一组全对 | 追加 E6→G6 明亮上行 |
| `levelup` | 自适应升档（难度 +1） | C6→E6→G6→C7 短琶音 + 高音闪光 |
| `assess` | 能力评估完成 | E5→A5→C6 柔和三音（比整轮完成轻） |
| `start` | 开始练习 / 开始新一轮 | G5→C6 |
| `complete`（优秀） | 结束整轮，正确率 ≥95% | C6→E6→G6→C7 长琶音 + E7 闪光 |
| `complete`（一般） | 60%~94% | C6→E6→G6（原行为） |
| `complete`（鼓励） | <60% | G4→C5→E5 温暖上行（不丧、不敷衍） |

节流：同名音效 70~1200ms 内不重复叠加（`THROTTLE_MS`），避免连对时波形叠在一起发吵；
`start` 给到 1.2s，因为「点开始练习」和「新一轮」两条路径都会触发。

---

## 三、触发点

| 文件 | 位置 | 音效 |
|---|---|---|
| `components/input/NumberKeypad.vue` | 数字键 / 退格 / 确认 | `tap` / `keyBack` / `keyConfirm` |
| `components/input/OptionButtons.vue` | 选中选项 | `tap` |
| `components/Practice.vue` | 物理键盘：数字 / Backspace / Enter | `tap` / `keyBack` / `keyConfirm` |
| 同上 | 选择题 ← → 移动焦点、数字快选、回车提交 | `tap` / `keyConfirm` |
| `components/Practice.vue` | `handleSubmit` 答对 | `correct` + `{ streak }` |
| 同上 | 答错 | `wrong` + `{ attempt }` |
| 同上 | 错满 3 次强制跳题 | `skip`（200ms 后，错开答错音） |
| 同上 | 手动/普通题单完成（`handlePracticeComplete`） | `complete` + `{ tier: tierForRate(rate) }` |
| 同上 | 点「开始练习」 | `start` |
| `composables/useAdaptiveSession.js` | `startNewAdaptiveSession`（含「开始新一轮」路径） | `start`（靠节流去重） |
| 同上 | 一组完成、弹自我评价前 | `group` + `{ perfect }` |
| 同上 | `evaluateGroup` 后档位上升 | `levelup`（延迟 320ms 错开组完成音/弹窗） |
| 同上 | 整轮结束、弹汇总前 | `complete` + `{ tier }` |
| 同上 | `completeAssessment` 诊断完成 | `assess` |

`tierForRate(rate)`：≥95 `great`、<60 `encourage`、其余 `good` —— 与
`constants/practice.js` 的评语分档（95 / 80 / 60）同口径。

---

## 四、验证

### 单测 `test/utils/sound/sfx.spec.js`（11 条）

用假的 AudioContext 数「发了几个音」，锁住相对丰富度：

| 断言 | 结果 |
|---|---|
| `tierForRate` 分档边界 | 100/95→great，94/60→good，59/0→encourage |
| 优秀档音数 > 一般档，一般/鼓励档都发声 | 5 > 3 |
| 连对 3/5/10 音数逐级递增 | 3 < 4 < 5 < 6 |
| 再次答错比第一次多一个音 | 1 → 2 |
| 满分一组比普通一组长；升档琶音 > 3 个音；评估完成 ≤ 整轮完成 | 通过 |
| 未知音效 / 关闭开关 / 无 AudioContext | 不抛错、静音 |

全量：`npx vitest run` → **266 通过（22 文件）**。

### 浏览器实测（8080 真 Chromium，包一层 AudioContext 数振荡器）

| 检查点 | 结果 |
|---|---|
| 诊断答对 5 题 | 每题 3 个音（基础两音 + 闪光），第 3 题起 4 个音（连对 3 加成） |
| 第 5 题答完（评估完成） | 该题共 8 个音 = 连对 5 档（5）+ `assess`（3） |
| 点「开始练习」 | +2 个音（`start`） |
| 练习中连对 3 题 | 每题 3 / 3 / 4 个音（第 3 题连对加成） |
| 同一题错两次 | 第一次 1 个音，第二次 2 个音 |
| `psm_sfx_enabled=0` 后答题 | +0（完全静音） |
| 物理键盘 7 / Backspace / Enter | +2（tap）/ +1（keyBack）/ +3（keyConfirm + 该题答错音） |
| 屏幕键盘 5 / 退格 / 确认 | +2 / +1 / +4（keyConfirm + 再次答错双音） |
| console | 零报错 |

> 音色好不好听没法在无头浏览器里断言，需要家长实际听一遍；音量/音高都在
> `sfx.js` 的 `tone()` 参数与 `N`（音名→频率）表里，可随时微调。

---

## 五、后续可加（按需）

| 位置 | 想法 |
|---|---|
| 自我评价弹窗提交 | 学生自评分数不同的轻提示音（1~5 档） |
| 里程碑（累计 100 题、连续 7 天） | 独立 `milestone` 音效 + 弹窗 |
| 连续答错后的降档 | 目前不给「失败音」，可考虑一个极轻的「调整一下」提示 |
| 音效音量档位 | 现在只有开/关；可加「小/中」两档 |
