// QA only: retain aggregate protocol metadata, never arguments/results/auth.
export function createMeter() {
 let state;
 const reset=()=>{state={startedAt:Date.now(),http:0,httpErrors:0,wsConnections:0,wsUpstreamErrors:0,clientMessages:0,serverMessages:0,clientBytes:0,serverBytes:0,parseErrors:0,blockedActions:0,mutations:{},actions:{},queryAdds:{},queryRemoves:0,queryUpdates:{},queryFailures:0,responses:0,responseErrors:0};};
 reset();
 const bump=(map,key)=>{map[key]=(map[key]??0)+1;};
 const name=x=>typeof x==='string'&&/^[a-zA-Z0-9_/:.-]{1,120}$/.test(x)?x:'other';
 return { reset, snapshot:()=>({...state,elapsedMs:Date.now()-state.startedAt}), inc:k=>{if(typeof state[k]==='number')state[k]++;},
  message(data,dir,queries){
   state[dir+'Messages']++; state[dir+'Bytes']+=data.length;
   let m;try{m=JSON.parse(data.toString());}catch{state.parseErrors++;return;}
   if(dir==='client'){
    if(m.type==='Mutation')bump(state.mutations,name(m.udfPath));
    if(m.type==='Action')bump(state.actions,name(m.udfPath));
    if(m.type==='ModifyQuerySet')for(const q of m.modifications??[]){if(q.type==='Add'){queries.set(q.queryId,name(q.udfPath));bump(state.queryAdds,name(q.udfPath));}else if(q.type==='Remove'){state.queryRemoves++;}}
   }else{
    if(m.type==='Transition')for(const q of m.modifications??[]){if(q.type==='QueryUpdated')bump(state.queryUpdates,queries.get(q.queryId)??'other');if(q.type==='QueryFailed')state.queryFailures++;}
    if(m.type==='MutationResponse'||m.type==='ActionResponse'){state.responses++;if(!m.success)state.responseErrors++;}
   }
  },
 };
}
