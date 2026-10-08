"use strict";

const fs = require("node:fs");
const { chromium } = require("playwright");
const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:8000";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  if (!(await page.locator("#quiz-availability").textContent()).includes("24 perguntas")) throw new Error("Question bank is incomplete");
  fs.mkdirSync("artifacts", { recursive: true });
  await page.locator("#quiz").scrollIntoViewIfNeeded();
  await page.waitForTimeout(750);
  await page.locator("#quiz").screenshot({ path: "artifacts/quiz-desktop.png" });
  await page.locator("#quiz-start").click();
  const initialQuestion = await page.locator("#quiz-question").textContent();
  let expectedScore = 0;
  for (let index = 0; index < 5; index += 1) {
    if (!(await page.locator("#quiz-step").textContent()).includes(`Pergunta ${index + 1} de 5`)) throw new Error("Question counter is incorrect");
    const first = page.locator("#quiz-options button").first();
    await first.click();
    if (await first.evaluate((button) => button.classList.contains("correct"))) expectedScore += 10;
    if (!(await page.locator("#quiz-feedback").isVisible())) throw new Error("Answer explanation did not appear");
    await page.locator("#quiz-next").click();
  }
  if (!(await page.locator("#quiz-result").isVisible())) throw new Error("Final result did not appear");
  if (Number(await page.locator("#quiz-final-score").textContent()) !== expectedScore) throw new Error("Points were counted incorrectly");
  const starts = new Set([initialQuestion]);
  await page.locator("#quiz-retry").click();
  starts.add(await page.locator("#quiz-question").textContent());
  for (let attempt = 0; starts.size === 1 && attempt < 4; attempt += 1) {
    await page.locator("#quiz-change").click();
    await page.locator("#quiz-start").click();
    starts.add(await page.locator("#quiz-question").textContent());
  }
  if (starts.size === 1) throw new Error("Questions did not change after starting new rounds");

  await page.locator("#quiz-change").click();
  await page.locator("#quiz-topic").selectOption("etica");
  await page.locator("#quiz-level").selectOption("avancado");
  await page.locator("#quiz-length").selectOption("20");
  if (!(await page.locator("#quiz-availability").textContent()).includes("2 perguntas disponíveis")) throw new Error("Topic and difficulty filters did not update the count");
  await page.locator("#quiz-start").click();
  for (let index = 0; index < 2; index += 1) {
    const tag = await page.locator("#quiz-question-tag").textContent();
    if (!tag.includes("Ética e decisões") || !tag.includes("Desafio")) throw new Error("Question ignored the selected theme or difficulty");
    await page.locator("#quiz-options button").first().click();
    await page.locator("#quiz-next").click();
  }
  if (!(await page.locator("#quiz-result").isVisible())) throw new Error("Filtered round did not finish");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#quiz-new-topic").click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (overflow > 1) throw new Error(`Quiz has ${overflow}px of mobile horizontal overflow`);
  await page.locator("#quiz").screenshot({ path: "artifacts/quiz-mobile.png" });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Quiz passed: 24-question bank, score, explanations, random rounds, filters, and mobile layout.");
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
