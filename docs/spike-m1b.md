# Spike M1b: poster footer and download tracking (festie.app)

Read-only investigation of the festie repo. No festie code was changed.

## 1. Where a footer can be added (exporter, Go)

- Posters are HTML rendered in headless Chromium (`apps/exporter/internal/exporter`). Each output page is one `<div class="export-page">` with fixed `width`/`height` and `overflow:hidden`, built in `renderPreparedHTML` (`prepared_renderer.go:224-267`).
- JPG and JPG zip take an element screenshot per page (`renderJPG`, `renderJPGZip` in `page_renderer.go`), so a taller page div gives a taller image with no capture change. PDF uses a fixed `PageHeightPx` paper size (`renderPDF`), so PDF would need more work: out of the MVP.
- Job data reaches the exporter as `PreparedRenderDocument.Job` (`map[string]any`, `exporter.go:118`), written by the API in `requestTemplateGeneration` (`template-export.service.ts`, `renderPayload.job`, ~line 495). `adFooter` can ride there with no schema change.
- Two render paths use the same renderer: whole-job (`processPreparedJob`) and per-item (`renderAndStoreDocument`, one stored file per poster, rows in `generated_template_document`). Both build the template through `preparedTemplateToTemplate`, so one `AdFooter` field on `Template` covers both.
- Assets: `waitForAssetsReady` waits for images but resolves on error, so a broken ad image would silently render a broken footer. The exporter should check the image first and drop the footer on failure.
- To verify in M7: the badge/watermark (`exportBadgeHTML(tpl)`) is positioned in the page div and could land over the ad once the div is taller.

## 2. How the "generated" count can be taken

- The exporter updates `export_jobs` and publishes a Redis event (`queue.go` `PUBLISH`; `publishJobUpdate(..., "COMPLETED")` in `per_item_job.go`). The API listens in `template-export-events.service.ts` (api-core). That is the hook: on COMPLETED with `job.adFooter`, send `POSTER_GENERATED` events.
- Per-item jobs: count rows with status `GENERATED` (one per poster), key `documentId:generated`. Re-running a job skips finished documents, and the key makes events idempotent. Other jobs: count rendered pages, key `jobId:generated`.

## 3. How downloads happen today

| Path | How the file is served | Trackable server-side? |
|---|---|---|
| Public poster, whole job | `getCompletedDownload` returns metadata, Next route streams (`result-poster-downloads/:jobId/file`) | Yes |
| Public poster, single document | `getPosterFile` (`public-result-poster.service.ts`) | Yes |
| Admin bulk zip / job zip | signed ticket, `GeneratedDocumentDownloadController` + `resolveZipTicket`, `createJobZipTicket` | Yes |
| Admin single document | `programme-documents-panel.tsx:176-182` calls `downloadFile(document.fileUrl)` straight to storage | **No** |
| Admin single job file (background jobs panel) | `fileUrl` of the job, straight to storage | **No** |

Which flows create per-item documents: only `requestDocuments` (`generated-template-document.service.ts:354`, `trackDocuments: true`). The generic "Download templates" dialog creates a plain job with one file.

## 4. Decisions and changes to the plan

- The risk in the plan was real. Fix in M7: serve admin single-file and job downloads through a signed-ticket route like the zip (preferred), otherwise an authenticated, idempotent report mutation.
- PDF posters get no footer in the MVP; JPG and JPG zip do.
- Plan sections 8.5, 8.6, the risk note and the M7 definition of done are updated.
