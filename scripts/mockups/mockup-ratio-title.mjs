/**
 * 下一轮改版设计图（方案对比）
 *   A  档位配比搬进「本次练习设置」（展开态内第二层，限高滚动）
 *   B1 卷子标题/副标题 → 抽屉底部独立「生成卷子」区块
 *   B2 卷子标题/副标题 → 点「生成卷子」时弹小对话框
 *
 * 用法：node scripts/mockup-ratio-title.mjs
 * 产物：designDocs/mockups/ratio-title/
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('/tmp/pw-playwright/')
const { chromium } = require('/tmp/pw-playwright')

const OUT = '/home/dr/workspace/PrimarySchoolMathematics/designDocs/mockups/ratio-title'
mkdirSync(OUT, { recursive: true })

const T = `
:root{--primary:#1cb0f6;--accent:#176ebf;--success:#58cc71;--ink:#1e3c5c;--muted:#8794a2;--line:#dbe7f4}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#eef4fb;font-family:"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.page{padding:24px 22px 34px;background:linear-gradient(180deg,#f7fbff 0%,#eef6ff 100%)}
.legend{background:#fff;border-radius:14px;padding:14px 18px;box-shadow:0 8px 24px rgba(23,110,191,.08);margin-bottom:18px}
.legend h3{font-size:13.5px;color:#1e3c5c;margin-bottom:6px}
.legend p{font-size:12px;line-height:1.8;color:#5b6b7a}
.legend b{color:#1e3c5c}
.legend .ok{color:#2f9e5c}
.card{background:rgba(255,255,255,.92);border-radius:24px;box-shadow:0 12px 32px rgba(23,110,191,.08);padding:24px 26px}
.panel{display:flex;flex-direction:column;gap:18px}
.head{text-align:center}
.title{font-size:24px;font-weight:700;color:#1e3c5c}
.sub{margin-top:4px;font-size:13px;color:#9aa7b4}
.section__title{font-size:13px;font-weight:600;color:#7f8c9b;margin-bottom:8px}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.metric{padding:12px 8px;border-radius:14px;background:linear-gradient(135deg,#f4f9ff,#eef5fd);text-align:center}
.metric__value{font-size:20px;font-weight:700;color:#176ebf;font-variant-numeric:tabular-nums}
.metric__unit{font-size:12px;font-weight:600}
.metric__label{margin-top:3px;font-size:11.5px;color:#8794a2}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{padding:6px 12px;border-radius:999px;font-size:12.5px;font-weight:600;color:#4a5a68;background:#f2f5f8}
.chip--focus{color:#d9822b;background:rgba(217,130,43,.12)}
.settings{border-top:1px solid #dbe7f4;padding-top:12px}
.settings__head{display:flex;align-items:center;gap:10px}
.caret{width:14px;height:14px;color:#9aa7b4}
.caret--open{transform:rotate(90deg)}
.settings__label{font-size:14px;font-weight:600;color:#1e3c5c}
.scope{font-size:11px;color:#7f8c9b;background:#eef3f8;border-radius:6px;padding:2px 7px}
.rows{margin-top:8px;display:flex;flex-direction:column}
.row{display:flex;align-items:center;gap:8px;min-height:44px;padding:6px 0;border-bottom:1px solid #eef3f8}
.row:last-child{border-bottom:none}
.row__label{font-size:14px;font-weight:500;color:#1e3c5c}
.row__value{font-size:13px;color:#5b6b7a}
.row__muted{color:#9aa7b4;font-size:13px}
.row__unit{font-size:13px;color:#8794a2}
.spacer{flex:1 1 auto}
.pair{flex:1 1 0;display:flex;align-items:center;gap:8px}
.hint{width:24px;height:24px;border-radius:50%;background:#dbe7f4;color:#7f8c9b;font-size:11px;
 display:inline-flex;align-items:center;justify-content:center;flex:0 0 24px}
.btn{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 12px;border-radius:9px;
 font-size:13px;font-weight:600;border:1px solid transparent;white-space:nowrap}
.btn--success{background:#58cc71;color:#fff}
.btn--ghost{background:#f2f5f8;color:#5b6b7a;border-color:#e3e9ef}
.btn--primary{background:#1cb0f6;color:#fff}
.btn--link{background:none;color:#1cb0f6;font-weight:600;border:none}
.num{width:72px;height:34px;border:1px solid #dcdfe6;border-radius:8px;background:#fff;display:flex;
 align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#1e3c5c}
.sw{width:44px;height:24px;border-radius:12px;background:#dcdfe6;position:relative;flex:0 0 44px}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.18)}
.startbtn{width:100%;height:52px;border-radius:16px;background:#1cb0f6;color:#fff;font-size:17px;font-weight:600;
 letter-spacing:.08em;display:flex;align-items:center;justify-content:center}

/* ── 档位配比（第二层折叠 + 限高滚动）── */
.ratio{margin:6px 0 4px;border:1px solid #e6eef6;border-radius:12px;background:#f8fbff;overflow:hidden}
.ratio__head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f2f8ff;border-bottom:1px solid #e6eef6}
.ratio__title{font-size:13px;font-weight:600;color:#1e3c5c}
.ratio__tag{font-size:11px;color:#b7791f;background:#fff7e6;border:1px solid #ffe1a8;border-radius:6px;padding:1px 6px}
.ratio__body{max-height:260px;overflow-y:auto;padding:8px 12px 10px}
.ratio__group{font-size:11.5px;color:#7f8c9b;font-weight:600;margin:6px 0 4px}
.ratio__line{display:flex;align-items:center;gap:8px;height:34px}
.ratio__idx{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;
 background:#eef3f8;color:#7f8c9b;font-size:11px;margin-right:6px}
.ratio__name{font-size:13px;color:#5b6b7a;flex:1 1 auto;min-width:0}
.ratio__input{width:64px;height:28px;border:1px solid #dcdfe6;border-radius:7px;background:#fff;display:flex;
 align-items:center;justify-content:center;font-size:13px;color:#1e3c5c;font-variant-numeric:tabular-nums}
.ratio__foot{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-top:1px solid #e6eef6;background:#fbfdff}
.ratio__hint{font-size:11px;color:#9aa7b4}
.scrollbar{position:absolute;right:6px;top:44px;bottom:40px;width:4px;border-radius:2px;background:#e3ecf6}
.scrollbar::after{content:"";position:absolute;left:0;top:10px;width:4px;height:60px;border-radius:2px;background:#c3d5e8}

/* ── 抽屉示意 ── */
.drawer{background:#fff;border-radius:16px;box-shadow:0 16px 40px rgba(23,110,191,.16);overflow:hidden}
.drawer__head{padding:14px 18px;border-bottom:1px solid #eef3f8;font-size:15px;font-weight:600;color:#1e3c5c;
 display:flex;justify-content:space-between;align-items:center}
.drawer__body{padding:12px 18px;font-size:13px;color:#3f4d5a;line-height:2}
.drawer__group{border:1px dashed #dbe7f4;border-radius:10px;padding:10px 12px;margin:10px 0;background:#fbfdff}
.drawer__group-title{font-size:12px;font-weight:600;color:#176ebf;margin-bottom:8px}
.fieldlabel{font-size:12.5px;color:#7f8c9b;margin-bottom:4px}
.field{height:34px;border:1px solid #dcdfe6;border-radius:8px;display:flex;align-items:center;padding:0 10px;color:#8794a2;font-size:13px;background:#fff}

/* ── 对话框 ── */
.dialog{background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(23,110,191,.22);overflow:hidden;width:420px}
.dialog__head{padding:16px 20px 6px;font-size:16px;font-weight:600;color:#1e3c5c}
.dialog__body{padding:8px 20px 4px}
.dialog__foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px 18px}
.backdrop{position:absolute;inset:0;background:rgba(30,60,92,.35);border-radius:16px}
`

const SW = '<div class="sw"></div>'

function page(inner, extra = '') {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>${T}${extra}</style></head><body>${inner}</body></html>`
}

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

const LEVELS = [
  ['二上', ['数数与比大小', '20 以内加减', '进退位入门', '进退位巩固', '100 以内加减']],
  ['二下', ['表内乘法·2~6', '表内乘法·7~9', '表内除法·2~6', '表内除法·7~9']],
  ['三上', ['万以内加减', '两位数×一位数', '三位数×一位数', '两位数×两位数']],
  ['三下', ['两三位数÷一位数', '三位数÷两位数']],
]

const ratioRows = (custom = {}) => LEVELS.map(([grade, names]) => `
  <div class="ratio__group">${grade}</div>
  ${names.map((n, i) => `
    <div class="ratio__line">
      <span class="ratio__name"><span class="ratio__idx">${custom[n] ? custom[n].idx : ''}</span>${n}</span>
      <span class="ratio__input">${custom[n] ? custom[n].v : '1.0'}</span>
    </div>`).join('')}
`).join('')

/* ── A：档位配比搬进本次练习设置 ── */
await shoot(page(`
  <div class="page" style="max-width:640px;margin:0 auto">
    <div class="legend">
      <h3>方案 A · 档位配比搬进「本次练习设置」</h3>
      <p>设置区展开后多一行 <b>档位配比</b>，点开是第二层，24 档<b>限高 260px 内部滚动</b>，
        不把整页撑长；<b>设置区收起时完全不显示</b>（折叠摘要里也不放）。<br>
        行内摘要：<b>已自定义 N 档</b> / <b>全部按默认</b>，看一眼就知道有没有改过。</p>
    </div>
    <div class="card"><div class="panel">
      <div class="head"><div class="title">准备开始</div><div class="sub">今天也来练一练吧</div></div>
      <section>
        <div class="section__title">目前学习情况</div>
        <div class="metrics">
          <div class="metric"><div class="metric__value">Lv.10</div><div class="metric__label">乘法口诀·2~6</div></div>
          <div class="metric"><div class="metric__value">83<span class="metric__unit">%</span></div><div class="metric__label">上次正确率</div></div>
          <div class="metric"><div class="metric__value">1<span class="metric__unit">天</span></div><div class="metric__label">连续练习</div></div>
        </div>
      </section>
      <section class="settings">
        <div class="settings__head">
          <svg class="caret caret--open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          <span class="settings__label">本次练习设置</span><span class="scope">只影响本次练习</span>
        </div>
        <div class="rows">
          <div class="row"><span class="row__label">档位</span><span class="row__value">Lv.10</span>
            <span class="spacer"></span>
            <span class="btn btn--ghost">降一档</span><span class="btn btn--success">升一档</span><span class="btn btn--ghost">▾</span></div>
          <div class="row"><div class="pair"><span class="row__label">挑战题</span><span class="hint">?</span>${SW}</div>
            <div class="pair"><span class="row__label">自动升档</span><span class="hint">?</span>${SW}</div></div>
          <div class="row"><span class="row__label">题量</span><span class="hint">?</span><span class="spacer"></span>
            <span class="num">10</span><span class="row__unit">~</span><span class="num">30</span><span class="row__unit">题</span></div>
          <div class="row"><span class="row__label">每组</span><span class="hint">?</span><span class="spacer"></span>
            <span class="row__muted">4~10 题</span></div>

          <div class="row" style="align-items:flex-start;flex-direction:column;gap:6px">
            <div style="display:flex;align-items:center;gap:8px;width:100%">
              <span class="row__label">档位配比</span>
              <span class="ratio__tag">3 档已自定义</span>
              <span class="spacer"></span>
              <span class="btn btn--link">收起</span>
            </div>
            <div class="ratio" style="width:100%;position:relative">
              <div class="ratio__head">
                <span class="ratio__title">各档出现比例</span>
                <span class="spacer"></span>
                <span class="row__muted" style="font-size:11.5px">0 = 不出 · &gt;1 = 提高占比</span>
              </div>
              <div class="ratio__body">
                ${ratioRows({ '进退位入门': { idx: 3, v: '0.0' }, '进退位巩固': { idx: 4, v: '2.0' }, '表内乘法·2~6': { idx: 6, v: '1.5' } })}
              </div>
              <div class="ratio__foot">
                <span class="ratio__hint">只影响各档出现比例，不改难度判定</span>
                <span class="btn btn--link" style="color:#ff4b4b">恢复默认</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div class="startbtn">开始练习</div>
    </div></div>
  </div>`), 'A-ratio-in-settings-390.png', { width: 430, height: 1100 })

/* ── A2：收起态（不显示配比） ── */
await shoot(page(`
  <div class="page" style="max-width:640px;margin:0 auto">
    <div class="legend">
      <h3>方案 A · 收起态</h3>
      <p>设置区收起时，<b>档位配比整块不出现</b>，折叠摘要里也只有 5 个基础 chip，
        页面高度和现在一致。</p>
    </div>
    <div class="card"><div class="panel">
      <div class="head"><div class="title">准备开始</div><div class="sub">今天也来练一练吧</div></div>
      <section>
        <div class="section__title">目前学习情况</div>
        <div class="metrics">
          <div class="metric"><div class="metric__value">Lv.10</div><div class="metric__label">乘法口诀·2~6</div></div>
          <div class="metric"><div class="metric__value">83<span class="metric__unit">%</span></div><div class="metric__label">上次正确率</div></div>
          <div class="metric"><div class="metric__value">1<span class="metric__unit">天</span></div><div class="metric__label">连续练习</div></div>
        </div>
      </section>
      <section class="settings">
        <div class="settings__head">
          <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          <span class="settings__label">本次练习设置</span><span class="scope">只影响本次练习</span>
        </div>
        <div class="chips" style="margin-top:10px">
          <span class="chip" style="font-size:12px;font-weight:500;color:#5b6b7a;background:#eef3f8;padding:4px 10px">Lv.10 乘法口诀·2~6</span>
          <span class="chip" style="font-size:12px;font-weight:500;color:#5b6b7a;background:#eef3f8;padding:4px 10px">10~30 题</span>
          <span class="chip" style="font-size:12px;font-weight:500;color:#5b6b7a;background:#eef3f8;padding:4px 10px">每组 4~10 题</span>
          <span class="chip" style="font-size:12px;font-weight:500;color:#5b6b7a;background:#eef3f8;padding:4px 10px">只练本档</span>
          <span class="chip" style="font-size:12px;font-weight:500;color:#5b6b7a;background:#eef3f8;padding:4px 10px">手动升档</span>
        </div>
      </section>
      <div class="startbtn">开始练习</div>
    </div></div>
  </div>`), 'A-ratio-collapsed-390.png', { width: 430, height: 760 })

/* ── B1：抽屉底部「生成卷子」区块 ── */
await shoot(page(`
  <div class="page" style="max-width:760px;margin:0 auto">
    <div class="legend">
      <h3>方案 B1 · 抽屉底部独立「生成卷子」区块</h3>
      <p>卷子标题 / 副标题放进一个虚线框住的<b>生成卷子</b>区块（和上面的共用配置视觉分开），
        区块里直接给「生成卷子」按钮。抽屉其余部分 = 自定义练习与卷子<b>共用</b>的配置。</p>
    </div>
    <div class="drawer">
      <div class="drawer__head"><span>其他设置</span><span style="color:#909399">×</span></div>
      <div class="drawer__body">
        <div>题型设置 · 启用括号 ( ) · 加法设置 · 减法设置 · 解法方式</div>
        <div>卷子数量 · 每行列数 · 文件名规则</div>
        <div class="drawer__group">
          <div class="drawer__group-title">生成卷子（仅卷子需要）</div>
          <div class="fieldlabel">卷子标题</div>
          <div class="field">口算练习</div>
          <div class="fieldlabel" style="margin-top:8px">副标题</div>
          <div class="field">2026-11-26 · 二年级上</div>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:12px">
            <span class="btn btn--primary">生成卷子</span>
          </div>
        </div>
      </div>
    </div>
  </div>`), 'B1-paper-block-in-drawer.png', { width: 800, height: 640 })

/* ── B2：点「生成卷子」弹对话框 ── */
await shoot(page(`
  <div class="page" style="max-width:760px;margin:0 auto">
    <div class="legend">
      <h3>方案 B2 · 点「生成卷子」时弹小对话框（推荐）</h3>
      <p>抽屉里<b>完全不放</b>卷子专属项 —— 抽屉 = 自定义练习与卷子<b>共用配置</b>，没有歧义。
        点「生成卷子」才出现标题/副标题（带默认值，直接点「生成」也行），
        生成完记住上次填写的值。</p>
    </div>
    <div style="position:relative;border-radius:16px;overflow:hidden">
      <div class="drawer" style="min-height:420px">
        <div class="drawer__head"><span>其他设置</span><span style="color:#909399">×</span></div>
        <div class="drawer__body">
          <div>题型设置 · 启用括号 ( )</div>
          <div>加法设置 · 减法设置 · 解法方式</div>
          <div>卷子数量 · 每行列数 · 文件名规则</div>
          <div style="margin-top:14px;color:#9aa7b4;font-size:12px">（这里不再出现「卷子标题 / 副标题 / 档位配比 / 练习档位」）</div>
        </div>
      </div>
      <div class="backdrop"></div>
      <div class="dialog" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)">
        <div class="dialog__head">生成卷子</div>
        <div class="dialog__body">
          <div class="fieldlabel">卷子标题</div>
          <div class="field">口算练习</div>
          <div class="fieldlabel" style="margin-top:10px">副标题</div>
          <div class="field">2026-11-26 · 二年级上</div>
          <div class="fieldlabel" style="margin-top:10px">卷子数量 / 每行列数</div>
          <div style="display:flex;gap:8px">
            <div class="field" style="width:88px">2</div>
            <div class="field" style="width:88px">3</div>
          </div>
        </div>
        <div class="dialog__foot">
          <span class="btn btn--ghost">取消</span>
          <span class="btn btn--primary">生成卷子</span>
        </div>
      </div>
    </div>
  </div>`), 'B2-paper-dialog-on-generate.png', { width: 800, height: 700 })

await browser.close()
console.log('\n产出目录：' + OUT)
