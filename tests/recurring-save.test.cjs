const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const R=require('../recurring.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const fn=source.slice(source.indexOf('  async function saveRecurringEntry('),source.indexOf('\n  const writeCategories'));
function setup(cloud=false){let entries=[{id:'root',date:'2026-11-01',amount:50,currency:'CAD',vendor:'Test vendor',category:'Utilities',receipt:'original-photo',recurrence:{anchor:'2026-11-01',every:1,unit:'days',enabled:true,lastDate:'2026-11-01',nextDate:'2026-11-02'}}],fail=false,writes=0;const refs={current:structuredClone(entries)};let chain=Promise.resolve();
 const db={collection:()=>({doc:id=>({id})}),runTransaction:cb=>{const op=chain.then(async()=>{const pending=new Map();const result=await cb({get:async ref=>({exists:entries.some(x=>x.id===ref.id),data:()=>{const row=structuredClone(entries.find(x=>x.id===ref.id));if(row&&row.recurrence)row.recurrence=Object.fromEntries(Object.entries(row.recurrence).sort(([a],[b])=>a.localeCompare(b)));return row;}}),set:(ref,v)=>pending.set(ref.id,v)});if(fail)throw Error('permission-denied');entries=entries.filter(x=>!pending.has(x.id)).concat([...pending.values()]);writes++;return result;});chain=op.catch(()=>{});return op;}};
 const api=Function('useCloud','navigator','db','Recurring','entriesRef','save','load','normalizeEntry','LS','setEntries',fn+';return {edit:saveRecurringEntry,post:postRecurringExpense,series:saveSeriesEntry};')(cloud,{onLine:true},db,R,refs,(_k,value)=>{if(fail)return false;entries=structuredClone(value);writes++;return true;},()=>structuredClone(entries),x=>x,{expenses:'test'},value=>{entries=structuredClone(value)});
 return {...api,root:()=>entries.find(x=>x.id==='root'),entries:()=>entries,writes:()=>writes,fail:()=>{fail=true;},recover:()=>{fail=false;},setEntries:list=>{entries=structuredClone(list);refs.current=structuredClone(list);},refs};}
const quote={currency:'CAD',rate:1,usedDate:'2026-11-02',source:'exact'};
for(const cloud of [false,true]){
 test((cloud?'cloud':'local')+' automatically posts once and advances atomically',async()=>{const t=setup(cloud);const first=await t.post('root','2026-11-02',quote);assert.equal(first.posted,1);assert.equal(t.entries().length,2);assert.equal(t.root().recurrence.nextDate,'2026-11-03');const added=t.entries().find(x=>x.recurrenceId);assert.equal(added.amount,50);assert.equal(added.receipt,null);assert.equal(added.autoPosted,true);assert.equal(t.root().receipt,'original-photo');assert.equal((await t.post('root','2026-11-02',quote)).posted,0);assert.equal(t.entries().length,2);});
 test((cloud?'cloud':'local')+' failure leaves occurrence and next date unchanged; later retry succeeds',async()=>{const t=setup(cloud);t.fail();await assert.rejects(t.post('root','2026-11-02',quote));assert.equal(t.entries().length,1);assert.equal(t.root().recurrence.nextDate,'2026-11-02');t.recover();assert.equal((await t.post('root','2026-11-02',quote)).posted,1);});
 test((cloud?'cloud':'local')+' disabled schedules and deleted originals never post',async()=>{const t=setup(cloud),old=structuredClone(t.root());await t.edit({...old,recurrence:{...old.recurrence,enabled:false}},old);assert.equal((await t.post('root','2026-11-02',quote)).posted,0);assert.equal((await t.post('deleted','2026-11-02',quote)).posted,0);assert.equal(t.entries().length,1);});
 test((cloud?'cloud':'local')+' stale currency quote is retried without using the wrong rate',async()=>{const t=setup(cloud);const result=await t.post('root','2026-11-02',{...quote,currency:'USD',rate:1.4});assert.equal(result.posted,0);assert.equal(t.root().recurrence.nextDate,'2026-11-02');});
 test((cloud?'cloud':'local')+' an existing occurrence is preserved while an imported old pointer advances',async()=>{const t=setup(cloud);t.setEntries(t.entries().concat({id:R.occurrenceId('root','2026-11-02'),amount:99,receipt:'unique-photo'}));assert.equal((await t.post('root','2026-11-02',quote)).posted,0);assert.equal(t.root().recurrence.nextDate,'2026-11-03');assert.equal(t.entries().find(x=>x.id.startsWith('repeat-')).amount,99);});
 test((cloud?'cloud':'local')+' unchecking recurring accepts reordered map fields and preserves recorded entries',async()=>{const t=setup(cloud),old=structuredClone(t.root());await t.edit({...old,recurrence:{...old.recurrence,enabled:false}},old);assert.equal(t.root().recurrence.enabled,false);assert.equal(t.root().amount,50);assert.equal(t.entries().length,1);});
 test((cloud?'cloud':'local')+' editing a genuinely changed schedule is rejected',async()=>{const t=setup(cloud),old=structuredClone(t.root());await t.post('root','2026-11-02',quote);await assert.rejects(t.edit({...old,amount:80},old),/changed/);assert.equal(t.root().recurrence.nextDate,'2026-11-03');});
}
test('two simultaneous cloud runs post one occurrence',async()=>{const t=setup(true);const results=await Promise.all([t.post('root','2026-11-02',quote),t.post('root','2026-11-02',quote)]);assert.equal(results.reduce((n,x)=>n+x.posted,0),1);assert.equal(t.entries().length,2);});
test('catch-up posts all missed dates; repeated opens add nothing extra',async()=>{const t=setup(true);const run=()=>R.catchUp([t.root()],'2026-11-05',{quote:async(currency,date)=>({...quote,currency,usedDate:date}),post:t.post});assert.equal((await run()).posted,4);assert.equal(t.root().recurrence.nextDate,'2026-11-06');assert.equal(t.entries().length,5);assert.equal((await run()).posted,0);});
test('catch-up chunks long gaps and continues without losing dates',async()=>{const t=setup(false);const options={quote:async()=>quote,post:t.post,limit:2};let r=await R.catchUp([t.root()],'2026-11-05',options);assert.equal(r.posted,2);assert.equal(r.more,true);r=await R.catchUp([t.root()],'2026-11-05',options);assert.equal(r.posted,2);assert.equal(t.entries().length,5);});
test('catch-up yields before posting when an edit or disconnect interrupts rate lookup',async()=>{const t=setup(true);let allowed=true;const r=await R.catchUp([t.root()],'2026-11-05',{quote:async()=>{allowed=false;return quote;},post:t.post,keepGoing:()=>allowed});assert.equal(r.posted,0);assert.equal(r.more,true);assert.equal(t.entries().length,1);});
const metaFn=source.slice(source.indexOf('  function recurringExport('),source.indexOf('\n  async function handleImportFile('));
const meta=Function('Recurring',metaFn+';return {encode:recurringExport,decode:recurringImport};')(R);
test('export/import preserves cadence and automatically posted occurrence identities',()=>{const root={id:'backup-root',recurrence:{anchor:'2026-01-31',unit:'months',every:2,enabled:false,lastDate:'2026-03-31',nextDate:'2026-05-31'}};assert.deepEqual(meta.decode(meta.encode(root)),root);const child={id:R.occurrenceId('root','2026-11-02'),recurrenceId:'root',scheduledDate:'2026-11-02'};const decoded=meta.decode(meta.encode(child));assert.equal(decoded.id,child.id);assert.equal(decoded.recurrenceId,child.recurrenceId);assert.throws(()=>meta.decode('{bad}'));assert.throws(()=>meta.decode(JSON.stringify({...child,id:'wrong'})));});
test('ordinary cloud edits preserve recurrence progress advanced on another device',async()=>{const a=source.indexOf('  const batchWriteEntries = useCallback('),b=source.indexOf('\n  const writeEntry',a);const code=source.slice(a,b);let stored={id:'root',status:'Pending',recurrence:{nextDate:'2026-11-06'}};const old={id:'root',status:'Approved',recurrence:{nextDate:'2026-11-02'}};const refs={current:[old]};const db={collection:()=>({doc:id=>({id})}),batch:()=>({set:(_ref,fields,opts)=>{stored=opts&&opts.merge?{...stored,...fields}:fields;},commit:async()=>{}})};const write=Function('useCallback','useCloud','db','entriesRef','showToast','save','LS','setEntries',code+';return batchWriteEntries;')(fn=>fn,true,db,refs,()=>{},()=>true,{},()=>{});await write([old]);assert.equal(stored.status,'Approved');assert.equal(stored.recurrence.nextDate,'2026-11-06');});

for(const cloud of [false,true]){
 test((cloud?'cloud':'local')+' latest amount/date/frequency update one template and preserve all earlier fields',async()=>{
  const t=setup(cloud);await t.post('root','2026-11-02',quote);await t.post('root','2026-11-03',quote);
  const before=structuredClone(t.entries()),root=structuredClone(t.root()),record=before.find(x=>x.id===root.recurrence.latestId);
  const context={root,record,latest:true};
  const edited={...record,amount:70,amountCAD:70,date:'2026-11-04',updatedAt:100};
  await t.series(edited,context,{spec:R.spec('fortnightly',2,'weeks',edited.date),enabled:true});
  assert.equal(t.root().amount,50);assert.equal(t.root().date,root.date);
  assert.deepEqual(t.entries().find(x=>x.id===R.occurrenceId('root','2026-11-02')),before.find(x=>x.id===R.occurrenceId('root','2026-11-02')));
  assert.equal(t.root().recurrence.nextDate,'2026-11-18');assert.equal(t.root().recurrence.template.amount,70);
  assert.equal(t.entries().filter(x=>x.recurrence).length,1);
  await t.post('root','2026-11-18',quote);
  const future=t.entries().find(x=>x.id===R.occurrenceId('root','2026-11-18'));
  assert.equal(future.amount,70);assert.equal(future.date,'2026-11-18');assert.equal(t.root().recurrence.latestId,future.id);
 });
 test((cloud?'cloud':'local')+' editing an older original does not change future defaults',async()=>{
  const t=setup(cloud);await t.post('root','2026-11-02',quote);const root=structuredClone(t.root());
  await t.series({...root,amount:99,date:'2026-10-30'}, {root,record:root,latest:false},{spec:R.spec('daily',1,'days',root.date),enabled:true});
  assert.equal(t.root().amount,99);assert.equal(R.template(t.root()).amount,50);
  await t.post('root','2026-11-03',quote);assert.equal(t.entries().find(x=>x.id===R.occurrenceId('root','2026-11-03')).amount,50);
 });
 test((cloud?'cloud':'local')+' latest occurrence can stop the single schedule without creating another',async()=>{
  const t=setup(cloud);await t.post('root','2026-11-02',quote);const root=structuredClone(t.root()),record=structuredClone(t.entries().find(x=>x.id===root.recurrence.latestId));
  await t.series(record,{root,record,latest:true},{spec:R.spec('daily',1,'days',record.date),enabled:false});
  assert.equal(t.root().recurrence.enabled,false);assert.equal(t.entries().filter(x=>x.recurrence).length,1);
  assert.equal((await t.post('root','2026-11-03',quote)).posted,0);
 });
 test((cloud?'cloud':'local')+' stale latest editor is rejected after a newer posting',async()=>{
  const t=setup(cloud);await t.post('root','2026-11-02',quote);const root=structuredClone(t.root()),record=structuredClone(t.entries().find(x=>x.id===root.recurrence.latestId));
  await t.post('root','2026-11-03',quote);
  await assert.rejects(t.series({...record,amount:90},{root,record,latest:true},{spec:R.spec('daily',1,'days',record.date),enabled:true}),/newer/);
  assert.equal(t.entries().find(x=>x.id===record.id).amount,50);assert.equal(R.template(t.root()).amount,50);
 });
 test((cloud?'cloud':'local')+' failed latest edit changes neither the occurrence nor the template',async()=>{
  const t=setup(cloud);await t.post('root','2026-11-02',quote);const before=structuredClone(t.entries()),root=structuredClone(t.root()),record=structuredClone(t.entries().find(x=>x.id===root.recurrence.latestId));t.fail();
  await assert.rejects(t.series({...record,amount:90},{root,record,latest:true},{spec:R.spec('daily',1,'days',record.date),enabled:true}));
  assert.deepEqual(t.entries(),before);
 });
 test((cloud?'cloud':'local')+' future currency comes from the latest template while historical currency stays intact',async()=>{
  const t=setup(cloud);await t.post('root','2026-11-02',quote);const root=structuredClone(t.root()),record=structuredClone(t.entries().find(x=>x.id===root.recurrence.latestId));
  await t.series({...record,currency:'USD',amount:60},{root,record,latest:true},{spec:R.spec('daily',1,'days',record.date),enabled:true});
  assert.equal(t.root().currency,'CAD');assert.equal(R.template(t.root()).currency,'USD');
  await t.post('root','2026-11-03',{...quote,currency:'USD',rate:1.5});assert.equal(t.entries().find(x=>x.id===R.occurrenceId('root','2026-11-03')).amountCAD,90);
 });
}
test('latest amount-only edit preserves monthly day 31 through February',()=>{
 const root={id:'r',date:'2027-01-31',currency:'CAD',amount:20,vendor:'Vendor',recurrence:{...R.spec('monthly',1,'months','2027-01-31'),enabled:true,lastDate:'2027-02-28',nextDate:'2027-03-31',latestId:'feb'}};
 const old={id:'feb',date:'2027-02-28',amount:20,currency:'CAD',vendor:'Vendor'},changed={...old,amount:30};
 const updates=R.seriesEdit(root,changed,old,root.recurrence,true,R.spec('monthly',1,'months',old.date),true,new Set(['feb']));
 assert.equal(updates[0].recurrence.anchor,'2027-01-31');assert.equal(updates[0].recurrence.nextDate,'2027-03-31');
});
test('nested template map equality ignores Firestore field order',()=>{const a={enabled:true,template:{amount:20,currency:'CAD',vendor:'V'}},b={template:{vendor:'V',currency:'CAD',amount:20},enabled:true};assert.equal(R.sameSchedule(a,b),true);assert.equal(R.sameSchedule(a,{...b,template:{...b.template,amount:21}}),false);});
test('schedule export/import retains the latest template and latest occurrence link',()=>{const root={id:'r',recurrence:{...R.spec('monthly',1,'months','2026-11-10'),enabled:true,lastDate:'2026-11-10',nextDate:'2026-12-10',latestId:'repeat-r-2026-11-10',template:{amount:60,currency:'USD',vendor:'V',category:'Utilities',comments:'',submittedBy:''}}};assert.deepEqual(meta.decode(meta.encode(root)),root);});
