import {test,expect} from '@playwright/test';
import {seed} from '../src/demo/model';

test('正式館名、舊資料一次重設、只保留西門範例，其他館新草稿可持續保存',async({page})=>{
 const old=seed();old.versions.push({...structuredClone(old.versions[0]),id:999,hotel_id:2,status:'submitted'},{...structuredClone(old.versions[0]),id:998,hotel_id:3,status:'draft'});
 await page.addInitScript(value=>{if(!sessionStorage.getItem('reset-fixture-installed')){sessionStorage.setItem('hotel-budget-anonymous-demo-v1',JSON.stringify(value));sessionStorage.setItem('reset-fixture-installed','yes');}},old);
 page.on('dialog',dialog=>dialog.accept());await page.goto('./');
 await expect(page.getByLabel('首頁館別',{exact:true}).locator('option')).toHaveText(['西門','昆明','博愛','美麗島','南西','南東','站前','北門','航空','桃車','真愛','駁二']);
 await page.getByRole('button',{name:'開始編列',exact:true}).click();await page.getByRole('button',{name:'開啟工作選單',exact:true}).click();await expect(page.getByLabel('目前館別',{exact:true}).locator('option:checked')).toHaveText('西門');await page.getByRole('button',{name:'關閉工作選單',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('hotel-budget-preview-v2')!==null)).toBe(true);
 const snapshot=await page.evaluate(()=>({old:sessionStorage.getItem('hotel-budget-anonymous-demo-v1'),current:JSON.parse(sessionStorage.getItem('hotel-budget-preview-v2')!)}));
 expect(snapshot.old).toBeNull();expect(snapshot.current.versions).toHaveLength(5);expect(snapshot.current.versions.every((v:any)=>v.hotel_id===1)).toBe(true);expect(snapshot.current.versions.some((v:any)=>v.id===998||v.id===999)).toBe(false);
 await expect(page.getByRole('tab',{name:'財務比較與帶入',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'年度客房預算，返回首頁',exact:true}).click();await page.getByLabel('首頁館別',{exact:true}).selectOption('2');await page.getByRole('button',{name:'開始編列',exact:true}).click();
 await expect(page.locator('.work-steps [aria-current="step"]')).toContainText('01');await page.getByRole('button',{name:'開啟工作選單',exact:true}).click();await expect(page.getByLabel('目前館別',{exact:true}).locator('option:checked')).toHaveText('昆明');await page.getByRole('button',{name:'關閉工作選單',exact:true}).click();
 await page.getByRole('button',{name:/建立新草稿/}).click();await expect(page.getByLabel('1月 Retail:官網 rn',{exact:true})).toHaveValue('0');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('hotel-budget-preview-v2')!).versions.filter((v:any)=>v.hotel_id===2).length)).toBe(1);
 await page.reload();await page.getByLabel('首頁館別',{exact:true}).selectOption('2');await page.getByRole('button',{name:'開始編列',exact:true}).click();await expect(page.locator('.work-steps [aria-current="step"]')).toContainText('02');
 await page.reload();await page.getByLabel('首頁編列來源',{exact:true}).selectOption('central');await page.getByRole('button',{name:'開始編列',exact:true}).click();await expect(page.getByRole('tab',{name:'財務比較與帶入',exact:true})).toHaveCount(0);
});
