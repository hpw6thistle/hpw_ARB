import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {buildReport,ReportVersion,SourceSnapshot} from '../src/reports/model';
import {emptyLedger,calculatePnl} from '../src/reports/pnl';
import {amount,money,divide} from '../src/reports/money';
import {pnlCatalog} from '../src/reports/catalog';
import {reportWorkbook} from '../src/reports/xlsx';

function fixture(){
  const lines=[{month:1,channel:'Retail:官網',rn:1,ahr:'100.000',rev:'100.000'},{month:2,channel:'Retail:官網',rn:9,ahr:'200.000',rev:'1800.000'}];
  const inventory=Array.from({length:12},(_,i)=>({month:i+1,available:i===0?3100:i===1?2800:0}));
  const version:ReportVersion={id:37,hotel_id:1,year:2027,kind:'finance',status:'draft',revision:2,lines,inventory_snapshot:inventory};
  const source:SourceSnapshot={source_id:1,source_revision:1,lines:structuredClone(lines),inventory};
  return {version,source};
}
test('損益沿用 206 科目、年度加權、負數及所得稅三種口徑',()=>{
  const {version,source}=fixture(),ledger=emptyLedger();ledger.values={'1/6000101':'100.000'};
  const r=buildReport(version,source,ledger,'第 01 館');
  expect(pnlCatalog.filter(r=>r.code)).toHaveLength(206);
  expect(r.annual).toMatchObject({rev:'1900.000',adr:'190.000',occ:'0.169',net:'1809.524'});
  const by=(rows:ReturnType<typeof calculatePnl>,id:number)=>rows.find(r=>r.row.row===id)!;
  expect(by(r.pnl,220).months[0]).toBe('-4.762');expect(by(r.pnl,221).annual).toBe('0.000');
  const automatic=calculatePnl(r.monthly.map(m=>m.net),ledger.values,'monthly_20');
  expect(by(automatic,221).months[1]).toBe('342.857');expect(by(automatic,222).annual).toBe('1366.667');
  const manual=calculatePnl(r.monthly.map(m=>m.net),{'2/8000101':'-10.125'},'manual');expect(by(manual,221).annual).toBe('-10.125');
  expect(money(divide(-1005n,2n))).toBe('-0.503');
  expect(source.lines[0].rev).toBe('100.000');
});
test('月除稅尾差、零分母、缺漏與超售來源拒絕',()=>{
  const {version,source}=fixture();version.lines=[1,2].map(month=>({month,channel:'Retail:官網',rn:1,ahr:'0.010',rev:'0.010'}));
  const report=buildReport(version,source,emptyLedger(),'第 01 館');
  expect(report.annual.net).toBe('0.020');expect(report.netDirect).toBe('0.019');expect(report.netDifference).toBe('0.001');expect(report.monthly[2].occ).toBeNull();
  expect(()=>buildReport({...version,inventory_snapshot:null},source,emptyLedger(),'x')).toThrow('快照');
  expect(()=>buildReport({...version,lines:[{...version.lines[0],rn:99999}]},source,emptyLedger(),'x')).toThrow();
});
test('Excel 七張表、文字注入安全與大額保留精度',async({},info)=>{
  const {version,source}=fixture(),ledger=emptyLedger();ledger.values={'1/6000101':'1234567890123.001'};
  const report=buildReport(version,source,ledger,'=HYPERLINK("https://example.invalid/")');
  const bytes=reportWorkbook(report),files=unzipSync(bytes),workbook=strFromU8(files['xl/workbook.xml']);
  expect([...workbook.matchAll(/<sheet /g)]).toHaveLength(7);
  expect(workbook).toContain('客房部');expect(workbook).toContain('損益調整差異');
  const sheet=strFromU8(files['xl/worksheets/sheet1.xml']);
  expect(sheet).not.toContain('<f>');expect(sheet).toContain('t="inlineStr"');expect(sheet).toContain('1234567890123.001');expect(sheet).toContain('=HYPERLINK(&quot;');
  expect(sheet).toContain('state="frozen"');
  await writeFile(info.outputPath('precision-report.xlsx'),bytes);
});

