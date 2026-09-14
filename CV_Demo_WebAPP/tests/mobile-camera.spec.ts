import {test,expect,chromium} from '@playwright/test';
import {createSession} from '../lib/auth';

for(const width of [320,390,430])test(`camera flow fits ${width}px screen`,async()=>{
 const browser=await chromium.launch({channel:'chromium',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 const context=await browser.newContext({viewport:{width,height:844},permissions:['camera']});
 const {token}=createSession('admin');
 await context.addCookies([{name:'cv_demo_session',value:token,url:'http://127.0.0.1:3040',httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();
 const fits=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 try{
  await page.goto('http://127.0.0.1:3040');
  await page.getByRole('button',{name:'Начать сканирование',exact:true}).click();
  for(let i=0;i<4;i++){await fits();await page.getByRole('button',{name:'Продолжить',exact:true}).click();}
  await page.getByRole('button',{name:'К сканированию',exact:true}).click();await fits();
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  const capture=page.getByRole('button',{name:'Сделать снимок',exact:true});
  await expect(capture).toBeEnabled();await fits();
  expect(await page.locator('.viewfinder').evaluate(el=>{const r=el.getBoundingClientRect();const parent=el.closest('.flow-content')!.getBoundingClientRect();return r.right<=parent.right+1&&r.left>=parent.left-1;})).toBeTruthy();
  await page.screenshot({path:`test-results/camera-${width}.png`,fullPage:true});
  await capture.click();await expect(page.getByRole('button',{name:'Распознать',exact:true})).toBeVisible();await fits();
  await page.getByRole('button',{name:'Переснять',exact:true}).click();await expect(capture).toBeEnabled();await fits();
 }finally{await context.close();await browser.close();}
});
