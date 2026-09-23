# Internet Archive S3 File Manager

A file manager like UI for your Internet Archive identifier using Internet Archive's S3 API (`s3.us.archive.org`).

---

## How to Use

### Option 1: Live Web Version (Easiest)

Use the hosted web application directly from your browser without installing or hosting anything.

- **Privacy & Security**: 100% client-side application. Zero credentials, keys, or files are sent to any third-party server.
- **Direct S3 Connection**: Authenticates directly from your browser to `s3.us.archive.org` via CORS using your Internet Archive S3 keys (`Authorization: LOW <access_key>:<secret_key>`).
- **Steps**:
  1. Open the live web app.
  2. Click **S3 Keys** in the top navigation bar.
  3. Enter your **S3 Access Key** and **S3 Secret Key** from [archive.org/account/s3.php](https://archive.org/account/s3.php).
  4. Click **Save & Connect**. All item identifiers owned by your account will automatically populate the dropdown.

### Option 2: Deploy Your Own (Recommended)

Host your own private instance as a single, standalone Cloudflare Worker using [`worker.js`](worker.js). Your S3 keys are stored safely as encrypted server secrets, so no keys are ever requested or stored in the browser UI.

#### Cloudflare Dashboard Step-by-Step

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the navigation sidebar, go to **Compute (Workers) > Workers & Pages** and click **Create**.
3. Choose **Start with Hello World!**, give it a name, and click **Deploy**.
4. On the worker detail page, click **Edit code**.
5. Paste the entire contents of [`worker.js`](worker.js) into the editor, replacing all default code, and click **Deploy**.
6. Navigate to the worker's **Settings** tab and select **Variables and Secrets**.
7. Under **Secrets**, click **Add** and configure your two keys (no item identifier needed—all items owned by your credentials are auto-detected):
   - `IA_ACCESS_KEY`: Your Internet Archive S3 Access Key.
   - `IA_SECRET_KEY`: Your Internet Archive S3 Secret Key.
8. Click **Deploy**. Visit your `*.workers.dev` URL to access your private manager.

> [!TIP]
> **Recommended**: Enable Cloudflare Access in the worker settings and select "Allow only me" to protect from others using it since it's a public URL.

---

## Features

- **File Explorer**: Windows Explorer style dense layout with keyboard navigation, sorting (Name, Size, Modified Date), and source filtering (All, Original, Derivative).
- **Two-Way Drag-and-Drop**:
  - Drag files or folders from your PC into any subfolder to upload with preserved directory structures.
  - Drag file rows out of the browser directly onto your PC desktop or file explorer to download.
  - Drag folders out or click the download icon to save all folder contents to your computer.
- **Automatic Identifier Discovery**: All items associated with your S3 credentials are automatically loaded into the quick-switch dropdown.
- **Batch Operations**: Multi-selection for batch deletions (with cascade derivative cleanup) and batch moving between folders.
- **Scale & Fullscreen**: Draggable slider adjusting density from 100% down to 200% compact mode, plus fullscreen mode.
- **Task Inspector**: Live polling and status display of running Internet Archive background catalog tasks.
- **Theme Support**: Default auto theme matching based on OS preferences, with manual Dark/Light toggle.

---

## License

MIT
