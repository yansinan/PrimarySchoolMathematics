/**
 * 题目多时的进度条方案对比（390 手机 + 1280 桌面）
 *   A 省略号窗口：1 … 4 5 6 … 30
 *   B 细条 + 当前题号：第 6 / 30 题  + 彩色进度条
 *   C 分段格子：固定 10 格
 *
 * 用法：node scripts/mockups/mockup-progress.mjs
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('/tmp/pw-playwright/')
const { chromium } = require('/tmp/pw-playwright')

const OUT = '/home/dr/workspace/PrimarySchoolMathematics/designDocs/mockups/progress'
mkdirSync(OUT, { recursive: true })

const T = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#eef4fb;font-family:"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.page{padding:20px 18px 30px;background:linear-gradient(180deg,#f7fbff 0%,#eef6ff 100%)}
.legend{background:#fff;border-radius:14px;padding:13px 16px;box-shadow:0 8px 24px rgba(23,110,191,.08);margin-bottom:16px}
.legend h3{font-size:13px;color:#1e3c5c;margin-bottom:5px}
.legend p{font-size:11.5px;line-height:1.75;color:#5b6b7a}
.legend b{color:#1e3c5c}
.card{background:#fff;border-radius:16px;box-shadow:0 10px 28px rgba(23,110,191,.10);padding:14px 16px}
.head{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 11px;font-weight:600;font-size:12px;
 line-height:1;border:1px solid #dbe7f4;color:#1e3c5c;background:#e9f4ff}
.badge--group{color:#176ebf;background:#e3f1ff;border-color:#cfe6fb}
.tag{font-size:11px;color:#7f8c9b;margin-bottom:6px}

/* 现状：逐题 steps（会溢出） */
.steps{display:flex;gap:6px;overflow:hidden;white-space:nowrap}
.step{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:42px;flex:0 0 auto}
.step__num{width:18px;height:18px;border-radius:50%;border:1.5px solid #dbe7f4;display:flex;align-items:center;
 justify-content:center;font-size:10px;color:#9aa7b4;background:#fff}
.step__num--done{background:#58cc71;border-color:#58cc71;color:#fff}
.step__num--cur{border-color:#1cb0f6;color:#1cb0f6;box-shadow:0 0 0 3px rgba(28,176,246,.18)}
.step__t{font-size:10px;color:#9aa7b4}

/* A 省略号窗口 */
.win{display:flex;align-items:center;gap:5px;flex-wrap:nowrap;overflow:hidden}
.win__n{min-width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;
 font-size:12px;color:#7f8c9b;background:#f2f6fa}
.win__n--done{background:#e5f7ea;color:#2f9e5c}
.win__n--wrong{background:#fdeaea;color:#e05252}
.win__n--cur{background:#1cb0f6;color:#fff;font-weight:700;box-shadow:0 2px 8px rgba(28,176,246,.35)}
.win__ell{color:#b6c2cf;font-size:12px;padding:0 2px}

/* B 细条 */
.bar-wrap{display:flex;align-items:center;gap:10px}
.bar{flex:1 1 auto;height:10px;border-radius:5px;background:#eef3f8;overflow:hidden;display:flex}
.bar__ok{background:#58cc71;height:100%}
.bar__bad{background:#ff8a8a;height:100%}
.bar-text{font-size:12.5px;color:#5b6b7a;font-variant-numeric:tabular-nums;white-space:nowrap}
.bar-text b{color:#176ebf;font-size:14px}

/* C 分段格 */
.seg{display:flex;gap:4px}
.seg__c{flex:1 1 0;height:10px;border-radius:3px;background:#eef3f8}
.seg__c--ok{background:#58cc71}
.seg__c--part{background:#ffc46b}
.seg__c--bad{background:#ff8a8a}
.stats{margin-top:10px;font-size:12.5px;color:#8794a2}
.stats b{color:#2f9e5c}
`

const page = (inner) => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>${T}</style></head><body>${inner}</body></html>`
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
async function shoot(html, file, { width, height, dsf = 2 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf })
  const p = await ctx.newPage()
  await p.setContent(html, { waitUntil: 'networkidle' })
  await p.waitForTimeout(120)
  await p.screenshot({ path: `${OUT}/${file}`, fullPage: true })
  await ctx.close()
  console.log('✓', file)
}

/* 现状：30 题逐题 steps（超出卡片） */
const stepsHtml = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1
  const cls = n < 6 ? 'step__num step__num--done' : n === 6 ? 'step__num step__num--cur' : 'step__num'
  return `<div class="step"><div class="${cls}">${n < 6 ? '✓' : n}</div><div class="step__t">第${n}题</div></div>`
}).join('')

/* A：省略号窗口（当前 6，窗口 ±1，两端各留 1） */
const winHtml = `
  <div class="win">
    <div class="win__n win__n--done">1</div>
    <span class="win__ell">…</span>
    <div class="win__n win__n--done">4</div>
    <div class="win__n win__n--done">5</div>
    <div class="win__n win__n--cur">6</div>
    <div class="win__n">7</div>
    <span class="win__ell">…</span>
    <div class="win__n">30</div>
  </div>`

/* B：细条（前 5 对 1 错） */
const barHtml = `
  <div class="bar-wrap">
    <div class="bar">
      ${Array.from({ length: 30 }, (_, i) => i < 4 ? '<span class="bar__ok" style="flex:1"></span>'
        : i === 4 ? '<span class="bar__bad" style="flex:1"></span>'
        : i === 5 ? '<span style="flex:1"></span>' : '<span style="flex:1"></span>').join('')}
    </div>
    <span class="bar-text"><b>6</b> / 30</span>
  </div>`

/* C：10 段 */
const segHtml = `
  <div class="seg">
    ${Array.from({ length: 10 }, (_, i) => `<div class="seg__c ${i === 0 ? 'seg__c--ok' : i === 1 ? 'seg__c--part' : ''}"></div>`).join('')}
  </div>`

const inner = (body) => `
  <div class="head"><span class="badge">一年级</span><span class="badge badge--group">第 2/3 组</span></div>
  ${body}
  <div class="stats">✅ 5 / 30</div>`

/* ── 手机 390 ── */
await shoot(page(`
  <div class="page" style="max-width:410px;margin:0 auto">
    <div class="legend">
      <h3>题目多时的进度展示 · 三种方案（390 宽度，以「30 题，已答 6 题」为例）</h3>
      <p>现状是逐题 steps，题一多就<b>横向溢出卡片</b>。下面三种都能收进固定宽度。</p>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="tag" style="color:#ff4b4b">现状：30 个逐题步骤 → 溢出</div>
      ${inner(`<div class="steps">${stepsHtml}</div>`)}
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="tag">A · 省略号窗口（保留题号语义，窗口 ±1，两端各留一个）</div>
      ${inner(winHtml)}
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="tag">B · 细条 + 「6 / 30」（对错用颜色，长度无关）</div>
      ${inner(barHtml)}
    </div>

    <div class="card">
      <div class="tag">C · 10 段格子（每段 3 题，按段着色）</div>
      ${inner(segHtml)}
    </div>
  </div>`), 'progress-390.png', { width: 430, height: 900 })

/* ── 桌面 1280 ── */
await shoot(page(`
  <div class="page" style="max-width:900px;margin:0 auto">
    <div class="legend">
      <h3>桌面 1280 · 同样三种</h3>
      <p>桌面卡片更宽，但 30 题逐题 steps 一样会挤；B 在两档宽度下表现最稳。</p>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="tag" style="color:#ff4b4b">现状</div>
      ${inner(`<div class="steps">${stepsHtml}</div>`)}
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="tag">A · 省略号窗口</div>
      ${inner(winHtml)}
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="tag">B · 细条 + 6 / 30</div>
      ${inner(barHtml)}
    </div>
    <div class="card">
      <div class="tag">C · 10 段格子</div>
      ${inner(segHtml)}
    </div>
  </div>`), 'progress-1280.png', { width: 1180, height: 700 })

await browser.close()
console.log('\n产出目录：' + OUT)
