# D-007 Document support matrix: launch limits, evidence, and quality gates

Task owner: **Implementation worker D-007**
Repository: `C:\Users\Masih\OneDrive\Documents\Nova Trade\nova-trade-lead-management`
Slice: **D-007 only**
Task status: **Parent-conductor accepted local implementation contract**; parser selection, calibration, and production activation remain gated.
Accepted dependency: `docs/decisions/document-storage-and-malware-scanning.md` (D-006)
Read-set scope: implementation plan, PRD, decisions (`D-006`, `D-010`), current repository utilities/tests, package scripts
Write-set scope: `docs/product/document-support-matrix.md` only
Mode: documentation-only (no implementation/config/package/database changes)

## 1) Scope and policy anchors

- Launch baseline:
  - English only
  - File formats: PDF, DOCX, XLSX, CSV, TXT, Markdown, JPEG, PNG
  - Input channels: tenant notes, tenant-uploaded files, tenant-authorized URLs
  - Storage hard ceiling: **50 MiB/object** (hard absolute bound from D-006, never exceed)
  - PDF: **500 pages** max
  - Spreadsheet: **100,000 rows** max (file-class limit)
  - Image: **20 MiB** max
  - Encrypted/protected, archive, audio/video, handwriting, additional languages: deferred/rejected
- D-006 boundary:
  - quarantine-first upload, clean-only extraction access, and tenant-scoped lifecycle
- D-010 boundary:
  - URL fetch and parsing only through allow-listed source cards
  - safe fetch only for tenant-authorized URL/document sources
  - no unrestricted crawling
- Evidence tier: STANDARD input validation, feeding HIGH untrusted-input evidence pipeline; no automated claim acceptance from parser success state alone.

## 2) Current-state inventory used for this matrix

The matrix is grounded in current repository behavior:

- `src/lib/safe-http.ts` already enforces:
  - `GET`/`HEAD` only
  - max redirects default `5` (config 0-10)
  - hostname validation, credential stripping rejection, DNS pinning, private/special-use and localhost block
- `src/lib/website-health.ts` already uses safe fetch and `5000ms` health timeout
- `src/lib/ai/website-viability.ts` currently uses compatibility caps (`120_000` bytes/chars), with explicit `UNKNOWN` on transport failure; this remains scoped to compatibility behavior only and is not the launch contract
- `src/lib/csv.ts` already protects spreadsheet formula injection on export (`= + - @` after whitespace/BOM/control)
- Unit/e2e safety tests confirm blocked private targets, redirect re-validation, and fetch limits
- No production parser/provider selection exists yet in this slice; this matrix constrains what later implementation may do

## 3) Supported/deferred matrix

> **Total rows:** 17
> **Launch rows:** 10
> **Deferred rows:** 7
> **Unknown rows:** 0

### F-001 - PDF (`application/pdf`, `.pdf`)

- **Status:** Launch
- **Hard caps:** **50 MiB/object**, **500 pages**
- **Media verification:** extension/MIME/signature consistency check; linearized PDFs are allowed if structures are internally consistent
- **Parser/OCR class:** PDF structural parser + fallback OCR pass for image-only sections
- **Preflight (deterministic):**
  - MIME/extension consistency check before reservation confirmation
  - reject malformed/encrypted structures by explicit parser policy
  - reject active content (`/JavaScript`, `/Launch`, `/AA`, `OpenAction`) and embedded executable/attachment references where parser policy disallows execution
  - reject archive-like container headers; reject macro-like / OLE package sections
  - reject if reported page count > 500
  - compute checksum and size before scanning/enqueue
- **Post-parse (deterministic):**
  - recompute page count; if >500 -> `blocked_limit`
  - if parse emits malformed object or unsupported compression, route `extraction_partial` with `requires_review`
  - if OCR is used, per-page OCR output and fallback coverage recorded
- **Resource/time limits:** parse budget `300s/job`, OCR budget `180s/job`, memory ceiling `1.5 GiB/job`, page extraction cap `500` pages
- **Language handling:** decode/normalize structure before language detection; non-English values only enter review workflow after decode
- **Quality/confidence thresholds (provisional):**
  - parser confidence: high `>= 0.96`, medium `0.90-0.95`, low `< 0.90`
  - evidence confidence: high requires parser confidence high + at least `2` anchors per critical claim + no contradiction
  - low parser confidence routes to `review_required` and cannot become `approved_knowledge`
