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
  await page.getByRole('button',{name:compare?'體驗財務比較':'體驗預算編列',exact:true}).click();
  await expect(page.getByLabel('目前館別',{exact:true}).locator('option')).toHaveCount(12);
}
async function draft(page:Page,y='2028'){
  await page.getByLabel('預算年度',{exact:true}).selectOption(y);
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
  await expect(page.getByRole('complementary',{name:'匿名展示版說明'})).toBeVisible();
  const names=await page.getByLabel('目前館別',{exact:true}).locator('option').allTextContents();
  expect(names).toEqual(Array.from({length:12},(_,i)=>`第 ${String(i+1).padStart(2,'0')} 示範館`));
  await page.locator('.v13-version-card').first().click();
  await expect(page.getByLabel('1月 Retail:官網 rn',{exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'開啟帳號與管理資訊'}).click();
  await expect(page.getByRole('dialog')).toContainText('匿名展示訪客');
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
  await page.reload();await page.getByRole('button',{name:'體驗預算編列',exact:true}).click();
  await page.getByLabel('預算年度',{exact:true}).selectOption('2028');
  await page.locator('.v13-version-card').first().click();await expect(rn).toHaveValue('3');
  await expect(page.getByLabel('1月 Retail:官網 ahr',{exact:true})).toHaveValue('3.000');
  await page.getByRole('button',{name:/提交此版本/}).click();await expect(rn).toBeDisabled();
  await expect(page.getByRole('button',{name:'刪除草稿',exact:true})).toBeDisabled();
});

test('超售匯入整批拒絕，原本草稿不受影響',async({page})=>{
  await enter(page);await draft(page);
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
  await expect(other.getByRole('button',{name:'體驗預算編列',exact:true})).toBeVisible();expect(await stored(other)).toBeNull();await context.close();
  page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'重設示範資料',exact:true}).click();
  await page.getByRole('button',{name:'體驗預算編列',exact:true}).click();
  await page.getByLabel('預算年度',{exact:true}).selectOption('2028');await expect(page.locator('.v13-version-card')).toHaveCount(0);
  await page.getByLabel('預算年度',{exact:true}).selectOption('2027');await page.locator('.v13-version-card').last().click();
  await page.setViewportSize({width:390,height:844});
  expect(await page.getByRole('region',{name:'月份與通路預算表'}).evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
});
