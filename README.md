# RePro — Office Receipt Scanner & Processing Management System

RePro is a local-first, full-stack office receipt scanning and expense processing management application. It supports direct scanning from AirScan/eSCL network and flatbed printers (e.g. HP Laser MFP series), document camera capture, drag-and-drop file ingestion, automatic OCR metadata extraction, folder organization by Month & Year, Free Mode inbox triage, and one-click ZIP exports.

---

## Key Features

- **Month & Year Folders**: Create and organize receipts by month/year (e.g. `September 2026`, `August 2026`) or custom project binders.
- **Direct-to-Folder Scanning**: Open any folder and scan receipts directly into it.
- **Physical Printer / AirScan Driver**: Native integration with AirScan / eSCL flatbed scanners with motor polling.
- **Free Mode / Inbox**: Rapidly scan batches of receipts without pre-selecting a folder, with single-click **"Auto-file by Date"** and batch triage.
- **Minimalist White Theme**: Clean white UI with simplified forms containing strictly the Receipt Name field.
- **Single-Folder & Master ZIP Export**: Download individual folder packages with images and `manifest.csv`, or export the entire multi-folder archive for accounting and tax records.
- **Docker & Coolify Ready**: Multi-stage Dockerfile and docker-compose configuration with persistent volume for `/app/server/data`.

---

## Local Development

```bash
# Install dependencies
npm install

# Start both backend server and frontend client
npm run dev
```

- Web UI: `http://localhost:5174` (or `http://localhost:5173`)
- API Server: `http://localhost:3001`

---

## Docker & Coolify Deployment

### Standalone Docker
```bash
docker compose up -d --build
```

### Coolify Deployment
1. Connect this repository to Coolify.
2. Select **Dockerfile** as the build pack.
3. Set port to `3000`.
4. Add a persistent storage volume mounted at:
   ```
   /app/server/data
   ```
5. Set the healthcheck endpoint to `/health`.
6. Deploy!
