"""Broader style training for a complete result-window C/T presence reader."""
import numpy as np,torch
from window_presence_reader import ROOT,WIDTH,HEIGHT,MEAN,STD,PresenceReader,render_input,inference_input,record,decision,metrics,edge_point
from point_reader_linear import project

def render(row,augment=False,rng=None,kind='positive'):
    rng=rng or np.random.default_rng(0)
    anchors=row['result_points'];present=[1.,float(row['label']=='two_line')];omitted=[]
    if kind in ['empty','empty_handle','empty_wick']:
        h,w=row['result_positions']
        handle=kind=='empty_handle' or (kind=='empty' and rng.random()<.5)
        bounds=(0.,max(.025,h-.085)) if handle else (min(.965,w+.085),.99)
        anchors=[edge_point(row,u) for u in bounds];present=[0.,0.]
        omitted=[p for p in row['points'] if p is not None]
    elif kind!='positive':raise ValueError(kind)
    x,meta=render_input(inference_input(row),anchors,augment,rng)
    for p in omitted:
        xy=project([p],meta['source_to_input'])[0]
        assert xy[0]<-8 or xy[0]>WIDTH+8 or xy[1]<-8 or xy[1]>HEIGHT+8,(row['id'],kind,xy.tolist())
    retained=[p if flag else None for p,flag in zip(row['points'],present)]
    for p in retained:
        if p is not None:
            xy=project([p],meta['source_to_input'])[0]
            assert 0<=xy[0]<WIDTH and 0<=xy[1]<HEIGHT,(row['id'],kind,xy.tolist())
    meta.update(kind=kind,target_presence=present,cohort=row['cohort'],annotation_reviewer=row['annotation_reviewer'],
                retained_points_input=[project([p],meta['source_to_input'])[0].tolist() if p is not None else None for p in retained])
    return x,torch.tensor(present,dtype=torch.float32),meta