- **Partial extraction semantics:** partial parses are valid for review; never auto-approved; malformed object/unsupported compression persists as `extraction_partial`
- **Table handling:** emit tables only when explicit structural boundaries are parse-safe; otherwise route to review for manual reconciliation
- **Formula/macro policy:** a PDF containing active content or executable/embedded attachment references is rejected from the launch knowledge path; active content is never executed or silently stripped into accepted evidence
- **Failure/review states:** `blocked_unsupported`, `blocked_security`, `extraction_partial`, `review_required`
- **Evidence-anchor expectations:** page-level (`doc:{id}:v{n}:page:{n}`), section-level (`:sec:{hash}`), OCR token anchors where image-based
- **Duplicate/version behavior:** same tenant + checksum + policy version + parser build id may reuse extraction only via explicit dedupe decision; otherwise new version
- **Representative fixture coverage:** normal PDF, 501-page PDF, malformed xref/object PDF, PDF with prompt-like instructions, password-protected PDF

### F-002 - DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `.docx`)

- **Status:** Launch
- **Hard caps:** **50 MiB/object**
- **Media verification:** extension/mime/container consistency validation and archive sanity checks
- **Parser/OCR class:** OOXML text and structure parser
- **Preflight (deterministic):**
  - reject extension/magic mismatch and non-OOXML binaries
  - reject macro package indicators (`.docm`, `.dotm`, `vbaProject.bin`)
  - reject password-protected/RC4/obfuscated embedded streams
  - run anti-zip bomb header sanity checks (entry count + entry size cap)
- **Post-parse (deterministic):**
  - enforce output cap (no more than 5,000 content blocks and 1,000 tables per doc)
  - reject if parser emits binary/unknown stream as authoritative text
  - mark table cell formula references as non-executable literals
- **Resource/time limits:** parse budget `120s/job`, memory ceiling `768 MiB/job`
- **Language handling:** decode and normalize structure before language detection; non-English chunks are `review_required`
- **Quality/confidence thresholds (provisional):** same parser/evidence schema as PDF; table cell extraction confidence `>= 0.93` for review-eligible routing, otherwise review
- **Partial extraction semantics:** partial parse can persist for review when headers or embedded streams fail strict parse
- **Table handling:** preserve table structure up to parser-safe boundaries; malformed tables route to partial review
- **Formula/macro policy:** formula-like text stored as inert evidence strings; macros rejected at preflight
- **Failure/review states:** `blocked_unsupported`, `blocked_security`, `extraction_partial`, `review_required`
- **Evidence-anchor expectations:** section-level and paragraph-level anchors (`doc:{id}:v{n}:s{idx}:p{idx}`)
- **Duplicate/version behavior:** tenant-local dedupe by checksum; same policy/build requires explicit reuse decision
- **Representative fixture coverage:** valid DOCX, macro-like DOCX payload, corrupted OOXML, prompt-like legal text, duplicate checksum reuse

### F-003 - XLSX (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `.xlsx`)

- **Status:** Launch
- **Hard caps:** **50 MiB/object**, max **100,000 rows** (per workbook slice), max **2,000,000 non-empty cells**, max **200 sheets**
- **Media verification:** reject wrong mime/extension/container signatures and encrypted/password-protected workbooks
- **Parser/OCR class:** OOXML spreadsheet parser (formula-safe mode)
- **Preflight (deterministic):**
  - reject `.xlsm`, `.xltm`, macro-capable workbooks, and password-protected/encrypted workbooks
  - reject shared formula bombs by per-sheet cell count cap
  - reject >200 sheets, >100k rows
- **Post-parse (deterministic):**
  - enforce row/cell caps per sheet and workbook
  - preserve sheet name and exact `row/col` locator for each parsed cell
  - formulas are preserved as evidence data, not executed
- **Resource/time limits:** parse budget `180s/job`, memory budget `512 MiB/job`
- **Language handling:** decode/normalize strings first; non-English values route to review workflow
- **Quality/confidence thresholds (provisional):**
  - parser confidence high `>= 0.95`, medium `0.90-0.95`, low `< 0.90`
  - table completeness gate for automatic routing is `>= 0.90`
  - suspicious formula-like values are sanitized in derived exports and flagged
- **Partial extraction semantics:** if >10% rows incomplete, emit `extraction_partial` and keep failed rows
- **Table handling:** preserve sheet, row/column coordinates; emit only parser-safe tables
- **Formula/macro policy:** formulas remain literal text anchors and are never executed
- **Failure/review states:** `extraction_partial`, `review_required`
- **Evidence-anchor expectations:** cell-level anchors (`doc:{id}:v{n}:sheet:{name}:r{row}:c{col}`)
- **Duplicate/version behavior:** same workbook checksum + policy version may reuse parsed tables; new policy or parser version creates a new version record
- **Representative fixture coverage:** xlsx (small), xlsx 100k+ rows boundary fail, formula-heavy xlsx, duplicate row IDs, mixed separators

