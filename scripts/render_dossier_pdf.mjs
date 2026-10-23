import { chromium } from '@playwright/test';
import path from 'path';

const htmlPath = path.resolve('/home/anonymous/medreach/docs/research/medreach-healthcare-access/merged-research-dossier.html');
const pdfPath = path.resolve('/home/anonymous/medreach/docs/research/medreach-healthcare-access/medreach-healthcare-access-dossier.pdf');

console.log(`Starting PDF rendering from ${htmlPath}...`);

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  
  // Navigate to local HTML file
  console.log('Loading HTML file in browser...');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle', timeout: 90000 });

  // Await MathJax completion
  console.log('Waiting for MathJax typesetting...');
  await page.evaluate(async () => {
    if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
      await window.MathJax.startup.promise;
    }
  });

  console.log('MathJax typesetting complete. Rendering PDF...');

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '18mm',
      bottom: '18mm',
      left: '14mm',
      right: '14mm'
    },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size: 7.5pt; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; padding: 0 14mm; box-sizing: border-box;">
        <span>MedReach Healthcare Access Research Dossier</span>
        <span>October 2026</span>
      </div>
    `,
    footerTemplate: `
      <div style="font-size: 7.5pt; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; padding: 0 14mm; box-sizing: border-box;">
        <span>Academic Research Archive &amp; Ledger</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `
  });

  console.log(`PDF successfully generated at: ${pdfPath}`);
  await browser.close();
})().catch(err => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
