import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 },
];

await fs.mkdir('qa-screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true });
let failures = 0;

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const response = await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 30000 });
  if (!response?.ok()) {
    console.error(`FAIL ${viewport.name}: page status ${response?.status()}`);
    failures++;
    continue;
  }

  const audit = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.getBoundingClientRect();
    const cta = document.querySelector('.header-cta')?.getBoundingClientRect();
    const stage = document.querySelector('.product-stage')?.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      h1: h1 ? { width: h1.width, height: h1.height, top: h1.top } : null,
      cta: cta ? { width: cta.width, height: cta.height } : null,
      stage: stage ? { left: stage.left, right: stage.right, width: stage.width } : null,
      title: document.querySelector('h1')?.textContent || '',
      hasProducts: Boolean(document.querySelector('#products')),
      hasAdvertisers: Boolean(document.querySelector('#advertisers')),
      hasVenues: Boolean(document.querySelector('#venues')),
      hasCampaigns: Boolean(document.querySelector('#campaigns')),
      hasImpact: Boolean(document.querySelector('#impact')),
      hasContact: Boolean(document.querySelector('#contact')),
    };
  });

  const fail = message => { console.error(`FAIL ${viewport.name}: ${message}`); failures++; };
  const pass = message => console.log(`PASS ${viewport.name}: ${message}`);

  audit.scrollWidth > audit.clientWidth + 2 ? fail('horizontal overflow') : pass('no horizontal overflow');
  !audit.h1 || audit.h1.width < 100 || audit.h1.height < 40 ? fail('hero headline missing/collapsed') : pass('hero headline renders');
  !audit.cta || audit.cta.width < 90 || audit.cta.height < 40 ? fail('header CTA too small') : pass('header CTA usable');
  !audit.stage || audit.stage.left < -3 || audit.stage.right > viewport.width + 3 ? fail('product stage clips') : pass('product stage contained');
  !audit.title.includes('Real venues') || !audit.title.includes('Measurable results') ? fail('core headline copy missing') : pass('core headline copy present');
  !audit.hasProducts || !audit.hasAdvertisers || !audit.hasVenues || !audit.hasCampaigns || !audit.hasImpact || !audit.hasContact ? fail('core section missing') : pass('core sections present');
  consoleErrors.length ? fail(`console errors: ${consoleErrors.join(' | ')}`) : pass('no console errors');

  await page.screenshot({ path: `qa-screenshots/${viewport.name}.png`, fullPage: true });
  await page.close();
}

await browser.close();
if (failures) process.exit(1);
console.log('Elevation Media responsive QA passed.');
