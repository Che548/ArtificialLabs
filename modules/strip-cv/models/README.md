# Experimental strip reader — 2026-09-14

R3 coverage alignment follow-up: if full-window coverage is below 0.90, the resolver also evaluates the coverage model on the same two focused windows used for presence. Both focused coverage scores must reach 0.90; all existing physical-band/control/presence checks remain required. This avoids letting surrounding background veto an otherwise readable result window. On the additional 1920x1080 user PNG, full-window coverage was 0.8445, while focused coverage was 0.965/0.971; the PNG and a JPEG-quality-94 approximation both returned one line. The 152 labeled and 803-image reference results stayed unchanged. The browser JPEG encoder was not replayed exactly. Seven policy/adapter tests cover the revised contract, including rejection of missing, weak or malformed focused coverage. This is part of the unpublished R3 revision and still requires rebuilding native code.

Policy revision `strip-reader-experimental-20260914-r3` adds physical band association for ambiguous windows. Independent C/T point heads can respond to one dye band, while surrounding background changes the auxiliary reader's answer. The resolver requires coverage and original control >= 0.90, two central dye profiles that place both point responses inside the same measured band (SNR >= 8), and control-only agreement from the primary reader on two narrower views. A separate T location still blocks this resolver. Existing reportable counts are preserved; missing control and invalid geometry remain blocked. All five weights are unchanged. The extra two presence-model passes run only after physical band association succeeds on a review case.

R3 implementation verification on the VM: C++ compilation passed; the actual C++ band resolver and frozen presence ONNX reproduced all 207 reference decisions and all 803 additional batch decisions. The app TypeScript adapter accepted each replay consistently. These batches overlap and must not be summed as unique images. Six policy/adapter unit tests passed. The replays reused detector, point, and full-window model outputs. Full native end-to-end inference on this VM was blocked by its OpenCV 4.5.4 importer rejecting the unchanged detector's ONNX Split operation; it is not a mobile parity test. A 12-image perturbation check (brightness 0.85/1.10, rotation 2 degrees, scale 0.80) added no new wrong counts, but exposed an existing R2/R3 wrong one-line answer for a rotated P016, whose two-line label is based on physical-strip knowledge. Six of eight variants of the two new photos were readable; the darker and rotated blue-strip views still requested review. These remaining limitations must not be hidden by the original-photo metrics.

On the T4 VM, saved full-window predictions plus newly computed profiles and focused GPU readings gave 135/152 correct known-count development references, versus R2's 133/152, with zero wrong issued counts and all previous correct counts retained. One-line references improved 23/34 to 25/34; two-line references stayed 110/118. In the personally labeled 48-photo subset, one-line counts improved 10/11 to 11/11 and two-line counts stayed 33/37, for 44/48 total. Both new user photos returned one line; the known physical two-line P016 stayed review. These are reused development checks, not an independent accuracy estimate or a guarantee that all one-line tests now pass. In the additional 803-image replay, issuance increased 279 to 280; the added image is unlabeled, so this measures coverage only. Native/device parity must be checked separately; native source changes require a new app build.

Policy revision `strip-reader-experimental-20260914-r2` lowers window coverage from 0.90 to 0.85. A duplicated C/T heatmap cell can pass as one line only when both readers have control scores >= 0.99 and test scores <= 0.02. Separate spatial T evidence, reader disagreement, and missing control still block a count. On the T4 VM, a decision-only replay of the saved 205 predictions recovered three correct counts: 133/152 known-count references, zero wrong issued counts (previously 130/152). These reused data are a regression check, not independent validation or a new native inference run. The reference metrics below describe the original policy. This revision changes native code and needs inclusion in the next native build; older native review results remain reviews.

Five frozen ONNX models are packaged in `reader-20260914/`: whole-strip detector, result endpoints, primary C/T presence, window coverage, and auxiliary C/T presence. iOS resource-bundle and Android asset declarations include these files in the next native build. The five frozen application weights are versioned with the app; other experimental weights remain ignored. The manifest records each SHA-256.

**Integration status: shared C++ preprocessing and OpenCV DNN inference, iOS/Android native methods, and the app analysis route are implemented. New native builds use the learned reader for count-only scans; older installed binaries retain the existing analyzer through capability detection. The iOS native build was signed and installed on the development iPhone on 2026-09-14. End-to-end native reference parity and device accuracy remain unverified. These reference-pipeline metrics do not establish mobile accuracy.**

The camera uses a detector-only call for four animated tracking corners. Its existing advice overlay provides framing and stability advice, then periodically runs C/T readability checks on stable captures. Readiness requires two consecutive reportable, agreeing counts. Preview files are deleted locally. Actual capture waits for an in-flight preview instead of silently ignoring the button.

The callable policy is exported as `decideLearnedStrip` from the StripCV module. It consumes model probabilities and returns an observed line count or review/invalid status. Every reported count requires user confirmation. It produces no diagnosis or calibrated signal ratio. Images must stay on the device.

## Verified reference-pipeline metrics