### F-004 - CSV (`text/csv`, `.csv`)

- **Status:** Launch
- **Hard caps:** **50 MiB/object**, max **100,000 rows**, max **1,000 columns**, max **16,384 chars/row**
- **Media verification:** MIME/header sanity and binary marker checks before parser dispatch
- **Parser/OCR class:** deterministic delimiter parser + quoted-field normalizer
- **Preflight (deterministic):**
  - reject files with binary markers and conflicting extension claims
  - detect and quarantine UTF-16/UTF-8-BOM cases; normalize decoding strategy with explicit charset decision
  - detect delimiter confusion; reject ambiguous delimiter maps when ambiguous > 5%
- **Post-parse (deterministic):**
  - enforce row cap and column cap
  - enforce formula-injection prefix protection before export or downstream query:
    - `=`, `+`, `-`, `@` when first meaningful non-BOM char; prefix with apostrophe in derivative
  - if >0.5% rows contain truncation markers, route review
- **Resource/time limits:** parse budget `120s/job`, memory ceiling `256 MiB/job`
- **Language handling:** decode/normalize before language detection; English-only goes to knowledge path
- **Quality/confidence thresholds (provisional):** parser confidence high `>= 0.97`; low-confidence rows route to partial extraction with `review_required`
- **Partial extraction semantics:** malformed rows are retained in review-only outputs with row-level truncation indicators
- **Table handling:** parse table boundaries from delimiter model; if delimiter confidence < threshold, route partial review
- **Formula/macro policy:** formula prefixes are escaped in downstream exports; no execution
- **Failure/review states:** `blocked_unsupported`, `review_required`, `extraction_partial`
- **Evidence-anchor expectations:** row/column anchors (`doc:{id}:v{n}:row:{n}:col:{name}`)
- **Duplicate/version behavior:** tenant checksum dedupe with parse-cache reuse only for same policy build
- **Representative fixture coverage:** valid CSV, malformed quoting, delimiter ambiguity, formula injection payload rows

### F-005 - TXT (`text/plain`, `.txt`)

- **Status:** Launch
- **Hard caps:** **50 MiB/object**, max **500,000 lines**, max **32,767 chars/line**, max **250 chars/word token span**
- **Media verification:** BOM/encoding and binary control scan before parse
- **Parser/OCR class:** Unicode text normalizer (line segmentation + encoding guardrails)
- **Preflight (deterministic):**
  - reject binary/UTF-16 malformed streams beyond fallback policy
  - decode/parse pipeline runs first, then language gate applies to derived text
  - reject embedded binary attachments, oversized lines, null bytes
- **Post-parse (deterministic):**
  - keep source line numbers for evidence
- **Resource/time limits:** parse budget `60s/job`, memory ceiling `128 MiB/job`
- **Language handling:** decode and normalize first, then language gate; non-English remains review-only
- **Quality/confidence thresholds (provisional):** parser confidence high `>= 0.99`; evidence confidence high only if `> 85%` lines clean/parsable
- **Partial extraction semantics:** malformed fragments route to partial review while preserving intact lines
- **Table handling:** line-oriented only; no table auto-synthesis
- **Formula/macro policy:** script-like constructs are escaped for derivative paths
- **Failure/review states:** `blocked_quality`, `review_required`
- **Evidence-anchor expectations:** line anchors (`doc:{id}:v{n}:line:{n}`)
- **Duplicate/version behavior:** same checksum policy-version dedupe
- **Representative fixture coverage:** clean English text, malformed encoding, null-byte payloads, very long-line rejection

### F-006 - Markdown (`text/markdown`, `.md`)

- **Status:** Launch
- **Hard caps:** same as TXT
- **Media verification:** extension signature and markdown parse-tree sanity checks
- **Parser/OCR class:** Markdown lexer/parser + link/front-matter sanitizer
- **Preflight (deterministic):**
  - enforce extension + content signature checks
  - cap link count (`<=5,000`) and fenced block nesting depth (`<=8`)
- **Post-parse (deterministic):**
  - retain heading/paragraph/list/table anchors
- **Resource/time limits:** parse budget `90s/job`, memory ceiling `256 MiB/job`
- **Language handling:** decode/normalization first; English-only review-eligible
- **Quality/confidence thresholds (provisional):** same as TXT with additional structure quality `> 0.90` for headings/tables
- **Partial extraction semantics:** malformed front-matter or malformed UTF control may produce partial parse with `review_required`
- **Table handling:** table anchors are emitted only when header and delimiter integrity is high
- **Formula/macro policy:** command-like blocks sanitized as inert evidence
- **Failure/review states:** `review_required`, `blocked_unsupported`
- **Evidence-anchor expectations:** heading/line/inline-link anchors
- **Duplicate/version behavior:** checksum dedupe local to tenant
- **Representative fixture coverage:** headings with mixed code fences, broken front matter, non-English text

