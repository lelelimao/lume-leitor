"use strict";

const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__spoken = [];
    Object.defineProperty(window.speechSynthesis, "getVoices", { value: () => [] });
    Object.defineProperty(window.speechSynthesis, "cancel", { value: () => {} });
    Object.defineProperty(window.speechSynthesis, "speak", {
      value: (utterance) => {
        window.__spoken.push(utterance.text);
        setTimeout(() => utterance.onstart?.(), 0);
        setTimeout(() => utterance.onend?.(), 150);
      },
    });
  });

  await page.goto("http://127.0.0.1:8000/leitor", { waitUntil: "domcontentloaded" });
  await page.locator("#speech-output").selectOption("browser");
  await page.locator("#image-upload").setInputFiles(path.resolve("examples/teste-leitura.png"));
  await page.waitForFunction(() => document.querySelector("#transcript").value.includes("LEITURA EM TEMPO REAL"), null, { timeout: 30000 });
  await page.waitForFunction(() => window.__spoken.length > 0, null, { timeout: 10000 });

  await page.locator("#clear-text").click();
  let busyResponses = 0;
  await page.route("**/api/recognize", async (route) => {
    if (busyResponses++ < 2) await route.fulfill({ status: 429, json: { detail: "Uma imagem já está sendo processada." } });
    else await route.continue();
  });
  await page.locator("#image-upload").setInputFiles(path.resolve("examples/teste-leitura.png"));
  await page.waitForFunction(() => document.querySelector("#image-status").textContent.includes("Aguardando a leitura anterior"), null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector("#transcript").value.includes("LEITURA EM TEMPO REAL"), null, { timeout: 30000 });
  if (busyResponses < 3) throw new Error("The image request did not retry after HTTP 429");

  await page.unrouteAll();
  await page.locator("#clear-text").click();
  let yoloFailed = false;
  let plainOcrRequested = false;
  await page.route("**/api/recognize", async (route) => {
    const body = route.request().postData() || "";
    if (body.includes("yolo_ocr") && !yoloFailed) {
      yoloFailed = true;
      await route.fulfill({ status: 503, json: { detail: "YOLO indisponível" } });
    } else {
      plainOcrRequested ||= body.includes('name="mode"') && body.includes("ocr");
      await route.continue();
    }
  });
  await page.locator("#image-upload").setInputFiles(path.resolve("examples/teste-leitura.png"));
  await page.waitForFunction(() => document.querySelector("#transcript").value.includes("LEITURA EM TEMPO REAL"), null, { timeout: 30000 });
  if (!yoloFailed || !plainOcrRequested) throw new Error("YOLO failure did not fall back to plain OCR");
  await page.unrouteAll();
  await page.locator("#recognition-mode").selectOption("gemini_research");
  await page.route("**/api/recognize", async (route) => {
    const body = route.request().postData() || "";
    if (!body.includes("gemini_research")) throw new Error("Gemini research mode was not submitted");
    await route.fulfill({ status: 200, json: {
      text: "Objeto principal: robô\n\nUm robô é uma máquina programável.",
      spoken_text: "Objeto identificado: robô. Um robô é uma máquina programável.",
      objects: ["robô", "livro"], primary_object: "robô", transcription: "",
      regions: [{ text: "robô", box: [10, 10, 100, 100] }], width: 200, height: 200,
      sources: [{ title: "Wikipédia: Robô", url: "https://pt.wikipedia.org/wiki/Rob%C3%B4" }],
      elapsed_ms: 900, warnings: [],
    } });
  });
  await page.locator("#image-upload").setInputFiles(path.resolve("examples/teste-leitura.png"));
  await page.waitForFunction(() => document.querySelector("#transcript").value.includes("máquina programável"), null, { timeout: 10000 });
  await page.waitForFunction(() => window.__spoken.some((text) => text.includes("Objeto identificado: robô")), null, { timeout: 10000 });
  if (!(await page.locator("#object-result").textContent()).includes("Objeto principal: robô")) throw new Error("Main object is not shown");
  if (await page.locator("#research-source-list a").count() !== 1) throw new Error("Research source is not shown");
  if (await page.locator("#auto-read").isEnabled()) throw new Error("Automatic camera scanning must be paused in Gemini mode");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Image upload passed: OCR, automatic speech, busy retry, YOLO fallback, and Gemini research display.");
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
