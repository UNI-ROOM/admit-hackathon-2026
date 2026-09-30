import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const artifacts = new URL('../test-artifacts/', import.meta.url);
const cards = [
    ['01 / LIVE', 'Раскрытая ладонь', 'Пальцы и запястье повторяют движение руки.', '2d-robot-hands-open.png', '-770px -340px', '#ffcb85'],
    ['02 / GRIP', 'Точный захват', 'Световое кольцо отмечает точку щипка.', '2d-robot-hand-grip.png', '-275px -325px', '#ffdf9f'],
    ['03 / ECHO', 'Рука из прошлого', 'Запись сохраняет движения всех пальцев.', '2d-robot-hands-echo.png', '-495px -365px', '#b9a1ee']
];
let content = '';
for (const [label, title, caption, filename, position, color] of cards) {
    const data = (await readFile(new URL(filename, artifacts))).toString('base64');
    content += `<article style="--accent:${color}"><header><span>${label}</span><h2>${title}</h2></header><div class="frame" style="background-image:url(data:image/png;base64,${data});background-position:${position}"></div><p>${caption}</p></article>`;
}
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Роботизированные руки в 2D</title><style>
*{box-sizing:border-box}body{margin:0;background:#201928;color:#f7ecdd;font-family:Arial,sans-serif}.sheet{width:1360px;padding:46px 40px 30px;background:radial-gradient(ellipse at 25% 0,#493247,transparent 65%)}.eyebrow{font-size:12px;letter-spacing:3px;color:#c2aacd;margin-bottom:14px}h1{font-size:40px;letter-spacing:-1.2px;margin:0 0 12px;font-weight:700}.intro{font-size:17px;color:#d1bdcc;margin:0 0 31px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}article{border:1px solid #67526d80;border-radius:20px;background:#2e2435;overflow:hidden}header{padding:23px 23px 19px}header span{font-size:11px;letter-spacing:2px;color:var(--accent);font-weight:700}h2{margin:10px 0 0;font-size:23px;letter-spacing:-.3px}.frame{height:405px;background-size:1440px 900px;background-repeat:no-repeat;background-color:#000}article p{font-size:14px;color:#dccbd8;line-height:1.6;margin:0;padding:18px 23px 23px;min-height:85px}.footer{display:flex;justify-content:space-between;align-items:center;padding-top:24px;font-size:12px;line-height:1.6;color:#aa96b0}.footer strong{color:#decce4;font-weight:400}
</style><div class="sheet"><div class="eyebrow">ECHO / ROBOT HANDS</div><h1>Роботизированные руки в 2D</h1><p class="intro">Та же объёмная модель: светлые звенья, тёмные суставы и цветные кончики пальцев.</p><div class="grid">${content}</div><div class="footer"><strong>21 сустав · независимое движение пальцев · запись Эхо</strong><span>Кадры из работающей игры.<br>Позы воспроизведены тестовыми координатами камеры.</span></div></div></html>`;
await writeFile(new URL('2d-robot-hands-preview.html', artifacts), html);
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 950 }, deviceScaleFactor: 1.5 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.locator('.sheet').screenshot({ path: fileURLToPath(new URL('2d-robot-hands-preview.png', artifacts)) });
} finally { await browser.close(); }
