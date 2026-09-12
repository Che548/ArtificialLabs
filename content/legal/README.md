# Legal documents in Sfera

`documents.json` contains the complete text of user-facing DOCX documents 01–08
from `ДОКИ RBI/Sfera — документы 12.09.2026` (edition 2026-09-12). Paragraphs and
section headings are preserved, with each source filename and SHA-256 recorded.
The content is bundled locally: opening a document does not fetch a website,
create consent records, change permission switches or submit signatures.

The health consent remains a form to fill and sign separately; the marketing
consent is a reserve document. Their status is visible in the reader. Internal
documents 00 and 09–11 are not included in the application.

Entry points: registration, Profile → Legal information, profile privacy details,
and the AI consent sheet. `LegalDocumentsModal` supports a specific document or
the index, internal navigation, close/back/swipe, long scrollable/selectable text,
font scaling and reduced motion. Document selection resets scrolling.

When legal text is approved or changed, update the corresponding bundled text,
version and source hash together. Publishing text alone does not implement the
separate signing or server-side evidence requirements described by the documents.

UI regression check (isolated services, no live accounts/SMS/email):

```sh
npx playwright test --config tests/legal-ui/playwright.config.ts
```

The fixture renders the real registration screen, reader, React Native Web Modal
and parent consent sheet. Only platform services, backend calls and unrelated
visual primitives are stubbed. Native iOS presentation still needs a device check.
