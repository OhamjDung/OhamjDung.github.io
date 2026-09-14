import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Hi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
await page.goto('http://localhost:8090');
await page.getByText('START',{exact:true}).waitFor({timeout:60000});
await page.screenshot({path:'qa/t0.png'});
await page.getByText('START',{exact:true}).click();
for(const t of [2,5,9,14]){await page.waitForTimeout(t===2?2000:t===5?3000:t===9?4000:5000);await page.screenshot({path:`qa/t${t}.png`});}
await page.mouse.click(720,450);await page.waitForTimeout(3000);await page.screenshot({path:'qa/desk.png'});
const f=page.locator('#computer-screen');const b=await f.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(12000);await page.screenshot({path:'qa/monitor.png'});console.log(await page.evaluate(()=>{const f=document.getElementById('computer-screen');return JSON.stringify({src:f.src,op:getComputedStyle(f).opacity,w:f.getBoundingClientRect().width});}));
await browser.close();
