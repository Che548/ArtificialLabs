"""C/T point reader. No strip mask or annotated geometry is used at inference."""
from collections import Counter
from functools import lru_cache
from pathlib import Path
import math
import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from torchvision.models import resnet18, ResNet18_Weights

SIZE, STRIDE = 512, 4
ROOT = Path(__file__).resolve().parents[1]
MEAN = np.float32([.485,.456,.406])[:,None,None]
STD = np.float32([.229,.224,.225])[:,None,None]

@lru_cache(maxsize=220)
def source_image(path):
    im=cv2.imread(str(ROOT/path)); assert im is not None,path
    return im

def project(points,H):
    p=np.asarray(points,np.float64).reshape(-1,2)
    h=np.c_[p,np.ones(len(p))]@np.asarray(H).T
    return h[:,:2]/h[:,2:]

def sub_box(row,left,right):
    q=np.asarray(row['quad'],np.float64)
    p=np.array([(1-left)*q[0]+left*q[1],(1-right)*q[0]+right*q[1],(1-right)*q[3]+right*q[2],(1-left)*q[3]+left*q[2]])
    return [*p.min(0),*p.max(0)]

def crop_bounds(bbox,w,h,padding=.25):
    x0,y0,x1,y1=bbox; dx,dy=(x1-x0)*padding,(y1-y0)*padding
    return [max(0,math.floor(x0-dx)),max(0,math.floor(y0-dy)),min(w,math.ceil(x1+dx)),min(h,math.ceil(y1+dy))]

