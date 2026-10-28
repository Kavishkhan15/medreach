// Rehearse and record the real Bootstrap UI without creating requests or sessions.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const phase = process.argv.find(arg => arg.startsWith('--phase='))?.split('=')[1] || 'rehearse';
if (!['discover', 'rehearse', 'record'].includes(phase)) throw new Error('Use --phase=discover, rehearse or record');
const base = process.env.DEMO_BASE_URL || 'http://localhost:3015';
const api = process.env.DEMO_API_URL || 'http://localhost:4000';
const out = path.resolve(process.env.DEMO_OUTPUT_DIR || 'output/demo-refresh-20261028');
await fs.mkdir(out, { recursive: true });
const listResponse = await fetch(`${api}/api/hospitals?limit=50`);
if (!listResponse.ok) throw new Error('Public hospital directory is unavailable');
const list = await listResponse.json();
const hospital = list.data?.find(row => row.name.includes('Lilavati')) || list.data?.find(row => row.slug);
if (!hospital?._id || !hospital.slug) throw new Error('A recorded hospital with a stable ID and slug is required');
const detailResponse = await fetch(`${api}/api/hospitals/${encodeURIComponent(hospital.slug)}`);
if (!detailResponse.ok) throw new Error('Public hospital details are unavailable');
const detail = await detailResponse.json();
await fs.writeFile(path.join(out, 'public-source-snapshot.json'), JSON.stringify({ capturedAt: new Date().toISOString(), list, detail }, null, 2));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const results = [];

