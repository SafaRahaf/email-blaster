# Email Blaster

A single-page email campaign workspace built with Next.js. The browser handles the spreadsheet, templates, batching, and local persistence; email delivery runs through the `/api/send-email` Node.js serverless function. There is no always-on application server, but the app must be deployed to a host that supports Next.js serverless route handlers.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sending uses Gmail SMTP, so enter an active Gmail address and its Google app password in the Senders panel. Gmail app passwords require two-step verification. For live sending, use a small test list first.

## Use

1. Import a CSV or edit the Leads sheet. The first row must contain an `Email` header. Optional headers include `First_Name`, `Last_Name`, and `From_Email`; missing `Status`, `Time`, `Date`, and `Note` columns are added automatically.
2. Configure one or more active Gmail senders. A row's `From_Email`, when present, must match an active configured sender; otherwise the row is marked failed. Without it, senders are selected according to their remaining weights.
3. Use `{{first_name}}`, `{{last_name}}`, or any other CSV header as a placeholder in the subject and HTML body.
4. Choose a batch size and optional attachments, then Start. The app advances through all pending rows, applies each sender's delay and weight, and updates the sheet with results. Simulation Mode exercises the flow without sending.
5. Download CSV to export the current sheet, including delivery statuses.

Files attached to each email may total up to 3 MB. Gmail's own quotas and anti-abuse limits still apply; this tool does not bypass them.

## Data and credentials

Lead sheets and sender configuration are stored in this browser's `localStorage`. Sender passwords are held only in page memory, are removed from any legacy saved sender data, and must be entered again after a reload. During delivery, the password and email content are sent over HTTPS to the serverless route, which connects to Gmail over TLS.

## Deploy

Deploy this project to Vercel or another Next.js-compatible serverless host. Do not configure a static export: the `/api/send-email` route needs a Node.js runtime and outbound SMTP access. No deployment SMTP secret is required because each user supplies their own Gmail app password in the page.

Run checks before deployment:

```bash
npm run lint
npx tsc --noEmit
npm run build
```
