const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__spoken = [];
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, 640, 360);
        context.fillStyle = '#111';
        context.font = '32px sans-serif';
        context.fillText('Uma frase que deve aparecer', 25, 170);
        return canvas.captureStream(5);
      },
    });
    Object.defineProperty(window.speechSynthesis, 'getVoices', {value: () => []});
    Object.defineProperty(window.speechSynthesis, 'cancel', {value: () => {}});
    Object.defineProperty(window.speechSynthesis, 'speak', {
      value: utterance => {
        window.__spoken.push(utterance.text);
        setTimeout(() => utterance.onstart?.(), 0);
        setTimeout(() => utterance.onend?.(), 150);
      },
    });
  });
  let calls = 0;
  await page.route('**/api/recognize', async route => {
    calls++;
    const text = calls === 2 ? '' : 'Uma frase que deve aparecer';
    await route.fulfill({json: {text, regions: [], width: 640, height: 360, elapsed_ms: 30, warnings: []}});
  });
  await page.goto('http://127.0.0.1:8000/leitor', {waitUntil: 'domcontentloaded'});
  await page.locator('#speech-output').selectOption('browser');
  await page.locator('#camera-toggle').click();
  await page.waitForFunction(() => document.getElementById('transcript').value === 'Uma frase que deve aparecer', {timeout: 15000});
  await page.waitForFunction(() => window.__spoken.length > 0, {timeout: 15000});
  await page.waitForFunction(() => document.getElementById('message').textContent.includes('Mantendo a última frase'), {timeout: 15000});
  if (await page.locator('#transcript').inputValue() !== 'Uma frase que deve aparecer') throw new Error('Brief OCR loss erased the transcript');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Automatic camera flow passed: ${calls} OCR responses, transcript shown, speech requested, brief loss retained.`);
  await browser.close();
})().catch(error => {console.error(error); process.exitCode = 1;});
