"""Read C/T presence from an enlarged result-region crop without segmentation."""
import cv2
import numpy as np
import torch
from torch import nn
from torchvision.models import resnet18,ResNet18_Weights
from point_reader_linear import ROOT,source_image,project,MEAN,STD

WIDTH,HEIGHT=384,128

def edge_point(row,u):
    q=np.asarray(row['quad']);return ((1-u)*(q[0]+q[3])+u*(q[1]+q[2]))/2

def inference_input(row):
    return {k:row[k] for k in ['id','image','width','height','sha256','source_group']}

def render_input(row,anchors,augment=False,rng=None):
    """Image-only inference: no labels, annotated quads, or C/T points accepted."""
    assert set(row)=={'id','image','width','height','sha256','source_group'}
    rng=rng or np.random.default_rng(0)
    begin,end=np.asarray(anchors,np.float64)
    direction=end-begin;length=float(np.linalg.norm(direction));assert length>2
    along=direction/length;across=np.array([-along[1],along[0]])
    center=(begin+end)/2;span=1.2*length
    if augment:
        center+=rng.uniform(-.04,.04)*length*along+rng.uniform(-.03,.03)*length*across
        angle=rng.uniform(-5,5)*np.pi/180
        rotation=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
        along=rotation@along;across=rotation@across;span*=rng.uniform(.9,1.1)
    scale=WIDTH/span
    H=np.array([[*(along*scale),(WIDTH-1)/2-center@along*scale],
                [*(across*scale),(HEIGHT-1)/2-center@across*scale],[0.,0.,1.]])
    # Float resampling and bounded photometry preserve weak contrast; no clipped gain or uint8 requantization.
    image=source_image(row['image']).astype(np.float32)/255.
    assert image.shape[:2]==(row['height'],row['width'])
    crop=cv2.warpAffine(image,H[:2],(WIDTH,HEIGHT),flags=cv2.INTER_LINEAR,borderValue=(.447,.447,.447))
    rgb=cv2.cvtColor(crop,cv2.COLOR_BGR2RGB)
    if augment:
        rgb=np.power(np.maximum(rgb,0),rng.uniform(.85,1.15))
        contrast=rng.uniform(.85,1.);rgb=(rgb-.5)*contrast+.5
        balance=rng.uniform(.95,1.05,3);rgb=rgb*balance/max(1.,float(balance.max()))
    assert np.isfinite(rgb).all() and rgb.min()>=0 and rgb.max()<=1.0001
    tensor=(rgb.transpose(2,0,1).astype(np.float32)-MEAN)/STD
    metadata=dict(case_id=row['id'],source_group=row['source_group'],source_image_sha256=row['sha256'],
        source_to_input=H.tolist(),anchors_source=np.asarray(anchors).tolist(),
        actual_crop_center=center.tolist(),actual_crop_span=span)
    return torch.from_numpy(np.ascontiguousarray(tensor)),metadata

def render(row,augment=False,rng=None,kind='positive'):
    rng=rng or np.random.default_rng(0)
    present=[1.,float(row['label']=='two_line')];omitted=[]
    anchors=row['result_points']
    if kind=='empty':
        bounds=(0.,.24) if rng.random()<.5 else (.86,.99)
        anchors=[edge_point(row,u) for u in bounds];present=[0.,0.]
        omitted=[p for p in row['points'] if p is not None]
    elif kind=='test_only':
        c,t=row['point_positions'];assert t is not None
        # Center a crop on T with its left edge beyond the C/T midpoint.
        half=min((t-c)*.32,.06)
        anchors=[edge_point(row,u) for u in (t-half,t+half)]
        present=[0.,1.];omitted=[row['points'][0]]
    elif kind!='positive':raise ValueError(kind)
    x,meta=render_input(inference_input(row),anchors,augment,rng)
    H=meta['source_to_input']
    for p in omitted:
        xy=project([p],H)[0]
        assert xy[0]<-8 or xy[0]>WIDTH+8 or xy[1]<-8 or xy[1]>HEIGHT+8,('omitted_band_in_crop',row['id'],kind,xy.tolist())
    retained=[p if flag else None for p,flag in zip(row['points'],present)]
    for p in retained:
        if p is not None:
            xy=project([p],H)[0]
            assert 0<=xy[0]<WIDTH and 0<=xy[1]<HEIGHT,(row['id'],kind,xy.tolist())
    meta.update(kind=kind,target_presence=present,retained_points_input=[project([p],H)[0].tolist() if p is not None else None for p in retained])
    return x,torch.tensor(present,dtype=torch.float32),meta

class PresenceReader(nn.Module):
    def __init__(self,pretrained=False):
        super().__init__();self.network=resnet18(weights=ResNet18_Weights.IMAGENET1K_V1 if pretrained else None,progress=False)
        self.network.fc=nn.Linear(512,2)
    def forward(self,x):return self.network(x)
    def train(self,mode=True):
        super().train(mode)
        for layer in self.network.modules():
            if isinstance(layer,nn.BatchNorm2d):layer.eval()
        return self

def decision(scores,region_ok=True):
    c,t=map(float,scores)
    if not region_ok:return dict(observed_label='invalid',reportable=False,reason='result_region_not_found')
    if c<=.1:return dict(observed_label='invalid',reportable=False,reason='control_absent')
    if c<.9:return dict(observed_label='review',reportable=False,reason='control_uncertain')
    if t>=.9:label,reason='two_line','ct_present'
    elif t<=.1:label,reason='one_line','control_only'
    else:label,reason='review','test_uncertain'
    return dict(observed_label=label,reportable=label in ['one_line','two_line'],reason=reason)

def record(row,scores,region_ok=True,**extra):
    pred=decision(scores,region_ok);reportable=pred['reportable'];expected=row['label']
    return dict(case_id=row['id'],source_group=row['source_group'],source_image_sha256=row['sha256'],expected_label=expected,
        touches_frame=row.get('touches_frame'),presence_scores=list(map(float,scores)),**pred,
        correct_report=reportable and pred['observed_label']==expected,wrong_report=reportable and pred['observed_label']!=expected,**extra)

def metrics(records):
    from collections import Counter
    pos=[r for r in records if r['expected_label']!='invalid'];neg=[r for r in records if r['expected_label']=='invalid']
    return dict(positive_images=len(pos),correct_reports=sum(r['correct_report'] for r in pos),wrong_reports=sum(r['wrong_report'] for r in pos),
        abstentions=sum(not r['reportable'] for r in pos),negative_images=len(neg),negative_false_reports=sum(r['reportable'] for r in neg),
        class_counts={label:dict(Counter(r['observed_label'] for r in pos if r['expected_label']==label)) for label in ['one_line','two_line']})
