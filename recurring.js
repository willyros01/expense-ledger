/* Expense Ledger recurrence dates. Calendar arithmetic uses UTC date-only values,
   while today() uses the device's local calendar date. Posting is coordinated by the app while it is open. */
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
  // Firestore sorts map keys. Compare the flat schedule's field values rather
  // than JSON insertion order; still reject changed, missing or added fields.
  function sameSchedule(a,b){
    if(a==null||b==null)return a==null&&b==null;
    const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
    return ak.length===bk.length&&ak.every((key,i)=>key===bk[i]&&a[key]===b[key]);
  }
  function occurrenceId(rootId,due){date(due);return 'repeat-'+rootId+'-'+due;}
  function advance(root,due){
    if(!root||!active(root.recurrence)||root.recurrence.nextDate!==due)throw Error('This scheduled date has already been posted or the schedule changed. Reopen it from History.');
    return {...root,recurrence:{...root.recurrence,lastDate:due,nextDate:next(root.recurrence,due)}};
  }
  function edited(old,s,enabled){
    validate(s);
    // A date/frequency change starts the new cadence after the latest posted
    // scheduled date, so it cannot re-offer already processed dates.
    const unchanged=old&&old.anchor===s.anchor&&old.unit===s.unit&&old.every===s.every;
    const after=old&&old.lastDate>s.anchor?old.lastDate:s.anchor;
    return {...s,enabled:!!enabled,lastDate:old&&old.lastDate||s.anchor,nextDate:unchanged&&old.nextDate?old.nextDate:next(s,after)};
  }
  function autoPost(root,due,quote,existing,now=Date.now()){
    const advanced=advance(root,due);
    if(!quote||quote.currency!==root.currency||!Number.isFinite(quote.rate)||quote.rate<=0)
      throw Error('The currency changed or its exchange rate is invalid.');
    if(!Number.isFinite(root.amount)||root.amount<=0)throw Error('Edit the recurring expense to correct its amount.');
    const id=occurrenceId(root.id,due);
    // Restore/import can leave a previously posted occurrence alongside an older
    // nextDate. Advance that pointer without overwriting the historical expense.
    const entry=existing?null:{id,date:due,amount:root.amount,currency:root.currency,vendor:root.vendor,
      category:root.category,comments:root.comments||'',submittedBy:root.submittedBy||'',receipt:null,
      amountCAD:root.amount*quote.rate,rate:quote.rate,rateDate:quote.usedDate,rateSource:quote.source,
      status:'Pending',approvedBy:null,approvedAt:null,createdAt:now,updatedAt:now,
      recurrenceId:root.id,scheduledDate:due,autoPosted:true};
    return {root:{...advanced,updatedAt:now},entry};
  }
  async function catchUp(roots,cutoff,{quote,post,keepGoing=()=>true,limit=50}){
    date(cutoff);
    let posted=0,steps=0,more=false;const errors=[];
    for(let root of roots){
      try {
        while(root&&active(root.recurrence)&&root.recurrence.nextDate<=cutoff){
          if(!keepGoing()||steps>=limit){more=true;break;}
          const due=root.recurrence.nextDate;
          const rate=await quote(root.currency,due);
          if(!keepGoing()){more=true;break;}
          const result=await post(root.id,due,rate);
          steps++;posted+=result.posted||0;
          const previous=root;root=result.root;
          if(root&&active(root.recurrence)&&root.recurrence.nextDate===due&&root.currency===previous.currency)
            throw Error('The recurring schedule could not advance.');
        }
      } catch(e){errors.push(e.message||'Recurring expense could not be posted.');}
    }
    return {posted,more,errors};
  }
  return {today,date,spec,preset,next,label,active,sameSchedule,occurrenceId,advance,edited,autoPost,catchUp};
});
