import {test,expect,Page} from '@playwright/test';
async function enter(page:Page,central=true){await page.getByLabel('首頁編列來源',{exact:true}).selectOption(central?'central':'hotel');await page.getByRole('button',{name:'開始編列',exact:true}).click();}
test('2.1 接續提示、儲存時間、重新進入與來源隔離，不呼叫外部 API',async({page},info)=>{
 const calls:string[]=[];page.on('request',r=>{if(r.url().includes('/api/'))calls.push(r.url());});
 await page.goto('./');await enter(page);
 await page.getByRole('button',{name:'開啟工作選單',exact:true}).click();await page.getByLabel('預算年度',{exact:true}).selectOption('2029');await page.getByRole('button',{name:'關閉工作選單',exact:true}).click();await page.getByRole('button',{name:/建立新草稿/}).click();
 await page.getByLabel('1月 Retail:官網 rn',{exact:true}).fill('3');await page.getByLabel('1月 Retail:官網 ahr',{exact:true}).fill('100');await expect(page.getByText(/尚未儲存 \d+ 個通路月份/)).toBeHidden({timeout:10000});
 const strip=page.getByRole('region',{name:'接續編列資訊',exact:true});await expect(strip).toContainText('台北時間');await expect(strip).not.toContainText('2029 年');
 await page.reload();await enter(page);await expect(strip).not.toContainText('2029 年');await expect(page.getByLabel('1月 Retail:官網 rn',{exact:true})).toHaveValue('3');
 await expect(page.locator('.work-steps [aria-current="step"]')).toContainText('02');
 await expect(page.locator('.app-status-bar')).toHaveCount(0);
 await page.getByRole('button',{name:'填寫說明',exact:true}).click();await expect(page.getByRole('dialog',{name:'填寫說明',exact:true})).toContainText('多格貼上支援從 Excel');await page.keyboard.press('Escape');
 await page.screenshot({path:info.outputPath('resume-compact-desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath('resume-compact-mobile.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 await page.getByRole('button',{name:'提交此版本 →',exact:true}).click();await page.reload();await enter(page);await expect(page.locator('.work-steps [aria-current="step"]')).toContainText('03');await expect(page.getByLabel('1月 Retail:官網 rn',{exact:true})).toBeDisabled();
 await page.reload();await enter(page,false);await expect(strip).not.toContainText('2029 年');await expect(page.locator('input[type=password]')).toHaveCount(0);expect(calls).toEqual([]);
});
