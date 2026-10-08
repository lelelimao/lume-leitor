const {chromium} = require('playwright');
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:8000';

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  const errors = [];
  for (const size of [{name: 'desktop', width: 1440, height: 900}, {name: 'mobile', width: 390, height: 844}]) {
    const page = await browser.newPage({viewport: {width: size.width, height: size.height}, deviceScaleFactor: 1});
    page.on('pageerror', error => errors.push(`${size.name}: ${error.message}`));
    await page.goto(`${baseUrl}/`, {waitUntil: 'networkidle'});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error(`${size.name} has ${overflow}px of horizontal overflow`);
    const height = await page.locator('body').evaluate(element => element.scrollHeight);
    for (let y = 0; y < height; y += size.height * .75) {
      await page.evaluate(scrollY => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path: `artifacts/home-${size.name}-qa.png`, fullPage: true});
    await page.getByRole('tab', {name: /Desafios e riscos/}).click();
    if (!(await page.locator('#panel-riscos').isVisible())) throw new Error('Risk tab did not open');
    await page.getByRole('link', {name: /Abrir leitor/}).first().click();
    await page.waitForURL('**/leitor');
    if (!(await page.locator('#camera-stage').isVisible())) throw new Error('Reader missing');
    await page.screenshot({path: `artifacts/reader-${size.name}-qa.png`, fullPage: true});
    await page.getByRole('link', {name: 'Conhecer o projeto'}).click();
    await page.waitForURL('**/?v=home');
    if (!(await page.getByRole('heading', {name: /Os limites das máquinas/}).isVisible())) throw new Error('Home link did not return to the project');
    await page.close();
  }
  await browser.close();
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Desktop and mobile UI smoke checks passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});
