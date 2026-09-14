import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeter} from './capacity-meter.mjs';
test('counts protocol operations without retaining sensitive contents',()=>{
 const m=createMeter(),q=new Map(); const send=(x,dir='client')=>m.message(Buffer.from(JSON.stringify(x)),dir,q);
 send({type:'Authenticate',value:'DO_NOT_RETAIN_TOKEN'});
 send({type:'ModifyQuerySet',modifications:[{type:'Add',queryId:1,udfPath:'health:snapshot',args:[{secret:'DO_NOT_RETAIN_DATA'}]}]});
 send({type:'Mutation',udfPath:'health:syncBatch',args:[{secret:'DO_NOT_RETAIN_DATA'}]});
 send({type:'Transition',modifications:[{type:'QueryUpdated',queryId:1,value:'DO_NOT_RETAIN_RESULT'}]},'server');
 send({type:'MutationResponse',success:true},'server');
 const s=m.snapshot();assert.equal(s.mutations['health:syncBatch'],1);assert.equal(s.queryUpdates['health:snapshot'],1);assert.equal(s.responses,1);assert(!JSON.stringify(s).includes('DO_NOT_RETAIN'));
 m.reset();assert.equal(m.snapshot().clientMessages,0);
});
