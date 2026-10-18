import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readLayoutState,VIEWPORT_CASES} from './3.3-browser-probes.mjs';

const args=process.argv.slice(2),option=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const target=option('--url');
if(!target)throw Error('Usage: node qa/3.3-browser-checks.mjs --url <authorized HTTP(S) game URL> [--browser chromium|firefox|webkit] [--output /absolute/path] [--case phone]');
const url=new URL(target);assert(['http:','https:'].includes(url.protocol),'Only an authorized normal HTTP(S) game URL is supported');
const output=resolve(option('--output','verification/3.3-browser')),browserName=option('--browser','chromium'),singleCase=option('--case');
const report={version:'3.3',url:url.origin+url.pathname,browser:browserName,startedAt:new Date().toISOString(),status:'starting',deviceGPUVerified:false,cases:[]};
await mkdir(output,{recursive:true});
let browser;
try{
 let playwright;try{playwright=await import('playwright');}catch{
  const runtimeModules=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;if(!runtimeModules)throw Error('Playwright is unavailable; no browser was installed by this script.');
  playwright=await import(pathToFileURL(join(runtimeModules,'playwright/index.mjs')).href);
 }
 assert(playwright[browserName],'Unsupported browser: '+browserName);
 // A fresh, isolated profile only. No stored credentials, CDP attachment,
 // protection bypass, altered GPU flags, request mocking or proxy is used.
 browser=await playwright[browserName].launch({headless:true});
 for(const fixture of VIEWPORT_CASES.filter(value=>!singleCase||value.name===singleCase)){
  const current={...fixture,status:'running',states:[],consoleErrors:[],pageErrors:[],artRequests:[]};report.cases.push(current);
  const context=await browser.newContext({viewport:{width:fixture.width,height:fixture.height},screen:{width:fixture.width,height:fixture.height},hasTouch:fixture.mobile,isMobile:fixture.mobile&&browserName!=='firefox',deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();page.on('console',message=>{if(message.type()==='error')current.consoleErrors.push(message.text().slice(0,300));});page.on('pageerror',error=>current.pageErrors.push(error.message.slice(0,300)));page.on('response',response=>{if(response.url().includes('/vehicles/'))current.artRequests.push({path:new URL(response.url()).pathname,status:response.status()});});
  async function capture(name){
   const state=await page.evaluate(readLayoutState);state.name=name;current.states.push(state);await page.screenshot({path:join(output,fixture.name+'-'+name+'.png'),animations:'disabled'});
   assert(!state.document.overflowX&&!state.document.overflowY,fixture.name+'/'+name+': document overflow');
   const blocking=state.issues.filter(issue=>issue.outside||issue.clippedBy.length||issue.covered);
   assert.equal(blocking.length,0,fixture.name+'/'+name+': clipped/covered controls: '+JSON.stringify(blocking));
   return state;
  }
  try{
   await page.goto(target,{waitUntil:'domcontentloaded'});await page.locator('#entry-enter').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('entry-enter').disabled,{timeout:30000});await capture('entry');await page.locator('#entry-enter').click();await page.locator('#entry-screen').waitFor({state:'hidden'});
   // Profile creation is deliberately not guessed here. Capture a mandatory
   // profile gate honestly instead of creating undeletable public test users.
   if(await page.locator('#dialog:visible input').count()){
    await capture('profile-gate');current.status='blocked-profile';current.reason='A profile is required before the garage. Use the separate authorized API/profile test flow; this browser script does not create permanent profiles.';continue;
   }
   const carImages=[];
   for(let index=0;index<5;index++){
    await page.locator('[data-car="'+index+'"]').click();await page.waitForTimeout(500);await capture('car-'+index);
    const png=await page.locator('#showroom-slot').screenshot({animations:'disabled'});carImages.push(createHash('sha256').update(png).digest('hex'));
   }
   assert.equal(new Set(carImages).size,5,'All five cropped car previews are identical; the large preview may be blank or selection is not rendered');
   current.distinctPreviewImages=5;
   await page.locator('#rotate-car').click();await page.waitForTimeout(500);await capture('rotation');await page.locator('#preview-lights').click();await capture('lights');
   await page.locator('#garage-next').click();await capture('track');for(const id of ['lammersdorf','bahnhof','kraemer']){await page.locator('[data-track="'+id+'"]').click();await capture('track-'+id);}
   await page.locator('#garage-next').click();await capture('race-setup');await page.locator('#open-settings').click();
   for(const tab of ['race','driving','graphics']){const element=page.locator('[data-settings-page="'+tab+'"]');assert.equal(await element.count(),1,'Missing settings tab '+tab);await element.click();await capture('settings-'+tab);}
   await page.locator('#settings-done').click();await page.locator('#start-solo').click();await page.locator('.race-briefing:not([hidden])').waitFor({timeout:30000});await capture('briefing');await page.locator('[data-briefing-ready]').click();await page.locator('#hud:not([hidden])').waitFor({timeout:30000});await page.waitForTimeout(3500);await capture('race');await page.locator('#pause').click();await capture('pause');await page.locator('#exit-race').click();await capture('garage-return');
   assert.equal(current.pageErrors.length,0,'Uncaught browser errors: '+current.pageErrors.join('; '));current.status='passed';
  }catch(error){current.status='failed';current.error=error.message;try{await page.screenshot({path:join(output,fixture.name+'-failure.png'),animations:'disabled'});}catch{};}
  finally{await context.close();}
 }
 report.status=report.cases.length&&report.cases.every(item=>item.status==='passed')?'passed':report.cases.some(item=>item.status==='failed')?'failed':'blocked';
}catch(error){report.status='blocked';report.reason=error.message;}
finally{
 await browser?.close();report.finishedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,browser:browserName,cases:report.cases.map(item=>({name:item.name,status:item.status,error:item.error??item.reason})),reason:report.reason,report:join(output,'report.json'),deviceGPUVerified:false},null,2));if(report.status!=='passed')process.exitCode=1;
}
