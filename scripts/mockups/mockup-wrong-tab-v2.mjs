/**
 * 设计图 v2：「错题重现」精简信息 + 排序 + 选 N 题
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
.tabs{display:flex;border:1px solid #dcdfe6;border-radius:10px;overflow:hidden;margin-bottom:12px}
.tab{flex:1 1 0;text-align:center;padding:9px 0;font-size:13px;color:#5b6b7a;background:#fff;border-right:1px solid #dcdfe6;white-space:nowrap}
.tab:last-child{border-right:none}
.tab--on{background:#1cb0f6;color:#fff;font-weight:600}
.toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.chip{font-size:12px;color:#5b6b7a;background:#f2f6fa;border-radius:999px;padding:4px 10px}
.chip--on{background:#e3f1ff;color:#176ebf;font-weight:600}
.spacer{flex:1 1 auto}
.count{font-size:12px;color:#176ebf;font-weight:600}
.sortrow{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.sortlabel{font-size:11.5px;color:#9aa7b4}
.select{display:inline-flex;align-items:center;gap:6px;border:1px solid #dcdfe6;border-radius:8px;padding:5px 10px;font-size:12px;color:#3f4d5a;background:#fff}
.select__caret{color:#c0c4cc;font-size:10px}
.list{border:1px solid #e6eef6;border-radius:12px;background:#fff;max-height:300px;overflow-y:auto}
.item{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #f2f7fc}
.item:last-child{border-bottom:none}
.item--sel{background:#f2f9ff}
.check{width:18px;height:18px;border-radius:5px;border:1.5px solid #c9d6e2;flex:0 0 18px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff}
.check--on{background:#1cb0f6;border-color:#1cb0f6}
.eq{font-size:13.5px;color:#1e3c5c;font-variant-numeric:tabular-nums;flex:0 0 auto}
.wrongans{color:#e05252;text-decoration:line-through;text-decoration-thickness:2px;font-size:13.5px;font-variant-numeric:tabular-nums}
.why{font-size:11px;color:#b7791f;background:#fff7e6;border-radius:6px;padding:1px 6px}
.times{font-size:11px;color:#7f8c9b}
.need{font-size:11px;color:#176ebf;background:#eaf4ff;border-radius:6px;padding:1px 6px;margin-left:auto}
.list__foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;background:#fbfdff;border-top:1px solid #e6eef6;font-size:11.5px;color:#9aa7b4}
.num-input{width:52px;height:26px;border:1px solid #dcdfe6;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;
 font-size:12px;color:#1e3c5c;background:#fff;font-variant-numeric:tabular-nums}
.link{color:#176ebf;font-weight:600}
.actions{display:flex;gap:10px;margin-top:14px}
.btn{flex:1;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;border:1px solid #dcdfe6;background:#fff;color:#5b6b7a}
.btn--primary{background:#1cb0f6;color:#fff;border-color:#1cb0f6}
/* 对比小图 */
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cmp__box{border:1px solid #e6eef6;border-radius:12px;padding:12px;background:#fff}
.cmp__title{font-size:11.5px;color:#7f8c9b;margin-bottom:8px}
.line{display:flex;align-items:center;gap:8px;font-size:14px;color:#1e3c5c;font-variant-numeric:tabular-nums}
.strike{color:#e05252;text-decoration:line-through;text-decoration-thickness:2px}
.cross{position:relative;color:#e05252;padding:0 2px}
.cross::after{content:"✕";position:absolute;right:-8px;top:-6px;font-size:9px;color:#e05252}
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
  ['27 + 15 =', '32', '忘进位', 3, '再练 5 次', true],
  ['8 + 7 =', '5', '忘进位', 3, '再练 5 次', true],
  ['42 − 15 =', '37', '忘退位', 2, '再练 3 次', false],
  ['7 × 8 =', '48', '口诀串行', 2, '再练 3 次', false],
  ['56 ÷ 8 =', '8', '试商偏差', 1, '再练 2 次', false],
  ['365 + 78 =', '343', '忘进位', 1, '再练 2 次', false],
]

const listHtml = rows.map(([eq, wrong, why, times, need, sel]) => `
  <div class="item ${sel ? 'item--sel' : ''}">
    <span class="check ${sel ? 'check--on' : ''}">${sel ? '✓' : ''}</span>
    <span class="eq">${eq}</span>
    <span class="wrongans">${wrong}</span>
    <span class="why">${why}</span>
    <span class="times">错 ${times} 次</span>
    <span class="need">${need}</span>
  </div>`).join('')

/* 图 1：v2 主界面 */
await shoot(page(`
  <div class="page" style="max-width:440px;margin:0 auto">
    <div class="legend">
      <h3>错题重现 · v2（精简信息 + 排序 + 选 N 题）</h3>
      <p>行内只保留 <b>算式 + 划掉的错误答案 + 错因 + 错误次数 + 还需练几次</b>，不再展示正确答案。</p>
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
          <span class="count">已选 2 题</span>
        </div>

        <div class="sortrow">
          <span class="sortlabel">排序</span>
          <span class="select">最该练（掌握度低优先）<span class="select__caret">▾</span></span>
          <span class="sortlabel">共 23 道</span>
        </div>

        <div class="list">
          ${listHtml}
          <div class="list__foot">
            <span class="link">全选</span>
            <span class="spacer"></span>
            <span>选</span>
            <span class="num-input">30</span>
            <span>题</span>
            <span class="link">自动选择</span>
          </div>
        </div>

        <div class="actions">
          <span class="btn">清空选择</span>
          <span class="btn btn--primary">开始互动练习（2 题）</span>
        </div>
      </div>
    </div>
  </div>`), 'wrong-tab-v2-390.png', { width: 460, height: 800 })

/* 图 2：错误答案的两种展示方式 */
await shoot(page(`
  <div class="page" style="max-width:520px;margin:0 auto">
    <div class="legend">
      <h3>错误答案怎么显示（不展示正确答案）</h3>
      <p>两种方案，功能等价；A 更克制、B 更醒目。</p>
    </div>
    <div class="cmp">
      <div class="cmp__box">
        <div class="cmp__title">A · 划线（推荐）</div>
        <div class="line">27 + 15 = <span class="strike">32</span></div>
        <div class="line" style="margin-top:8px">42 − 15 = <span class="strike">37</span></div>
        <div style="font-size:11px;color:#9aa7b4;margin-top:10px;line-height:1.7">
          删除线＝"这个答案是错的"，一眼就懂；<br>孩子数学课上也在用这个记号。
        </div>
      </div>
      <div class="cmp__box">
        <div class="cmp__title">B · 叉号角标</div>
        <div class="line">27 + 15 = <span class="cross">32</span></div>
        <div class="line" style="margin-top:8px">42 − 15 = <span class="cross">37</span></div>
        <div style="font-size:11px;color:#9aa7b4;margin-top:10px;line-height:1.7">
          更像"批改过的卷子"，但数字上叠符号，<br>小字号时会显脏。
        </div>
      </div>
    </div>
  </div>`), 'wrong-ans-style.png', { width: 540, height: 380 })

await browser.close()
console.log('\n产出目录：' + OUT)
