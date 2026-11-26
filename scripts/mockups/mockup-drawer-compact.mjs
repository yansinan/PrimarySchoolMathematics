/**
 * 下一轮设计图：生成卷子抽屉的紧凑化
 *   N1 数字范围改成「表格式」  （默认推荐）
 *   N2 数字范围改成「单行紧凑」
 *   O1 出题规则内联（折叠摘要）——  干掉「其他设置」按钮与二级抽屉
 *   O2 出题规则内联（展开）
 *
 * 用法：node scripts/mockup-drawer-compact.mjs
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('/tmp/pw-playwright/')
const { chromium } = require('/tmp/pw-playwright')

const OUT = '/home/dr/workspace/PrimarySchoolMathematics/designDocs/mockups/drawer-compact'
mkdirSync(OUT, { recursive: true })

const T = `
:root{--primary:#1cb0f6;--ink:#1e3c5c;--line:#dbe7f4}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#eef4fb;font-family:"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.page{padding:22px 20px 32px;background:linear-gradient(180deg,#f7fbff 0%,#eef6ff 100%)}
.legend{background:#fff;border-radius:14px;padding:14px 18px;box-shadow:0 8px 24px rgba(23,110,191,.08);margin-bottom:16px}
.legend h3{font-size:13.5px;color:#1e3c5c;margin-bottom:6px}
.legend p{font-size:12px;line-height:1.8;color:#5b6b7a}
.legend b{color:#1e3c5c}
.card{background:#fff;border-radius:16px;box-shadow:0 12px 32px rgba(23,110,191,.10);padding:16px 18px}
.drawer-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid #eef3f8;margin-bottom:14px}
.drawer-head span:first-child{font-size:15px;font-weight:600;color:#1e3c5c}
.label{font-size:13px;color:#606266}
.row{display:flex;align-items:center;gap:10px;padding:8px 0}
.row__label{font-size:13px;color:#606266;flex:0 0 92px}
.radio{display:inline-flex;border:1px solid #dcdfe6;border-radius:8px;overflow:hidden}
.radio span{padding:7px 12px;font-size:12.5px;color:#5b6b7a;border-right:1px solid #dcdfe6;background:#fff}
.radio span:last-child{border-right:none}
.radio span.on{background:#1cb0f6;color:#fff;font-weight:600}
.chk{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#5b6b7a;margin-right:12px}
.box{width:14px;height:14px;border:1px solid #dcdfe6;border-radius:3px;display:inline-block}
.box.on{background:#1cb0f6;border-color:#1cb0f6}
.input{height:34px;border:1px solid #dcdfe6;border-radius:8px;display:flex;align-items:center;padding:0 10px;font-size:13px;color:#1e3c5c;background:#fff}
.input--num{width:88px;justify-content:center}
.btn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 14px;border-radius:8px;
 font-size:13px;font-weight:600;border:1px solid #dcdfe6;background:#fff;color:#5b6b7a;white-space:nowrap}
.btn--primary{background:#1cb0f6;color:#fff;border-color:#1cb0f6}

/* ── N1 表格式 ── */
.rangetable{border:1px solid #e6eef6;border-radius:10px;overflow:hidden;background:#fff}
.rangetable__head{display:grid;grid-template-columns:1fr 92px 92px;gap:8px;padding:7px 12px;background:#f6faff;
 border-bottom:1px solid #e9f1fa;font-size:11.5px;color:#8794a2}
.rangetable__head span:nth-child(2),.rangetable__head span:nth-child(3){text-align:center}
.range-line{display:grid;grid-template-columns:1fr 92px 92px;gap:8px;align-items:center;padding:7px 12px;border-bottom:1px solid #f2f7fc}
.range-line:last-child{border-bottom:none}
.range-line__name{font-size:13px;color:#3f4d5a}
.range-line .input--num{width:100%}

/* ── N2 单行紧凑 ── */
.inlinerange{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:10px 12px;border:1px solid #e6eef6;border-radius:10px;background:#fff}
.inlinerange__item{display:flex;align-items:center;gap:6px}
.inlinerange__name{font-size:12.5px;color:#5b6b7a}
.tilde{color:#c0c4cc;font-size:12px}
.num-sm{width:56px;height:30px;border:1px solid #dcdfe6;border-radius:7px;display:flex;align-items:center;justify-content:center;
 font-size:13px;color:#1e3c5c;background:#fff}

/* ── 出题规则内联 ── */
.rules{border:1px solid #e6eef6;border-radius:10px;overflow:hidden}
.rules__head{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 12px;background:#f8fbff;cursor:pointer}
.rules__caret{width:12px;height:12px;color:#9aa7b4}
.rules__title{font-size:13px;font-weight:600;color:#1e3c5c;white-space:nowrap;flex:0 0 auto}
.rules__badges{display:flex;flex-wrap:wrap;gap:5px;margin-left:4px;flex:1 1 auto;min-width:0}
.badge{font-size:11px;color:#5b6b7a;background:#eef3f8;border-radius:6px;padding:2px 7px}
.rules__body{padding:10px 12px 12px;border-top:1px solid #eef3f8;display:flex;flex-direction:column;gap:10px;background:#fff}
.rules__field{display:flex;align-items:center;gap:10px}
.rules__label{font-size:12.5px;color:#7f8c9b;flex:0 0 72px}
`

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
const page = (inner) => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>${T}</style></head><body>${inner}</body></html>`

const stepRow = `
  <div class="row"><span class="row__label">几步运算</span>
    <div class="radio"><span>一步运算</span><span>两步运算</span><span>三步运算</span></div>
  </div>`

const beforeNums = `
  <div class="row"><span class="row__label">算数项1</span>
    <div style="display:flex;flex-direction:column;gap:8px;flex:1">
      <div class="input" style="width:100%"><span style="color:#909399;margin-right:8px">最小值</span>1</div>
      <div class="input" style="width:100%"><span style="color:#909399;margin-right:8px">最大值</span>9</div>
    </div>
  </div>
  <div class="row"><span class="row__label">算数项2</span>
    <div style="display:flex;flex-direction:column;gap:8px;flex:1">
      <div class="input" style="width:100%"><span style="color:#909399;margin-right:8px">最小值</span>1</div>
      <div class="input" style="width:100%"><span style="color:#909399;margin-right:8px">最大值</span>9</div>
    </div>
  </div>
  <div class="row"><span class="row__label">运算结果</span>
    <div style="display:flex;flex-direction:column;gap:8px;flex:1">
      <div class="input" style="width:100%"><span style="color:#909399;margin-right:8px">最小值</span>1</div>
      <div class="input" style="width:100%"><span style="color:#909399;margin-right:8px">最大值</span>99</div>
    </div>
  </div>`

const n1 = `
  <div class="rangetable">
    <div class="rangetable__head"><span>数字范围</span><span>最小值</span><span>最大值</span></div>
    <div class="range-line"><span class="range-line__name">算数项 1</span><div class="input input--num">1</div><div class="input input--num">9</div></div>
    <div class="range-line"><span class="range-line__name">算数项 2</span><div class="input input--num">1</div><div class="input input--num">9</div></div>
    <div class="range-line"><span class="range-line__name">运算结果</span><div class="input input--num">1</div><div class="input input--num">99</div></div>
  </div>`

const n2 = `
  <div class="inlinerange">
    <div class="inlinerange__item"><span class="inlinerange__name">算数项1</span>
      <span class="num-sm">1</span><span class="tilde">~</span><span class="num-sm">9</span></div>
    <div class="inlinerange__item"><span class="inlinerange__name">算数项2</span>
      <span class="num-sm">1</span><span class="tilde">~</span><span class="num-sm">9</span></div>
    <div class="inlinerange__item"><span class="inlinerange__name">结果</span>
      <span class="num-sm">1</span><span class="tilde">~</span><span class="num-sm">99</span></div>
  </div>`

/* ── 图 1：N1 表格式（手机 390） ── */
await shoot(page(`
  <div class="page" style="max-width:430px;margin:0 auto">
    <div class="legend">
      <h3>N1 · 数字范围改「表格式」（推荐）</h3>
      <p>三行共用一列表头 <b>最小值 / 最大值</b>，原来 6 个带前缀的大输入框变成 <b>3 行 × 2 个窄框</b>，
        高度少一半，标签和数字一眼对上。手机上仍然一行放得下。</p>
    </div>
    <div class="card">
      ${stepRow}
      <div style="height:6px"></div>
      ${n1}
    </div>
  </div>`), 'N1-range-table-390.png', { width: 430, height: 560 })

/* ── 图 2：N2 单行紧凑（手机 390） ── */
await shoot(page(`
  <div class="page" style="max-width:430px;margin:0 auto">
    <div class="legend">
      <h3>N2 · 数字范围改「单行紧凑」</h3>
      <p>全部压进一行：<b>算数项1 [1]~[9]  算数项2 [1]~[9]  结果 [1]~[99]</b>，窄屏自动换行。
        最省高度，但三组数字挨在一起，扫读时要多认一下。</p>
    </div>
    <div class="card">
      ${stepRow}
      <div style="height:6px"></div>
      ${n2}
    </div>
  </div>`), 'N2-range-inline-390.png', { width: 430, height: 480 })

/* ── 图 3：改造前后对照 ── */
await shoot(page(`
  <div class="page" style="max-width:900px;margin:0 auto">
    <div class="legend">
      <h3>改造前后对照 · 手机 390 宽度</h3>
      <p>左：现在的样子（每个范围两个整行输入框，<b>占 6 行</b>）；右：N1 表格式（<b>占 3 行</b>）。</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card" style="padding:12px">
        <div style="font-size:12px;color:#ff4b4b;margin-bottom:8px">现在</div>
        ${stepRow}${beforeNums}
      </div>
      <div class="card" style="padding:12px">
        <div style="font-size:12px;color:#2f9e5c;margin-bottom:8px">N1 表格式</div>
        ${stepRow}<div style="height:6px"></div>${n1}
      </div>
    </div>
  </div>`), 'N0-before-after.png', { width: 900, height: 720 })

/* ── 图 4：O1 出题规则内联（折叠） ── */
await shoot(page(`
  <div class="page" style="max-width:430px;margin:0 auto">
    <div class="legend">
      <h3>O1 · 干掉「其他设置」：出题规则内联（折叠态）</h3>
      <p>「几步运算」右侧那个 <b>其他设置</b> 按钮和它打开的二级抽屉取消，
        剩下的 5 项（题型/括号/进位/退位/解法）并进抽屉里一个可折叠的 <b>出题规则</b>，
        折叠时用 badge 显示当前选择 —— 点击数从 <b>3 级降到 1 级</b>。</p>
    </div>
    <div class="card">
      <div class="drawer-head"><span>测试生成</span><span style="color:#909399">×</span></div>
      ${stepRow}
      <div style="height:4px"></div>
      ${n1}
      <div style="height:10px"></div>
      <div class="row"><span class="row__label">运算符号</span>
        <div><span class="chk"><i class="box on"></i>+</span><span class="chk"><i class="box"></i>−</span>
          <span class="chk"><i class="box"></i>×</span><span class="chk"><i class="box"></i>÷</span></div>
      </div>
      <div class="row"><span class="row__label">口算题数量</span><div class="input input--num">30</div></div>
      <div style="height:6px"></div>
      <div class="rules">
        <div class="rules__head">
          <svg class="rules__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          <span class="rules__title">出题规则</span>
          <span class="rules__badges">
            <span class="badge">口算</span><span class="badge">无括号</span>
            <span class="badge">随机进位</span><span class="badge">随机退位</span><span class="badge">口算解题</span>
          </span>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        <span class="btn">生成卷子</span><span class="btn btn--primary">开始练习</span>
      </div>
    </div>
  </div>`), 'O1-rules-collapsed-390.png', { width: 430, height: 780 })

/* ── 图 5：O2 出题规则内联（展开） ── */
await shoot(page(`
  <div class="page" style="max-width:430px;margin:0 auto">
    <div class="legend">
      <h3>O2 · 出题规则内联（展开态）</h3>
      <p>展开就是原来「其他设置」里的 5 项，但不再跳二级抽屉，也不再有「其他设置」按钮。</p>
    </div>
    <div class="card">
      <div class="drawer-head"><span>测试生成</span><span style="color:#909399">×</span></div>
      ${stepRow}
      <div style="height:4px"></div>
      ${n1}
      <div style="height:10px"></div>
      <div class="rules">
        <div class="rules__head">
          <svg class="rules__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(90deg)"><polyline points="9 18 15 12 9 6"/></svg>
          <span class="rules__title">出题规则</span>
        </div>
        <div class="rules__body">
          <div class="rules__field"><span class="rules__label">题型</span>
            <div class="radio"><span class="on">口算题</span><span>竖式题</span></div></div>
          <div class="rules__field"><span class="rules__label">括号</span>
            <div class="radio"><span class="on">不带括号</span><span>带括号</span></div></div>
          <div class="rules__field"><span class="rules__label">加法进位</span>
            <div class="radio"><span class="on">随机进位</span><span>必须进位</span><span>不进位</span></div></div>
          <div class="rules__field"><span class="rules__label">减法退位</span>
            <div class="radio"><span class="on">随机退位</span><span>必须退位</span><span>不退位</span></div></div>
          <div class="rules__field"><span class="rules__label">解题方式</span>
            <div class="radio"><span class="on">口算</span><span>竖式</span></div></div>
        </div>
      </div>
    </div>
  </div>`), 'O2-rules-expanded-390.png', { width: 430, height: 900 })

await browser.close()
console.log('\n产出目录：' + OUT)