### F-007 - JPEG (`image/jpeg`, `.jpg/.jpeg`)

- **Status:** Launch
- **Hard caps:** max **20 MiB/image**, max dimension **7680x7680 px**, max megapixels **20 MP**
- **Media verification:** magic-byte and MIME match required
- **Parser/OCR class:** image metadata validator + OCR adapter (English-only output)
- **Preflight (deterministic):**
  - verify magic bytes + MIME match
  - reject animated/CMYK/unsupported color profile profiles if unsupported by OCR chain
  - reject thumbnails, corrupted EXIF orientation markers causing dimension expansion
  - explicit anti-handwriting policy: handwriting-only images are routed to deferred format policy `F-015`
- **Post-parse (deterministic):**
  - OCR run only once per page-like image region
  - if OCR coverage < 65% for readable blocks -> partial review
- **Resource/time limits:** OCR budget `120s/image`, per-image memory cap `1 GiB`
- **Language handling:** OCR output decoded then language gate; non-English routes to review-only
- **Quality/confidence thresholds (provisional):**
  - parser confidence high `>= 0.93`
  - OCR confidence high `>= 0.90`, medium `>= 0.70`; low `< 0.70` => review required
- **Partial extraction semantics:** OCR region failures are marked partial and never auto-approved
- **Table handling:** extract table-like text regions only when cell boundaries are detectable
- **Formula/macro policy:** no text-to-code execution
- **Failure/review states:** `review_required` on OCR-low, `blocked_unsupported` on unreadable formats, `extraction_partial` when OCR fails by region
- **Evidence-anchor expectations:** OCR block anchors (`doc:{id}:v{n}:img:{index}:bbox:{x1},{y1},{x2},{y2}`)
- **Duplicate/version behavior:** checksum dedupe local to tenant
- **Representative fixture coverage:** clear printed text image, rotated image, noisy image, very large image near limit, handwriting sample (deferred)

### F-008 - PNG (`image/png`, `.png`)

- **Status:** Launch
- **Hard caps:** max **20 MiB/image**, max dimension **7680x7680 px**, max **20 MP**
- **Media verification:** magic-byte and chunk-profile checks
- **Parser/OCR class:** image metadata validator + OCR adapter (English-only)
- **Preflight (deterministic):**
  - verify magic bytes + MIME match
  - reject animated PNG and chunk combinations outside approved image parser profile
  - reject huge color tables above parser budget
- **Post-parse (deterministic):**
  - same OCR coverage and block-level anchors as JPEG
- **Resource/time limits:** OCR budget `120s/image`, per-image memory cap `1 GiB`
- **Language handling:** OCR output decoded then language gate; non-English routes to review-only
- **Quality/confidence thresholds (provisional):** same as JPEG
- **Partial extraction semantics:** same as JPEG
- **Table handling:** same as JPEG
- **Formula/macro policy:** same as JPEG
- **Failure/review states:** same as JPEG
- **Evidence-anchor expectations:** same image/bbox anchors as JPEG
- **Duplicate/version behavior:** tenant checksum dedupe with optional derivative reuse
- **Representative fixture coverage:** standard PNG text image, non-English text print, alpha-heavy image, oversized canvas

### F-009 - Tenant notes (`tenant_notes`)

- **Status:** Launch
- **Hard caps:** **1 MiB encoded payload** max, **100,000 Unicode code points** max per note context
- **Media verification:** source payload validator for text body and UTF code-point limits
- **Parser/OCR class:** plain text normalizer (same as TXT with note-scoped metadata)
- **Preflight (deterministic):**
  - operator-submitted text field size cap check against 1 MiB and 100,000 Unicode code points
  - HTML/script stripping and URL extraction guardrails
  - prompt-injection-as-data normalization (no control-flow effect)
- **Post-parse (deterministic):** link/claim extraction with source-attribution anchors to question/thread context
- **Resource/time limits:** per-save validation under `2s`, per-update parse under `2s`
- **Language handling:** decode and normalize first; non-English notes are review-only unless explicit language scope
- **Quality/confidence thresholds (provisional):** parser confidence baseline `1.00`; evidence confidence remains human-confirmation-weighted
- **Partial extraction semantics:** oversized or malformed notes route to deferred upload path rather than partial extraction
- **Table handling:** markdown table-like blocks retained as text rows only if explicit structure exists
- **Formula/macro policy:** prompt-injection text treated as inert data
- **Failure/review states:** `review_required` when malicious payload tags or unsupported language are detected
- **Evidence-anchor expectations:** note-scoped locators (`notes:{note_id}:line:{n}`)
- **Duplicate/version behavior:** content-diff dedupe only when same tenant, same note hash, same play/context hash
- **Representative fixture coverage:** good note block, oversized note block (routed to file upload channel), script-injection text, non-English insertion

