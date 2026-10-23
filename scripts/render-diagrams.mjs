import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { primaryFigures } from "./diagram-figures.mjs";

const DIAGRAMS_DIR = path.resolve("docs/diagrams");

async function main() {
  console.log("Rendering curated architecture figures (offline)...");
  const files = await fs.readdir(DIAGRAMS_DIR);
  const primaryNames = new Set(primaryFigures().map(figure => figure.id));
  const mmdFiles = files.filter((f) => f.endsWith(".mmd") && !primaryNames.has(path.basename(f, ".mmd")));

  if (mmdFiles.length === 0) {
    console.log("No .mmd files found.");
    return;
  }

  const channel = process.env.MEDREACH_PLAYWRIGHT_CHANNEL || "chrome";
  const browser = await chromium.launch({ headless: true, channel });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
  });

  for (const figure of primaryFigures()) {
    await page.setViewportSize({ width: figure.width, height: figure.height });
    await page.setContent(`<html><head><style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style></head><body>${figure.svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => [...document.querySelectorAll("text")].flatMap(node => {
      const box=node.getBBox(), limit=Number(node.dataset.maxWidth);
      return box.width > limit + 1 || box.x < 0 || box.x + box.width > 1600 ? [{text:node.textContent,width:box.width,limit}] : [];
    }));
    if (overflow.length) throw new Error(`Text overflow in ${figure.id}: ${JSON.stringify(overflow)}`);
    const svgPath=path.join(DIAGRAMS_DIR,`${figure.id}.svg`);
    const pngPath=path.join(DIAGRAMS_DIR,`${figure.id}.png`);
    if (process.argv.includes("--check")) {
      if (await fs.readFile(svgPath,"utf8") !== figure.svg) throw new Error(`Stale SVG: ${figure.id}`);
      const png=await fs.readFile(pngPath);
      if (png.readUInt32BE(16)!==figure.width*2 || png.readUInt32BE(20)!==figure.height*2) throw new Error(`Wrong PNG dimensions: ${figure.id}`);
    } else {
      await fs.writeFile(svgPath,figure.svg);
      await page.locator("svg").screenshot({path:pngPath});
    }
    console.log(`  ✓ ${figure.id}: ${figure.width}×${figure.height}, text fits, SVG + 2× PNG`);
  }
  if (!process.argv.includes("--workflows")) {
    await browser.close();
    return;
  }
  console.log("Rendering optional workflow Mermaid sources (requires network)...");

  // Base HTML with Mermaid
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
        <style>
          body {
            margin: 0;
            padding: 40px;
            background: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          #container {
            display: inline-block;
            background: #ffffff;
            padding: 20px;
            border-radius: 8px;
          }
        </style>
      </head>
      <body>
        <div id="container"></div>
        <script>
          mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'strict',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          });
        </script>
      </body>
    </html>
  `);

  for (const file of mmdFiles) {
    const baseName = path.basename(file, ".mmd");
    const mmdPath = path.join(DIAGRAMS_DIR, file);
    const svgPath = path.join(DIAGRAMS_DIR, `${baseName}.svg`);
    const pngPath = path.join(DIAGRAMS_DIR, `${baseName}.png`);

    console.log(`Processing: ${file}...`);
    const content = await fs.readFile(mmdPath, "utf-8");

    try {
      const renderResult = await page.evaluate(async (source) => {
        const id = "mermaid-" + Math.random().toString(36).slice(2);
        const { svg } = await window.mermaid.render(id, source);
        const container = document.getElementById("container");
        container.innerHTML = svg;
        const svgEl = container.querySelector("svg");
        return {
          svg,
          width: svgEl ? svgEl.getBoundingClientRect().width : 1200,
          height: svgEl ? svgEl.getBoundingClientRect().height : 800,
        };
      }, content);

      // Save SVG
      await fs.writeFile(svgPath, renderResult.svg, "utf-8");

      // Adjust viewport to fit container and capture PNG
      const containerHandle = await page.$("#container");
      if (containerHandle) {
        await containerHandle.screenshot({ path: pngPath });
      }

      console.log(`  ✓ Rendered ${baseName}.svg and ${baseName}.png`);
    } catch (err) {
      console.error(`  ✗ Failed rendering ${file}:`, err.message);
      process.exitCode = 1;
    }
  }

  await browser.close();
  console.log("Diagram rendering complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
