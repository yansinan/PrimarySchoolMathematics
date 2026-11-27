/**
 * 准备页重设计 · 设计图渲染脚本（一次性工具，产出 PNG）
 * 用法：node scripts/mockup-start-page.mjs
 * 产物：designDocs/mockups/start-page/*.png
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire('/tmp/pw-playwright/')
const { chromium } = require('/tmp/pw-playwright')

const OUT = '/home/dr/workspace/PrimarySchoolMathematics/designDocs/mockups/start-page'
mkdirSync(OUT, { recursive: true })

/* ── 设计 token（全部取自现有代码）─────────────────────────────
 * 主色 #1cb0f6 / 强调 #176ebf / 成功 #58cc71 / 文本 #1e3c5c
 * 弱文本 #8794a2 #7f8c9b / 边 #dbe7f4 / 面板 #f8fbff→#eef5ff
 */
const TOKENS = `
:root{
  --primary:#1cb0f6; --accent:#176ebf; --success:#58cc71;
  --ink:#1e3c5c; --muted:#8794a2; --muted2:#7f8c9b;
  --line:#dbe7f4; --panel-a:#f8fbff; --panel-b:#eef5fd;
  --chip-bg:#f2f5f8; --chip-ink:#4a5a68;
  --focus:#d9822b;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#eef4fb;font-family:"PingFang SC","Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.frame{display:flex;justify-content:center;padding:28px 20px;background:#eef4fb}
.phone{width:390px;height:844px;background:#fff;border-radius:26px;box-shadow:0 18px 48px rgba(23,110,191,.16);overflow:hidden;position:relative}
.desktop{width:100%;max-width:960px;background:#f7fbff;border-radius:20px;box-shadow:0 14px 40px rgba(23,110,191,.14);overflow:hidden}
.statusbar{height:28px;background:#f7fbff;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:11px;color:#9aa7b4}
.viewport{height:816px;overflow:hidden;background:linear-gradient(180deg,#f7fbff 0%,#eef6ff 100%);padding:16px 14px 0}
.dviewport{min-height:900px;overflow:hidden;background:linear-gradient(180deg,#f7fbff 0%,#eef6ff 100%);padding:28px 24px 0;display:flex;justify-content:center}
.split{display:grid;grid-template-columns:minmax(280px,340px) minmax(0,1fr);gap:24px;align-items:start}
@media(max-width:900px){.split{grid-template-columns:1fr;gap:16px}}

/* ── 卡片 ── */
.card{background:rgba(255,255,255,.88);backdrop-filter:blur(12px);border-radius:24px;
  box-shadow:0 12px 32px rgba(23,110,191,.08);width:100%;max-width:560px}
/* 宽屏：卡片随视口放宽（clamp），避免在大屏上孤零零一条 */
@media(min-width:768px){.card{max-width:clamp(560px,72vw,880px)}}
.panel{display:flex;flex-direction:column;gap:20px;padding:8px 4px 4px}
.head{text-align:center}
.title{font-size:26px;font-weight:700;color:#1e3c5c;line-height:1.3}
.sub{margin-top:4px;font-size:14px;color:#9aa7b4}
.section__title{font-size:13px;font-weight:600;color:#7f8c9b;letter-spacing:.02em;margin-bottom:10px}
.section__head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px}
.section__head .section__title{margin-bottom:0}

/* 三张指标卡 */
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.metric{padding:14px 10px;border-radius:16px;background:linear-gradient(135deg,#f4f9ff,#eef5fd);text-align:center}
.metric__value{font-size:24px;font-weight:700;color:#176ebf;font-variant-numeric:tabular-nums;line-height:1.15}
.metric__unit{font-size:13px;font-weight:600;margin-left:1px}
.metric__grade{margin-left:4px;padding:1px 5px;border-radius:6px;background:#e8f1fb;color:#3f7cb8;font-size:11px}
.metric__label{margin-top:4px;font-size:12px;color:#8794a2}

/* chip 行 */
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{padding:7px 14px;border-radius:999px;font-size:13px;font-weight:600;color:#4a5a68;background:#f2f5f8}
.chip--level{color:#176ebf;background:rgba(23,110,191,.1)}
.chip--focus{color:#d9822b;background:rgba(217,130,43,.12)}
.chip--summary{font-size:12px;font-weight:500;color:#5b6b7a;background:#eef3f8;padding:4px 10px}

/* ── 本次练习设置（折叠区块）────────────────────────────── */
.settings{border-top:1px solid #dbe7f4;padding-top:14px;margin-top:2px}
.settings__head{display:flex;align-items:center;gap:10px;cursor:default}
.settings__caret{width:14px;height:14px;flex:0 0 14px;color:#9aa7b4;transition:transform .16s ease}
.settings__caret--open{transform:rotate(90deg)}
.settings__label{font-size:14px;font-weight:600;color:#1e3c5c}
.scope{font-size:11px;font-weight:500;color:#7f8c9b;background:#eef3f8;border-radius:6px;padding:2px 7px}
.settings__summary{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.rows{margin-top:10px;display:flex;flex-direction:column;gap:0}
.row--pair{gap:20px}
.pair{flex:1 1 0;display:flex;align-items:center;gap:8px;min-width:0}
.pair__label{font-size:14px;font-weight:500;color:#1e3c5c;white-space:nowrap}
.pair__hint{display:none}
.hintbtn{width:16px;height:16px;border-radius:50%;background:#dbe7f4;color:#7f8c9b;font-size:11px;
  display:inline-flex;align-items:center;justify-content:center;flex:0 0 16px;cursor:help;line-height:1}
.popover{position:absolute;z-index:20;background:#1e3c5c;color:#fff;font-size:12px;line-height:1.6;
  padding:7px 10px;border-radius:8px;box-shadow:0 6px 18px rgba(30,60,92,.28);max-width:200px;white-space:normal}
.popover::after{content:"";position:absolute;top:100%;left:14px;border:5px solid transparent;border-top-color:#1e3c5c}
.rel{position:relative}
.row--readonly .row__value{color:#9aa7b4;font-size:13px}
.row{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 0;border-bottom:1px solid #eef3f8}
.row:last-child{border-bottom:none}
.row__label{font-size:14px;font-weight:500;color:#1e3c5c;flex:0 0 auto}
.row__value{font-size:13px;color:#5b6b7a;flex:1 1 auto;min-width:0}
.row__hint{display:none}
.row__unit{font-size:13px;color:#8794a2}
.row--level{flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 14px;border-radius:9px;
  font-size:13px;font-weight:600;border:1px solid transparent;white-space:nowrap}
.btn--success{background:#58cc71;color:#fff}
.btn--success[disabled]{background:#cfe9d7;color:#7fae8b}
.btn--link{background:transparent;color:#176ebf;padding:0 6px;height:28px;font-weight:500}
.btn--ghost{background:#f2f5f8;color:#5b6b7a;border-color:#e3e9ef}
.num{width:72px;height:32px;border:1px solid #dcdfe6;border-radius:8px;background:#fff;
  display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#1e3c5c;
  font-variant-numeric:tabular-nums}
.sw{width:44px;height:24px;border-radius:12px;background:#dcdfe6;position:relative;flex:0 0 44px}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;
  box-shadow:0 1px 3px rgba(0,0,0,.18)}
.sw--on{background:#58cc71}
.sw--on::after{left:22px}
.more{width:100%;margin:0 0 8px;padding:10px 12px;border-radius:12px;background:#f6f9fc;border:1px solid #e6eef6;
  display:flex;flex-direction:column;gap:8px}
.more__title{font-size:12px;font-weight:600;color:#7f8c9b}
.more__row{display:flex;align-items:center;gap:8px}
.more__label{font-size:13px;color:#5b6b7a;flex:0 0 auto}
.more__hint{font-size:11.5px;color:#9aa7b4;flex:1 1 auto}
.caretbtn{width:28px;height:28px;border-radius:8px;border:1px solid #dcdfe6;background:#fff;color:#909399;
  display:inline-flex;align-items:center;justify-content:center}
.sel{height:32px;border:1px solid #dcdfe6;border-radius:8px;background:#fff;display:flex;align-items:center;
  justify-content:space-between;padding:0 10px;font-size:13px;color:#5b6b7a;min-width:210px}
.sel__caret{color:#c0c4cc}

/* 主按钮 */
.startbtn{width:100%;height:52px;border:none;border-radius:16px;background:#1cb0f6;color:#fff;
  font-size:17px;font-weight:600;letter-spacing:.08em;display:flex;align-items:center;justify-content:center}
.sticky{position:absolute;left:0;right:0;bottom:0;padding:12px 14px 18px;
  background:linear-gradient(180deg,rgba(247,251,255,0),rgba(247,251,255,.96) 32%)}

/* 桌面两列 */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 28px}
.deskrows .grid2{gap:0 28px}
.deskrows .grid2 .row{border-bottom:1px solid #eef3f8}
/* 设置区在宽屏自动排成两列：grid-template-columns: repeat(auto-fit, minmax(300px, 1fr))
   —— 不用媒体查询硬切，容器窄就自动回退一列 */
.wide-rows{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0 32px;align-items:start}
.wide-rows > .row--level,.wide-rows > .row--pair{grid-column:1/-1}
@media(max-width:560px){.grid2{grid-template-columns:1fr}}

/* 标注（设计说明） */
.note{position:absolute;background:#fffbe8;border:1px solid #ffe08a;border-radius:8px;
  font-size:11px;line-height:1.5;color:#6b5510;padding:6px 9px;box-shadow:0 4px 14px rgba(200,160,20,.18);max-width:210px}
.anno{position:absolute;background:#1cb0f6;color:#fff;font-size:11px;font-weight:600;border-radius:999px;
  padding:2px 8px;box-shadow:0 3px 10px rgba(28,176,246,.35);white-space:nowrap}
.anno--green{background:#58cc71;box-shadow:0 3px 10px rgba(88,204,113,.35)}
.anno--orange{background:#ffb13c;box-shadow:0 3px 10px rgba(255,177,60,.35)}
.legend{max-width:960px;margin:0 auto 18px;background:#fff;border-radius:16px;padding:16px 20px;
  box-shadow:0 8px 24px rgba(23,110,191,.08)}
.legend h3{font-size:14px;color:#1e3c5c;margin-bottom:8px}
.legend p{font-size:12.5px;line-height:1.75;color:#5b6b7a}
.legend b{color:#1e3c5c}
.legend .tag{display:inline-block;background:#eef4fb;color:#176ebf;border-radius:6px;padding:1px 7px;
  font-size:11.5px;font-weight:600;margin-right:6px}
</style>`

