import {test,expect,Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {channels} from '../src/demo/model';

const observed=new Map<Page,string[]>();
const demoOrigin=`http://127.0.0.1:${process.env.DEMO_TEST_PORT||5051}/`;
test.beforeEach(async({page})=>{
  const calls:string[]=[];observed.set(page,calls);
  page.on('request',r=>{if(r.url().includes('/api/')||!r.url().startsWith(demoOrigin))calls.push(r.url());});
});
test.afterEach(async({page})=>{expect(observed.get(page)).toEqual([]);});
async function enter(page:Page,compare=false){
  await page.goto('./');
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.getByRole('button',{name:compare?'財務比較':'開始編列',exact:true}).click();
  await expect(page.getByLabel('目前館別',{exact:true}).locator('option')).toHaveCount(12);
}
async function menu(page:Page){
  if(!await page.getByRole('dialog',{name:'工作範圍與編列版本'}).isVisible())await page.getByRole('button',{name:'開啟工作選單',exact:true}).click();
}
async function draft(page:Page,y='2028'){
  await menu(page);
  await page.getByLabel('預算年度',{exact:true}).selectOption(y);
  await page.getByRole('button',{name:'關閉工作選單',exact:true}).click();
  await page.getByRole('button',{name:/建立新草稿/}).click();
  await expect(page.getByLabel('1月 Retail:官網 rn',{exact:true})).toBeVisible();
}
const stored=(page:Page)=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('hotel-budget-anonymous-demo-v1')||'null'));
async function saved(page:Page){await expect(page.getByText(/尚未儲存 \d+ 個通路月份/)).toBeHidden({timeout:10000});}
function fixture(change?:(xml:string)=>string,extra:Record<string,Uint8Array>={}){
  const rows=[['month','channel','room_nights','ahr'],...Array.from({length:12},(_,m)=>channels.map(c=>[String(m+1),c,'0','0'])).flat()];
  let xml=`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>`<c r="${'ABCD'[c]}${r+1}" t="inlineStr"><is><t>${v}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  if(change)xml=change(xml);
  return Buffer.from(zipSync({'xl/worksheets/sheet1.xml':strToU8(xml),...extra}));
}

