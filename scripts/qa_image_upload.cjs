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
  await page.route("**/api/status", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.gemini = { configured: true, model: "gemini-3.5-flash-lite" };
    await route.fulfill({ json: data });
  });
  const geminiModes = [];
  await page.route("**/api/recognize", async (route) => {
    const body = route.request().postData() || "";
    const mode = body.includes("gemini_research") ? "gemini_research" : body.includes("gemini") ? "gemini" : "unexpected";
    geminiModes.push(mode);
    if (mode === "unexpected") throw new Error("A Gemini action submitted the wrong mode");
    await route.fulfill({ status: 200, json: {
      text: mode === "gemini_research" ? "Objeto principal: robô\n\nUm robô é uma máquina programável." : "Texto na imagem: Olá\n\nObjetos identificados: robô, livro",
      spoken_text: mode === "gemini_research" ? "Objeto identificado: robô. Um robô é uma máquina programável." : "Olá. Objetos identificados: robô, livro",
      objects: ["robô", "livro"], primary_object: "robô", transcription: "",
      regions: [{ text: "robô", box: [10, 10, 100, 100] }], width: 200, height: 200,
      sources: mode === "gemini_research" ? [{ title: "Wikipédia: Robô", url: "https://pt.wikipedia.org/wiki/Rob%C3%B4" }] : [],
      elapsed_ms: 900, warnings: [],
    } });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#gemini-connection-state").textContent.includes("Conectado"));
  if (!(await page.locator("#frame-info").textContent()).includes("30 MB")) throw new Error("Larger photo limit is not shown");
  await page.locator("#speech-output").selectOption("browser");
  const fileChooser = page.waitForEvent("filechooser");
  await page.locator("#gemini-research-button").click();
  await (await fileChooser).setFiles(path.resolve("examples/teste-leitura.png"));
  await page.waitForFunction(() => document.querySelector("#transcript").value.includes("máquina programável"), null, { timeout: 10000 });
  await page.waitForFunction(() => window.__spoken.some((text) => text.includes("Objeto identificado: robô")), null, { timeout: 10000 });
  if (!(await page.locator("#object-result").textContent()).includes("Objeto principal: robô")) throw new Error("Main object is not shown");
  if (await page.locator("#research-source-list a").count() !== 1) throw new Error("Research source is not shown");
  if (await page.locator("#auto-read").isEnabled()) throw new Error("Automatic camera scanning must be paused in Gemini mode");
  await page.locator("#gemini-read-button").click();
  await page.waitForFunction(() => document.querySelector("#transcript").value.includes("Objetos identificados: robô, livro"), null, { timeout: 10000 });
  if (!(await page.locator("#research-sources").isHidden())) throw new Error("Old research sources remained on the new result");
  if (geminiModes.join(",") !== "gemini_research,gemini") throw new Error("Both Gemini actions must use their own modes");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Image upload passed: OCR, speech, retry, fallback, Gemini action buttons, and 30 MB limit.");
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
