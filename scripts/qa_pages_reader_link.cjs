"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage();
  const docs = (file) => pathToFileURL(path.resolve("docs", file)).href;
  await page.goto(docs("index.html"));
  if (!(await page.getByRole("link", { name: /Como instalar/ }).isVisible())) throw new Error("Installation link is missing");
  await page.locator(".site-header .nav-cta").click();
  await page.waitForURL("http://localhost:8000/leitor");
  if (!(await page.locator("#camera-stage").isVisible())) throw new Error("Published home button did not open the reader");

  await page.goto(docs("como-usar.html"));
  await page.locator(".launch-actions .nav-cta").click();
  await page.waitForURL("http://localhost:8000/leitor");
  if (!(await page.locator("#camera-stage").isVisible())) throw new Error("Instructions page button did not open the reader");
  await browser.close();
  console.log("Pages reader buttons open the local reader from both published pages.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