const SWITCH_ON = '<div class="sw sw--on"></div>'
const SWITCH_OFF = '<div class="sw"></div>'
const CARET = '<svg class="settings__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
const CARET_OPEN = '<svg class="settings__caret settings__caret--open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'

/** 现状：重复档位 + 历史正确率 */
function beforePanel() {
  return `
  <div class="panel">
    <div class="head"><div class="title">准备开始</div><div class="sub">今天也来练一练吧</div></div>
    <section>
      <div class="section__title">目前学习情况</div>
      <div class="metrics">
        <div class="metric"><div class="metric__value">Lv.10</div>
          <div class="metric__label">乘法口诀·2~6 <span class="metric__grade">二上</span></div></div>
        <div class="metric"><div class="metric__value">100<span class="metric__unit">%</span></div>
          <div class="metric__label">历史正确率</div></div>
        <div class="metric"><div class="metric__value">1<span class="metric__unit">天</span></div>
          <div class="metric__label">连续练习</div></div>
      </div>
    </section>
    <section>
      <div class="section__title">这次练什么</div>
      <div class="chips">
        <span class="chip">10~30 题</span><span class="chip">每组 4~10 题</span>
        <span class="chip">只练本档</span><span class="chip">升档：手动</span>
        <span class="chip chip--level">乘法口诀·2~6 <span class="metric__grade">二上</span></span>
      </div>
    </section>
    <section>
      <div class="section__title">练习重点</div>
      <div class="chips"><span class="chip chip--focus">进退位巩固</span></div>
    </section>
  </div>`
}