const origin=`http://127.0.0.1:${process.env.DEMO_TEST_PORT||5051}/`;
async function finance(page:Page){
  await page.goto('./');await page.getByLabel('首頁編列來源',{exact:true}).selectOption('finance');await page.getByRole('button',{name:'財務比較',exact:true}).click();
  await page.getByLabel('來源版本',{exact:true}).selectOption('1');await page.getByRole('button',{name:/建立財務調整草稿/}).click();
  await expect(page.getByLabel('1月 Retail:官網 rn',{exact:true})).toBeEnabled();
}
const stored=(page:Page)=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('hotel-budget-preview-v2')!));
test('財務調整立即儲存、完整損益編列、Excel／PDF 及提交鎖定',async({page},info)=>{
  const calls:string[]=[];page.on('request',r=>{if(r.url().includes('/api/')||!r.url().startsWith(origin))calls.push(r.url());});
  await finance(page);const before=await stored(page),fin=before.versions.find((v:any)=>v.kind==='finance');
  await page.getByLabel('1月 Retail:官網 ahr',{exact:true}).fill('2222.125');
  await page.getByRole('button',{name:'儲存並預覽報表',exact:true}).click();
  await expect(page.getByRole('region',{name:'客房部損益表',exact:true})).toBeVisible();
  let state=await stored(page);expect(state.versions.find((v:any)=>v.id===fin.id).lines.find((l:any)=>l.month===1&&l.channel==='Retail:官網').ahr).toBe('2222.125');
  await page.getByLabel('顯示全部 206 科目').check();await expect(page.locator('.report-table tbody tr')).toHaveCount(221);
  await page.getByRole('tab',{name:'損益科目編列',exact:true}).click();
  await page.getByLabel('1月 6000101 金額',{exact:true}).fill('500000.125');await page.getByLabel('所得稅計算方式').selectOption('monthly_20');
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'儲存並匯出 Excel',exact:true}).click();const download=await downloadEvent;
  await download.saveAs(info.outputPath('finance-report.xlsx'));
  const bytes=await readFile((await download.path())!),zip=unzipSync(bytes);expect(strFromU8(zip['xl/worksheets/sheet1.xml'])).toContain('500000.125');
  state=await stored(page);expect(state.pnl[fin.id].values['1/6000101']).toBe('500000.125');expect(state.pnl[fin.id].baseline_values).toEqual(before.pnl[fin.id].baseline_values);
  expect(state.versions.find((v:any)=>v.id===1).lines).toEqual(before.versions.find((v:any)=>v.id===1).lines);
  expect(state.versions.find((v:any)=>v.id===fin.id).snapshot).toEqual(fin.snapshot);
  await page.getByRole('tab',{name:'客房部損益',exact:true}).click();await page.getByLabel('顯示全部 206 科目').check();
  await page.emulateMedia({media:'print'});await expect(page.locator('.report-actions')).toBeHidden();const pdf=await page.pdf({path:info.outputPath('pnl.pdf'),format:'A4',landscape:true,printBackground:true});expect(pdf.subarray(0,4).toString()).toBe('%PDF');await page.emulateMedia({media:'screen'});
  await page.getByRole('tab',{name:'預算編列',exact:true}).click();await page.getByRole('button',{name:'提交此版本 →',exact:true}).click();
  await page.getByRole('button',{name:'預覽報表',exact:true}).click();await page.getByRole('tab',{name:'損益科目編列',exact:true}).click();await expect(page.getByLabel('1月 6000101 金額',{exact:true})).toBeDisabled();await expect(page.getByLabel('所得稅計算方式')).toBeDisabled();
  expect(calls).toEqual([]);
});
test('損益無效輸入阻擋匯出、還原及手機紅色房晚區／接續資訊',async({page})=>{
  await finance(page);await page.getByRole('button',{name:'儲存並預覽報表',exact:true}).click();
  await page.getByRole('tab',{name:'損益科目編列',exact:true}).click();await page.getByLabel('1月 6000101 金額',{exact:true}).fill('-');
  let downloaded=false;page.on('download',()=>downloaded=true);await page.getByRole('button',{name:'儲存並匯出 Excel',exact:true}).click();await expect(page.getByRole('alert')).toContainText('最多三位小數');expect(downloaded).toBe(false);
  await expect(page.getByRole('tab',{name:'預算編列',exact:true})).toBeDisabled();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'還原變更',exact:true}).click();
  await page.getByRole('tab',{name:'預算編列',exact:true}).click();await page.locator('.setting-summary').click();await page.locator('.inventory-details>summary').click();
  const palette=await page.locator('.inventory-details .monthbox').first().evaluate(e=>({bg:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderColor,text:getComputedStyle(e.querySelector('strong')!).color}));expect(palette).toEqual({bg:'rgb(255, 246, 244)',border:'rgb(231, 203, 197)',text:'rgb(145, 73, 63)'});
  await expect(page.locator('.work-nav-context')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'目前工作表',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'接續編列資訊',exact:true})).not.toContainText('2027 年');
  await expect(page.getByRole('region',{name:'接續編列資訊',exact:true})).not.toContainText('財務調整預算');
  await page.getByRole('button',{name:'儲存並預覽報表',exact:true}).click();await page.setViewportSize({width:390,height:844});await expect(page.getByRole('region',{name:'客房部損益表',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