async function ready(locator, label) {
  await locator.waitFor({ state: 'visible' });
  console.log(`${phase.toUpperCase()} OK: ${label}`);
  return locator;
}
async function overlay(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="#1469cd" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    cursor.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;width:25px;height:25px;left:16px;top:16px;filter:drop-shadow(0 2px 3px rgba(17,30,64,.2))';
    document.body.append(cursor);
    document.addEventListener('mousemove', event => { cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`; });
    const subtitle = document.createElement('div');
    subtitle.id = 'demo-subtitle';
    subtitle.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:999998;text-align:center;padding:10px 16px;border-radius:12px;background:#111e40;color:white;font-family:Arial,sans-serif;font-size:16px;line-height:1.45;pointer-events:none;max-width:660px;margin:auto';
    document.body.append(subtitle);
  });
}
async function subtitle(page, value) {
  await page.locator('#demo-subtitle').evaluate((node, text) => { node.textContent = text; }, value);
}
async function click(page, locator, label) {
  await ready(locator, label);
  await locator.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await page.waitForTimeout(650);
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No geometry for ${label}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 });
  await page.waitForTimeout(200);
  await locator.click();
}

try {
  for (const [name, size] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 720 }]]) {
    const context = await browser.newContext({ viewport: size, reducedMotion: 'reduce',
      ...(phase === 'record' ? { recordVideo: { dir: path.join(out, `raw-${name}`), size } } : {}) });
    let mutations = 0;
    await context.route(url => url.pathname.startsWith('/api/') || url.pathname.startsWith('/health'), route => {
      const url = new URL(route.request().url());
      if (route.request().method() !== 'GET') {
        // Auth refresh is denied locally as well; no POST reaches an API.
        if (!url.pathname.startsWith('/api/auth/')) mutations++;
        return route.fulfill({ status: 401, json: { error: 'Read-only website demonstration' } });
      }
      if (url.pathname === '/api/hospitals') return route.fulfill({ json: list });
      if (url.pathname === `/api/hospitals/${hospital.slug}`) return route.fulfill({ json: detail });
      if (url.pathname.endsWith('/enriched')) return route.fulfill({ json: { enriched: null } });
      if (url.pathname.startsWith('/api/auth/')) return route.fulfill({ status: 401, json: { error: 'Sign in required' } });
      if (url.pathname.startsWith('/health')) return route.fulfill({ json: { ok: true, db: 'connected' } });
      return route.fulfill({ json: { data: [], total: 0 } });
    });
    const created = performance.now();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/hospitals`, { waitUntil: 'domcontentloaded' });
    const search = await ready(page.getByRole('textbox', { name: 'Search hospitals', exact: true }), `${name} directory search`);
    await ready(page.getByRole('heading', { name: hospital.name, exact: true }), `${name} recorded hospital`);
    await page.evaluate(() => document.fonts.ready);
    const startOffset = (performance.now() - created) / 1000;
    const started = performance.now();
    if (phase === 'record') await overlay(page);
    if (phase === 'record') await subtitle(page, 'Find a hospital and review its recorded details');
    if (phase === 'record') await page.waitForTimeout(2000);
    await click(page, search, 'Search hospitals');
    await search.pressSequentially(hospital.name.split(' ')[0], { delay: phase === 'record' ? 85 : 1 });
    await ready(page.locator('.hospital-card').filter({ hasText: hospital.name }).getByRole('link', { name: 'Details', exact: true }), 'Filtered hospital details link');
    if (phase === 'discover') {
      await fs.writeFile(path.join(out, `fields-directory-${name}.json`), JSON.stringify(await page.locator('input,select,button').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().width).map(n => ({ tag: n.tagName, id: n.id, text: n.textContent?.trim().slice(0, 80), type: n.type }))), null, 2));
    }
    if (phase === 'record') await page.waitForTimeout(1800);
    await click(page, page.locator('.hospital-card').filter({ hasText: hospital.name }).getByRole('link', { name: 'Details', exact: true }), 'Open hospital details');
    await page.waitForURL(`**/hospitals/${hospital.slug}`);
    await ready(page.getByRole('heading', { name: hospital.name, exact: true }), 'Hospital detail heading');
    if (phase === 'record') { await overlay(page); await subtitle(page, 'Review provider information before requesting care'); await page.waitForTimeout(2300); }
    await click(page, page.getByRole('link', { name: 'Request Bed', exact: true }), 'Open standard bed request');
    await page.waitForURL('**/requests/new?**');
    const select = await ready(page.locator('#hospital'), 'Target hospital selector');
    await page.waitForFunction(id => document.querySelector('#hospital')?.value === id, String(hospital._id));
    const facility = await ready(page.locator('#facility'), 'Facility selector');
    const options = await facility.locator('option').evaluateAll(nodes => nodes.map(n => ({ value: n.value, text: n.textContent })));
    const icu = options.find(option => option.value === 'ICU');
    if (!icu) throw new Error('ICU is not an available request type');
    if (phase === 'discover') await fs.writeFile(path.join(out, `fields-request-${name}.json`), JSON.stringify(await page.locator('input,select,textarea,button').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().width).map(n => ({ tag: n.tagName, id: n.id, type: n.type, text: n.textContent?.trim().slice(0, 100), options: n.tagName === 'SELECT' ? [...n.options].map(o => ({ value: o.value, text: o.text })) : undefined }))), null, 2));
    if (phase === 'record') { await overlay(page); await subtitle(page, 'Choose a care request — hospital confirmation is required'); await page.waitForTimeout(2300); }
    await click(page, facility, 'Review facility type');
    await facility.selectOption(icu.value);
    await page.keyboard.press('Escape');
    if (phase === 'record') { await subtitle(page, 'Preview only · no request submitted and no bed reserved'); await page.waitForTimeout(3200); }
    await page.screenshot({ path: path.join(out, `${phase}-${name}-final.png`) });
    if (mutations || errors.length) throw new Error(JSON.stringify({ mutations, errors }));
    const duration = (performance.now() - started) / 1000;
    const video = page.video();
    await context.close();
    const raw = video ? await video.path() : null;
    results.push({ name, size, hospital: hospital.name, selectedHospital: String(hospital._id), facility: icu.value, startOffset, duration, raw, mutations, errors });
  }
  await fs.writeFile(path.join(out, `${phase}.json`), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