### F-010 - Tenant-authorized URLs (`tenant_authorized_urls`)

- **Status:** Launch
- **Hard caps:** response body **2 MiB** max, normalized text **500,000 chars** max, redirects **5**, request timeout **7000 ms**, URL depth budget **1**, page budget **5**
- **Media verification:** strict host validation and DNS/public-target validation from `safe-http.ts`
- **Parser/OCR class:** safe HTTP fetch + HTML-to-text parser + metadata normalizer
- **Preflight (deterministic):**
  - D-010 allowlist and tenant authorization must be present
  - strict host validation and DNS/public-target validation from `safe-http.ts`
  - method only `GET`/`HEAD`, no credentials in URL, no `file://`/`ftp://`
  - explicit URL depth/page budget validation and deny-list/allow-list traversal controls
- **Post-parse (deterministic):**
  - enforce final URL normalization and redirect policy
  - enforce page-budget stop condition after **5** pages
  - if body truncation occurs, classify as `extraction_partial`
- **Resource/time limits:** request timeout `7000ms`, DNS/connection timeout `700ms`, retry budget `2` with bounded exponential backoff
- **Language handling:** language detection after extraction decode; non-English routes to review unless exception configured
- **Quality/confidence thresholds (provisional):**
  - parser confidence high `>= 0.92`
  - extractor confidence high only when title/domain, final URL, and at least one evidence span are captured
  - unresolved redirects/blocked hostnames -> blocked
- **Partial extraction semantics:** if truncation or page cap is reached, mark `extraction_partial` and persist partial evidence
- **Table handling:** table extraction only when HTML table nodes are stable after parser normalization
- **Formula/macro policy:** do not execute scripts; capture only normalized text + metadata
- **Failure/review states:** `blocked_security`, `review_required`, `extraction_partial`
- **Evidence-anchor expectations:** URL + redirect chain + final URL + content hash + locator anchors
- **Duplicate/version behavior:** per-URL/version hash is dedupe key; duplicate crawl under same tenant and policy may reuse extracted evidence with provenance
- **Representative fixture coverage:** authorized URL success, private-IP redirect, max-redirect, bad scheme, timeout, non-English landing page, parked domain sample
- **Compatibility note:** existing `website-viability.ts` compatibility cap (`120,000` bytes/chars) is compatibility-only and not the launch contract

### F-011 - Archive/container inputs (`.zip`, `.7z`, `.tar`, `.rar`, `.gzip`, multi-part archives)

- **Status:** Deferred
- **Hard caps:** no extraction or parse
- **Media verification:** archive/container signatures immediately rejected
- **Parser/OCR class:** none
- **Rationale:** decompression bombs, polymorphic container confusion, and nested unsupported formats are out of launch scope
- **Preflight (deterministic):** classify as unsupported; provide explicit retry path via deferred fixture
- **Post-parse (deterministic):** n/a (blocked pre-parse)
- **Failure/review states:** `blocked_unsupported` (hard fail; no extraction)
- **Resource/time limits:** n/a
- **Language handling:** n/a
- **Quality/confidence thresholds (provisional):** n/a (deferred; no parser output)
- **Partial extraction semantics:** n/a
- **Table handling:** n/a
- **Formula/macro policy:** n/a
- **Evidence-anchor expectations:** n/a
- **Duplicate/version behavior:** n/a
- **Representative fixture coverage:** zip bomb surrogate, nested archive with mixed media, malformed archive rename as .pdf

### F-012 - Macro-enabled office inputs (`.docm`, `.dotm`, `.xlsm`, embedded VBA)

- **Status:** Deferred
- **Hard caps:** no extraction
- **Media verification:** macro signature and extension check before admission
- **Parser/OCR class:** none
- **Rationale:** executable-like macro surfaces and policy-sensitive execution risk
- **Preflight (deterministic):** hard reject by extension/container signature before parser admission
- **Post-parse (deterministic):** n/a (blocked pre-parse)
- **Failure/review states:** `blocked_security` with explicit "macro/active-content disabled"
- **Resource/time limits:** n/a
- **Language handling:** n/a
- **Quality/confidence thresholds (provisional):** n/a (rejected prior to parsing)
- **Partial extraction semantics:** n/a
- **Table handling:** n/a
- **Formula/macro policy:** n/a
- **Evidence-anchor expectations:** n/a
- **Duplicate/version behavior:** n/a (rejected input)
- **Representative fixture coverage:** `.docm` macro workbook, `.xlsm` macro workbook, embedded VBA payload