test('子路徑開啟、匿名 12 館、無帳密與無 API／外部請求',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enter(page);
  await expect(page.locator('body')).not.toContainText(/展示|試算|非正式核定資料/);
  const names=await page.getByLabel('目前館別',{exact:true}).locator('option').allTextContents();
  expect(names).toEqual(Array.from({length:12},(_,i)=>`第 ${String(i+1).padStart(2,'0')} 館`));
  await menu(page);await page.locator('.v13-version-card').first().click();
  await expect(page.getByLabel('1月 Retail:官網 rn',{exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'開啟帳號與管理資訊'}).click();
  await expect(page.getByRole('dialog')).toContainText('目前資料保存在此瀏覽器分頁');
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('精確金額、自動儲存、REV 覆寫、重新整理與提交唯讀',async({page})=>{
  page.on('dialog',d=>d.accept());await enter(page);await draft(page);
  const rn=page.getByLabel('1月 Retail:官網 rn',{exact:true});
  await rn.fill('3');await page.getByLabel('1月 Retail:官網 ahr',{exact:true}).fill('2.675');await saved(page);
  let state=await stored(page),v=state.versions.find((v:any)=>v.year===2028);
  expect(v.lines[0]).toMatchObject({rn:3,ahr:'2.675',rev:'8.025'});
  const rev=page.getByLabel('1月 Retail:官網 REV',{exact:true});
  await rev.locator('..').getByRole('checkbox').check();await rev.fill('9.000');await saved(page);
  state=await stored(page);v=state.versions.find((v:any)=>v.year===2028);
  expect(v.lines[0]).toMatchObject({ahr:'3.000',rev:'9.000'});
  await page.reload();await page.getByRole('button',{name:'開始編列',exact:true}).click();
  await menu(page);await page.getByLabel('預算年度',{exact:true}).selectOption('2028');
  await page.locator('.v13-version-card').first().click();await expect(rn).toHaveValue('3');
  await expect(page.getByLabel('1月 Retail:官網 ahr',{exact:true})).toHaveValue('3.000');
  await page.getByRole('button',{name:/提交此版本/}).click();await expect(rn).toBeDisabled();
  await menu(page);await expect(page.getByRole('button',{name:'刪除草稿',exact:true})).toBeDisabled();
});

test('超售匯入整批拒絕，原本草稿不受影響',async({page})=>{
  await enter(page);await draft(page);
  await page.locator('.budget-file-menu > summary').click();
  const bad=fixture(xml=>xml.replace('<c r="C2" t="inlineStr"><is><t>0</t>','<c r="C2" t="inlineStr"><is><t>999999</t>').replace('<c r="D2" t="inlineStr"><is><t>0</t>','<c r="D2" t="inlineStr"><is><t>100</t>'));
  await page.getByLabel('選擇匯入 Excel').setInputFiles({name:'anonymous-over-capacity.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bad});
  await expect(page.getByText('匯入預覽：108 筆')).toBeVisible();
  await page.getByRole('button',{name:'確認匯入',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('房晚超過可售房晚');
  const v=(await stored(page)).versions.find((v:any)=>v.year===2028);
  expect(v.revision).toBe(0);expect(v.lines).toEqual([]);
});

test('財務比較、單一來源獨立副本與凍結房晚',async({page})=>{
  await enter(page,true);
  await expect(page.getByRole('region',{name:'版本財務指標對照'})).toBeVisible();
  await page.getByLabel('來源版本',{exact:true}).selectOption('1');
  await page.getByRole('button',{name:/建立財務調整草稿/}).click();
  const rn=page.getByLabel('1月 Retail:官網 rn',{exact:true});await expect(rn).toBeEnabled();
  const before=await stored(page),source=before.versions.find((v:any)=>v.id===1),finance=before.versions.find((v:any)=>v.kind==='finance');
  await page.getByLabel('1月 Retail:官網 ahr',{exact:true}).fill('4200');await saved(page);
  await page.locator('.setting-summary').click();
  await page.getByLabel('房間數',{exact:true}).fill('90');
  await page.getByRole('button',{name:'儲存房間數',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('房間數已儲存');
  const after=await stored(page),updated=after.versions.find((v:any)=>v.id===finance.id);
  expect(after.versions.find((v:any)=>v.id===1).lines).toEqual(source.lines);
  expect(updated.snapshot).toEqual(finance.snapshot);
  expect(updated.lines.find((l:any)=>l.month===1&&l.channel==='Retail:官網').ahr).toBe('4200.000');
});

test('XLSX 下載／匯入與公式、外連、壓縮過大檔案拒絕',async({page})=>{
  await enter(page);await draft(page);
  await page.locator('.budget-file-menu > summary').click();
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:/下載範本/}).click();
  const download=await downloadEvent,bytes=await readFile((await download.path())!);
  const zip=unzipSync(bytes);expect(strFromU8(zip['xl/worksheets/sheet1.xml'])).toContain('<t>ahr</t>');
  await page.getByLabel('選擇匯入 Excel').setInputFiles({name:'anonymous-input.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
  await expect(page.getByText('匯入預覽：108 筆')).toBeVisible();
  await page.getByRole('button',{name:'確認匯入',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('108 筆已匯入');
  const upload=async(buffer:Buffer)=>page.getByLabel('選擇匯入 Excel').setInputFiles({name:'invalid.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
  await upload(fixture(s=>s.replace('<c r="D2"','<c r="D2"').replace('<is><t>ahr</t></is>','<f>1+1</f><v>2</v>')));
  await expect(page.getByRole('alert')).toContainText('公式儲存格');
  await upload(fixture(undefined,{'_rels/.rels':strToU8('<Relationships><Relationship TargetMode="External" Target="https://example.invalid/"/></Relationships>')}));
  await expect(page.getByRole('alert')).toContainText('外部連結');
  await upload(fixture(undefined,{'xl/extra.xml':strToU8('A'.repeat(2_500_000))}));
  await expect(page.getByRole('alert')).toContainText('過大');
  await expect(page.getByRole('button',{name:'確認匯入',exact:true})).toHaveCount(0);
});

test('分頁隔離、重設與窄螢幕橫向表格',async({page,browser})=>{
  await enter(page);await draft(page);
  const context=await browser.newContext();const other=await context.newPage();await other.goto(page.url());
  await expect(other.getByRole('button',{name:'開始編列',exact:true})).toBeVisible();expect(await stored(other)).toBeNull();await context.close();
  page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'開啟帳號與管理資訊'}).click();await page.getByRole('button',{name:'重設資料',exact:true}).click();
  await page.getByRole('button',{name:'開始編列',exact:true}).click();
  await menu(page);await page.getByLabel('預算年度',{exact:true}).selectOption('2028');await expect(page.locator('.v13-version-card')).toHaveCount(0);
  await page.getByLabel('預算年度',{exact:true}).selectOption('2027');await page.locator('.v13-version-card').last().click();
  await page.setViewportSize({width:390,height:844});
  expect(await page.getByRole('region',{name:'月份與通路預算表'}).evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
});

test('首屏可編列、點擊說明、摘要即時更新且捲動後可見',async({page})=>{
  await page.setViewportSize({width:1366,height:633});await enter(page);
  const rn=page.getByLabel('1月 Retail:官網 rn',{exact:true});
  await expect(rn).toBeEnabled();
  expect((await rn.boundingBox())!.y+(await rn.boundingBox())!.height).toBeLessThan(605);
  await expect(page.getByLabel('房間數',{exact:true})).toBeHidden();
  await page.locator('.input-help > summary').click();
  await expect(page.locator('.input-help')).toContainText('白底 R/N 與 AHR 可編輯');
  await page.locator('.input-help > summary').click();
  const total=page.getByLabel('全年營收',{exact:true});
  const before=Number((await total.innerText()).replaceAll(',',''));
  const rate=Number(await page.getByLabel('1月 Retail:官網 ahr',{exact:true}).inputValue());
  await rn.fill(String(Number(await rn.inputValue())+1));
  await expect(total).toHaveText((before+rate).toLocaleString('zh-TW',{minimumFractionDigits:3,maximumFractionDigits:3}));
  await page.getByRole('region',{name:'月份與通路預算表'}).evaluate(e=>e.scrollTop=e.scrollHeight);
  await page.evaluate(()=>window.scrollTo(0,470));
  const box=(await page.getByRole('region',{name:'全年即時預算摘要'}).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(68);expect(box.y+box.height).toBeLessThan(605);
  // Data cells have one border system; computed and editable fields differ by surface.
  const colors=await page.locator('.budget-matrix').evaluate(e=>({
    edit:getComputedStyle(e.querySelector('td.editable')!).backgroundColor,
    calc:getComputedStyle(e.querySelector('td.calculated')!).backgroundColor,
    border:getComputedStyle(e.querySelector('td.editable')!).borderRightColor,
    calcBorder:getComputedStyle(e.querySelector('td.calculated')!).borderRightColor,
  }));
  expect(colors.edit).toBe('rgb(255, 255, 255)');expect(colors.calc).toBe('rgb(240, 241, 239)');expect(colors.border).toBe(colors.calcBorder);
});

test('手機邊緣右滑選單、焦點限制、Escape 與減少動態設定',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await enter(page);
  const button=page.getByRole('button',{name:'開啟工作選單',exact:true});
  await button.focus();
  await page.locator('.work-heading').evaluate(e=>{
    const start=new Touch({identifier:1,target:e,clientX:12,clientY:130});
    const end=new Touch({identifier:1,target:e,clientX:120,clientY:135});
    e.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[start],changedTouches:[start]}));
    e.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[end]}));
  });
  const dialog=page.getByRole('dialog',{name:'工作範圍與編列版本'});await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox())!.x).toBe(0);
  expect(await dialog.evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
  await expect(dialog.getByRole('button',{name:'返回首頁'})).toHaveCount(0);
  await dialog.getByRole('button',{name:'返回目前工作區 →',exact:true}).focus();await page.keyboard.press('Tab');
  expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(button).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});

test('導覽標題回首頁確認、單一三點選單與草稿 Hero 位置',async({page})=>{
  await enter(page);
  const nav=page.getByRole('navigation',{name:'主要導覽'});
  const home=nav.getByRole('button',{name:'客房預算，返回首頁',exact:true});
  expect(await nav.evaluate(e=>e.firstElementChild?.textContent)).toBe('客房預算');
  await expect(nav.getByRole('button',{name:'開啟工作選單',exact:true})).toHaveText('⋯');
  await expect(page.locator('.work-context')).toHaveCount(0);
  await menu(page);await expect(page.getByRole('dialog',{name:'工作範圍與編列版本'}).getByRole('button',{name:/建立新草稿/})).toHaveCount(0);
  await page.getByRole('button',{name:'關閉工作選單',exact:true}).click();
  const flow=(await page.locator('.v152-flow-row').boundingBox())!,hero=(await page.locator('.work-hero').boundingBox())!;
  const rooms=(await page.locator('.inventory-panel').boundingBox())!,budget=(await page.locator('.budget-section').boundingBox())!;
  expect(hero.y).toBeGreaterThanOrEqual(flow.y+flow.height);expect(rooms.y).toBeGreaterThan(hero.y+hero.height);
  expect(Math.abs(rooms.x-budget.x)).toBeLessThan(1);expect(Math.abs(rooms.width-budget.width)).toBeLessThan(1);
  const title=page.locator('.setting-summary>span').first(),color=await title.evaluate(e=>getComputedStyle(e).color);
  await page.locator('.setting-summary').hover();expect(await title.evaluate(e=>getComputedStyle(e).color)).toBe(color);
  page.once('dialog',d=>d.dismiss());await home.click();await expect(page.getByLabel('1月 Retail:官網 rn',{exact:true})).toBeVisible();
  page.once('dialog',d=>d.accept());await home.click();await expect(page.getByRole('button',{name:'開始編列',exact:true})).toBeVisible();
});

test('兩層表頭隨內容增高仍固定、原生滾輪與收合月份對齊',async({page})=>{
  await page.setViewportSize({width:1366,height:900});await enter(page);
  const grid=page.getByRole('region',{name:'月份與通路預算表'});
  await grid.evaluate(e=>{e.style.scrollBehavior='auto';e.scrollTop=450;e.scrollLeft=210;});
  await page.evaluate(()=>window.scrollBy(0,document.querySelector('.vertical-scroll')!.getBoundingClientRect().top-240));
  const header=page.locator('.budget-matrix thead');
  const regionBox=(await grid.boundingBox())!,headBox=(await header.boundingBox())!;
  expect(Math.abs(headBox.y-regionBox.y-1)).toBeLessThan(2);
  await header.locator('th').evaluateAll(cells=>cells.forEach(c=>(c as HTMLElement).style.fontSize='20px'));
  const first=(await header.locator('tr').nth(0).boundingBox())!,second=(await header.locator('tr').nth(1).boundingBox())!;
  expect(second.y).toBeGreaterThanOrEqual(first.y+first.height-1);
  expect(await header.evaluate(e=>e.contains(document.elementFromPoint(100,e.getBoundingClientRect().y+12)))).toBe(true);
  await header.locator('th').evaluateAll(cells=>cells.forEach(c=>(c as HTMLElement).style.removeProperty('font-size')));
  const scrollY=await page.evaluate(()=>window.scrollY),before=await grid.evaluate(e=>e.scrollTop);
  await page.mouse.move(regionBox.x+300,regionBox.y+170);await page.mouse.wheel(0,400);
  await expect.poll(()=>grid.evaluate(e=>e.scrollTop)).toBeGreaterThan(before);
  expect(await page.evaluate(()=>window.scrollY)).toBe(scrollY);
  await page.getByRole('button',{name:'全部收合',exact:true}).click();
  await expect(page.locator('.month-summary')).toHaveCount(12);
  const columns=await page.locator('.month-summary').evaluateAll(rows=>rows.map(row=>Array.from(row.children).map(c=>Math.round(c.getBoundingClientRect().x))));
  for(const row of columns)expect(row).toEqual(columns[0]);
  await expect(page.locator('.month-collapse').first()).toContainText('01 月');await expect(page.locator('.month-collapse').last()).toContainText('12 月');
});