/** 新版：折叠态（取消「这次练什么」，信息并入设置摘要；「练习重点」上提） */
function afterPanelCollapsed() {
  return `
  <div class="panel">
    <div class="head"><div class="title">准备开始</div><div class="sub">今天也来练一练吧</div></div>
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
    </section>
    <section class="settings">
      <div class="settings__head">
        ${CARET}
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
    </section>
  </div>`
}

/** 新版：展开态（取消「这次练什么」，信息并入设置区；「练习重点」上提） */
function afterPanelExpanded() {
  return `
  <div class="panel">
    <div class="head"><div class="title">准备开始</div><div class="sub">今天也来练一练吧</div></div>
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
    </section>
    <section class="settings">
      <div class="settings__head">
        ${CARET_OPEN}
        <span class="settings__label">本次练习设置</span>
        <span class="scope">只影响本次练习</span>
      </div>
      <div class="rows">
        <!-- 档位：一行 = 档位 + 升一档 -->
        <div class="row row--level">
          <span class="row__label">档位</span>
          <span class="row__value">Lv.10 乘法口诀·2~6 二上</span>
          <span class="btn btn--success">升一档</span>
          <span class="caretbtn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
        <!-- 出题范围：两个开关并排一行 -->
        <div class="row row--pair">
          <div class="pair">
            <span class="pair__label">挑战题</span>
            <span class="hintbtn">?</span>
            ${SWITCH_OFF}
          </div>
          <div class="pair">
            <span class="pair__label">自动升档</span>
            <span class="hintbtn">?</span>
            ${SWITCH_OFF}
          </div>
        </div>
        <!-- 练习量：下限~上限，一行 -->
        <div class="row">
          <span class="row__label">题量</span>
          <span class="hintbtn">?</span>
          <span class="row__value"></span>
          <span class="num">10</span><span class="row__unit">~</span><span class="num">30</span><span class="row__unit">题</span>
        </div>
        <!-- 每组题量：只读 -->
        <div class="row row--readonly">
          <span class="row__label">每组</span>
          <span class="hintbtn">?</span>
          <span class="row__value">4~10 题</span>
        </div>
      </div>
    </section>
  </div>`
}

