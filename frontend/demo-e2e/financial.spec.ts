import {test,expect} from '@playwright/test';
import {seed,amount,money,roundedDivide,calculate,summary,inventory,Version} from '../src/demo/model';

test('Decimal 口徑：半入、零房晚、精確 REV 反推及非有限數值拒絕',()=>{
  expect(money(roundedDivide(1005n,2n))).toBe('0.503');
  expect(calculate({month:1,channel:'Retail:官網',rn:3,ahr:'2.675'}).rev).toBe('8.025');
  expect(calculate({month:1,channel:'Retail:官網',rn:0,target_rev:'0'}).ahr).toBe('0.000');
  expect(()=>calculate({month:1,channel:'Retail:官網',rn:0,target_rev:'1'})).toThrow();
  expect(()=>calculate({month:1,channel:'Retail:官網',rn:3,target_rev:'10'})).toThrow('精確回算');
  for(const value of ['NaN','Infinity','-1','1.0001','1e9'])expect(()=>amount(value)).toThrow();
});

test('年度指標用加總分母重新計算；含稅收入除以 1.05',()=>{
  const state=seed(),h=state.hotels[0];h.room_count=100;
  state.inventory['1/2027']=inventory(state,h,2027).map(i=>i.month<=2?i:{...i,unavailable:i.days*100,available:0});
  const v:Version={id:999,hotel_id:1,year:2027,kind:'hotel',status:'draft',revision:0,created_by:'DEMO_VISITOR',source_id:null,
    lines:[calculate({month:1,channel:'Retail:官網',rn:1,ahr:'100'}),calculate({month:2,channel:'Retail:官網',rn:9,ahr:'200'})]};
  const result=summary(state,v);
  expect(result.annual).toMatchObject({rn:10,rev:'1900.000',available:5900,adr:'190.000',occ_pct:'0.169',revpar:'0.322'});
  expect(result.net_revenue).toBe('1809.524');
});
