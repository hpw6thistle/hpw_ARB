import {test,expect} from '@playwright/test';
import {yearFigures,yearDelta} from '../src/yearComparison';
import {seed,addPriorBudgets,summary} from '../src/demo/model';

test('年度住房率加權、除零、精確收入、缺月拒絕與歷史資料補齊不覆寫',()=>{
 const months=Array.from({length:12},(_,i)=>({month:i+1,available:i===0?100:i===1?300:0,rn:i===0?50:i===1?30:0,revenue:i===0?'9007199254740.001':'0.000'}));
 const result=yearFigures(months);expect(result.annual.occ).toBe('20.000');expect(result.monthly[2].occ).toBeNull();expect(result.annual.rev).toBe('9007199254740.001');
 expect(yearDelta('20.000','25.125')).toBe('-5.125');expect(yearDelta('0.000',null)).toBeNull();expect(()=>yearFigures(months.slice(0,11))).toThrow('12 個月');
 expect(()=>yearFigures([...months.slice(0,11),months[0]])).toThrow('月份');
 const old=seed();delete old.priorBudgetsSeeded;old.versions=old.versions.filter(v=>v.year!==2026);const first=structuredClone(old.versions[0]);
 addPriorBudgets(old);expect(old.versions[0]).toEqual(first);const count=old.versions.length;addPriorBudgets(old);expect(old.versions).toHaveLength(count);expect(old.versions.filter(v=>v.year===2026)).toHaveLength(2);
});

test('全年與同月對照、更新資料、手機欄寬與導覽標題',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:'開始編列',exact:true}).click();await page.getByRole('tab',{name:'年度比較',exact:true}).click();
 const table=page.getByRole('region',{name:'去年與今年預算對照',exact:true});await expect(table).toBeVisible();await expect(table.locator('tbody tr')).toHaveCount(52);
 const state=seed(),current=state.versions.find(v=>v.id===3)!,prior=state.versions.find(v=>v.hotel_id===1&&v.year===2026&&v.kind==='hotel')!;
 const selected=await page.getByLabel('本年度比較版本',{exact:true}).inputValue();expect(selected).toBe('3');
 await page.getByLabel('年度比較期間',{exact:true}).selectOption('1');await expect(table.locator('tbody tr')).toHaveCount(4);
 const rn=table.locator('tbody tr').nth(1);await expect(rn.locator('td').nth(0)).toHaveText(summary(state,prior).monthly[0].rn.toLocaleString('zh-TW'));await expect(rn.locator('td').nth(1)).toHaveText(summary(state,current).monthly[0].rn.toLocaleString('zh-TW'));
 await page.getByLabel('本年度比較版本',{exact:true}).selectOption('1');
 await page.getByRole('button',{name:'更新比較資料',exact:true}).click();await expect(table).toBeVisible();await expect(page.getByLabel('年度比較期間',{exact:true})).toHaveValue('1');await expect(page.getByLabel('本年度比較版本',{exact:true})).toHaveValue('1');
 for(const width of [320,390,768,1366]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(await page.locator('.work-navbar').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);}
 await page.setViewportSize({width:390,height:844});expect((await table.locator('tbody th').first().boundingBox())!.width).toBeLessThan(110);
 await expect(page.getByRole('button',{name:'年度客房預算，返回首頁',exact:true})).toHaveText('年度客房預算');
});

test('缺少去年版本以破折號呈現，不假設為零',async({page})=>{
 const state=seed();state.versions=state.versions.filter(v=>v.year!==2026);
 await page.addInitScript(s=>sessionStorage.setItem('hotel-budget-preview-v2',JSON.stringify(s)),state);
 await page.goto('./');await page.getByRole('button',{name:'開始編列',exact:true}).click();await page.getByRole('tab',{name:'年度比較',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'去年數字與增減'})).toBeVisible();const rows=page.getByRole('region',{name:'去年與今年預算對照',exact:true}).locator('tbody tr');await expect(rows).toHaveCount(52);
 for(const i of [0,1,2,3]){await expect(rows.nth(i).locator('td').nth(0)).toHaveText('—');await expect(rows.nth(i).locator('td').nth(2)).toHaveText('—');}
});

test('各館與聯訂不顯示覆寫，財務保留覆寫及三位小數回算',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('./');await page.getByRole('button',{name:'開始編列',exact:true}).click();await expect(page.locator('.override')).toHaveCount(0);await expect(page.getByLabel('1月 Retail:官網 REV',{exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'年度客房預算，返回首頁',exact:true}).click();await page.getByLabel('首頁編列來源',{exact:true}).selectOption('central');await page.getByRole('button',{name:'開始編列',exact:true}).click();await expect(page.locator('.override')).toHaveCount(0);
 await page.getByRole('button',{name:'年度客房預算，返回首頁',exact:true}).click();await page.getByLabel('首頁編列來源',{exact:true}).selectOption('finance');await page.getByRole('button',{name:'財務比較',exact:true}).click();await page.getByLabel('來源版本',{exact:true}).selectOption('1');await page.getByRole('button',{name:/建立財務調整草稿/}).click();
 await page.getByLabel('1月 Retail:官網 rn',{exact:true}).fill('1');const rev=page.getByLabel('1月 Retail:官網 REV',{exact:true});await rev.locator('..').getByRole('checkbox').check();await rev.fill('123.125');await page.getByRole('button',{name:/儲存全部變更/}).click();
 await expect(page.getByLabel('1月 Retail:官網 ahr',{exact:true})).toHaveValue('123.125');
 const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('hotel-budget-preview-v2')!).versions.find((v:any)=>v.kind==='finance').lines.find((l:any)=>l.month===1&&l.channel==='Retail:官網'));expect(saved).toMatchObject({rn:1,rev:'123.125',ahr:'123.125'});
});
