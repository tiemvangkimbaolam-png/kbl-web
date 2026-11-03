# CCCD administrative address conversion

Owner request: after identity OCR, translate an old administrative address into the corresponding current address quickly and accurately, without changing existing POS calculations or historical records.

## Implemented behavior

- Purchase, sale and pawn OCR use the same local resolver after the existing direct Gemini extraction. No additional AI, geocoding, network request or external disclosure of customer addresses is used for conversion.
- OCR instructions explicitly select permanent/current residence, not hometown, birthplace or issuing-office address. The extraction retains the administrative names visible on the card; conversion is a separate deterministic step.
- Exact old province, district and ward hierarchy is required for automatic conversion. A unique destination is applied only for source rows explicitly identifying an entire-unit merge, unchanged unit, rename or type change. House/street/neighborhood prefix and country are retained. Case, standard abbreviations, leading zeros in numeric wards and unaccented input are normalized; a conflicting supplied Vietnamese accent or explicit administrative type is not silently corrected.
- Split/partial units keep the original address and show candidate current wards. No candidate is preselected. The owner confirms the customer's present ward and clicks Apply. The original remains visible, and Undo restores it. Manual edits dismiss the stale suggestion; its controls cannot overwrite a subsequently changed field.
- Missing hierarchy, unknown earlier historical names, unsupported special-area rows or conflicting source codes remain manual. Already-current two-tier addresses are not transformed again. This is administrative equivalence, not verification of actual present residence or a complete historical geocoder.
- Only newly scanned form values are affected. There is no migration, batch rewrite, financial function change, new customer database, address logging or identity-result cache. Original card images continue through the existing storage flow. The original OCR text is retained in the form's review panel/result; no separate persistent text audit database was introduced.

## Official data and limits

Source [NSO old/new conversion workbook](https://danhmuchanhchinh.nso.gov.vn/TAPTIN/BangChuyendoi%C4%90VHCmoi_cu_final.xlsx), sheet `Tổng hợp_không merge `, supplies 10,571 relationships for the 1 July 2025 reorganization. [Current NSO comparison export](https://danhmuchanhchinh.nso.gov.vn/Doi_Chieu_Moi.aspx) was exported for **03/11/2026 against 30/11/2025**, covering all 3,321 current wards and their current province names. The current catalog is used for destination labels, including subsequent type/name updates recorded by NSO; it is not assumed to be the unchanged 2025 province list.

The generated file records both source hashes, sheet/row evidence, dates, notes, conflicts and counts. Three inconsistent old ward codes (00553, 01615, 02485) and two district-code conflicts are blocked from automatic use. Six source rows without an old ward code require manual handling. Numeric/string code representations are normalized, yielding 10,033 old codes and 10,036 distinct old hierarchy entries. Across those exact source entries, 9,567 resolve automatically and 469 require review; this is a source-table check, not a measured accuracy rate on customers or OCR.

The offline snapshot is dated 03/11/2026. It does **not** silently fetch future administrative changes. A snapshot older than 90 days, or implausibly future-dated relative to the machine clock, disables automatic conversion and retains the original address. Refresh requires a newly reviewed official export and replacement data build. Other changes to streets, house numbering or historical units absent from this source are not inferred.

Rebuild with `scripts/build-pos-address-data.py` using the original official XLSX and current XLS export. The tool needs `openpyxl` and `xlrd` for maintenance only; the POS runtime has no new package dependency. Raw public source workbooks are retained locally for evidence and excluded from the source ZIP; all required generated runtime data and its source manifest are included. The export must represent the supplied as-of date; it is not a live API query.

## Verification and installation

- Full suite: **371/371 pass**. New checks cover national-source integrity, unique entire-unit conversion, partial splits, wrong hierarchy/type/accent, no-match, stale snapshots, original-response preservation, and execution of actual purchase/sale/embedded-pawn handlers with nonpersonal OCR fixtures.
- All 511 existing renderer function declarations and 126 pawn function declarations outside the three identity OCR handlers remain byte-identical to the pre-change installed source. Main/index/scale/connection/presentation/website-AI files and the bounded Gemini transport module retain their original hashes.
- Actual browser fixture verifies automatic conversion (3.20 ms including compact panel rendering), split selection with initially disabled Apply, explicit application, Undo, and stale-panel removal after a manual edit. These are synthetic nonpersonal addresses. No customer card was uploaded or customer transaction saved during testing.
- Installed into the actual packaged POS while it was closed, with compact rollback material retained. Packaged/root files match. All prior archive payload bytes and unaffected headers are preserved; reconstruction hash verifies rollback to the prior OCR-speed version. No business database/settings files were written by installation. POS reopened using the existing launcher. An actual customer scan in the reopened application remains for owner confirmation.
- Installed archive SHA256: `4b66e4f5fbf8a5bf24a6911b66bddce71c978db05ae1bd8b56744d2708c07e8b`.

Browser opening initially failed because automatic approval reported exhausted usage. After the owner continued, the same browser tool worked; a local server startup issue was resolved and the actual interactions above completed. No approval or browser security control was bypassed.