### F-013 - Password-protected/encrypted documents

- **Status:** Deferred
- **Hard caps:** no extraction
- **Media verification:** encryption and password markers detected before any parse
- **Parser/OCR class:** none
- **Rationale:** cannot verify integrity under D-006 without controlled decryption path
- **Preflight (deterministic):** decrypt marker detection before admission
- **Post-parse (deterministic):** n/a (blocked pre-parse)
- **Failure/review states:** `blocked_security`
- **Resource/time limits:** n/a
- **Language handling:** n/a
- **Quality/confidence thresholds (provisional):** n/a (rejected prior to parsing)
- **Partial extraction semantics:** n/a
- **Table handling:** n/a
- **Formula/macro policy:** n/a
- **Evidence-anchor expectations:** n/a
- **Duplicate/version behavior:** n/a (rejected input)
- **Representative fixture coverage:** encrypted archive/docx/pdf samples

### F-014 - Audio/video (`.mp3`, `.mp4`, `.m4a`, `.wav`, `.avi`, `.mov`, `.mkv`)

- **Status:** Deferred
- **Rationale:** not in launch support scope
- **Hard caps:** no extraction
- **Media verification:** extension/mime consistency for blocked media families
- **Parser/OCR class:** none
- **Preflight (deterministic):** n/a (hard policy deferral)
- **Post-parse (deterministic):** n/a (hard scope deferral)
- **Failure/review states:** `blocked_unsupported`
- **Resource/time limits:** n/a
- **Language handling:** n/a
- **Quality/confidence thresholds (provisional):** n/a (launch excluded)
- **Partial extraction semantics:** n/a
- **Table handling:** n/a
- **Formula/macro policy:** n/a
- **Evidence-anchor expectations:** n/a
- **Duplicate/version behavior:** n/a (launch excluded)
- **Representative fixture coverage:** `.mp3` audio sample, `.mp4` video sample

### F-015 - Handwriting-only images

- **Status:** Deferred
- **Rationale:** OCR model uncertainty is out of scope for launch
- **Hard caps:** no parser extraction
- **Media verification:** handwriting classifier threshold check
- **Parser/OCR class:** none
- **Preflight (deterministic):** n/a (hard scope deferral; handwriting-only media classifier routes here)
- **Post-parse (deterministic):** n/a (hard scope deferral)
- **Failure/review states:** `blocked_unsupported` unless a secondary channel explicitly attached later
- **Resource/time limits:** n/a
- **Language handling:** n/a
- **Quality/confidence thresholds (provisional):** n/a (launch excluded)
- **Partial extraction semantics:** n/a
- **Table handling:** n/a
- **Formula/macro policy:** n/a
- **Evidence-anchor expectations:** n/a
- **Duplicate/version behavior:** n/a (launch excluded)
- **Representative fixture coverage:** handwritten image sample, mixed handwritten-print page
- **Allowed next state:** route to human-review hint and optional deferred work-list

### F-016 - Non-English language payloads (non-Latin scripts or detected language != English with confidence >0.65)

- **Status:** Deferred
- **Rationale:** launch language policy is English only
- **Hard caps:** n/a (policy routing row)
- **Media verification:** applies to decoded outputs from parsed supported formats
- **Parser/OCR class:** n/a
- **Preflight (deterministic):** safe decode and structure extraction occurs first; language classification is then performed on decoded text
- **Post-parse (deterministic):** parsed content is marked `review_required` when language mismatch is detected and explicit non-English scope is missing
- **Failure/review states:** `review_required` if language mismatch and scope is not authorized
- **Resource/time limits:** n/a
- **Language handling:** explicit non-English policy row; confidence and gating are review-only
- **Quality/confidence thresholds (provisional):** n/a (review gating, not parser-gate)
- **Partial extraction semantics:** parse-complete payload may remain in review-only state
- **Table handling:** inherited from source parser behavior with language flag
- **Formula/macro policy:** inherited from source parser behavior
- **Evidence-anchor expectations:** same as source format + language tag
- **Duplicate/version behavior:** n/a
- **Representative fixture coverage:** non-English text in all launch formats, mixed-language docs, low-confidence language signals

### F-017 - Legacy binary document formats (`.doc`, `.xls`, `.rtf`, `.odt`, `.xlsb`)

