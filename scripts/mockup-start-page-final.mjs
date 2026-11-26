/**
 * 准备页重设计 · 方案 A（窄栏居中）定稿图
 * 宽屏 = 手机版同一套布局，卡片宽度固定 560px 居中；不新增任何宽屏专用 CSS。
 *
 * 用法：node scripts/mockup-start-page-final.mjs
 * 产物：designDocs/mockups/start-page/final-*.png
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('/tmp/pw-playwright/')
const { chromium } = require('/tmp/pw-playwright')

const OUT = '/home/dr/workspace/PrimarySchoolMathematics/designDocs/mockups/start-page'
mkdirSync(OUT, { recursive: true })

const T = `
:root{--primary:#1cb0f6;--accent:#176ebf;--success:#58cc71;--ink:#1e3c5c;
 --muted:#8794a2;--muted2:#7f8c9b;--line:#dbe7f4;--focus:#d9822b}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#eef4fb;font-family:"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.page{min-height:100vh;background:linear-gradient(180deg,#f7fbff 0%,#eef6ff 100%);padding:20px 16px 30px}
.legend{background:#fff;border-radius:14px;padding:14px 18px;box-shadow:0 8px 24px rgba(23,110,191,.08);margin-bottom:20px;max-width:760px;margin-left:auto;margin-right:auto}
.legend h3{font-size:13.5px;color:#1e3c5c;margin-bottom:6px}
.legend p{font-size:12px;line-height:1.75;color:#5b6b7a}
.legend b{color:#1e3c5c}
.card{background:rgba(255,255,255,.9);backdrop-filter:blur(12px);border-radius:24px;
 box-shadow:0 12px 32px rgba(23,110,191,.08);width:560px;max-width:100%;margin:0 auto;padding:26px 30px 30px}
.panel{display:flex;flex-direction:column;gap:20px}
.head{text-align:center}
.title{font-size:26px;font-weight:700;color:#1e3c5c;line-height:1.3}
.sub{margin-top:4px;font-size:14px;color:#9aa7b4}
.section__title{font-size:13px;font-weight:600;color:#7f8c9b;letter-spacing:.02em;margin-bottom:10px}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.metric{padding:14px 10px;border-radius:16px;background:linear-gradient(135deg,#f4f9ff,#eef5fd);text-align:center}
.metric__value{font-size:24px;font-weight:700;color:#176ebf;font-variant-numeric:tabular-nums;line-height:1.15}
.metric__unit{font-size:13px;font-weight:600;margin-left:1px}
.metric__grade{margin-left:4px;padding:1px 5px;border-radius:6px;background:#e8f1fb;color:#3f7cb8;font-size:11px}
.metric__label{margin-top:4px;font-size:12px;color:#8794a2}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{padding:7px 14px;border-radius:999px;font-size:13px;font-weight:600;color:#4a5a68;background:#f2f5f8}
.chip--focus{color:#d9822b;background:rgba(217,130,43,.12)}
.chip--summary{font-size:12px;font-weight:500;color:#5b6b7a;background:#eef3f8;padding:4px 10px}
.settings{border-top:1px solid #dbe7f4;padding-top:14px}
.settings__head{display:flex;align-items:center;gap:10px}
.settings__caret{width:14px;height:14px;flex:0 0 14px;color:#9aa7b4}
.settings__caret--open{transform:rotate(90deg)}
.settings__label{font-size:14px;font-weight:600;color:#1e3c5c}
.scope{font-size:11px;font-weight:500;color:#7f8c9b;background:#eef3f8;border-radius:6px;padding:2px 7px}
.settings__summary{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.rows{margin-top:10px;display:flex;flex-direction:column}
.row{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 0;border-bottom:1px solid #eef3f8}
.row:last-child{border-bottom:none}
.row__label{font-size:14px;font-weight:500;color:#1e3c5c;flex:0 0 auto}
.row__value{font-size:13px;color:#5b6b7a;flex:1 1 auto;min-width:0}
.row__unit{font-size:13px;color:#8794a2}
.row--pair{gap:24px}
.pair{flex:1 1 0;display:flex;align-items:center;gap:8px;min-width:0}
.pair__label{font-size:14px;font-weight:500;color:#1e3c5c;white-space:nowrap}
.hintbtn{width:16px;height:16px;border-radius:50%;background:#dbe7f4;color:#7f8c9b;font-size:11px;
 display:inline-flex;align-items:center;justify-content:center;flex:0 0 16px;cursor:help;line-height:1}
.row--readonly .row__value{color:#9aa7b4;font-size:13px}
.btn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 14px;border-radius:9px;
 font-size:13px;font-weight:600;border:1px solid transparent;white-space:nowrap}
.btn--success{background:#58cc71;color:#fff}
.btn--ghost{background:#f2f5f8;color:#5b6b7a;border-color:#e3e9ef}
.level-actions{display:flex;align-items:center;gap:8px;margin-left:auto}
.btn--sm{height:30px;padding:0 10px;font-size:12.5px}
.caretbtn{width:28px;height:28px;border-radius:8px;border:1px solid #dcdfe6;background:#fff;color:#909399;
 display:inline-flex;align-items:center;justify-content:center}
.num{width:72px;height:32px;border:1px solid #dcdfe6;border-radius:8px;background:#fff;
 display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#1e3c5c;font-variant-numeric:tabular-nums}
.sw{width:44px;height:24px;border-radius:12px;background:#dcdfe6;position:relative;flex:0 0 44px}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.18)}
.sw--on{background:#58cc71}
.sw--on::after{left:22px}
.startbtn{width:100%;height:52px;border:none;border-radius:16px;background:#1cb0f6;color:#fff;
 font-size:17px;font-weight:600;letter-spacing:.08em;display:flex;align-items:center;justify-content:center}
.more{margin:0 0 8px;padding:12px 14px;border-radius:12px;background:#f6f9fc;border:1px solid #e6eef6;
 display:flex;flex-direction:column;gap:9px}
.more__title{font-size:12px;font-weight:600;color:#7f8c9b}
.more__row{display:flex;align-items:center;gap:10px}
.more__label{font-size:13px;color:#5b6b7a;flex:0 0 auto}
.more__hint{font-size:11.5px;color:#9aa7b4;flex:1 1 auto}
.sel{height:32px;border:1px solid #dcdfe6;border-radius:8px;background:#fff;display:flex;align-items:center;
 justify-content:space-between;padding:0 10px;font-size:13px;color:#5b6b7a;flex:1 1 auto}
.sel__caret{color:#c0c4cc}
@media(max-width:420px){.row--level{flex-wrap:wrap}.level-actions{width:100%;justify-content:flex-end;margin-left:0}}
@media(max-width:480px){.card{padding:20px 18px 22px}.title{font-size:22px}.metric{padding:12px 6px}.metric__value{font-size:20px}}
`
const SW_OFF = '<div class="sw"></div>'
const CARET = '<svg class="settings__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
const CARET_OPEN = '<svg class="settings__caret settings__caret--open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
const CARET_BTN = '<span class="caretbtn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>'

const metricsBlock = `
  <section>
    <div class="section__title">目前学习情况</div>
    <div class="metrics">
      <div class="metric"><div class="metric__value">Lv.10</div>
        <div class="metric__label">乘法口诀·2~6 <span class="metric__grade">二上</span></div></div>
      <div class="metric"><div class="metric__value">83<span class="metric__unit">%</span></div>
        <div class="metric__label">上次正确率</div></div>
      <div class="metric"><div class="metric__value">1<span class="metric__unit">天</span></div>
        <div class="metric__label">连续练习</div></div>
    </div>
  </section>
  <section>
    <div class="section__title">练习重点</div>
    <div class="chips"><span class="chip chip--focus">进退位巩固</span></div>
  </section>`

const settingsCollapsed = `
  <section class="settings">
    <div class="settings__head">${CARET}
      <span class="settings__label">本次练习设置</span>
      <span class="scope">只影响本次练习</span>
    </div>
    <div class="settings__summary">
      <span class="chip chip--summary">Lv.10 乘法口诀·2~6</span>
      <span class="chip chip--summary">10~30 题</span>
      <span class="chip chip--summary">每组 4~10 题</span>
      <span class="chip chip--summary">只练本档</span>
      <span class="chip chip--summary">手动升档</span>
    </div>
  </section>`

const settingsExpanded = `
  <section class="settings">
    <div class="settings__head">${CARET_OPEN}
      <span class="settings__label">本次练习设置</span>
      <span class="scope">只影响本次练习</span>
    </div>
    <div class="rows">
      <div class="row row--level">
        <span class="row__label">档位</span>
        <span class="row__value">Lv.10</span>
        <span class="level-actions">
          <span class="btn btn--ghost btn--sm">降一档</span>
          <span class="btn btn--success btn--sm">升一档</span>
          ${CARET_BTN}
        </span>
      </div>
      <div class="row row--pair">
        <div class="pair"><span class="pair__label">挑战题</span><span class="hintbtn">?</span>${SW_OFF}</div>
        <div class="pair"><span class="pair__label">自动升档</span><span class="hintbtn">?</span>${SW_OFF}</div>
      </div>
      <div class="row">
        <span class="row__label">题量</span><span class="hintbtn">?</span>
        <span class="row__value"></span>
        <span class="num">10</span><span class="row__unit">~</span><span class="num">30</span><span class="row__unit">题</span>
      </div>
      <div class="row row--readonly">
        <span class="row__label">每组</span><span class="hintbtn">?</span>
        <span class="row__value">4~10 题</span>
      </div>
    </div>
  </section>`


const settingsExpandedWithMore = `
  <section class="settings">
    <div class="settings__head">${CARET_OPEN}
      <span class="settings__label">本次练习设置</span>
      <span class="scope">只影响本次练习</span>
    </div>
    <div class="rows">
      <div class="row row--level">
        <span class="row__label">档位</span>
        <span class="row__value">Lv.10</span>
        <span class="level-actions">
          <span class="btn btn--ghost btn--sm">降一档</span>
          <span class="btn btn--success btn--sm">升一档</span>
          ${CARET_BTN}
        </span>
      </div>
      <div class="more">
        <div class="more__title">更多档位控制</div>
        <div class="more__row">
          <span class="more__label">起点档位</span>
          <span class="sel">自动（按练习记录计算）<span class="sel__caret">▾</span></span>
        </div>
        <div class="more__row">
          <span class="more__hint">指定后下次开始练习生效，不影响当前这一轮</span>
        </div>
        <div class="more__row" style="justify-content:flex-end;gap:8px">
          <span class="btn" style="background:#f2f5f8;color:#5b6b7a;border-color:#e3e9ef">恢复自动</span>
          <span class="btn btn--success">应用</span>
        </div>
      </div>
      <div class="row row--pair">
        <div class="pair"><span class="pair__label">挑战题</span><span class="hintbtn">?</span>${SW_OFF}</div>
        <div class="pair"><span class="pair__label">自动升档</span><span class="hintbtn">?</span>${SW_OFF}</div>
      </div>
      <div class="row">
        <span class="row__label">题量</span><span class="hintbtn">?</span>
        <span class="row__value"></span>
        <span class="num">10</span><span class="row__unit">~</span><span class="num">30</span><span class="row__unit">题</span>
      </div>
      <div class="row row--readonly">
        <span class="row__label">每组</span><span class="hintbtn">?</span>
        <span class="row__value">4~10 题</span>
      </div>
    </div>
  </section>`

const MORE = `
        <div class="more">
          <div class="more__title">更多档位控制</div>
          <div class="more__row">
            <span class="more__label">起点档位</span>
            <span class="sel">自动（按练习记录计算）<span class="sel__caret">▾</span></span>
          </div>
          <div class="more__row">
            <span class="more__hint">指定后下次开始练习生效，不影响当前这一轮</span>
          </div>
          <div class="more__row" style="justify-content:flex-end;gap:8px">
            <span class="btn" style="background:#f2f5f8;color:#5b6b7a;border-color:#e3e9ef">恢复自动</span>
            <span class="btn btn--success">应用</span>
          </div>
        </div>`

function card(settings) {
  return `<div class="card"><div class="panel">
    <div class="head"><div class="title">准备开始</div><div class="sub">今天也来练一练吧</div></div>
    ${metricsBlock}
    ${settings}
    <div style="margin-top:4px"><div class="startbtn">开始练习</div></div>
  </div></div>`
}

function page(inner, extra = '') {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>${T}${extra}</style></head><body>${inner}</body></html>`
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
async function shoot(html, file, { width, height, dsf = 2 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf })
  const p = await ctx.newPage()
  await p.setContent(html, { waitUntil: 'networkidle' })
  await p.waitForTimeout(200)
  await p.screenshot({ path: `${OUT}/${file}`, fullPage: true })
  await ctx.close()
  console.log('✓', file)
}

const NOTE = `
    <div class="legend">
      <h3>方案 A · 窄栏居中（定稿）</h3>
      <p>
        宽屏 = 手机版<b>同一套布局</b>，卡片固定 560px 居中，<b>零新增宽屏 CSS</b>。<br>
        依据：agentmux 宽屏 Settings 规格 §3.2 ——「一行一列、列宽可读」优先于「填满宽度」；
        对本页面（内容仅 4 块、给孩子看）更合适。
      </p>
    </div>`

/* 1) 桌面 1440 · 折叠（默认） */
await shoot(page(`<div class="page">${NOTE}${card(settingsCollapsed)}</div>`),
  'final-collapsed-1440.png', { width: 1440, height: 1000, dsf: 1.5 })

