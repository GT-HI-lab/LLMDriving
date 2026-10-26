const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BUZZ_TEST_BROWSER || 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1500 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.BUZZ_TEST_URL || 'http://127.0.0.1:8765');
    await page.locator('#prepareButton').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#prepareButton').disabled);
    await page.locator('#participantId').fill('UI_PREVIEW');
    await page.locator('#prepareButton').click();
    await page.locator('#participantInstructionView').waitFor({ state: 'visible' });
    assert.match(await page.locator('#participantInstructionHeading').innerText(), /North Pole/);
    const notice = await page.locator('.recording-notice').evaluate(el => {
      const timing = document.querySelectorAll('#participantInstructionBody .instruction-timing')[1];
      return { size: getComputedStyle(el).fontSize, timingSize: getComputedStyle(timing).fontSize,
        x: el.getBoundingClientRect().x, tx: timing.getBoundingClientRect().x,
        y: el.getBoundingClientRect().top, ty: timing.getBoundingClientRect().bottom };
    });
    assert.equal(notice.size, notice.timingSize);
    assert.equal(notice.x, notice.tx);
    assert.ok(notice.y >= notice.ty);
    await page.locator('#backButton').click();
    await page.locator('#researcherPin').fill('1111');
    await page.locator('#researcherPinForm button[type=submit]').click();
    assert.equal(await page.locator('#researcherPinError').innerText(), 'Incorrect PIN. Please try again.');
    assert.equal(await page.locator('#researcherView').isVisible(), false);
    await page.locator('#researcherPinCancel').click();
    assert.equal(await page.locator('#participantInstructionView').isVisible(), true);
    await page.locator('#backButton').click();
    await page.locator('#researcherPin').fill('7890');
    await page.locator('#researcherPinForm button[type=submit]').click();
    await page.locator('#researcherView').waitFor({ state: 'visible' });
    // Render the live view with synthetic playback events: no microphone/API call.
    await page.locator('#prepareButton').click();
    await page.evaluate(() => {
      clearPreparationTimer();
      showView(conversationView);
      hideParticipantStatus();
      setConversationState('listening');
    });
    assert.equal(await page.locator('#stopButton').isVisible(), false);
    const order = await page.evaluate(() => ['conversationHeading', 'voiceOrb', 'voiceState', 'conversationInstruction'].map(id => document.getElementById(id).getBoundingClientRect().top));
    assert.ok(order.every((y, i) => !i || y > order[i-1]));
    await page.evaluate(() => handleRealtimeEvent({type:'input_audio_buffer.speech_started',item_id:'preview-u'}));
    assert.equal(await page.locator('#voiceState').innerText(), 'Buzz is listening');
    await page.evaluate(() => handleRealtimeEvent({type:'input_audio_buffer.speech_stopped',item_id:'preview-u'}));
    assert.equal(await page.locator('#voiceState').innerText(), 'Buzz is thinking');
    await page.evaluate(() => {
      pendingTranscriptionItemIds.clear();
      handleRealtimeEvent({type:'output_audio_buffer.started',response_id:'preview-a'});
    });
    assert.equal(await page.locator('#voiceState').innerText(), 'Buzz is speaking');
    await page.screenshot({ path: path.resolve('tests/ui-conversation-desktop.png'), fullPage: true });
    await page.evaluate(() => handleRealtimeEvent({type:'output_audio_buffer.stopped',response_id:'preview-a'}));
    assert.equal(await page.locator('#voiceState').innerText(), 'Buzz is listening');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.resolve('tests/ui-conversation-mobile.png'), fullPage: true });
    await page.evaluate(() => {
      conversationInstruction.hidden = true;
      showParticipantStatus('Conversation complete. Please return the device to the researcher.');
      returnButton.hidden = false;
    });
    await page.locator('#returnButton').click();
    assert.equal(await page.locator('#researcherPinDialog').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#conversationView').isVisible(), true);
    await page.locator('#returnButton').click();
    await page.locator('#researcherPin').fill('7890');
    await page.locator('#researcherPinForm button[type=submit]').click();
    await page.locator('#researcherView').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    console.log('UI checks passed: task card, recording notice, PIN gates, live states, responsive layout.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
