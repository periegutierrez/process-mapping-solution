# Process Mapping Solution · v0.1

Initial local-first implementation of the approved Process Mapping Solution baseline.

## Run locally

The project uses the bundled Node.js runtime when run from Codex, but any current Node.js LTS release with `pnpm` also works.

```powershell
pnpm install
pnpm start
```

Open the local Angular development URL shown in the terminal. A production build is available with:

```powershell
pnpm build
```

## Architecture

```text
Angular standalone UI
  → Signals + Reactive Forms
  → data.service.ts
  → data.worker.ts
  → DuckDB WASM
  → OPFS (`opfs://process-mapping-v01.duckdb`)
```

The worker initializes the required relational tables and stores the v0.1 snapshot in `app_state` so the UI can evolve without changing the import/export contract. If OPFS or the DuckDB WASM runtime cannot initialize, the UI stays usable with a clearly labelled in-memory fallback.

## Implemented in v0.1

- Responsive dashboard shell with process coverage, activity, register preview, and next-step cards.
- Process CRUD with code, description, owner position, time gap, timestamps, and validation.
- Process hierarchy with optional direct parent and explicit top-level process assignment.
- Process owner position maintenance with assigned employees, plus multiple supporting document/image links per process. Supporting-document status is maintained on each link rather than on the process.
- Procedure CRUD with process link, platform, description, time gap, process-specific order, and timestamps.
- Tabbed procedure editor: define procedure details first, then add numbered step-by-step instructions.
- Department/group workload records: each procedure can define separate transaction volume and completion time for every using department or group.
- Procedure template download and filled-template upload with department/group workload rows, process order, time gap, master-data, numeric, and step validation.
- Optional procedure-level and step-level resource links, each labelled as an image or document and opened in a new tab.
- Step CRUD with required title/description, ordering, and per-step resource links.
- Seeded user and platform master data used by the forms.
- Dropdown-value maintenance for supporting-document status, frequency, duration unit, and resource-link type lists.
- Process containment model with optional direct parent and explicit top-level assignment.
- Process editor controls for ordering assigned procedures; the same order is used in the process map and procedure register.
- Worker-side CRUD/persistence boundary and DuckDB schema initialization.
- OPFS persistence attempt with DuckDB memory and in-memory fallback states.
- Process map explorer that starts by asking for a top-level process, displays its processes and sub-processes, and loads procedures when a process is selected. Clicking a procedure opens a step-by-step modal.
- Attachment metadata capture (name, type, size, uploader, timestamp, version) without storing the file blob yet.
- Local audit-log records for create, update, delete, import, and export operations.
- JSON snapshot import/export and sample-data reset.

## Explicitly stubbed for later versions

- JWT/SSO authentication, server-side RBAC, user and platform CRUD screens.
- Backend synchronization, authoritative shared audit trail, and multi-user conflict handling.
- Encryption-at-rest for PII and secure key management.
- File/blob storage, attachment version replacement, and downloads.
- Native `.duckdb` / Parquet archive export and restore. JSON export is the v0.1 interchange format.
- Advanced graph layouts, filtering, 500-node performance tuning, Cytoscape/D3 replacement, and PDF/CSV view export.
- Full process analytics and backend-backed offline sync.

## Notes

The DuckDB WASM binaries and browser workers are copied from the installed package into same-origin `/duckdb` assets at build time, so the runtime does not need a CDN request.