/* 2) 桌面 1440 · 展开 */
await shoot(page(`<div class="page">${NOTE}${card(settingsExpanded)}</div>`),
  'final-expanded-1440.png', { width: 1440, height: 1000, dsf: 1.5 })

/* 3) 桌面 1440 · 展开 + 「更多」面板 */
await shoot(page(`<div class="page">${NOTE}${card(settingsExpandedWithMore)}</div>`),
  'final-more-1440.png', { width: 1440, height: 1100, dsf: 1.5 })

/* 4) 手机 390 · 折叠 */
await shoot(page(`<div class="page" style="padding:12px 10px 20px">
  <div class="card" style="padding:18px 16px 20px;border-radius:22px">
    <div class="panel" style="gap:18px">
      <div class="head"><div class="title" style="font-size:22px">准备开始</div><div class="sub">今天也来练一练吧</div></div>
      ${metricsBlock}
      ${settingsCollapsed}
      <div class="startbtn" style="height:48px;font-size:16px">开始练习</div>
    </div>
  </div></div>`),
  'final-collapsed-390.png', { width: 390, height: 844, dsf: 2 })

/* 5) 手机 390 · 展开 */
await shoot(page(`<div class="page" style="padding:12px 10px 20px">
  <div class="card" style="padding:18px 16px 20px;border-radius:22px">
    <div class="panel" style="gap:18px">
      <div class="head"><div class="title" style="font-size:22px">准备开始</div><div class="sub">今天也来练一练吧</div></div>
      ${metricsBlock}
      ${settingsExpanded}
      <div class="startbtn" style="height:48px;font-size:16px">开始练习</div>
    </div>
  </div></div>`),
  'final-expanded-390.png', { width: 390, height: 844, dsf: 2 })

await browser.close()
console.log('\n产出目录：' + OUT)
