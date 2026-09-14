"""Experimental strip reader with spatial support for one-line reports; inference is image-only."""
import argparse, contextlib, hashlib, json, time
from pathlib import Path
import cv2, numpy as np, torch
from ultralytics import YOLO
from strip_absence_agreement import decide as absence_decision
from point_reader_region import PointReader, render as point_input, decode, inference_input as point_fields
from point_reader_linear import source_image
from window_presence_reader import PresenceReader, render_input, inference_input, decision as count_decision
from window_coverage_reader import CoverageReader, decision as coverage_decision

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def tensor_sha(x): return hashlib.sha256(x.numpy().tobytes()).hexdigest()
def invalid(reason):
    return dict(observed_label='invalid',reportable=False,reason=reason)
def consensus(primary, auxiliary):
    if not primary['reportable']:
        return dict(primary)
    if not auxiliary['reportable'] or primary['observed_label'] != auxiliary['observed_label']:
        return dict(observed_label='review',reportable=False,reason='readers_do_not_confidently_agree')
    return dict(primary,reason='readers_agree')

class StripPipeline:
    def __init__(self, manifest, device=None):
        self.manifest_path=Path(manifest).resolve()
        self.manifest=json.loads(self.manifest_path.read_text())
        self.device=torch.device(device or ('cuda' if torch.cuda.is_available() else 'cpu'))
        self.checkpoints={}
        for name,item in self.manifest['checkpoints'].items():
            path=(self.manifest_path.parent/item['path']).resolve()
            assert path.is_file() and sha(path)==item['sha256'],name
            self.checkpoints[name]=path
        assert set(self.checkpoints)=={'detector','points','presence','coverage','auxiliary'}
        self.detector=YOLO(str(self.checkpoints['detector']))
        self.models=dict(points=PointReader(),presence=PresenceReader(),coverage=CoverageReader(),auxiliary=PresenceReader())
        for name,model in self.models.items():
            model.load_state_dict(torch.load(self.checkpoints[name],weights_only=True,map_location='cpu')['model'])
            model.to(self.device).eval()
        self.manifest_sha256=sha(self.manifest_path)
    def amp(self):
        return torch.autocast('cuda',dtype=torch.float16) if self.device.type=='cuda' else contextlib.nullcontext()
    @torch.inference_mode()
    def predict(self, image_path, return_tensors=False):
        path=Path(image_path).resolve()
        image=cv2.imread(str(path))
        if image is None:raise ValueError('Unable to decode image: '+str(path))
        height,width=image.shape[:2]
        row=dict(id=path.stem,image=str(path),width=width,height=height,sha256=sha(path),source_group=path.stem)
        policy=self.manifest['policy']
        started=time.perf_counter()
        pred=self.detector.predict(source=image,imgsz=640,device=str(self.device),conf=.001,iou=.7,
                                   max_det=100,rect=False,end2end=False,verbose=False,save=False)[0]
        boxes=sorted([dict(bbox=b,confidence=float(c)) for b,c in zip(pred.boxes.xyxy.cpu().tolist(),pred.boxes.conf.cpu().tolist())
                      if c>=policy['detector_confidence']],key=lambda d:-d['confidence'])
        routes={key:invalid('detector_no_proposal') for key in ['primary','auxiliary','consensus','original_boundary']}
        output=dict(image=str(path),source_image_sha256=row['sha256'],width=width,height=height,
                    model_manifest_sha256=self.manifest_sha256,experimental=True,detector_proposals=boxes)
        tensors={}
        if boxes:
            x,_,meta=point_input(point_fields(row),boxes[0]['bbox'])
            with self.amp(): logits=self.models['points'](x[None].to(self.device))
            geometry=decode(logits[0],meta)
            output['geometry']=dict(**geometry,preprocessing=meta,input_tensor_sha256=tensor_sha(x))
            tensors['point_input']=x
            anchors=[a['point_source'] for a in geometry['anchors']]
            for k in routes:routes[k]=invalid('result_region_degenerate')
            if np.isfinite(anchors).all() and np.linalg.norm(np.asarray(anchors[1])-anchors[0])>2:
                crop,transform=render_input(inference_input(row),anchors)
                scores={}
                for name in ['presence','coverage','auxiliary']:
                    with self.amp(): z=self.models[name](crop[None].to(self.device))
                    scores[name]=z[0].float().sigmoid().cpu().tolist()
                length_ok=geometry['result_region']['length_input_px']>=16
                q=scores['coverage'][2]
                routes['primary']=coverage_decision([*scores['presence'],q],length_ok)
                routes['auxiliary']=coverage_decision([*scores['auxiliary'],q],length_ok)
                routes['consensus']=consensus(routes['primary'],routes['auxiliary'])
                boundary_ok=length_ok and all(a['score']>=.5 for a in geometry['anchors'])
                routes['original_boundary']=count_decision(scores['presence'],boundary_ok)
                output.update(presence_scores=scores['presence'],auxiliary_presence_scores=scores['auxiliary'],
                              window_coverage_score=q,window_preprocessing=transform,window_tensor_sha256=tensor_sha(crop))
                tensors['window_input']=crop
        routes['absence_checked']=absence_decision(dict(output,routes=routes))
        selected=routes[policy['route']]
        output.update(routes=routes,result=dict(**selected,observed_line_count={'one_line':1,'two_line':2}.get(selected['observed_label']),
                                               requires_user_confirmation=selected['reportable']),
                      elapsed_ms=1000*(time.perf_counter()-started))
        # Source image memoization is a rendering optimization, not a data retention store.
        source_image.cache_clear()
        return (output,tensors) if return_tensors else output

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--models',required=True,type=Path)
    parser.add_argument('--input',required=True,nargs='+',type=Path)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--device',choices=['cpu','cuda'],default=None)
    args=parser.parse_args()
    cv2.setNumThreads(1);torch.set_num_threads(4)
    paths=[]
    for item in args.input:
        if item.is_dir():paths.extend(sorted(p for p in item.iterdir() if p.suffix.lower() in {'.png','.jpg','.jpeg','.webp','.bmp','.tif','.tiff'}))
        else:paths.append(item)
    assert paths,'No supported input images'
    assert not args.output.exists(),'Choose a new output file'
    pipeline=StripPipeline(args.models,args.device)
    with args.output.open('x') as output:
        for path in paths:
            row=pipeline.predict(path)
            output.write(json.dumps(row,allow_nan=False)+'\n');output.flush()
            print(json.dumps(dict(image=path.name,**row['result'],elapsed_ms=round(row['elapsed_ms'],1))),flush=True)
if __name__=='__main__':main()
