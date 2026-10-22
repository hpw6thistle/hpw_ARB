import {test,expect} from '@playwright/test';

test('首頁分工、各館範圍與聯訂草稿分開保存',async({page})=>{
  await page.goto('./');await expect(page.getByLabel('首頁館別',{exact:true}).locator('option')).toHaveCount(12);
  await page.getByLabel('首頁館別',{exact:true}).selectOption('2');await page.getByRole('button',{name:'開始編列',exact:true}).click();
  await page.getByRole('button',{name:'開啟工作選單',exact:true}).click();
  await expect(page.getByLabel('目前館別',{exact:true})).toHaveValue('2');await expect(page.getByLabel('目前館別',{exact:true}).locator('option')).toHaveCount(1);
  await expect(page.getByLabel('編列來源',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'關閉工作選單',exact:true}).click();await expect(page.getByRole('tab',{name:'財務比較與帶入',exact:true})).toBeDisabled();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'年度客房預算，返回首頁',exact:true}).click();
  await page.getByLabel('首頁編列來源',{exact:true}).selectOption('central');await page.getByRole('button',{name:'開始編列',exact:true}).click();
  await expect(page.locator('.workspace-sheet')).toContainText('聯訂預算');await page.getByRole('button',{name:/建立新草稿/}).click();
  const created=await page.evaluate(()=>{const s=JSON.parse(sessionStorage.getItem('hotel-budget-anonymous-demo-v1')!);return s.versions[s.versions.length-1];});expect(created.kind).toBe('central');
});

test('手機比較欄寬、置中說明與純文字底列',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('./');await page.getByLabel('首頁編列來源',{exact:true}).selectOption('finance');await page.getByRole('button',{name:'財務比較',exact:true}).click();
  const grid=page.getByRole('region',{name:'版本財務指標對照',exact:true});await expect(grid).toBeVisible();
  const label=grid.locator('tbody th').first(),box=(await label.boundingBox())!;expect(box.width).toBeLessThan(110);
  await grid.evaluate(e=>e.scrollLeft=e.scrollWidth);expect((await label.boundingBox())!.width).toBeLessThan(110);
  const sheet=page.locator('.workspace-sheet');expect(await sheet.evaluate(e=>({bg:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderBottomWidth,radius:getComputedStyle(e).borderRadius}))).toEqual({bg:'rgba(0, 0, 0, 0)',border:'0px',radius:'0px'});
  await page.getByLabel('來源版本',{exact:true}).selectOption('1');await page.getByRole('button',{name:/建立財務調整草稿/}).click();await expect(page.getByLabel('財務調整操作流程',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'房間數與可售房晚設定',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'房間數與可售房晚設定',exact:true});await expect(dialog).toBeVisible();
  const centered=(await dialog.boundingBox())!;expect(centered.x).toBeGreaterThanOrEqual(10);expect(centered.x+centered.width).toBeLessThanOrEqual(380);expect(Math.abs(centered.y+centered.height/2-422)).toBeLessThan(2);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByLabel('房間數',{exact:true})).toBeHidden();
  await page.getByRole('button',{name:'開啟工作選單',exact:true}).click();
  await page.getByRole('button',{name:'版本說明',exact:true}).click();await expect(page.getByRole('dialog',{name:'版本說明',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'工作範圍與編列版本',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'關閉工作選單',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
