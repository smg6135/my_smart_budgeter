// Rasterize our code-authored leaf mark for native app icons. Run from the repo root.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const { chromium } = require('playwright');
const leaf = '<path d="M701 282C463 240 304 344 331 505c21 124 150 171 259 120 80-38 130-142 111-343Z" fill="#D7EE9B"/><path d="M365 393c22 123 131 216 290 279" fill="none" stroke="#233C32" stroke-width="28" stroke-linecap="round"/><path d="m565 566 74-6" stroke="#233C32" stroke-width="22" stroke-linecap="round"/>';
function svg(background=true){return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background?'<rect width="1024" height="1024" fill="#233C32"/>':''}${leaf}</svg>`;}
await writeFile('apps/mobile/assets/pocket-mark.svg',svg());
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});
await page.setContent(`<style>html,body{margin:0;overflow:hidden}</style>${svg()}`);
await page.screenshot({path:'apps/mobile/assets/icon.png'});
await page.setViewportSize({width:64,height:64});
await page.setContent(`<style>html,body{margin:0}svg{width:64px;height:64px}</style>${svg()}`);
await page.screenshot({path:'apps/mobile/assets/favicon.png'});
await browser.close();
