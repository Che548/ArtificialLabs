# CV Demo · reference lock

The existing Sfera scan flow owns the behavior: five instruction pages, optional skip preference, QR / manual batch, camera / import, actual StripCV, confidence gate, result review, correction and history. Apple-like utility styling is explicitly requested by the user. Refero bundled color/craft guidance supplies semantic neutrals, legible labels, focus and form behavior; live Refero tools were unavailable.

Preserve: system sans-serif typography, neutral #f5f5f7 canvas, white panels, #1d1d1f primary ink, thin #dedee3 separators, 16–28px panel corners, charcoal primary buttons. Cool blue is reserved for focus and selected controls; no pink UI. Actual scan images retain their original colors. Instruction artwork is existing product artwork presented in monochrome. Motion: 180–260ms opacity and small translations; respect reduced motion.

Desktop: quiet top navigation, centered scanning workspace, expandable local history. Mobile: full-width camera and bottom actions. No fake test results or seeded history. Clear status before and after every operation. Access modal uses the same design language.

Decisions: use original C++ pipeline (source: native module), server-side access gate (user login requirement), local browser history (existing local-first architecture), share links with expiration and revocation (requested passwordless access). Uploaded images are processed transiently by this demo server and never enter the app's Convex backend.
