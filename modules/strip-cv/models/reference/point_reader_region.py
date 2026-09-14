"""Learn result-region boundary points; read C/T inside the predicted region."""
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
import point_reader_linear as base
from point_reader_linear import ROOT,SIZE,STRIDE,MEAN,STD,project

def inference_input(row):
    # Geometry and truth positions are deliberately absent from this interface.
    return {**{k:row[k] for k in ['id','image','width','height','sha256','source_group']},
            'points':[None,None],'result_points':[None,None]}

def render(row,bbox,augment=False,rng=None,kind='positive'):
    x,target,meta=base.render(row,bbox,augment,rng,kind)
    aux=np.zeros((2,SIZE//STRIDE,SIZE//STRIDE),np.float32)
    yy,xx=np.mgrid[:SIZE//STRIDE,:SIZE//STRIDE]
    x0,y0,x1,y1=meta['roi'];mapped=[]
    for channel,p in enumerate(row['result_points']):
        if p is None or not (x0<=p[0]<x1 and y0<=p[1]<y1):mapped.append(None);continue
        q=project([p],meta['source_to_input'])[0]
        assert 0<=min(q) and max(q)<SIZE
        mapped.append(q.tolist());cx,cy=np.clip(np.rint(q/STRIDE).astype(int),0,SIZE//STRIDE-1)
        aux[channel]=np.exp(-((xx-cx)**2+(yy-cy)**2)/(2*2.0**2))
    meta['points_input']+=mapped
    meta['point_names']=['control','test','handle_end','wick_start']
    return x,torch.cat([target,torch.from_numpy(aux)],0),meta

class PointReader(base.PointReader):
    def __init__(self,pretrained=False):
        super().__init__(pretrained)
        self.boundary_head=nn.Conv2d(64,2,1)
        nn.init.constant_(self.boundary_head.bias,-4.6)

    def forward(self,x):
        x=self.backbone[0](x);features=[]
        for stage in self.backbone[1:]:x=stage(x);features.append(x)
        p=self.lateral[3](features[3])
        for i in [2,1,0]:p=F.interpolate(p,size=features[i].shape[-2:],mode='bilinear',align_corners=False)+self.lateral[i](features[i])
        shared=self.head[:3](p)
        return torch.cat([self.head[3](shared),self.boundary_head(shared)],1)

def point_loss(logits,target):
    return base.point_loss(logits[:,:2],target[:,:2])+.5*base.point_loss(logits[:,2:],target[:,2:])

def peak(channel,inverse,mask=None):
    source=channel if mask is None else np.where(mask,channel,0.)
    yy,xx=np.unravel_index(source.argmax(),source.shape);xy=[float(xx*STRIDE),float(yy*STRIDE)]
    y,x=np.mgrid[:source.shape[0],:source.shape[1]]
    other=np.where((x-xx)**2+(y-yy)**2>4**2,source,0.)
    return dict(score=float(source[yy,xx]),second_peak_score=float(other.max()),point_input=xy,
                point_source=project([xy],inverse)[0].tolist(),unrestricted_peak_score=float(channel.max()))

def decode(logits,meta):
    heat=logits.detach().float().sigmoid().cpu().numpy();assert heat.shape[0]==4
    inverse=np.linalg.inv(meta['source_to_input']);anchors=[peak(h,inverse) for h in heat[2:]]
    begin,end=[np.asarray(a['point_input']) for a in anchors];axis=end-begin;length=float(np.linalg.norm(axis))
    y,x=np.mgrid[:heat.shape[1],:heat.shape[2]];xy=np.stack([x*STRIDE,y*STRIDE],-1)
    delta=xy-begin
    u=np.sum(delta*axis,axis=-1)/max(length**2,1)
    distance=np.abs(delta[...,0]*axis[1]-delta[...,1]*axis[0])/max(length,1)
    width=max(8.,.25*length)
    region=(u>=-.05)&(u<=1.05)&(distance<=width)
    bands=[peak(h,inverse,region) for h in heat[:2]];c,t=bands
    separation=float((np.asarray(t['point_input'])-c['point_input'])@axis/max(length,1))
    if any(a['score']<.5 for a in anchors):observed,reason='invalid','result_region_not_found'
    elif length<16:observed,reason='review','result_region_degenerate'
    elif c['score']<.5:observed,reason='invalid','control_below_threshold'
    elif c['second_peak_score']>=.5 or t['second_peak_score']>=.5:observed,reason='review','extra_peak_inside_result_region'
    elif t['score']>=.5 and separation>=8:observed,reason='two_line','ordered_ct_pair'
    elif t['score']<=.1:observed,reason='one_line','control_only'
    else:observed,reason='review','test_presence_or_order_uncertain'
    return dict(bands=bands,anchors=anchors,result_region=dict(length_input_px=length,half_width_input_px=width),
                observed_label=observed,reportable=observed in ['one_line','two_line'],reason=reason)

def score_record(row,prediction):
    output=base.score_record(row,prediction);errors=[]
    if row['label']!='invalid' and 'anchors' in prediction:
        q=np.asarray(row['quad']);begin=(q[0]+q[3])/2;end=(q[1]+q[2])/2;axis=end-begin
        for a,u in zip(prediction['anchors'],row['result_positions']):
            point=np.asarray(a['point_source']);predicted=float((point-begin)@axis/(axis@axis))
            errors.append(dict(longitudinal_error=abs(predicted-u),present=a['score']>=.5))
    output['region_errors']=errors
    output['region_aligned']=bool(errors) and all(e['present'] and e['longitudinal_error']<=.0354 for e in errors)
    return output

def metrics(records):
    output=base.metrics(records)
    output['positive_regions_aligned']=sum(r['expected_label']!='invalid' and r['region_aligned'] for r in records)
    output['correct_with_lines_and_region_aligned']=sum(r['correct_report'] and r['line_aligned'] and r['region_aligned'] for r in records)
    return output
