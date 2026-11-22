/**
 * Deterministic school-level fraction helper.
 * No evaluation of arbitrary expressions; only small explicit integer fractions.
 */
const MAX = 1000000;
function fraction(a,b) {
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||Math.abs(a)>MAX||Math.abs(b)>MAX||b===0) return null;
  const sign = b < 0 ? -1 : 1;
  return {a:a*sign,b:b*sign};
}
function gcd(a,b) {
  a=Math.abs(a);b=Math.abs(b);
  while(b){const t=a%b;a=b;b=t}
  return a||1;
}
function decimalWithComma(n,scale) {
  const sign=n<0?'-':'';
  let d=String(Math.abs(n)).padStart(scale+1,'0');
  return sign + (scale ? d.slice(0,-scale)+','+d.slice(-scale).replace(/0+$/,'') : d);
}
export function explainDecimalFraction(numerator,denominator) {
  const original=fraction(numerator,denominator);
  if(!original) return null;
  const {a,b}=original;
  let reducedA=a,reducedB=b;
  const div=gcd(a,b);
  reducedA/=div;reducedB/=div;
  let rest=reducedB,twos=0,fives=0;
  while(rest%2===0){rest/=2;twos++}
  while(rest%5===0){rest/=5;fives++}
  if(rest!==1) return {
    exact:a+'/'+b,
    terminates:false,
    text:'Знаменатель после сокращения содержит простой множитель, отличный от 2 и 5. Поэтому домножением нельзя получить знаменатель вида 10, 100, 1000, …; десятичная запись будет бесконечной периодической.'
  };
  const scale=Math.max(twos,fives);
  if(scale>9) return null;
  const base=10**scale, factor=base/reducedB;
  const product=reducedA*factor;
  if(!Number.isSafeInteger(product)||Math.abs(product)>1e12) return null;
  const decimal=decimalWithComma(product,scale);
  const reduceText=div>1
    ? a+'/'+b+' = '+reducedA+'/'+reducedB+' (сократим числитель и знаменатель на '+div+'). '
    : '';
  const explanatory='Подбираем знаменатель '+base+': '+reducedB+' × '+factor+' = '+base+'. '+reduceText+
    'Домножаем И ЧИСЛИТЕЛЬ, И ЗНАМЕНАТЕЛЬ на '+factor+', чтобы значение дроби сохранилось.';
  return {
    exact:a+'/'+b,
    reduced:reducedA+'/'+reducedB,
    terminates:true,
    factor,base,
    decimal,
    step:{
      title:'Подробно переводим дробь '+a+'/'+b+' в десятичную',
      text:explanatory,
      formula:'a/b = (a × k)/(b × k)',
      symbols:'a — числитель ('+reducedA+'), b — знаменатель ('+reducedB+'), k — дополнительный множитель ('+factor+').',
      substitution:reducedA+'/'+reducedB+' = ('+reducedA+' × '+factor+')/('+reducedB+' × '+factor+')',
      calculation:product+'/'+base+' = '+decimal
    }
  };
}
export function explainNestedFraction(n1,d1,n2,d2) {
  const left=fraction(n1,d1),right=fraction(n2,d2);
  if(!left||!right||right.a===0) return null;
  const p=left.a*right.b,q=left.b*right.a;
  if(!Number.isSafeInteger(p)||!Number.isSafeInteger(q)||q===0) return null;
  const divisor=gcd(p,q),negative=q<0?-1:1;
  const a=(p/divisor)*negative,b=(q/divisor)*negative;
  if(Math.abs(a)>1e9||Math.abs(b)>1e9)return null;
  const divisorSteps={
    title:'Преобразуем двухэтажную дробь',
    text:'Дробная черта между двумя дробями означает деление. Деление на ненулевую дробь заменяем умножением на обратную, затем сокращаем результат.',
    formula:'(a/b) ÷ (c/d) = (a/b) × (d/c) = (a × d)/(b × c)',
    symbols:'a='+left.a+', b='+left.b+', c='+right.a+', d='+right.b+'; c ≠ 0.',
    substitution:'('+left.a+'/'+left.b+') ÷ ('+right.a+'/'+right.b+') = ('+left.a+'/'+left.b+') × ('+right.b+'/'+right.a+')',
    calculation:p+'/'+q+(divisor>1?' = '+a+'/'+b:'')
  };
  return {value:a+'/'+b,step:divisorSteps,decimal:explainDecimalFraction(a,b)};
}
export function fractionHelpForProblem(problem) {
  const input=String(problem||'').slice(0,4000);
  const nested=input.match(/\(\s*([+-]?\d{1,6})\s*\/\s*([+-]?\d{1,6})\s*\)\s*(?:\/|÷|:)\s*\(\s*([+-]?\d{1,6})\s*\/\s*([+-]?\d{1,6})\s*\)/);
  if(nested){
    const x=explainNestedFraction(...nested.slice(1).map(Number));
    if(!x)return '';
    return 'Проверенное преобразование явно указанной двухэтажной дроби: '+
      x.step.substitution+'; '+x.step.calculation+'; итог '+x.value+'. '+
      (x.decimal?.terminates?'Десятичная запись: '+x.decimal.step.substitution+'; '+x.decimal.step.calculation+'.':'')+
      ' Не пропускай правило умножения на обратную дробь.';
  }
  return '';
}
export function appendFractionWorking(solution) {
  if(!solution||solution.needs_clarification||!Array.isArray(solution.steps)||!solution.answer) return solution;
  const answer=String(solution.answer);
  // Only append a complete conversion if the answer explicitly contains a numerical fraction.
  const matches=[...answer.matchAll(/(^|[^\d])([+-]?\d{1,6})\s*\/\s*(\d{1,6})(?![\d/])/g)];
  let chosen=null;
  if(matches.length===1) chosen=[Number(matches[0][2]),Number(matches[0][3])];
  if(!chosen&&matches.length===0){
    const expression=solution.steps.map(x=>[x.formula,x.substitution,x.calculation].join(' ')).join('\n');
    const raw=[...expression.matchAll(/(^|[^\d])([+-]?\d{1,6})\s*\/\s*(\d{1,6})(?![\d/])/g)];
    const hits=[];
    for(const m of raw.slice(0,45)){
      const n=Number(m[2]),d=Number(m[3]);
      const check=explainDecimalFraction(n,d);
      if(check?.terminates && check.decimal.includes(',') && answer.replace(/\./g,',').includes(check.decimal))
        if(!hits.some(x=>x[0]*d===n*x[1]))hits.push([n,d]);
    }
    if(hits.length===1)chosen=hits[0];
  }
  if(!chosen) return solution;
  const worked=explainDecimalFraction(chosen[0],chosen[1]);
  if(!worked?.terminates||worked.factor===1&&worked.base===1) return solution;
  const content=solution.steps.map(x=>[x.formula,x.text,x.substitution,x.calculation].join(' ')).join(' ');
  // Do not repeat if the AI has already shown this same rational-to-decimal expansion.
  const multiplierPattern=new RegExp('(?:×|\\*|x)\\s*'+worked.factor+'\\b');
  if(multiplierPattern.test(content) && (content.includes(String(worked.base))||content.includes(worked.decimal)))return solution;
  if(solution.steps.length>=12)return solution;
  solution.steps.push(worked.step);
  return solution;
}
