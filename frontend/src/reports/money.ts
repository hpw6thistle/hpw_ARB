/** Signed thousandths; reports never round-trip money through floating point. */
export function amount(value:unknown):bigint {
  const text=String(value);
  if(!/^-?\d{1,24}(?:\.\d{1,3})?$/.test(text))throw new Error('金額須為數字、最多三位小數');
  const negative=text.startsWith('-'),[whole,fraction='']=text.replace(/^-/,'').split('.');
  const n=BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));
  return negative?-n:n;
}
export function money(n:bigint):string {const v=n<0n?-n:n;return (n<0n?'-':'')+v/1000n+'.'+(v%1000n).toString().padStart(3,'0');}
export function divide(n:bigint,d:bigint):bigint {if(d<=0n)throw new Error('分母必須大於零');const v=n<0n?-n:n;const r=(v*2n+d)/(d*2n);return n<0n?-r:r;}
export function fmt(value:string|number|null|undefined,percent=false):string {
  if(value==null)return '—';
  const [whole,fraction]=String(value).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction===undefined?'':'.'+fraction)+(percent?'%':'');
}