- **Status:** Deferred
- **Hard caps:** no extraction
- **Media verification:** legacy format signatures blocked at ingress
- **Parser/OCR class:** none
- **Preflight (deterministic):** signature-based hard reject before reservation
- **Post-parse (deterministic):** n/a (blocked pre-parse)
- **Failure/review states:** `blocked_unsupported`
- **Resource/time limits:** n/a
- **Language handling:** n/a
- **Quality/confidence thresholds (provisional):** n/a (rejected prior to parsing)
- **Partial extraction semantics:** n/a
- **Table handling:** n/a
- **Formula/macro policy:** n/a
- **Evidence-anchor expectations:** n/a
- **Duplicate/version behavior:** n/a (rejected input)
- **Representative fixture coverage:** `.doc`, `.xls`, `.rtf`, `.odt`, `.xlsb` samples

## 4) Deterministic parse and quality pipeline (high-level)

1. **Preflight stage (before signed reservation):**
   - tenant/workspace auth + source policy check (where required)
   - format determination from extension + signature + MIME (all three must align or reject)
   - max-size check against D-006 (`50 MiB`) and format-specific caps
   - compressed-container/macro/encrypted checks
   - prompt-injection-as-data sanitization check (data only; no control-flow effect)
   - URL-only safe-fetch policy check for `tenant_authorized_urls`
2. **Reservation + upload / fetch stage:**
   - checksum capture and immutable version identity
3. **Extraction stage (clean-only):**
   - run format parser/OCR class
   - enforce post-parse limits and cap checks
   - emit per-chunk/page/row/column anchors
4. **Quality decision stage:**
   - parser confidence and quality grade classification
   - evidence confidence requires parser + provenance + non-conflict
   - values in this section are provisional launch thresholds and require D-015 calibration
   - if parser confidence high and evidence confidence high, route to `ready` (non-approved review queue)
   - if parser confidence medium, route to `needs_review` (no auto-approval)
   - if parser confidence low or structural failure, route to `blocked`/`extraction_partial`
5. **Approval stage:**
   - only `ready` artifacts may participate in knowledge build/lead features
   - `ready` does **not** imply `approved_knowledge`; explicit human approval is required before any knowledge is marked approved

### Confidence rule (required)

- **Parser confidence** (technical certainty from extraction engine) and **truth/evidence confidence** (claim-grade confidence) are distinct.
- `parser_confidence` can be high with incomplete evidence if no coverage; `evidence_confidence` remains blocked by missing anchors/conflicts.
- Any low-quality path must be explicitly represented as:
  - `blocked_unsupported`, `extraction_partial`, or `review_required`
- No low-confidence path can become approved, directly or indirectly, in a launch state.
- All confidence gates in this document are provisional defaults and must be recalibrated with D-015 golden sets before operational rollout.

## 5) URL safety and connector policy integration (D-010 alignment)

- Sources may only use allow-listed connector cards:
  - `tenant_authorized_urls` (`status: allowed-for-implementation`)
  - `public_official_company_website` (`status: allowed-for-implementation`, live activation deferred by D-010)
- No unrestricted crawling, breadth expansion, or sitemap brute force in launch parsing.
- URL fetch policy:
  - no raw private hosts, no credentials in URL
  - no non-HTTP(S) schemes
  - max redirects = 5 (hard cap)
  - DNS and IP checks for public-only targets
  - timeout budgets and abort propagation required
- Any URL route that fails policy or safe-http validation stays review/blocked and never enters knowledge-ready state.

## 6) Fixtures (representative and adversarial)

**Specialty-chemicals example fixture set (required):**
- `specialty_chem_pdf_formula_package_spec_v1.pdf` (PDF, 120 pages, English)
- `specialty_chem_epoxy_resins_tech_data_sheet.docx` (DOCX, non-macro)
- `specialty_chem_mwf_component_catalog.xlsx` (XLSX, 8 sheets, formulas as literals)
- `specialty_chem_customer_targets.csv` (CSV with 200 rows)
- `specialty_chem_mwf_fluid_image.jpg` (JPEG image with printed spec table)
- `specialty_chem_flooring_pipe_website.txt` (tenant-authorized URL text snapshot)

**Non-industrial fixture set (required):**
- `services_coach_brochure.txt` (TXT)
- `saas_pricing_notes.md` (Markdown)
- `clinic_staff_directory.csv` (CSV, row boundary)
- `nonindustrial_logo_marketing.jpeg` (JPEG, non-technical text)
- `community_health_url.html` (authorized URL fixture)

