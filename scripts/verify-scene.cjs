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
            if (process.env.VIEWPORT && process.env.VIEWPORT !== name) continue;
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
            const frame = page.frameLocator('#computer-screen');
            assert.equal(await frame.locator('.desktop').getAttribute('data-started'), 'false', 'Wide view stays asleep');
            await page.waitForFunction(() => [...document.querySelectorAll('#monitor-videos video')].every(video => !video.paused && video.readyState >= 2));
            assert.equal(await page.locator('#monitor-videos video').count(), 2, 'Both monitor static layers are restored');
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
            await frame.locator('.desktop[data-started="true"][data-section="about"]').waitFor();
            await page.waitForTimeout(1000);
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
            assert.equal(await frame.locator('.desktop').getAttribute('data-started'), 'true');
            await frame.locator('.desktop[data-section="about"]').waitFor();
            await frame.locator('#window-about[data-visible="true"]').waitFor();
            await page.waitForTimeout(1200);
            assert(await frame.locator('#window-about').evaluate(element => Number(getComputedStyle(element).opacity) > 0.98), 'About window has opened');
            await page.screenshot({ path: `qa/${name}-monitor-about.png` });
            // Exercise the state handler independently of CSS3D iframe hit-test rounding.
            await frame.locator('[data-task="projects"]').evaluate(button => button.click());
            await frame.locator('.desktop[data-section="projects"]').waitFor();
            await page.evaluate(() => {
                const screen = document.getElementById('computer-screen');
                screen.contentWindow.postMessage({type:'wake-desktop'}, new URL(screen.src).origin);
                screen.contentWindow.postMessage({type:'wake-desktop'}, new URL(screen.src).origin);
            });
            await page.waitForTimeout(750);
            assert.equal(await frame.locator('.desktop').getAttribute('data-section'), 'projects', 'Repeated wake does not reset the current section');
            await frame.locator('.project-content').dispatchEvent('wheel', { deltaY: -180, bubbles: true });
            await page.waitForTimeout(400);
            assert.equal(await page.locator('body').getAttribute('data-camera'), 'monitor', 'Scrolling up inside a window does not zoom');
            const screenBox = await page.locator('#computer-screen').boundingBox();
            await page.mouse.move(screenBox.x + screenBox.width * 0.25, screenBox.y + screenBox.height * 0.08);
            await page.mouse.wheel(0, -160);
            // Keep sending momentum past the transition; one gesture must remain one step.
            for (let i = 0; i < 20; i++) {
                await page.waitForTimeout(80);
                await page.mouse.wheel(0, -20);
            }
            await page.waitForFunction(() => document.body.dataset.camera === 'desk');
            await page.screenshot({path: `qa/${name}-zoom-out-medium.png`});
            assert.equal(await frame.locator('.desktop').getAttribute('data-section'), 'projects', 'Zooming out preserves the section');
            await page.waitForTimeout(300);
            await page.mouse.move(20, viewport.height / 2);
            await page.mouse.wheel(0, -160);
            await page.waitForFunction(() => document.body.dataset.camera === 'idle');
            await page.screenshot({path: `qa/${name}-zoom-out-wide.png`});
            await page.waitForTimeout(300);
            await page.mouse.wheel(0, -160);
            await page.waitForTimeout(400);
            assert.equal(await page.locator('body').getAttribute('data-camera'), 'idle', 'Wide is the zoom-out boundary');
            await page.mouse.wheel(0, 160);
            await page.waitForFunction(() => document.body.dataset.camera === 'desk');
            await page.waitForTimeout(300);
            await page.mouse.wheel(0, 160);
            await page.waitForFunction(() => document.body.dataset.camera === 'monitor');
            // A reloaded/late iframe must wake even though the camera is already at max zoom.
            await page.locator('#computer-screen').evaluate(screen => { screen.src = screen.src; });
            await frame.locator('.desktop[data-started="true"][data-section="about"]').waitFor();
            assert.deepEqual(startup, [], 'Original startup audio is not requested');
            assert.deepEqual(errors, [], 'No runtime or WebGL errors');
            console.log(`${name}: bidirectional zoom, momentum guard, content scroll isolation, monitor effects, wake recovery, story scroll, canvas, petting and haze passed`);
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
                const bounds = await page.locator('#computer-screen').boundingBox();
                const swipeDown = async (x, y) => {
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 130 }] });
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                };
                await swipeDown(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.08);
                await page.waitForFunction(() => document.body.dataset.camera === 'desk');
                await page.waitForTimeout(300);
                await swipeDown(20, 650);
                await page.waitForFunction(() => document.body.dataset.camera === 'idle');
                console.log('mobile: native touch swipes start, zoom in and zoom out through both stages');
            }
            await context.close();
        }
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
