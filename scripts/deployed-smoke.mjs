import {chromium} from '@playwright/test';
const url=process.env.APP_URL||'https://lol5892.github.io/mcu/';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ru-RU'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(url);if(response?.status()!==200)throw Error('HTTPS did not return 200: '+response?.status());
 await page.evaluate(async()=>navigator.serviceWorker.ready);await page.reload();
 const scope=await page.evaluate(async()=>(await navigator.serviceWorker.getRegistration())?.scope);if(scope!==url)throw Error('Unexpected scope: '+scope);
 await page.getByRole('button',{name:'Открыть: Железный человек',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Посмотрели',exact:true}).click();
 await page.getByLabel('Оценка Антона').selectOption('9');await page.getByLabel('Оценка Тани').selectOption('8');await page.getByLabel('Наша заметка').fill('Проверка опубликованного приложения');await page.getByText('Сохранено на устройстве',{exact:true}).waitFor();
 await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Открыть: Железный человек',exact:true}).click();
 if(await page.getByLabel('Оценка Антона').inputValue()!=='9'||await page.getByLabel('Оценка Тани').inputValue()!=='8'||await page.getByLabel('Наша заметка').inputValue()!=='Проверка опубликованного приложения')throw Error('Offline records did not persist');
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({url,httpStatus:response.status(),serviceWorkerScope:scope,offlineReload:'passed',bothRatings:'passed',notePersistence:'passed',javascriptErrors:errors}));
}finally{await browser.close();}
