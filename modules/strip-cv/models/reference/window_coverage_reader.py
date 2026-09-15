"""Read C/T and verify coverage of the result window from the same pixels."""
import math
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
import window_presence_reader as base
import window_presence_expanded as expanded
from window_presence_reader import ROOT, WIDTH, HEIGHT, MEAN, STD, render_input, inference_input, metrics
from point_reader_linear import project


class CoverageReader(base.PresenceReader):
    def __init__(self):
        super().__init__()
        self.network.fc = nn.Linear(512, 3)

    def initialize_presence(self, state):
        own = self.state_dict()
        for key, value in state.items():
            if key in ['network.fc.weight', 'network.fc.bias']:
                own[key][:2].copy_(value)
            else:
                own[key].copy_(value)
        own['network.fc.weight'][2].zero_()
        own['network.fc.bias'][2].zero_()
        self.load_state_dict(own)


def coverage_truth(row, metadata):
    """Training/scoring only; this function never enters model inference."""
    if row['label'] == 'invalid':
        return dict(complete=False, reason='known_empty_source')
    q = np.asarray(row['quad'], np.float64)
    h, w = row['result_positions']
    u = np.asarray([h, w, w, h])[:, None]
    quad = (1 - u) * q[[0, 0, 3, 3]] + u * q[[1, 1, 2, 2]]
    mapped = project(quad, metadata['source_to_input'])
    anchors = project(row['result_points'], metadata['source_to_input'])
    direction = anchors[1] - anchors[0]
    angle = math.degrees(math.atan2(direction[1], direction[0]))
    inside = bool((mapped[:, 0] >= 0).all() and (mapped[:, 0] < WIDTH).all()
                  and (mapped[:, 1] >= 0).all() and (mapped[:, 1] < HEIGHT).all())
    ordered = abs(angle) <= 15
    return dict(complete=inside and ordered, corners_inside=inside,
                canonical_angle_degrees=angle, quad_input=mapped.tolist())


def render(row, augment=False, rng=None, kind='positive'):
    rng = rng or np.random.default_rng(0)
    if kind != 'bad_window':
        x, ct, meta = expanded.render(row, augment, rng, kind)
        quality = coverage_truth(row, meta)
        mask = [1., 1., 1.]
    else:
        anchors = np.asarray(row['result_points'], np.float64)
        center = anchors.mean(0)
        direction = anchors[1] - anchors[0]
        length = float(np.linalg.norm(direction))
        along = direction / length
        across = np.asarray([-along[1], along[0]])
        mode = int(rng.integers(4))
        if mode == 0:
            anchors += rng.choice([-1., 1.]) * rng.uniform(.25, .85) * direction
            corruption = 'same_scale_longitudinal_shift'
        elif mode == 1:
            anchors += rng.choice([-1., 1.]) * rng.uniform(.10, .30) * length * across
            corruption = 'same_scale_transverse_shift'
        elif mode == 2:
            anchors = anchors[::-1].copy()
            corruption = 'reversed_orientation'
        else:
            anchors = center + rng.uniform(.45, .80) * (anchors - center)
            corruption = 'partial_window_zoom'
        x, meta = render_input(inference_input(row), anchors, augment, rng)
        quality = coverage_truth(row, meta)
        ct = torch.tensor([1., float(row['label'] == 'two_line')])
        # A band outside a partial crop is unknown, never a supervised absence.
        mask = [float(quality['complete']), float(quality['complete']), 1.]
        meta.update(kind=kind, corruption=corruption, cohort=row['cohort'],
                    annotation_reviewer=row['annotation_reviewer'])
    targets = [*ct.tolist(), float(quality['complete'])]
    meta.update(target_presence=ct.tolist(), target_outputs=targets,
                loss_mask=mask, coverage_truth=quality)
    return x, torch.tensor(targets, dtype=torch.float32), torch.tensor(mask, dtype=torch.float32), meta


def loss(logits, target, mask):
    element = F.binary_cross_entropy_with_logits(logits.float(), target, reduction='none')
    return ((element * mask).sum(1) / mask.sum(1).clamp(min=1)).mean()


def decision(scores, region_ok=True):
    c, t, q = map(float, scores)
    if not region_ok:
        return dict(observed_label='invalid', reportable=False, reason='result_region_degenerate')
    if q < .9:
        return dict(observed_label='review', reportable=False, reason='window_coverage_uncertain')
    return base.decision([c, t], True)


def record(row, scores, region_ok=True, **extra):
    pred = decision(scores, region_ok)
    reportable = pred['reportable']
    return dict(case_id=row['id'], source_group=row['source_group'], source_image_sha256=row['sha256'],
                expected_label=row['label'], touches_frame=row.get('touches_frame'),
                presence_scores=list(map(float, scores[:2])), coverage_score=float(scores[2]),
                observed_label=pred['observed_label'], reportable=reportable, reason=pred['reason'],
                correct_report=reportable and pred['observed_label'] == row['label'],
                wrong_report=reportable and pred['observed_label'] != row['label'], **extra)
