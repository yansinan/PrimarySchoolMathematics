// 验证 StatsDrawer 数据源修复的 playwright 脚本
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5173';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const t = msg.text();
      if (t.includes('ElementPlusError') || t.includes('custom-class')) return;
      console.log(`[browser ${msg.type()}]`, t.slice(0, 200));
    }
  });

  console.log('--- Step 1: Open page ---');
  await page.goto(`${BASE}/?b1test`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__psm_debug && window.__psm_debug.answerN, { timeout: 10000 });
  console.log('  __psm_debug loaded');

  const before = await page.evaluate(async () => {
    const db = await window.__psm_debug.getDB();
    return { answers: db.answers.length, page: location.pathname + location.search };
  });
  console.log('  Before:', before);

  console.log('--- Step 2: answerN(5, true) for assessment ---');
  // The page is on home (assessment), answer 5 questions
  const r1 = await page.evaluate(async () => await window.__psm_debug.answerN(5, true));
  console.log('  answerN(5):', r1);
  // After 5 questions, may pop up PracticeSummaryDialog (assessment has 5 questions)
  await page.waitForTimeout(1500);

  const afterAssessment = await page.evaluate(async () => {
    const db = await window.__psm_debug.getDB();
    return { answers: db.answers.length, state: window.__psm_debug.state() };
  });
  console.log('  After assessment:', afterAssessment);

  // Check if summary dialog is open
  const hasSummaryDialog = await page.evaluate(() => {
    return !!document.querySelector('.el-dialog__wrapper') &&
           document.body.textContent.includes('练习总结') || document.body.textContent.includes('本轮');
  });
  console.log('  Has summary dialog:', hasSummaryDialog);

  await page.screenshot({ path: '/tmp/v1-after-assessment.png' });

  // Close dialog if present
  await page.evaluate(() => {
    const closeBtns = document.querySelectorAll('.el-dialog__close, .el-dialog__headerbtn');
    if (closeBtns.length) closeBtns[0].click();
  });
  await page.waitForTimeout(500);

  console.log('--- Step 3: answerN(4, true) for adaptive group 1 ---');
  const r2 = await page.evaluate(async () => await window.__psm_debug.answerN(4, true));
  console.log('  answerN(4):', r2);
  await page.waitForTimeout(2000);

  const afterAdaptive1 = await page.evaluate(async () => {
    const db = await window.__psm_debug.getDB();
    return { answers: db.answers.length, state: window.__psm_debug.state() };
  });
  console.log('  After adaptive 1:', afterAdaptive1);

  // SelfEval dialog: pick first emoji
  const hasSelfEval = await page.evaluate(() => {
    return document.body.textContent.includes('表情') ||
           document.body.textContent.includes('感觉') ||
           document.body.textContent.includes('自我评价') ||
           document.body.textContent.includes('你觉得');
  });
  console.log('  Has SelfEval dialog:', hasSelfEval);
  await page.screenshot({ path: '/tmp/v2-selfeval.png' });

  // Click first emoji button if SelfEval is up
  if (hasSelfEval) {
    await page.evaluate(() => {
      // Find emoji buttons
      const emojis = document.querySelectorAll('.emoji-btn, button.emoji, [class*="emoji"]');
      if (emojis.length) {
        emojis[0].click();
      } else {
        // Fallback: click first button in dialog
        const dialog = document.querySelector('.el-dialog__body');
        if (dialog) {
          const btns = dialog.querySelectorAll('button');
          if (btns.length) btns[0].click();
        }
      }
    });
    await page.waitForTimeout(2000);
  }

  console.log('--- Step 4: answerN(4, true) for adaptive group 2 ---');
  const r3 = await page.evaluate(async () => await window.__psm_debug.answerN(4, true));
  console.log('  answerN(4):', r3);
  await page.waitForTimeout(2000);

  // SelfEval 2
  const hasSelfEval2 = await page.evaluate(() => {
    return document.body.textContent.includes('表情') ||
           document.body.textContent.includes('自我评价') ||
           document.body.textContent.includes('你觉得');
  });
  console.log('  Has SelfEval 2:', hasSelfEval2);
  if (hasSelfEval2) {
    await page.evaluate(() => {
      const emojis = document.querySelectorAll('.emoji-btn, button.emoji, [class*="emoji"]');
      if (emojis.length) emojis[0].click();
      else {
        const dialog = document.querySelector('.el-dialog__body');
        if (dialog) {
          const btns = dialog.querySelectorAll('button');
          if (btns.length) btns[0].click();
        }
      }
    });
    await page.waitForTimeout(2000);
  }

  // After 2nd group: should show PracticeSummaryDialog
  const hasSummary2 = await page.evaluate(() => {
    return document.body.textContent.includes('练习总结') ||
           document.body.textContent.includes('本轮') ||
           document.body.textContent.includes('本次练习');
  });
  console.log('  Has summary 2:', hasSummary2);
  await page.screenshot({ path: '/tmp/v3-summary.png' });

  // Click "📊 分析" button to open StatsDrawer
  const analysisBtnFound = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('分析') || b.textContent.includes('📊'));
    if (btn) {
      btn.click();
      return { clicked: true, text: btn.textContent.trim() };
    }
    return { clicked: false, allButtons: btns.map(b => b.textContent.trim()).slice(0, 20) };
  });
  console.log('  Analysis button:', analysisBtnFound);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/v4-stats-drawer.png' });

  // Now read "你掌握得怎么样" section content
  const masterySection = await page.evaluate(() => {
    // Find the section
    const allText = document.body.innerText;
    const idx = allText.indexOf('你掌握得怎么样');
    if (idx === -1) return { found: false, snippet: '' };
    // Get next 800 chars
    const snippet = allText.slice(idx, idx + 1200);
    // Count number-like entries (operands)
    const numbers = snippet.match(/\b\d{1,2}\b/g) || [];
    return {
      found: true,
      snippet,
      numberCount: numbers.length,
      first20: numbers.slice(0, 20)
    };
  });
  console.log('--- Mastery section ---');
  console.log('  Found:', masterySection.found);
  console.log('  Number count:', masterySection.numberCount);
  console.log('  First 20 numbers:', masterySection.first20);
  console.log('  Snippet:', masterySection.snippet?.slice(0, 600));

  // Check stats store state
  const statsStoreState = await page.evaluate(() => {
    // Try to find Pinia
    const apps = document.querySelectorAll('[data-v-app]');
    return { hasApp: apps.length > 0 };
  });
  console.log('  Pinia app present:', statsStoreState.hasApp);

  // Also try the debug API to get stats store data
  const statsData = await page.evaluate(async () => {
    // Try to access via window.__psm_debug or pinia
    const root = document.querySelector('#app')?.__vue_app__;
    if (!root) return { noApp: true };
    const pinia = root.config.globalProperties.$pinia;
    if (!pinia) return { noPinia: true };
    const stores = {};
    pinia._s.forEach((store, key) => {
      stores[key] = {
        allAnswersLen: store.allAnswers?.length,
        allAnswersSample: store.allAnswers?.slice(-2).map(a => ({ eq: a.equation, ok: a.isCorrect })),
        overallAccuracy: store.overallAccuracyPercent,
        aggregatedStats: store.aggregatedStats
      };
    });
    return stores;
  });
  console.log('  Pinia stores:');
  console.log(JSON.stringify(statsData, null, 2).slice(0, 2500));

  await browser.close();
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
