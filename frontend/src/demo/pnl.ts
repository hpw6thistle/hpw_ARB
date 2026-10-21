import {PnlLedger} from '../reports/pnl';
import {amount,money,divide} from '../reports/money';
import {Line} from './model';
/** Independent examples generated from synthetic source revenue, never workbook values. */
export function syntheticLedger(lines:Line[]):PnlLedger {
  const values:Record<string,string>={};
  const factors:Record<string,number>={'5000101':6,'6000101':25,'6000105':2,'6000106':2,'6000107':2,'6120102':8,'6200201':4,'6320102':12,'6300101':3,'4269901':1};
  for(let month=1;month<=12;month++){
    const gross=lines.filter(l=>l.month===month).reduce((n,l)=>n+amount(l.rev),0n),net=divide(gross*100n,105n);
    for(const [code,factor] of Object.entries(factors))values[month+'/'+code]=money(divide(net*BigInt(factor),100n));
  }
  return {values,tax_mode:'source_excel',baseline_values:{...values},baseline_tax_mode:'source_excel'};
}
