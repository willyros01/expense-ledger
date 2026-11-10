/* Expense Ledger recurrence dates. Calendar arithmetic uses UTC date-only values,
   while today() uses the device's local calendar date. No timers post expenses. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.Recurring=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DAY=86400000;
  const presets={daily:['days',1],weekly:['weeks',1],fortnightly:['weeks',2],monthly:['months',1],quarterly:['months',3],yearly:['years',1]};
  function date(s){
    if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('Pick a valid date.');
    const d=new Date(s+'T12:00:00Z');
    if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s||Number(s.slice(0,4))<1900) throw Error('Pick a valid date from 1900 onwards.');
    return d;
  }
  function str(d){const s=d.toISOString().slice(0,10);if(!/^\d{4}-/.test(s))throw Error('The next due date is beyond the supported calendar.');return s;}
  function today(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function validate(s){
    if(!s||!['days','weeks','months','years'].includes(s.unit)||!Number.isInteger(s.every)||s.every<1||s.every>999) throw Error('Repeat every must be a whole number from 1 to 999.');
    date(s.anchor);
    return s;
  }
  function spec(frequency,every,unit,anchor){const p=presets[frequency];return validate({unit:p?p[0]:unit,every:p?p[1]:Number(every),anchor});}
  function preset(s){return Object.keys(presets).find(k=>presets[k][0]===s.unit&&presets[k][1]===s.every)||'custom';}
  function next(s,after){
    validate(s);const a=date(s.anchor),b=date(after);
    if(+b<+a)return s.anchor;
    if(s.unit==='days'||s.unit==='weeks'){
      const step=s.every*(s.unit==='weeks'?7:1)*DAY;
      return str(new Date(+a+(Math.floor((+b-+a)/step)+1)*step));
    }
    const step=s.every*(s.unit==='years'?12:1),origin=a.getUTCFullYear()*12+a.getUTCMonth();
    let n=Math.max(1,Math.floor((b.getUTCFullYear()*12+b.getUTCMonth()-origin)/step));
    function occurrence(k){const total=origin+k*step,y=Math.floor(total/12),m=total%12;if(y>9999)throw Error('The next due date is beyond the supported calendar.');return new Date(Date.UTC(y,m,Math.min(a.getUTCDate(),new Date(Date.UTC(y,m+1,0)).getUTCDate()),12));}
    let d=occurrence(n);if(+d<=+b)d=occurrence(n+1);
    return str(d);
  }
  function label(s){try{validate(s);return s.every===1?'Every '+({days:'day',weeks:'week',months:'month',years:'year'}[s.unit]):'Every '+s.every+' '+s.unit;}catch(e){return 'Invalid schedule — edit to fix';}}
  function active(s){try{validate(s);date(s.nextDate);return s.enabled===true;}catch(e){return false;}}
  function occurrenceId(rootId,due){date(due);return 'repeat-'+rootId+'-'+due;}
  function advance(root,due){
    if(!root||!active(root.recurrence)||root.recurrence.nextDate!==due)throw Error('This scheduled date has already been reviewed or the schedule changed. Reopen it from History.');
    return {...root,recurrence:{...root.recurrence,lastDate:due,nextDate:next(root.recurrence,due)}};
  }
  function edited(old,s,enabled){
    validate(s);
    // A date/frequency change starts the new cadence after the latest reviewed
    // scheduled date, so it cannot re-offer already processed dates.
    const unchanged=old&&old.anchor===s.anchor&&old.unit===s.unit&&old.every===s.every;
    const after=old&&old.lastDate>s.anchor?old.lastDate:s.anchor;
    return {...s,enabled:!!enabled,lastDate:old&&old.lastDate||s.anchor,nextDate:unchanged&&old.nextDate?old.nextDate:next(s,after)};
  }
  return {today,date,spec,preset,next,label,active,occurrenceId,advance,edited};
});
