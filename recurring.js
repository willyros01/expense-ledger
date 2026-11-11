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
    if(a===b)return true;
    if(typeof a!=="object"||typeof b!=="object"||Array.isArray(a)!==Array.isArray(b))return false;
    const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
    return ak.length===bk.length&&ak.every((key,i)=>key===bk[i]&&sameSchedule(a[key],b[key]));
  }
  function template(root){return root.recurrence&&root.recurrence.template||root;}
  function templateFields(entry){
    if(!Number.isFinite(entry.amount)||entry.amount<=0||typeof entry.currency!=="string"||!/^[A-Z]{3}$/.test(entry.currency)||typeof entry.vendor!=="string"||!entry.vendor.trim())
      throw Error("Enter a valid amount, currency and vendor for future expenses.");
    return {amount:entry.amount,currency:entry.currency,vendor:entry.vendor,category:entry.category||"Other",comments:entry.comments||"",submittedBy:entry.submittedBy||""};
  }
  function latestId(root,existingIds){
    if(!root||!root.recurrence)return null;
    if(root.recurrence.latestId)return root.recurrence.latestId;
    const candidate=occurrenceId(root.id,root.recurrence.lastDate||root.recurrence.anchor);
    if(existingIds&&existingIds.has(candidate))return candidate;
    return root.recurrence.lastDate>root.date?candidate:root.id;
  }
  function latestSchedule(root,entry,previous,spec,enabled){
    validate(spec);date(entry.date);
    const old=root.recurrence;
    const changed=entry.date!==previous.date||spec.unit!==old.unit||spec.every!==old.every;
    const cadence={unit:spec.unit,every:spec.every,anchor:changed?entry.date:old.anchor};
    const after=old.lastDate>entry.date?old.lastDate:entry.date;
    return {...old,...cadence,enabled:!!enabled,latestId:entry.id,template:templateFields(entry),
      nextDate:changed?next(cadence,after):old.nextDate};
  }
  function seriesEdit(root,entry,previous,expectedSchedule,wasLatest,spec,enabled,existingIds){
    if(!root||!root.recurrence)throw Error("The recurring schedule was removed. Reopen the expense.");
    const isLatest=latestId(root,existingIds)===entry.id;
    if(isLatest!==wasLatest || (wasLatest&&!sameSchedule(root.recurrence,expectedSchedule)))
      throw Error("A newer occurrence or schedule change was saved. Reopen the expense before changing future postings.");
    if(!isLatest){
      // An original expense may now be historical. Freeze its old defaults before
      // changing its recorded fields so that this edit cannot alter the future.
      const record=root.id===entry.id?{...entry,recurrence:{...root.recurrence,template:templateFields(template(root))}}:{...entry};
      if(root.id!==entry.id)delete record.recurrence;
      return [record];
    }
    const recurrence=latestSchedule(root,entry,previous,spec,enabled);
    if(root.id===entry.id)return [{...entry,recurrence}];
    const record={...entry};delete record.recurrence;
    return [{...root,recurrence,updatedAt:entry.updatedAt},record];
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
    const defaults=template(root);
    if(!quote||quote.currency!==defaults.currency||!Number.isFinite(quote.rate)||quote.rate<=0)
      throw Error('The currency changed or its exchange rate is invalid.');
    if(!Number.isFinite(defaults.amount)||defaults.amount<=0)throw Error('Edit the recurring expense to correct its amount.');
    const id=occurrenceId(root.id,due);
    // Restore/import can leave a previously posted occurrence alongside an older
    // nextDate. Advance that pointer without overwriting the historical expense.
    const entry=existing?null:{id,date:due,amount:defaults.amount,currency:defaults.currency,vendor:defaults.vendor,
      category:defaults.category,comments:defaults.comments||'',submittedBy:defaults.submittedBy||'',receipt:null,
      amountCAD:defaults.amount*quote.rate,rate:quote.rate,rateDate:quote.usedDate,rateSource:quote.source,
      status:'Pending',approvedBy:null,approvedAt:null,createdAt:now,updatedAt:now,
      recurrenceId:root.id,scheduledDate:due,autoPosted:true};
    return {root:{...advanced,recurrence:{...advanced.recurrence,latestId:id},updatedAt:now},entry};
  }
  async function catchUp(roots,cutoff,{quote,post,keepGoing=()=>true,limit=50}){
    date(cutoff);
    let posted=0,steps=0,more=false;const errors=[];
    for(let root of roots){
      try {
        while(root&&active(root.recurrence)&&root.recurrence.nextDate<=cutoff){
          if(!keepGoing()||steps>=limit){more=true;break;}
          const due=root.recurrence.nextDate;
          const rate=await quote(template(root).currency,due);
          if(!keepGoing()){more=true;break;}
          const result=await post(root.id,due,rate);
          steps++;posted+=result.posted||0;
          const previous=root;root=result.root;
          if(root&&active(root.recurrence)&&root.recurrence.nextDate===due&&template(root).currency===template(previous).currency)
            throw Error('The recurring schedule could not advance.');
        }
      } catch(e){errors.push(e.message||'Recurring expense could not be posted.');}
    }
    return {posted,more,errors};
  }
  return {today,date,spec,preset,next,label,active,sameSchedule,template,templateFields,latestId,latestSchedule,seriesEdit,occurrenceId,advance,edited,autoPost,catchUp};
});