def render(row,bbox,augment=False,rng=None,kind='positive'):
    rng=rng or np.random.default_rng(0)
    image=source_image(row['image']); h,w=image.shape[:2]
    assert (w,h)==(row['width'],row['height'])
    points=list(row['points']); pad=.25
    if kind!='positive':
        if kind=='test_only' and points[1] is not None:
            c,t=row['point_positions']; bbox=sub_box(row,(c+t)/2+.015,min(.99,t+.12)); points[0]=None
        else:
            left,right=(0,.24) if rng.random()<.5 else (.86,.99)
            bbox=sub_box(row,left,right); points=[None,None]
        pad=.05
    if augment and kind=='positive':
        x0,y0,x1,y1=bbox; bw,bh=x1-x0,y1-y0
        cx,cy=(x0+x1)/2+rng.uniform(-.04,.04)*bw,(y0+y1)/2+rng.uniform(-.04,.04)*bh
        bw*=rng.uniform(.85,1.15); bh*=rng.uniform(.85,1.15)
        bbox=[cx-bw/2,cy-bh/2,cx+bw/2,cy+bh/2]
        pad=rng.uniform(.15,.35)
    roi=crop_bounds(bbox,w,h,pad); x0,y0,x1,y1=roi
    assert x1>x0 and y1>y0
    if kind!='positive':
        # A negative crop must visibly exclude the annotated omitted bands.
        margin=.018*max(row['bbox'][2]-row['bbox'][0],row['bbox'][3]-row['bbox'][1])
        for original,retained in zip(row['points'],points):
            if original is not None and retained is None:
                assert not (x0-margin<=original[0]<=x1+margin and y0-margin<=original[1]<=y1+margin),row['id']
    crop=image[y0:y1,x0:x1]; ch,cw=crop.shape[:2]
    angle=rng.uniform(-180,180) if augment else 0.
    theta=math.radians(angle)
    boundw=abs(cw*math.cos(theta))+abs(ch*math.sin(theta))
    boundh=abs(cw*math.sin(theta))+abs(ch*math.cos(theta))
    scale=SIZE*(rng.uniform(.85,.98) if augment else .96)/max(boundw,boundh)
    local=np.eye(3); local[:2]=cv2.getRotationMatrix2D(((cw-1)/2,(ch-1)/2),angle,scale)
    local[:2,2]+=np.array([(SIZE-1)/2-(cw-1)/2,(SIZE-1)/2-(ch-1)/2])
    if augment and rng.random()<.5:
        local=np.array([[-1,0,SIZE-1],[0,1,0],[0,0,1]])@local
    im=cv2.warpAffine(crop,local[:2],(SIZE,SIZE),flags=cv2.INTER_LINEAR,borderValue=(114,114,114))
    H=local@np.array([[1,0,-x0],[0,1,-y0],[0,0,1]])
    mapped=[project([p],H)[0].tolist() if p is not None else None for p in points]
    assert all(p is None or (0<=min(p) and max(p)<SIZE) for p in mapped),row['id']
    if augment:
        gain=rng.uniform(.85,1.15); offset=rng.uniform(-12,12)
        im=np.clip(im.astype(np.float32)*gain+offset,0,255).astype(np.uint8)
        hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[:,:,1]*=rng.uniform(.8,1.2)
        im=cv2.cvtColor(np.clip(hsv,0,255).astype(np.uint8),cv2.COLOR_HSV2BGR)
        if rng.random()<.1: im=cv2.GaussianBlur(im,(3,3),rng.uniform(.2,.6))
    rgb=cv2.cvtColor(im,cv2.COLOR_BGR2RGB)
    tensor=(rgb.transpose(2,0,1).astype(np.float32)/255-MEAN)/STD
    target=np.zeros((2,SIZE//STRIDE,SIZE//STRIDE),np.float32)
    yy,xx=np.mgrid[:SIZE//STRIDE,:SIZE//STRIDE]
    for channel,p in enumerate(mapped):
        if p is not None:
            cx,cy=np.clip(np.rint(np.asarray(p)/STRIDE).astype(int),0,SIZE//STRIDE-1)
            target[channel]=np.exp(-((xx-cx)**2+(yy-cy)**2)/(2*2.0**2))
    return torch.from_numpy(np.ascontiguousarray(tensor)),torch.from_numpy(target),dict(
        case_id=row['id'],kind=kind,roi=roi,source_to_input=H.tolist(),points_input=mapped,
        source_image_sha256=row['sha256'],source_group=row['source_group'])

class PointReader(nn.Module):
    def __init__(self,pretrained=False):
        super().__init__()
        r=resnet18(weights=ResNet18_Weights.IMAGENET1K_V1 if pretrained else None,progress=False)
        self.backbone=nn.ModuleList([nn.Sequential(r.conv1,r.bn1,r.relu,r.maxpool),r.layer1,r.layer2,r.layer3,r.layer4])
        self.lateral=nn.ModuleList([nn.Conv2d(c,64,1) for c in [64,128,256,512]])
        self.head=nn.Sequential(nn.Conv2d(64,64,3,padding=1),nn.GroupNorm(8,64),nn.ReLU(),nn.Conv2d(64,2,1))
        nn.init.constant_(self.head[-1].bias,-4.6)

    def train(self,mode=True):
        super().train(mode)
        # Preserve pretrained running statistics with this small source-photo corpus.
        for layer in self.backbone.modules():
            if isinstance(layer,nn.BatchNorm2d): layer.eval()
        return self

    def forward(self,x):
        x=self.backbone[0](x); features=[]
        for stage in self.backbone[1:]: x=stage(x); features.append(x)
        p=self.lateral[3](features[3])
        for i in [2,1,0]: p=F.interpolate(p,size=features[i].shape[-2:],mode='bilinear',align_corners=False)+self.lateral[i](features[i])
        return self.head(p)

def point_loss(logits,target):
    # Gaussian neighborhood weighting and focal exponents follow Objects as Points.
    probability=logits.float().sigmoid().clamp(1e-5,1-1e-5)
    centers=target.eq(1)
    positive=-(1-probability).square()*probability.log()*centers
    negative=-probability.square()*torch.log1p(-probability)*(1-target).pow(4)*(~centers)
    # Per-image normalization gives empty crops a stable contribution.
    return ((positive+negative).sum((1,2,3))/centers.sum((1,2,3)).clamp(min=1)).mean()

def decode(logits,meta):
    heat=logits.detach().float().sigmoid().cpu().numpy()
    inverse=np.linalg.inv(meta['source_to_input']); bands=[]
    for channel in heat:
        yy,xx=np.unravel_index(channel.argmax(),channel.shape)
        point=[float(xx*STRIDE),float(yy*STRIDE)]
        excluded=channel.copy()
        y,x=np.mgrid[:channel.shape[0],:channel.shape[1]]
        excluded[(x-xx)**2+(y-yy)**2<=4**2]=0
        bands.append(dict(score=float(channel[yy,xx]),second_peak_score=float(excluded.max()),
                          point_input=point,point_source=project([point],inverse)[0].tolist()))
    c,t=bands; separated=np.linalg.norm(np.asarray(c['point_input'])-t['point_input'])>=8
    if c['score']<.5: observed='invalid'
    elif c['second_peak_score']>=.5 or t['second_peak_score']>=.5: observed='review'
    elif t['score']>=.5 and separated: observed='two_line'
    elif t['score']<=.1: observed='one_line'
    else: observed='review'
    return dict(bands=bands,observed_label=observed,reportable=observed in ['one_line','two_line'])

def score_record(row,prediction):
    expected=row['label']; observed=prediction['observed_label']; report=prediction['reportable']
    output=dict(case_id=row['id'],source_group=row['source_group'],source_image_sha256=row['sha256'],
                expected_label=expected,touches_frame=row.get('touches_frame'),**prediction,
                correct_report=report and observed==expected,wrong_report=report and observed!=expected)
    errors=[]
    if expected!='invalid' and 'bands' in prediction:
        q=np.asarray(row['quad']); start=(q[0]+q[3])/2; end=(q[1]+q[2])/2; axis=end-start
        for index,position in enumerate(row['point_positions']):
            if position is not None:
                band=prediction['bands'][index]; point=np.asarray(band['point_source']); x=float((point-start)@axis/(axis@axis))
                top=(1-x)*q[0]+x*q[1]; bottom=(1-x)*q[3]+x*q[2]; across=bottom-top
                y=float((point-top)@across/(across@across))
                errors.append(dict(band=['control','test'][index],longitudinal_error=float(abs(x-position)),
                                   transverse_position=float(y),present=band['score']>=.5))
    output['line_errors']=errors
    output['line_aligned']=bool(errors) and all(e['present'] and e['longitudinal_error']<=.0354 and -.25<=e['transverse_position']<=1.25 for e in errors)
    return output

def metrics(records):
    pos=[r for r in records if r['expected_label']!='invalid']; neg=[r for r in records if r['expected_label']=='invalid']
    out=dict(positive_images=len(pos),correct_reports=sum(r['correct_report'] for r in pos),
        wrong_reports=sum(r['wrong_report'] for r in pos),abstentions=sum(not r['reportable'] for r in pos),
        correct_and_line_aligned=sum(r['correct_report'] and r['line_aligned'] for r in pos),
        negative_images=len(neg),negative_false_reports=sum(r['reportable'] for r in neg),
        class_counts={label:dict(Counter(r['observed_label'] for r in pos if r['expected_label']==label)) for label in ['one_line','two_line']})
    out['source_groups']={g:dict(images=len(a),correct=sum(r['correct_report'] for r in a),wrong=sum(r['wrong_report'] for r in a),abstain=sum(not r['reportable'] for r in a)) for g in sorted({r['source_group'] for r in pos}) for a in [[r for r in pos if r['source_group']==g]]}
    return out
