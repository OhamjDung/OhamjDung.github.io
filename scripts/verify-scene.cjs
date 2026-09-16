const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Hi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/Hi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const room = process.env.ROOM_URL || 'http://127.0.0.1:8080/?dev';
const desktop = process.env.DESKTOP_URL || 'http://127.0.0.1:5173/';
fs.mkdirSync('qa', { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chromium' });
    try {
        for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
            const context = await browser.newContext({ viewport, hasTouch: name === 'mobile', isMobile: name === 'mobile' });
            const page = await context.newPage();
            page.setDefaultTimeout(90000);
            const errors = [];
            const startup = [];
            page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
            page.on('console', message => { if (message.type() === 'error' && /THREE|shader|WebGL/i.test(message.text())) { errors.push(message.text()); console.error(message.text()); } });
            page.on('request', request => { if (request.url().includes('/startup/')) startup.push(request.url()); });
            await context.route('**/www.googletagmanager.com/**', route => route.abort());

            await page.goto(desktop, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.desktop[data-started="false"]');
            await page.waitForTimeout(900);
            assert.equal(await page.locator('video').count(), 0, 'No automatic intro');
            const black = await page.screenshot({ path: `qa/${name}-blank.png` });
            const blackStats = await sharp(black).stats();
            assert(blackStats.channels.slice(0, 3).every(channel => channel.max === 0), 'Initial desktop is pure black');
            await page.mouse.move(8, viewport.height / 2);
            for (const section of ['about', 'projects', 'contact']) {
                await page.mouse.wheel(0, 140);
                await page.waitForSelector(`.desktop[data-section="${section}"]`);
                await page.waitForTimeout(750);
            }
            await page.screenshot({ path: `qa/${name}-contact.png` });
            await page.locator('[data-task="about"]').click();
            await page.locator('#window-about .paper').hover();
            await page.mouse.wheel(0, 500);
            await page.waitForTimeout(800);
            assert.equal(await page.locator('.desktop').getAttribute('data-section'), 'about', 'Window scrolling must not advance story');

            await page.goto(room, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => {
                const button = document.querySelector('.bios-start-button');
                return button && getComputedStyle(button.parentElement.parentElement.parentElement).opacity === '1';
            });
            await page.waitForTimeout(600);
            await page.screenshot({ path: `qa/${name}-start.png` });
            if (name === 'desktop') await page.mouse.click(20, 100);
            else await page.mouse.wheel(0, 120);
            await page.waitForFunction(() => document.body.dataset.camera === 'idle');
            await page.screenshot({ path: `qa/${name}-wide.png` });
            const canvas = page.locator('#webgl canvas');
            const pixels = await canvas.screenshot();
            const stats = await sharp(pixels).stats();
            assert(stats.channels.slice(0, 3).some(channel => channel.stdev > 12), 'Scene canvas is not blank');
            await page.waitForTimeout(500);
            assert(!pixels.equals(await canvas.screenshot()), 'Scene animates');
            await page.mouse.move(viewport.width / 2, viewport.height / 2);
            await page.mouse.wheel(0, 160);
            await page.waitForFunction(() => document.body.dataset.camera === 'desk');
            await page.screenshot({ path: `qa/${name}-desk.png` });
            await page.getByRole('button', { name: 'Pet cat' }).click();
            assert.equal(await page.locator('body').getAttribute('data-camera'), 'desk', 'Petting does not change camera');
            assert.equal(await page.getByRole('button', { name: 'Pet cat' }).getAttribute('data-petting'), 'true');
            await page.screenshot({ path: `qa/${name}-pet.png` });
            const haze = page.getByRole('slider', { name: 'Haze' });
            await haze.fill('85');
            await page.waitForFunction(() => document.body.dataset.haze === '85');
            assert.equal(await page.locator('body').getAttribute('data-camera'), 'desk', 'Slider does not zoom');
            await page.screenshot({ path: `qa/${name}-haze.png` });
            await haze.fill('45');
            await page.mouse.move(viewport.width / 2, viewport.height / 2);
            await page.mouse.wheel(0, 160);
            await page.waitForFunction(() => document.body.dataset.camera === 'monitor');
            const frame = page.frameLocator('#computer-screen');
            assert.equal(await frame.locator('.desktop').getAttribute('data-started'), 'false');
            await page.screenshot({ path: `qa/${name}-monitor-black.png` });
            await frame.locator('.desktop').hover({ position: { x: 240, y: 300 } });
            await page.mouse.wheel(0, 140);
            await frame.locator('.desktop[data-section="about"]').waitFor();
            await frame.locator('#window-about[data-visible="true"]').waitFor();
            await page.waitForTimeout(1200);
            assert(await frame.locator('#window-about').evaluate(element => Number(getComputedStyle(element).opacity) > 0.98), 'About window has opened');
            await page.screenshot({ path: `qa/${name}-monitor-about.png` });
            assert.deepEqual(startup, [], 'Original startup audio is not requested');
            assert.deepEqual(errors, [], 'No runtime or WebGL errors');
            console.log(`${name}: black start, story scroll, content scroll isolation, click/wheel Start, two zoom stages, animated canvas, petting, haze and embedded desktop passed`);
            if (name === 'mobile') {
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.waitForFunction(() => {
                    const button = document.querySelector('.bios-start-button');
                    return button && getComputedStyle(button.parentElement.parentElement.parentElement).opacity === '1';
                });
                const cdp = await context.newCDPSession(page);
                const swipe = async () => {
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 620 }] });
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 480 }] });
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                };
                await swipe();
                await page.waitForFunction(() => document.body.dataset.camera === 'idle');
                await swipe();
                await page.waitForFunction(() => document.body.dataset.camera === 'desk');
                await swipe();
                await page.waitForFunction(() => document.body.dataset.camera === 'monitor');
                console.log('mobile: native touch swipes start and advance both camera stages');
            }
            await context.close();
        }
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
