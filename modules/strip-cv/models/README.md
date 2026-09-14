# Experimental strip reader — 2026-09-14

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