/** 桌面版（两列布局的设置区） */
function desktopPanel(expanded) {
  const s = expanded ? afterPanelExpanded() : afterPanelCollapsed()
  return s.replace('<section class="settings">', '<section class="settings" style="max-width:100%">')
}

function page(inner, extraCss = '') {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<style>${TOKENS}${extraCss}</style></head><body>${inner}</body></html>`
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })

async function shoot(html, file, { width, height, deviceScaleFactor = 2 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor })
  const p = await ctx.newPage()
  await p.setContent(html, { waitUntil: 'networkidle' })
  await p.waitForTimeout(250)
  await p.screenshot({ path: `${OUT}/${file}`, fullPage: true })
  await ctx.close()
  console.log('✓', file)
}

/* 1) 现状 · 手机 */
await shoot(page(`
  <div class="frame"><div class="phone">
    <div class="statusbar"><span>9:41</span><span>●●● ⌁ ▮</span></div>
    <div class="viewport">${beforePanel()}</div>
    <div class="sticky"><div class="startbtn">开始练习</div></div>
  </div></div>`), 'before-390.png', { width: 430, height: 900 })

/* 2) 新版 · 手机 · 折叠 */
await shoot(page(`
  <div class="frame"><div class="phone">
    <div class="statusbar"><span>9:41</span><span>●●● ⌁ ▮</span></div>
    <div class="viewport">${afterPanelCollapsed()}</div>
    <div class="sticky"><div class="startbtn">开始练习</div></div>
  </div></div>`), 'after-collapsed-390.png', { width: 430, height: 900 })

/* 3) 新版 · 手机 · 展开 */
await shoot(page(`
  <div class="frame"><div class="phone">
    <div class="statusbar"><span>9:41</span><span>●●● ⌁ ▮</span></div>
    <div class="viewport">${afterPanelExpanded()}</div>
    <div class="sticky"><div class="startbtn">开始练习</div></div>
  </div></div>`), 'after-expanded-390.png', { width: 430, height: 900 })

/* 4) 新版 · 桌面 · 折叠（宽屏分栏：左=学习情况+重点，右=设置） */
const deskCollapsed = afterPanelCollapsed()
  .replace('<section class="settings">', '<section class="settings" style="grid-column:1/-1">')
await shoot(page(`
  <div class="dviewport"><div class="desktop">
    <div style="padding:28px 28px 0">
      <div class="card"><div class="panel split">
        <div>
          <section>
            <div class="section__title">目前学习情况</div>
            <div class="metrics" style="grid-template-columns:1fr">
              <div class="metric"><div class="metric__value">Lv.10</div>
                <div class="metric__label">乘法口诀·2~6 <span class="metric__grade">二上</span></div></div>
              <div class="metric" style="display:flex;justify-content:space-between;align-items:center;text-align:left">
                <div><div class="metric__value" style="font-size:20px">83<span class="metric__unit">%</span></div>
                  <div class="metric__label">上次正确率</div></div>
                <div style="text-align:right"><div class="metric__value" style="font-size:20px">1<span class="metric__unit">天</span></div>
                  <div class="metric__label">连续练习</div></div>
              </div>
            </div>
          </section>
          <section>
            <div class="section__title">练习重点</div>
            <div class="chips"><span class="chip chip--focus">进退位巩固</span></div>
          </section>
        </div>
        ${deskCollapsed.replace(/<section>[\s\S]*?<\/section>\s*<section class="settings"/, '<section class="settings"')}
      </div></div>
    </div>
  </div></div>`), 'after-collapsed-1440.png', { width: 1024, height: 940 })

/* 5) 新版 · 桌面 · 展开（宽屏分栏 + 设置区自动两列） */
const deskExpandedInner = afterPanelExpanded().replace(
  /<div class="rows">([\s\S]*?)<\/div>\s*<\/section>/,
  `<div class="rows wide-rows">
     <div class="row row--level">
       <span class="row__label">档位</span>
       <span class="row__value">Lv.10 乘法口诀·2~6 二上</span>
       <span class="btn btn--success">升一档</span>
       <span class="caretbtn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
     </div>
     <div class="row row--pair rel">
       <div class="pair">
         <span class="pair__label">挑战题</span>
         <span class="hintbtn">?</span>
         <div class="popover" style="left:78px;top:-8px">打开后，这一轮会混入下一档的题（约占 15%）</div>
         ${SWITCH_OFF}
       </div>
       <div class="pair">
         <span class="pair__label">自动升档</span>
         <span class="hintbtn">?</span>
         <div class="popover" style="left:78px;top:-8px">打开后，练够量且正确率达标就自动进下一档</div>
         ${SWITCH_OFF}
       </div>
     </div>
     <div class="row rel">
       <span class="row__label">题量</span>
       <span class="hintbtn">?</span>
       <div class="popover" style="left:56px;top:-8px">这一轮做几题：最少 ~ 最多。答得好会提前结束</div>
       <span class="row__value"></span>
       <span class="num">10</span><span class="row__unit">~</span><span class="num">30</span><span class="row__unit">题</span>
     </div>
     <div class="row row--readonly rel">
       <span class="row__label">每组</span>
       <span class="hintbtn">?</span>
       <div class="popover" style="left:56px;top:-8px">每组出几题，由表现自动调整，不可手动改</div>
       <span class="row__value">4~10 题</span>
     </div>
   </div></section>`
)
const deskExpanded = deskExpandedInner.replace(
  /<section>\s*<div class="section__title">目前学习情况<\/div>[\s\S]*?<\/section>\s*<section>\s*<div class="section__title">练习重点<\/div>[\s\S]*?<\/section>/,
  `<section>
            <div class="section__title">目前学习情况</div>
            <div class="metrics" style="grid-template-columns:1fr">
              <div class="metric"><div class="metric__value">Lv.10</div>
                <div class="metric__label">乘法口诀·2~6 <span class="metric__grade">二上</span></div></div>
              <div class="metric" style="display:flex;justify-content:space-between;align-items:center;text-align:left">
                <div><div class="metric__value" style="font-size:20px">83<span class="metric__unit">%</span></div>
                  <div class="metric__label">上次正确率</div></div>
                <div style="text-align:right"><div class="metric__value" style="font-size:20px">1<span class="metric__unit">天</span></div>
                  <div class="metric__label">连续练习</div></div>
              </div>
            </div>
          </section>
          <section>
            <div class="section__title">练习重点</div>
            <div class="chips"><span class="chip chip--focus">进退位巩固</span></div>
          </section>`
)
await shoot(page(`
  <div class="dviewport"><div class="desktop">
    <div style="padding:28px 28px 0">
      <div class="card"><div class="panel split">
        <div>
          ${deskExpanded.replace(/<section>[\s\S]*?<\/section>\s*<section>\s*<div class="section__title">练习重点<\/div>[\s\S]*?<\/section>\s*(<section class="settings")/, '$1')}
        </div>
        ${deskExpanded.replace(/^[\s\S]*?<section class="settings"/, '<section class="settings"').replace(/<\/section>\s*<\/div>\s*<\/div>/, '</section></div></div>')}
      </div></div>
    </div>
  </div></div>`), 'after-expanded-1440.png', { width: 1024, height: 940 })

/* 5b) 新版 · 手机 · 展开 + 「更多」面板展开 */
const withMore = afterPanelExpanded().replace(
  /(<div class="row row--level">[\s\S]*?<\/div>)/,
  `$1
        <div class="more">
          <div class="more__title">更多档位控制</div>
          <div class="more__row">
            <span class="more__label">起点档位</span>
            <span class="sel" style="min-width:0;flex:1">自动（按练习记录计算）<span class="sel__caret">▾</span></span>
          </div>
          <div class="more__row" style="justify-content:flex-end;gap:8px">
            <span class="btn btn--ghost">恢复自动</span>
            <span class="btn btn--success">应用</span>
          </div>
        </div>`
)
await shoot(page(`
  <div class="frame"><div class="phone">
    <div class="statusbar"><span>9:41</span><span>●●● ⌁ ▮</span></div>
    <div class="viewport">${withMore}</div>
    <div class="sticky"><div class="startbtn">开始练习</div></div>
  </div></div>`), 'after-more-390.png', { width: 430, height: 900 })

/* 5c) 「更多」面板的局部说明图 */
await shoot(page(`
  <div style="padding:30px 24px;background:#f7fbff;min-height:560px">
    <div style="max-width:390px;margin:0 auto">
      <div style="font-size:12px;color:#7f8c9b;margin-bottom:10px">点档位行右侧 ▾ 之后：</div>
      <div class="card" style="padding:14px">
        <div class="row row--level" style="border-bottom:none;padding-bottom:8px">
          <span class="row__label">档位</span>
          <span class="row__value">Lv.10 乘法口诀·2~6 二上</span>
          <span class="btn btn--success">升一档</span>
          <span class="caretbtn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
        </div>
        <div class="more">
          <div class="more__title">更多档位控制</div>
          <div class="more__row">
            <span class="more__label">起点档位</span>
            <span class="sel" style="min-width:0;flex:1">自动（按练习记录计算）<span class="sel__caret">▾</span></span>
          </div>
          <div class="more__row">
            <span class="more__hint" style="flex:1 1 auto">指定后下次开始练习生效，不影响当前这一轮</span>
          </div>
          <div class="more__row" style="justify-content:flex-end;gap:8px">
            <span class="btn btn--ghost">恢复自动</span>
            <span class="btn btn--success">应用</span>
          </div>
        </div>
      </div>
      <div style="font-size:12px;color:#7f8c9b;margin-top:14px;line-height:1.7">
        · 「起点档位」：把练习钉在某一档开始（进度被跳过时用来拉回来）<br>
        · 「恢复自动」：交回系统按答题记录算<br>
        · 「应用」：确认后才生效，作用于下次开始练习
      </div>
    </div>
  </div>`), 'more-panel.png', { width: 480, height: 640, deviceScaleFactor: 2 })

/* 6) 对照页：现状 vs 新版 */
await shoot(page(`
  <div style="padding:26px 20px">
    <div class="legend">
      <h3>准备开始页 · 三处改动</h3>
      <p>
        <span class="tag">1</span><b>去掉重复的档位展示</b>：「这次练什么」chip 行里那个「乘法口诀·2~6 二上」删掉，
        只保留「目前学习情况」里的大号 Lv 卡（带年级徽标）。<br>
        <span class="tag">2</span><b>历史正确率 → 上次正确率</b>：数字从「全部历史平均」改为「最近一轮练习的正确率」，
        没有历史时显示 —。<br>
        <span class="tag">3</span><b>取消「这次练什么」，并入设置摘要</b>：那一行的信息（题量 / 组量 / 只练本档 / 手动升档）
        与「目前学习情况」重复 → 全部并入「本次练习设置」的折叠摘要；<br>
        <span class="tag">4</span><b>「练习重点」上提</b>：放到「目前学习情况」正下方，作为孩子的关注点；
        设置区（可改的控件）统一在页面底部。<br>
        <span class="tag">5</span><b>自适应设置默认折叠</b>：折叠时一行标题 + 一行摘要 chip；
        展开后是紧凑的设置行（档位/挑战题/自动升档/练习量/每组题量），桌面两列、手机单列。
      </p>
    </div>
    <div style="display:flex;gap:22px;justify-content:center;flex-wrap:wrap">
      <div>
        <div style="text-align:center;font-size:13px;color:#7f8c9b;margin-bottom:8px">现状</div>
        <div class="phone" style="width:390px;height:844px">
          <div class="statusbar"><span>9:41</span><span>●●● ⌁ ▮</span></div>
          <div class="viewport">${beforePanel()}</div>
          <div class="sticky"><div class="startbtn">开始练习</div></div>
        </div>
      </div>
      <div>
        <div style="text-align:center;font-size:13px;color:#7f8c9b;margin-bottom:8px">新版（折叠）</div>
        <div class="phone" style="width:390px;height:844px">
          <div class="statusbar"><span>9:41</span><span>●●● ⌁ ▮</span></div>
          <div class="viewport">${afterPanelCollapsed()}</div>
          <div class="sticky"><div class="startbtn">开始练习</div></div>
        </div>
      </div>
      <div>
        <div style="text-align:center;font-size:13px;color:#7f8c9b;margin-bottom:8px">新版（展开）</div>
        <div class="phone" style="width:390px;height:844px">
          <div class="statusbar"><span>9:41</span><span>●●● ⌁ ▮</span></div>
          <div class="viewport">${afterPanelExpanded()}</div>
          <div class="sticky"><div class="startbtn">开始练习</div></div>
        </div>
      </div>
    </div>
  </div>`), 'compare.png', { width: 1420, height: 1000, deviceScaleFactor: 1.6 })

await browser.close()
console.log('\n产出目录：' + OUT)