**Negative fixtures (required):**
- malformed PDF (bad xref/object map)
- encrypted PDF + encrypted XLSX
- `.docm` macro workbook
- compressed archive container
- CSV formula injection payload (e.g., leading `=HYPERLINK`, `=cmd|...`)
- prompt-injection statement embedded in payload
- oversized image and oversized spreadsheet row/column maps
- URL private-network redirect

## 7) Threat/failure handling and state model (concise)

| Input issue | Primary failure state | Human-visible result |
|---|---|---|
| malformed input, bad signature, ambiguous delimiter | `blocked_unsupported` | "Unsupported or malformed format" |
| prompt-injection text patterns | `review_required` (data-only) | "Contains data-pattern instructions; treated as text only" |
| misleading success output (parser says done, low confidence) | `review_required` | "Parsed with warnings; knowledge not approved" |
| decompression bomb indicators | `blocked_security` | "Container and compressed payload rejected" |
| scanner error/timeout after upload | `scanner_error` -> ingestion review queue | no model use, no approved knowledge |
| extractor timeout/resource cap hit | `extraction_partial` | "Partial extraction available in review queue" |

## 8) Untracked-aware checks to complete this slice

- This matrix must be updated and validated against D-006/D-010 counts.
- Row counts and states in this file must be:
  - launch: 10
  - deferred: 7
  - total: 17
- Every row includes all required columns in this document (status, limits, parser class, preflight, post-parse, thresholds, state mapping, evidence anchors, fixtures).
- Adversarial probes below are mandatory for downstream implementation test planning.
- The worker ran trailing-whitespace, no-index diff, and row/status field checks; the parent conductor independently reran the mechanical and semantic checks before acceptance.

## 9) Required adversarial probes for later implementation tests

1. `malformed_input`
   malformed delimiter, bad header signatures, malformed CSV quoting, corrupted PDF dictionary, invalid ZIP as rename.
2. `prompt_injection`
   injected text that attempts policy override or tool directive; ensure treated as data and does not alter ingestion policy/tenant scope.
3. `misleading_success_output`
   parse confidence intentionally low but parser status "finished"; require review state and no auto-approved knowledge.
4. `zip/decompression`
   archive-like payloads and nested compressed segments must remain rejected.
5. `macro/formula`
   macro-bearing office + formula-heavy CSV/XLSX should never auto-execute; formulas preserved as literals and sanitized in exports.
6. `language_guard`
   non-English text payload blocked for launch.
7. `url_reach_policy`
   verify URL fetch respects no-unrestricted-crawl, depth/page caps, and timeout before any evidence capture.

## 10) DoneClaim (task handoff)

- **File:** `docs/product/document-support-matrix.md` (new, single-file write)
- **Checks/exits executed in this pass (pass/fail):**
  - `git status --short docs/product/document-support-matrix.md`
    - `exit 0`
    - pass: new untracked file only
  - `git diff --check -- docs/product/document-support-matrix.md`
    - `exit 0` (no whitespace/patch diagnostics)
  - `rg -n "[ \t]+$" docs/product/document-support-matrix.md; if ($LASTEXITCODE -eq 0) { exit 1 } else { exit 0 }`
    - `exit 0` (no trailing whitespace matches)
  - `git diff --no-index -- /dev/null docs/product/document-support-matrix.md`
    - `exit 1` (expected for untracked-file diff output, no parser warnings)
  - EOF check script:
    - `Last chars: \r\n` and `no extra blank-line tail flag`
  - parse validation via row/status scan:
    - **F-heading count:** 17
    - **Status line count:** 17
    - **Launch status count:** 10
    - **Deferred status count:** 7
    - **Missing required fields:** 0
- **Integrity checks:** no placeholders/TBD, no malformed BOM prefix
- **Placeholders:** 0 required (no TBD, no pseudo-metrics)
- **Exact matrix inventory (accepted in this slice):**
  - Supported format/input rows: **10**
    - PDF, DOCX, XLSX, CSV, TXT, Markdown, JPEG, PNG, Tenant notes, Tenant-authorized URL
  - Deferred rows: **7**
    - Archive/container inputs, Macro-enabled office, Password/encrypted, Audio/video, Handwriting, Non-English language payloads, Legacy binary document formats
- **Adversarial probes required:** 7 (as listed in section 9; includes all requested classes)
- **Cleanup:** **None** (no runtime artifacts created by this worker)
- **Known risks:**
  - Parser confidence calibration drift if later parser adapters differ from assumptions in this matrix
  - OCR confidence variance across image quality classes; risk of false review routing without explicit human review UX
  - De-duplication edge cases when tenants re-upload semantically identical files under new policy versions
  - URL fixture behavior divergence if safe-fetch defaults change outside this slice