| Measure | Result |
| --- | --- |
| Personally labeled photos: correct count / all photos | 42/48 (87.50%) |
| Personally labeled photos: wrong count / issued counts | 0/42 (0%) |
| Personally labeled photos: review | 6/48 (12.50%) |
| Personally labeled one-line photos: correct / all | 9/11 (81.82%) |
| Personally labeled two-line photos: correct / all | 33/37 (89.19%) |
| All known-count development references: correct / all | 130/152 (85.53%) |
| Whole-strip candidate coverage, IoU >= 0.5 and full quad inside padded crop | 139/140 (99.29%) |
| Median detector-box IoU, all 140 positive images, missing detection = 0 | 93.20% |
| Median detector-box IoU, 48 personally labeled images | 95.31% |
| Same-input CPU/GPU decision agreement | 205/205 (100%) |
| T4 median full-pipeline inference | 67.50 ms |

These are reused development data, with mixed visible/physical-count labels; physical-strip independence is not established. No segmentation model is used. Do not describe zero observed wrong reports as proven zero error. The full 803-image run returned counts for 276/303 photos; all 500 archived frames requested review. This is coverage, not accuracy. One unknown-count photo still receives a count and remains an unresolved readability concern.

## Native implementation contract

1. Normalize EXIF orientation, decode the local image, and preserve original pixels.
2. Detector: RGB float NCHW 1x3x640x640, Ultralytics square letterbox and external NMS; confidence 0.05, IoU 0.7. Output 1x5x8400, xywh and one-class score. Select the highest-confidence proposal; map coordinates back to the original image.
3. Pad that box by 25% on each side, floor/ceil bounds, clip to source, and affine fit the crop to a centered 512x512 image at 0.96 scale, uint8 bilinear, border 114. RGB ImageNet mean/std normalization. Point logits are 1x4x128x128: C, T, handle end, wick start; sigmoid and stride-4 argmax. Map endpoints through the inverse affine transform.
4. Result window: center on endpoints, span 1.2 times endpoint distance, width 384 and height 128, float32 bilinear affine sampling with border 0.447. Normalize RGB with ImageNet mean/std. Run presence, coverage, and auxiliary models; apply sigmoid. Use coverage channel 2. Preserve this float sampling to avoid erasing faint contrast.
5. Decode spatial T within the endpoint corridor using the reference implementation; pass its probability and both readers to `decideLearnedStrip`. Never substitute raw detector confidence for count confidence.
6. Verify decoded image tensors, geometry, probabilities, and final decisions against the frozen reference on both platforms before routing camera scans to this backend. The four reader exports have numerical ONNX/PyTorch parity on a fixed synthetic tensor; this is not end-to-end mobile parity.

Exact preprocessing and the reference runtime are preserved in `reference/` and in the separately delivered Python package. Do not upload scan photographs to the training VM as a mobile inference workaround.


R4 candidate adds an optional641KB spatially local band model for independently reconstructed windows when the original crop has low coverage. Existing R3 counts are preserved. It requires all six ONNX assets and the matching native/TypeScript code; this candidate is not deployed. Development replay: original135/152 unchanged, additional black-handle photo reads1; no independent clinical validation.


### R5: independent evidence for single-line recognition

R5 reuses the six unchanged model assets. When both window readers agree that C is present
and T is absent, coverage is sufficient, and the point model still proposes T, the local
band reader checks the pixels. Its agreement resolves that coordinate-only veto. Existing
counts, coverage requirements and model probability thresholds remain unchanged.
The native and TypeScript reason is `local_bands_confirm_single_line`.

The user explicitly corrected P016 from two lines to one on 2026-09-14 at 21:51 UTC.
The correction is recorded separately from the original audit; earlier descriptions of
P016 or its +2-degree variant as wrong one-line counts used the superseded label.

On the corrected development references, R5 recovers 30/35 one-line and 110/117 two-line
images: 140/152 total, with 12 reviews and no wrong issued counts on those original images.
The corrected R4 baseline is 25/35 and 110/117. The personal 48-image subset is unchanged:
11/11 one-line and 33/37 two-line. These are development results, not an independent holdout.


### R6: distinguish an uncertain auxiliary estimate from contradictory evidence

The auxiliary reader's uncertain T range (0.1–0.9) no longer vetoes strong agreement
between the primary and spatially local reader. This route requires the existing strong
criteria C≥0.99 and T≤0.02 in both readers, sufficient original coverage, auxiliary C≥0.9,
and no extra local band. Confident auxiliary T≥0.9 still blocks a single-line result.
All six model assets and the existing probability thresholds are unchanged.
The native reason is `local_bands_resolve_auxiliary_uncertainty`; supporting confidence
and the original auxiliary probabilities remain separately available.

The nine new user-confirmed one-line originals improved from 4/9 in R5 to 7/9 in the
prototype. The blurred 01.10.04 image and the low-coverage 01.09.41 image still require
another view. The user excluded 01.10.07 from this new batch; it was not used to train
or choose this rule. The older positive regression cohort is retained.

Final R6 verification: 4,131 native post-reader/GPU comparisons and app-adapter checks matched; 15 decision/adapter tests passed. On the previous 152 reference images, one-line 30/35 and two-line 110/117 were unchanged with zero wrong issued counts. New confirmed one-line originals and exact Chromium-normalized images both improved 4/9 to 7/9. The 505 labelled images include training data (117/124 one-line, 363/372 two-line, nine empty controls unreported); these are development checks, not independent validation. Full detector/point inference ran on GPU; native post-reader parity uses those upstream outputs because the VM host OpenCV cannot import the detector.
