import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const font = async (name: string, file: string) => (await readFile(new URL(`../node_modules/@fontsource-variable/${name}/files/${file}`, import.meta.url))).toString('base64');
const petrona = await font('petrona', 'petrona-latin-wght-normal.woff2');
const bricolage = await font('bricolage-grotesque', 'bricolage-grotesque-latin-standard-normal.woff2');
const logo = (await readFile(new URL('../public/images/query-farm.svg', import.meta.url))).toString('base64');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const ticks = Array.from({ length: 60 }, (_, i) => `<line x1="150" y1="15" x2="150" y2="${i % 5 === 0 ? 31 : 22}" transform="rotate(${i * 6} 150 150)" stroke="${i % 5 === 0 ? '#dfb55e' : '#696758'}" stroke-width="${i % 5 === 0 ? 2 : 1}"/>`).join('');
  await page.setContent(`<!doctype html><html><head><style>
    @font-face{font-family:Petrona;src:url(data:font/woff2;base64,${petrona});font-weight:100 900}
    @font-face{font-family:Bricolage;src:url(data:font/woff2;base64,${bricolage});font-weight:100 900}
    *{box-sizing:border-box}body{margin:0;background:#f7f3ea;color:#29251f;font-family:Bricolage}
    .rule{height:6px;background:linear-gradient(90deg,#f0c877 25%,#d9a441 25% 50%,#a9762e 50% 75%,#7a5230 75%)}
    main{padding:46px 62px}.brand{display:flex;align-items:center;gap:13px;font:700 32px Petrona}.brand img{width:37px;height:37px}.top{display:flex;justify-content:space-between;align-items:center;padding-bottom:29px;border-bottom:1px solid #d6cdbd}.top span{font-size:17px;color:#71695d}
    .body{display:flex;gap:45px;align-items:center;justify-content:space-between;margin-top:36px}h1{font:500 80px/.99 Petrona;letter-spacing:-4px;margin:0 0 25px}h1 span{color:#80622f}.eyebrow{font-size:17px;font-weight:600;margin-bottom:22px}p{font-size:17px;line-height:1.8;color:#71695d;margin:0}.dial{background:#24241f;padding:25px;border-radius:9px;width:346px;box-shadow:0 3px 0 #161711}.dial svg{width:296px;height:296px}.dial p{text-align:center;font-size:14px;color:#bbb39f;margin-top:8px}.base{font-size:15px;color:#71695d;margin-top:37px;border-top:1px solid #d6cdbd;padding-top:21px}
    </style></head><body><div class="rule"></div><main><div class="top"><div class="brand"><img src="data:image/svg+xml;base64,${logo}">Query.Farm</div><span>DuckDB Release Watch</span></div><div class="body"><div><div class="eyebrow">Releases & long-term support</div><h1>Keeping time<br>with <span>DuckDB.</span></h1><p>A community clock for the next chapter.</p></div><div class="dial"><svg viewBox="0 0 300 300">${ticks}<circle cx="150" cy="150" r="108" fill="none" stroke="#4c4c40"/><text x="150" y="174" text-anchor="middle" fill="#e6b959" font-family="Bricolage" font-size="77" letter-spacing="-6">2.0</text><path d="M150 32v20" stroke="#e6b959" stroke-width="2"/><circle cx="150" cy="55" r="3" fill="#e6b959"/></svg><p>Good software is worth the wait.</p></div></div><div class="base">duckdb-release-clock.query.farm</div></main></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL('../public/social.png', import.meta.url).pathname });
  console.log('Created public/social.png (1200 × 630).');
} finally {
  await browser.close();
}
