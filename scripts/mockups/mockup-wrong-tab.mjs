/**
 * 设计图：生成模式改分页 + 「错题重现」页 + 多选交互方案
 * 产物：designDocs/mockups/wrong-tab/
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('/tmp/pw-playwright/')
const { chromium } = require('/tmp/pw-playwright')

const OUT = '/home/dr/workspace/PrimarySchoolMathematics/designDocs/mockups/wrong-tab'
mkdirSync(OUT, { recursive: true })

const T = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#eef4fb;font-family:"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.page{padding:20px 18px 30px;background:linear-gradient(180deg,#f7fbff 0%,#eef6ff 100%)}
.legend{background:#fff;border-radius:14px;padding:13px 16px;box-shadow:0 8px 24px rgba(23,110,191,.08);margin-bottom:16px}
.legend h3{font-size:13px;color:#1e3c5c;margin-bottom:5px}
.legend p{font-size:11.5px;line-height:1.75;color:#5b6b7a}
.legend b{color:#1e3c5c}
.drawer{background:#fff;border-radius:16px;box-shadow:0 12px 32px rgba(23,110,191,.12);overflow:hidden}
.drawer__head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #eef3f8}
.drawer__title{font-size:15px;font-weight:600;color:#1e3c5c}
.drawer__body{padding:14px 16px 16px}

/* 三段分页 */
.tabs{display:flex;border:1px solid #dcdfe6;border-radius:10px;overflow:hidden;margin-bottom:14px}
.tab{flex:1 1 0;text-align:center;padding:9px 0;font-size:13px;color:#5b6b7a;background:#fff;border-right:1px solid #dcdfe6;white-space:nowrap}
.tab:last-child{border-right:none}
.tab--on{background:#1cb0f6;color:#fff;font-weight:600}

/* 工具栏 */
.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.chip{font-size:12px;color:#5b6b7a;background:#f2f6fa;border-radius:999px;padding:4px 10px}
.chip--on{background:#e3f1ff;color:#176ebf;font-weight:600}
.spacer{flex:1 1 auto}
.count{font-size:12px;color:#176ebf;font-weight:600}

/* 错题列表 */
.list{max-height:268px;overflow-y:auto;border:1px solid #e6eef6;border-radius:12px;background:#fff}
.item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #f2f7fc}
.item:last-child{border-bottom:none}
.item--sel{background:#f2f9ff}
.check{width:18px;height:18px;border-radius:5px;border:1.5px solid #c9d6e2;flex:0 0 18px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff}
.check--on{background:#1cb0f6;border-color:#1cb0f6}
.eq{font-size:14px;color:#1e3c5c;font-variant-numeric:tabular-nums;flex:0 0 auto;min-width:92px}
.ans{font-size:12px;color:#7f8c9b}
.ans b{color:#e05252}
.times{font-size:11px;color:#b7791f;background:#fff7e6;border-radius:6px;padding:1px 6px;margin-left:auto}
.list__foot{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fbfdff;border-top:1px solid #e6eef6;font-size:11.5px;color:#9aa7b4}

/* 底部动作 */
.actions{display:flex;gap:10px;margin-top:14px}
.btn{flex:1;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;border:1px solid #dcdfe6;background:#fff;color:#5b6b7a}
.btn--primary{background:#1cb0f6;color:#fff;border-color:#1cb0f6}

/* 多选方案对比 */
.opt{border:1px solid #e6eef6;border-radius:12px;padding:12px;margin-bottom:12px;background:#fff}
.opt__title{font-size:12.5px;font-weight:600;color:#1e3c5c;margin-bottom:8px}
.opt__desc{font-size:11.5px;color:#7f8c9b;line-height:1.7;margin-top:8px}
.mock{display:flex;flex-direction:column;gap:6px}
.mrow{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:#f8fbff;font-size:12px;color:#3f4d5a}
.mbox{width:16px;height:16px;border-radius:4px;border:1.5px solid #c9d6e2;flex:0 0 16px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff}
.mbox--on{background:#1cb0f6;border-color:#1cb0f6}
.mrow--sel{background:#eaf6ff}
.dash{position:relative}
.dash::after{content:"";position:absolute;inset:2px;border:1.5px dashed #1cb0f6;border-radius:8px;background:rgba(28,176,246,.10);pointer-events:none}
.badge-tip{font-size:11px;color:#176ebf;background:#e3f1ff;border-radius:6px;padding:1px 6px;margin-left:6px}
`

const page = inner => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>${T}</style></head><body>${inner}</body></html>`
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
async function shoot(html, file, { width, height, dsf = 2 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf })
  const p = await ctx.newPage()
  await p.setContent(html, { waitUntil: 'networkidle' })
  await p.waitForTimeout(150)
  await p.screenshot({ path: `${OUT}/${file}`, fullPage: true })
  await ctx.close()
  console.log('✓', file)
}

const rows = [
  ['27 + 15 = 42', '我的答案 32', '忘进位', 2, true],
  ['8 + 7 = 15', '我的答案 5', '忘进位', 3, true],
  ['42 − 15 = 27', '我的答案 37', '忘退位', 1, false],
  ['7 × 8 = 56', '我的答案 48', '口诀串行', 2, false],
  ['56 ÷ 8 = 7', '我的答案 8', '试商偏差', 1, false],
  ['365 + 78 = 443', '我的答案 343', '忘进位', 1, true],
]

const listHtml = rows.map(([eq, ans, why, times, sel]) => `
  <div class="item ${sel ? 'item--sel' : ''}">
    <span class="check ${sel ? 'check--on' : ''}">${sel ? '✓' : ''}</span>
    <span class="eq">${eq}</span>
    <span class="ans">${ans} · ${why}</span>
    <span class="times">错 ${times} 次</span>
  </div>`).join('')

/* 图 1：三段分页 + 错题重现页 */
await shoot(page(`
  <div class="page" style="max-width:440px;margin:0 auto">
    <div class="legend">
      <h3>生成模式改成三段分页 · 新增「错题重现」</h3>
      <p>三页互斥，同一位置切换；<b>错题重现</b>里是一个可滚动的错题列表，
        每行显示「算式 · 我的答案 · 错因 · 错误次数」，左侧勾选加入本次练习。</p>
    </div>
    <div class="drawer">
      <div class="drawer__head"><span class="drawer__title">测试生成</span><span style="color:#909399">×</span></div>
      <div class="drawer__body">
        <div class="tabs">
          <span class="tab">自动生成</span>
          <span class="tab">手动添加</span>
          <span class="tab tab--on">错题重现</span>
        </div>

        <div class="toolbar">
          <span class="chip chip--on">全部</span>
          <span class="chip">加法</span>
          <span class="chip">减法</span>
          <span class="chip">乘法</span>
          <span class="chip">除法</span>
          <span class="spacer"></span>
          <span class="count">已选 3 题</span>
        </div>

        <div class="list">
          ${listHtml}
          <div class="list__foot">
            <span>共 23 道错题 · 滚到底自动加载</span>
            <span class="spacer"></span>
            <span style="color:#176ebf">全选</span>
          </div>
        </div>

        <div class="actions">
          <span class="btn">清空选择</span>
          <span class="btn btn--primary">开始互动练习（3 题）</span>
        </div>
      </div>
    </div>
  </div>`), 'wrong-tab-390.png', { width: 460, height: 780 })

/* 图 2：多选交互三方案 */
await shoot(page(`
  <div class="page" style="max-width:520px;margin:0 auto">
    <div class="legend">
      <h3>错题列表的多选方式 · 三种</h3>
      <p>错题通常几十条、需要逐题看清，所以「精准点选」优先；框选/连选在触屏上容易误选。</p>
    </div>

    <div class="opt">
      <div class="opt__title">A · 点击勾选（推荐）</div>
      <div class="mock">
        <div class="mrow mrow--sel"><span class="mbox mbox--on">✓</span>27 + 15 = 42　<span style="color:#7f8c9b">错 2 次</span></div>
        <div class="mrow mrow--sel"><span class="mbox mbox--on">✓</span>8 + 7 = 15　<span style="color:#7f8c9b">错 3 次</span></div>
        <div class="mrow"><span class="mbox"></span>42 − 15 = 27　<span style="color:#7f8c9b">错 1 次</span></div>
        <div class="mrow"><span class="mbox"></span>7 × 8 = 56　<span style="color:#7f8c9b">错 2 次</span></div>
      </div>
      <div class="opt__desc">整行可点（不用瞄准小方框）；桌面支持 <b>Shift+点击</b> 连选、<b>Ctrl/⌘+点击</b> 加选；配「全选 / 反选 / 按运算符组选」。</div>
    </div>

    <div class="opt">
      <div class="opt__title">B · 拖拽框选</div>
      <div class="mock dash">
        <div class="mrow mrow--sel"><span class="mbox mbox--on">✓</span>27 + 15 = 42</div>
        <div class="mrow mrow--sel"><span class="mbox mbox--on">✓</span>8 + 7 = 15</div>
        <div class="mrow"><span class="mbox"></span>42 − 15 = 27</div>
        <div class="mrow"><span class="mbox"></span>7 × 8 = 56</div>
      </div>
      <div class="opt__desc">桌面一把框选很爽，但触屏要「按住拖」才不误触滚动，实现复杂、移动端体验反而差。</div>
    </div>

    <div class="opt">
      <div class="opt__title">C · 滑动连选（长按进入）</div>
      <div class="mock">
        <div class="mrow mrow--sel"><span class="mbox mbox--on">✓</span>27 + 15 = 42</div>
        <div class="mrow mrow--sel"><span class="mbox mbox--on">✓</span>8 + 7 = 15</div>
        <div class="mrow mrow--sel"><span class="mbox mbox--on">✓</span>42 − 15 = 27</div>
        <div class="mrow"><span class="mbox"></span>7 × 8 = 56</div>
      </div>
      <div class="opt__desc">像相册选图，滑过即选。适合"整段全选"，但和列表滚动冲突，需要长按态提示，孩子容易选错又难撤销。</div>
    </div>
  </div>`), 'wrong-select-options.png', { width: 540, height: 900 })

await browser.close()
console.log('\n产出目录：' + OUT)
