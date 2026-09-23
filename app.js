const AppState = {
  item: "",
  currentPath: "",
  allFiles: [],
  filteredFiles: [],
  selectedFilePaths: new Set(),
  currentPreviewFile: null,
  sourceFilter: "all",
  searchQuery: "",
  sortField: "name",
  sortAsc: true,
  accessKey: "",
  secretKey: "",
  density: "compact",
  theme: "auto",
  isServerConnected: false,
  fileTasks: new Map(),
  tasksById: new Map(),
  userBuckets: []
};

function getTaskForFile(e) {
  if (!e || !AppState.fileTasks) return null;
  if (AppState.fileTasks.has(e)) return AppState.fileTasks.get(e);
  const t = e.replace(/^\/+/g, "");
  if (AppState.fileTasks.has(t)) return AppState.fileTasks.get(t);
  for (const [s, n] of AppState.fileTasks.entries()) {
    const a = s.replace(/^\/+/g, "");
    if (a === t || t.endsWith("/" + a) || a.endsWith("/" + t)) return n;
  }
  return null;
}

function getFileForTask(e) {
  if (!e || !AppState.tasksById) return null;
  const t = AppState.tasksById.get(String(e));
  return t && t.file || null;
}

function defineTaskFile(e, t, s = null) {
  if (!e || !t) return false;
  const n = t.trim().replace(/^\/+/g, "");
  const a = String(e).trim();
  const o = AppState.tasksById.get(a) || {};
  const i = (o.cmd || o.task || "").toLowerCase();
  const l = s || o.type || (i.includes("delete") ? "delete" : i.includes("rename") || i.includes("move") ? "move" : "task");
  const r = { ...o, taskId: a, file: n, type: l, status: o.status || "running", source: "manual" };
  AppState.fileTasks.set(n, r);
  AppState.tasksById.set(a, r);
  renderCurrentFolder();
  return true;
}

function promptDefineTaskFile(e, t = "") {
  const s = getFileForTask(e) || "";
  const n = "Define target file for Task #" + e + " (" + (t || "task") + "):\nEnter file path (e.g. video.mp4 or movies/film.mp4):";
  const a = prompt(n, s);
  if (!a) return;
  const o = a.trim().replace(/^\/+/g, "");
  if (!o) return;
  const i = (t || "").toLowerCase();
  const l = i.includes("delete") ? "delete" : i.includes("rename") || i.includes("move") ? "move" : "task";
  defineTaskFile(e, o, l);
  openCatalogTasksModal();
}

function locateFileInExplorer(e) {
  if (!e) return;
  const t = e.trim().replace(/^\/+/g, "");
  const n = t.split("/").slice(0, -1).join("/");
  closeModal("modalCatalogTasks");
  navigateToPath(n);
  setTimeout(() => {
    const a = document.getElementById("row_" + escapeId(t));
    if (a) {
      a.scrollIntoView({ behavior: "smooth", block: "center" });
      a.classList.add("is-selected-row");
      setTimeout(() => a.classList.remove("is-selected-row"), 2000);
    }
  }, 150);
}

const UploadEngine = {
  queue: [],
  activeUploads: 0,
  maxConcurrency: 2,
  totalBytes: 0,
  uploadedBytes: 0,
  startTime: null,
  speedHistory: [],
  isPaused: false
};

window.addEventListener("DOMContentLoaded", () => {
  loadStoredSettings();
  initDragAndDrop();

  const urlParam = new URLSearchParams(window.location.search).get("item");
  if (urlParam) {
    AppState.item = urlParam.trim();
  }

  checkS3Status();
});

function loadStoredSettings() {
  AppState.accessKey = (localStorage.getItem("ia_access_key") || "").trim();
  AppState.secretKey = (localStorage.getItem("ia_secret_key") || "").trim();
  const defItem = (localStorage.getItem("ia_default_item") || "").trim();
  if (defItem) {
    AppState.item = defItem;
  }

  const elAccess = document.getElementById("inputAccessKey");
  const elSecret = document.getElementById("inputSecretKey");
  if (elAccess) elAccess.value = AppState.accessKey;
  if (elSecret) elSecret.value = AppState.secretKey;

  const t = localStorage.getItem("ia_theme") || "auto";
  setTheme(t);

  const savedZoom = localStorage.getItem("ia_table_zoom") || "100";
  applyTableScale(savedZoom);

  const isHidden = localStorage.getItem("ia_preview_pane_hidden") === "1";
  const pPane = document.getElementById("previewPane");
  const btnPrev = document.getElementById("btnTogglePreview");
  if (isHidden && pPane) {
    pPane.classList.add("is-hidden");
    if (btnPrev) btnPrev.classList.remove("is-primary");
  } else if (btnPrev) {
    btnPrev.classList.add("is-primary");
  }
}

async function saveSettings() {
  const elAccess = document.getElementById("inputAccessKey");
  const elSecret = document.getElementById("inputSecretKey");
  const aKey = elAccess ? elAccess.value.trim() : "";
  const sKey = elSecret ? elSecret.value.trim() : "";
  const resDiv = document.getElementById("settingsTestResult");
  const btn = document.querySelector("#modalSettings .modal-card-foot .button.is-primary");

  if (!aKey || !sKey) {
    if (resDiv) {
      resDiv.style.display = "block";
      resDiv.className = "notification is-warning is-light is-size-7 p-3 mb-3";
      resDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Please enter both Access Key and Secret Key.';
    }
    return;
  }

  if (btn) btn.classList.add("is-loading");
  if (resDiv) {
    resDiv.style.display = "block";
    resDiv.className = "notification is-info is-light is-size-7 p-3 mb-3";
    resDiv.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Validating S3 credentials...';
  }

  try {
    const probe = await fetch("https://s3.us.archive.org/", {
      method: "GET",
      headers: { "Authorization": "LOW " + aKey + ":" + sKey }
    });
    if (probe.status === 403) {
      if (btn) btn.classList.remove("is-loading");
      if (resDiv) {
        resDiv.style.display = "block";
        resDiv.className = "notification is-danger is-light is-size-7 p-3 mb-3";
        resDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Authentication failed (HTTP 403 Forbidden). S3 keys were rejected.';
      }
      return;
    }
  } catch { }

  if (btn) btn.classList.remove("is-loading");
  AppState.accessKey = aKey;
  AppState.secretKey = sKey;
  localStorage.setItem("ia_access_key", aKey);
  localStorage.setItem("ia_secret_key", sKey);

  closeModal("modalSettings");
  checkS3Status();
}

function togglePasswordVisibility(id, btn) {
  const input = document.getElementById(id);
  if (!input) return;
  const isPass = input.type === "password";
  input.type = isPass ? "text" : "password";
  const icon = btn ? btn.querySelector("i") : null;
  if (icon) {
    icon.className = isPass ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  }
}

function applyTableScale(val) {
  const num = parseInt(val, 10) || 100;
  const clamped = Math.max(100, Math.min(200, num));
  const table = document.getElementById("fileListTable");
  const label = document.getElementById("labelTableZoom");
  const input = document.getElementById("inputTableZoom");
  if (label) label.textContent = clamped + "%";
  if (input && String(input.value) !== String(clamped)) input.value = clamped;
  if (table) {
    table.style.zoom = 100 / clamped;
  }
  localStorage.setItem("ia_table_zoom", clamped);
}

function applyDensity(e) {
  applyTableScale(e === "ultracompact" ? 100 : e === "comfortable" ? 130 : 100);
}

function toggleDensity() { }

function toggleFullscreen() {
  const icon = document.getElementById("iconFullscreen");
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => { });
    if (icon) icon.innerHTML = '<i class="fa-solid fa-compress"></i>';
  } else {
    document.exitFullscreen().catch(() => { });
    if (icon) icon.innerHTML = '<i class="fa-solid fa-expand"></i>';
  }
}

document.addEventListener("fullscreenchange", () => {
  const icon = document.getElementById("iconFullscreen");
  if (icon) {
    icon.innerHTML = document.fullscreenElement ? '<i class="fa-solid fa-compress"></i>' : '<i class="fa-solid fa-expand"></i>';
  }
});

function getSystemTheme() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setTheme(e) {
  AppState.theme = e;
  if (!e || e === "auto") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("ia_theme");
  } else {
    document.documentElement.setAttribute("data-theme", e);
    localStorage.setItem("ia_theme", e);
  }
}

function toggleTheme() {
  const cur = AppState.theme && AppState.theme !== "auto" ? AppState.theme : getSystemTheme();
  const next = cur === "dark" ? "light" : "dark";
  setTheme(next);
}

function toggleNavbarMenu() {
  const menu = document.getElementById("navbarExplorerMenu");
  if (menu) menu.classList.toggle("is-active");
}

async function checkS3Status() {
  const btn = document.getElementById("btnS3Status");
  const icon = document.getElementById("iconS3Status");
  const label = document.getElementById("labelS3Status");
  const badge = document.getElementById("settingsS3StatusBadge");

  if (icon) icon.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
  if (label) label.textContent = "Checking...";
  if (btn) btn.className = "button is-small is-light";

  let serverConnected = false;
  try {
    const sRes = await fetch("/api/s3-status?t=" + Date.now());
    if (sRes.ok) {
      const sJson = await sRes.json();
      if (sJson.connected) {
        serverConnected = true;
        AppState.isServerConnected = true;
        if (sJson.defaultItem && !AppState.item) {
          AppState.item = sJson.defaultItem;
        }
      }
    }
  } catch { }

  const hasLocalKeys = Boolean(AppState.accessKey && AppState.secretKey);

  if (serverConnected) {
    if (btn) btn.className = "button is-small is-success is-light";
    if (icon) icon.innerHTML = '<i class="fa-solid fa-circle-check has-text-success"></i>';
    if (label) label.textContent = "S3: Connected";
    if (btn) btn.title = "Connected via Cloudflare secrets.";
    if (badge) {
      badge.className = "tag is-small is-success is-light";
      badge.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> Connected (Worker Secrets)';
    }
    await fetchUserBuckets();
  } else if (hasLocalKeys) {
    try {
      const probeRes = await fetch("https://s3.us.archive.org/", {
        method: "GET",
        headers: { "Authorization": "LOW " + AppState.accessKey + ":" + AppState.secretKey }
      });
      if (probeRes.ok || probeRes.status === 200) {
        AppState.isServerConnected = true;
        if (btn) btn.className = "button is-small is-success is-light";
        if (icon) icon.innerHTML = '<i class="fa-solid fa-circle-check has-text-success"></i>';
        if (label) label.textContent = "S3: Connected";
        if (btn) btn.title = "Connected with your S3 keys.";
        if (badge) {
          badge.className = "tag is-small is-success is-light";
          badge.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> Connected';
        }
        await fetchUserBuckets();
      } else if (probeRes.status === 403) {
        AppState.isServerConnected = false;
        if (btn) btn.className = "button is-small is-danger is-light";
        if (icon) icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation has-text-danger"></i>';
        if (label) label.textContent = "S3: Invalid Keys";
        if (btn) btn.title = "S3 keys rejected (403 Forbidden). Click to update.";
        if (badge) {
          badge.className = "tag is-small is-danger is-light";
          badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Invalid Keys (403)';
        }
      } else {
        AppState.isServerConnected = true;
        if (btn) btn.className = "button is-small is-success is-light";
        if (icon) icon.innerHTML = '<i class="fa-solid fa-circle-check has-text-success"></i>';
        if (label) label.textContent = "S3: Connected";
        await fetchUserBuckets();
      }
    } catch {
      AppState.isServerConnected = true;
      if (btn) btn.className = "button is-small is-success is-light";
      if (icon) icon.innerHTML = '<i class="fa-solid fa-key has-text-success"></i>';
      if (label) label.textContent = "S3: Keys Set";
      await fetchUserBuckets();
    }
  } else {
    AppState.isServerConnected = false;
    if (btn) btn.className = "button is-small is-danger is-light";
    if (icon) icon.innerHTML = '<i class="fa-solid fa-circle-xmark has-text-danger"></i>';
    if (label) label.textContent = "S3: Not Connected";
    if (btn) btn.title = "No S3 credentials found. Click to enter keys.";
    if (badge) {
      badge.className = "tag is-small is-danger is-light";
      badge.innerHTML = '<i class="fa-solid fa-circle-xmark mr-1"></i> Not Connected (Read-Only)';
    }
    updateBucketDropdown([]);
    if (AppState.item) {
      loadItemFiles();
    }
  }
}

async function testS3Connection() {
  const btn = document.getElementById("btnTestS3Connection");
  const resDiv = document.getElementById("settingsTestResult");
  const sAccess = (document.getElementById("inputAccessKey")?.value || "").trim();
  const sSecret = (document.getElementById("inputSecretKey")?.value || "").trim();

  if (!btn || !resDiv) return;
  const oldHtml = btn.innerHTML;
  btn.classList.add("is-loading");
  btn.disabled = true;
  resDiv.style.display = "none";

  try {
    let connected = false;
    let errMsg = "";
    if (sAccess && sSecret) {
      const probe = await fetch("https://s3.us.archive.org/", {
        method: "GET",
        headers: { "Authorization": "LOW " + sAccess + ":" + sSecret }
      });
      if (probe.ok || probe.status === 200) {
        connected = true;
      } else if (probe.status === 403) {
        errMsg = "Authentication failed (HTTP 403 Forbidden). S3 keys were rejected.";
      } else {
        connected = true;
      }
    } else {
      errMsg = "Please enter both Access Key and Secret Key.";
    }

    resDiv.style.display = "block";
    if (connected) {
      resDiv.className = "notification is-success is-light is-size-7 p-3 mb-3";
      resDiv.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> <strong>S3 Connection Successful!</strong> Keys authenticated against archive.org S3.';
      const badge = document.getElementById("settingsS3StatusBadge");
      if (badge) {
        badge.className = "tag is-small is-success is-light";
        badge.innerHTML = '<i class="fa-solid fa-circle-check mr-1"></i> Connected';
      }
    } else {
      resDiv.className = "notification is-danger is-light is-size-7 p-3 mb-3";
      resDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> ' + escapeHtml(errMsg || "Connection failed.");
    }
  } catch (err) {
    resDiv.style.display = "block";
    resDiv.className = "notification is-danger is-light is-size-7 p-3 mb-3";
    resDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Connection error: ' + escapeHtml(err.message);
  } finally {
    btn.classList.remove("is-loading");
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
}

async function fetchUserBuckets() {
  const sel = document.getElementById("selectItemIdentifier");
  if (!sel) return;

  let buckets = [];
  try {
    if (AppState.accessKey && AppState.secretKey) {
      const res = await fetch("https://s3.us.archive.org/", {
        headers: { "Authorization": "LOW " + AppState.accessKey + ":" + AppState.secretKey }
      });
      if (res.ok) {
        const xml = await res.text();
        const regex = /<Bucket>[\s\S]*?<Name>([^<]+)<\/Name>/gi;
        let m;
        while ((m = regex.exec(xml)) !== null) {
          buckets.push(m[1].trim());
        }
      }
    } else {
      const wRes = await fetch("/api/buckets?t=" + Date.now());
      if (wRes.ok) {
        const bData = await wRes.json();
        if (bData.buckets) buckets = bData.buckets;
      }
    }
  } catch { }

  AppState.userBuckets = buckets;
  updateBucketDropdown(buckets);

  if (buckets.length > 0) {
    if (!AppState.item || !buckets.includes(AppState.item)) {
      AppState.item = buckets[0];
    }
    sel.value = AppState.item;
    loadItemFiles();
  } else if (AppState.item) {
    loadItemFiles();
  }
}

function updateBucketDropdown(buckets) {
  const sel = document.getElementById("selectItemIdentifier");
  if (!sel) return;

  if (!buckets || buckets.length === 0) {
    sel.innerHTML = '<option value="" disabled selected hidden>' + (AppState.isServerConnected ? 'No items found on this S3 key' : 'Connect S3 to list items') + '</option>';
    return;
  }

  let html = '<option value="" disabled ' + (!AppState.item ? 'selected' : '') + ' hidden>Select Identifier (' + buckets.length + ')...</option>';
  for (const b of buckets) {
    const isSel = b === AppState.item ? " selected" : "";
    html += '<option value="' + escapeHtml(b) + '"' + isSel + '>' + escapeHtml(b) + '</option>';
  }
  sel.innerHTML = html;
}

function onIdentifierSelect(val) {
  resetPreviewPane();
  if (!val) {
    AppState.item = "";
    const tbody = document.getElementById("fileListTbody");
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" class="has-text-centered p-5 has-text-grey"><span class="icon is-large mb-2"><i class="fa-solid fa-box-open fa-2x"></i></span><div>Select an identifier from the dropdown above to load files.</div></td></tr>';
    }
    return;
  }
  AppState.item = val;
  localStorage.setItem("ia_default_item", val);
  loadItemFiles();
}

async function loadItemFiles() {
  resetPreviewPane();
  if (!AppState.item) {
    const tbody = document.getElementById("fileListTbody");
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" class="has-text-centered p-5 has-text-grey"><span class="icon is-large mb-2"><i class="fa-solid fa-box-open fa-2x"></i></span><div>Select an identifier from the dropdown above to load files.</div></td></tr>';
    }
    return;
  }

  const tbody = document.getElementById("fileListTbody");
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="8" class="has-text-centered p-5 has-text-grey"><i class="fa-solid fa-circle-notch fa-spin fa-2x mb-2"></i><div>Fetching files for <strong class="has-text-primary">' + escapeHtml(AppState.item) + '</strong>&hellip;</div></td></tr>';
  }

  AppState.selectedFilePaths.clear();
  updateSelectionButtons();

  try {
    let resultData = null;
    try {
      const nRes = await fetch("/api/files?item=" + encodeURIComponent(AppState.item) + "&t=" + Date.now());
      if (nRes.ok) resultData = await nRes.json();
    } catch { }

    if (!resultData || !resultData.files) {
      const metaUrl = "https://archive.org/metadata/" + encodeURIComponent(AppState.item) + "/files?t=" + Date.now();
      const metaRes = await fetch(metaUrl);
      if (!metaRes.ok) throw new Error("Metadata API returned HTTP " + metaRes.status);
      const metaJson = await metaRes.json();
      const mapped = (metaJson.result || []).map(r => ({
        name: r.name,
        size: parseInt(r.size || "0", 10) || 0,
        format: r.format || (r.name.split(".").pop() || "").toUpperCase(),
        mtime: r.mtime ? parseInt(r.mtime, 10) * 1000 : null,
        source: r.source || "unknown",
        md5: r.md5 || ""
      }));
      let total = 0;
      mapped.forEach(r => { total += r.size; });
      resultData = { files: mapped, totalFiles: mapped.length, totalBytes: total };
    }

    AppState.allFiles = resultData.files || [];
    const stCount = document.getElementById("statFilesCount");
    const stSize = document.getElementById("statTotalSize");
    if (stCount) stCount.textContent = resultData.totalFiles || AppState.allFiles.length;
    if (stSize) stSize.textContent = formatBytes(resultData.totalBytes || 0);

    renderCurrentFolder();
    fetchItemViews(AppState.item);
    fetchCatalogTasks();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" class="has-text-centered p-5 has-text-danger"><i class="fa-solid fa-triangle-exclamation fa-2x mb-2"></i><div>Failed to load files: ' + escapeHtml(err.message) + '</div><button class="button is-small is-light mt-3" onclick="loadItemFiles()">Retry</button></td></tr>';
    }
  }
}

async function fetchItemViews(e) {
  const elCount = document.getElementById("statViewsCount");
  const elTag = document.getElementById("statViewsTag");
  if (!elCount) return;

  try {
    let viewsData = null;
    try {
      const vRes = await fetch("https://be-api.us.archive.org/views/v1/short/" + encodeURIComponent(e));
      if (vRes.ok) {
        viewsData = (await vRes.json())[e] || null;
      }
    } catch { }

    if (!viewsData) {
      try {
        const v2 = await fetch("/api/views?item=" + encodeURIComponent(e));
        if (v2.ok) viewsData = (await v2.json()).views || null;
      } catch { }
    }

    if (viewsData) {
      const allTime = parseInt(viewsData.all_time || 0, 10);
      let formatted = allTime.toLocaleString();
      if (allTime >= 1000000) formatted = (allTime / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
      else if (allTime >= 1000) formatted = (allTime / 1000).toFixed(1).replace(/\.0$/, "") + "K";
      elCount.textContent = formatted;
      if (elTag) elTag.title = "Internet Archive Views for " + e + ": " + allTime.toLocaleString();
    } else {
      elCount.textContent = "--";
    }
  } catch {
    elCount.textContent = "--";
  }
}

function refreshCurrentFolder() {
  loadItemFiles();
}

function navigateToPath(e) {
  AppState.currentPath = e.replace(/^\/+/g, "").replace(/\/+$/g, "");
  AppState.selectedFilePaths.clear();
  updateSelectionButtons();
  renderBreadcrumbs();
  renderCurrentFolder();
  updateOverlayTargetPath();
}

function renderBreadcrumbs() {
  const elList = document.getElementById("breadcrumbList");
  if (!elList) return;
  const parts = AppState.currentPath ? AppState.currentPath.split("/") : [];
  let html = '<li class="' + (parts.length === 0 ? "is-active" : "") + '"><a onclick="navigateToPath(\'\')"><i class="fa-solid fa-house mr-1"></i> root</a></li>';
  let accum = "";
  for (let i = 0; i < parts.length; i++) {
    accum += (i > 0 ? "/" : "") + parts[i];
    const isLast = i === parts.length - 1;
    html += '<li class="' + (isLast ? "is-active" : "") + '"><a onclick="navigateToPath(\'' + escapeHtml(accum) + '\')">' + escapeHtml(parts[i]) + '</a></li>';
  }
  elList.innerHTML = html;
}

function renderCurrentFolder() {
  const prefix = AppState.currentPath ? AppState.currentPath + "/" : "";
  const foldersMap = new Map();
  const directFiles = [];

  for (const f of AppState.allFiles) {
    const full = f.name;
    if (prefix && !full.startsWith(prefix)) continue;
    const rel = prefix ? full.substring(prefix.length) : full;
    const slashIdx = rel.indexOf("/");
    if (slashIdx !== -1) {
      const folderName = rel.substring(0, slashIdx);
      if (foldersMap.has(folderName)) {
        foldersMap.get(folderName).count++;
      } else {
        foldersMap.set(folderName, { name: folderName, fullPath: prefix + folderName, isFolder: true, count: 1 });
      }
    } else if (full.endsWith("/")) {
      const clean = full.replace(/\/+$/g, "").split("/").pop();
      if (clean && !foldersMap.has(clean)) {
        foldersMap.set(clean, { name: clean, fullPath: full.replace(/\/+$/g, ""), isFolder: true, count: 0 });
      }
    } else {
      directFiles.push({ ...f, isFolder: false, displayName: rel, fullPath: full });
    }
  }

  let list = [];
  const q = AppState.searchQuery.toLowerCase();
  for (const fld of foldersMap.values()) {
    if (!q || fld.name.toLowerCase().includes(q)) list.push(fld);
  }
  for (const fi of directFiles) {
    if (AppState.sourceFilter === "original" && fi.source !== "original") continue;
    if (AppState.sourceFilter === "derivative" && fi.source === "original") continue;
    if (q && !fi.displayName.toLowerCase().includes(q)) continue;
    list.push(fi);
  }

  list.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    if (a.isFolder && b.isFolder) return a.name.localeCompare(b.name);
    let valA = a[AppState.sortField];
    let valB = b[AppState.sortField];
    if (AppState.sortField === "size") {
      return AppState.sortAsc ? valA - valB : valB - valA;
    }
    if (AppState.sortField === "mtime") {
      return AppState.sortAsc ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
    }
    return AppState.sortAsc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
  });

  AppState.filteredFiles = list;
  const tbody = document.getElementById("fileListTbody");
  const summaryEl = document.getElementById("statusItemSummary");

  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="has-text-centered p-5 has-text-grey"><i class="fa-regular fa-folder-open fa-2x mb-2"></i><div>This folder is empty. Drop files to upload.</div></td></tr>';
    if (summaryEl) summaryEl.textContent = "0 items in folder";
    return;
  }

  tbody.innerHTML = list.map(item => {
    if (item.isFolder) {
      return '<tr draggable="true" ondragstart="onFolderRowDragStart(event, \'' + escapeHtml(item.fullPath) + '\')" ondragend="onFolderRowDragEnd(event, \'' + escapeHtml(item.fullPath) + '\')">' +
        '<td class="has-text-centered"><i class="fa-solid fa-folder has-text-warning"></i></td><td></td><td colspan="5"><a class="has-text-weight-bold" onclick="navigateToPath(\'' + escapeHtml(item.fullPath) + '\')">' + escapeHtml(item.name) + '/</a><span class="tag is-small is-primary ml-2">' + item.count + ' items</span></td>' +
        '<td class="has-text-right">' +
        '<div class="buttons are-small is-right mb-0">' +
        '<button class="button is-small is-ghost p-1 has-text-primary" title="Download Folder" onclick="event.stopPropagation(); downloadFolderFiles(\'' + escapeHtml(item.fullPath) + '\')"><i class="fa-solid fa-download"></i></button>' +
        '<button class="button is-small is-ghost p-1" title="Open Folder" onclick="navigateToPath(\'' + escapeHtml(item.fullPath) + '\')"><i class="fa-solid fa-arrow-right"></i></button>' +
        '</div>' +
        '</td></tr>';
    }

    const task = getTaskForFile(item.fullPath);
    const isSel = AppState.selectedFilePaths.has(item.fullPath);
    const icon = getFileIconClass(item.displayName);
    const srcTag = item.source === "original" ? "is-success" : "is-info";
    const dateStr = item.mtime ? formatDate(item.mtime) : "-";
    let rowClass = isSel ? "is-selected-row" : "";
    let taskBadge = "";

    if (task) {
      rowClass += " is-disabled-row";
      taskBadge = '<span class="tag is-small is-info ml-2 font-monospace"><i class="fa-solid fa-spinner fa-spin mr-1"></i> ' + escapeHtml(task.type || "processing") + '</span>';
    }

    return '<tr id="row_' + escapeId(item.fullPath) + '" class="' + rowClass + '" draggable="true" ondragstart="onFileRowDragStart(event, \'' + escapeHtml(item.fullPath) + '\', \'' + escapeHtml(item.displayName) + '\')" onclick="onRowClicked(event, \'' + escapeHtml(item.fullPath) + '\')">' +
      '<td class="has-text-centered" onclick="event.stopPropagation()"><input type="checkbox" ' + (isSel ? "checked" : "") + ' ' + (task ? "disabled" : "") + ' onchange="toggleSelectFile(\'' + escapeHtml(item.fullPath) + '\', this.checked)"></td>' +
      '<td class="has-text-centered">' + icon + '</td>' +
      '<td><span class="has-text-weight-medium font-monospace">' + escapeHtml(item.displayName) + '</span>' + taskBadge + '</td>' +
      '<td class="font-monospace">' + formatBytes(item.size) + '</td>' +
      '<td><span class="tag is-small ' + srcTag + ' is-light">' + escapeHtml(item.source) + '</span></td>' +
      '<td><span class="tag is-small is-primary font-monospace">' + escapeHtml(item.format) + '</span></td>' +
      '<td class="is-size-7 has-text-grey">' + dateStr + '</td>' +
      '<td class="has-text-right" onclick="event.stopPropagation()">' +
      '<div class="buttons are-small is-right mb-0">' +
      '<a class="button is-ghost p-1 has-text-primary" title="Download" href="https://archive.org/download/' + encodeURIComponent(AppState.item) + '/' + encodeURI(item.fullPath) + '" target="_blank" download ondragstart="onFileRowDragStart(event, \'' + escapeHtml(item.fullPath) + '\', \'' + escapeHtml(item.displayName) + '\')"><i class="fa-solid fa-download"></i></a>' +
      '<button class="button is-ghost p-1 has-text-warning" title="Replace" onclick="triggerReplaceFilePicker(\'' + escapeHtml(item.fullPath) + '\')"><i class="fa-solid fa-arrows-rotate"></i></button>' +
      '<button class="button is-ghost p-1 has-text-info" title="Move" onclick="openSingleMoveModal(\'' + escapeHtml(item.fullPath) + '\')"><i class="fa-solid fa-arrows-turn-right"></i></button>' +
      '<button class="button is-ghost p-1 has-text-danger" title="Delete" onclick="openSingleDeleteModal(\'' + escapeHtml(item.fullPath) + '\')"><i class="fa-solid fa-trash"></i></button>' +
      '</div>' +
      '</td>' +
      '</tr>';
  }).join("");

  if (summaryEl) {
    summaryEl.textContent = list.length + " items in current view";
  }
}

function onRowClicked(e, path) {
  if (getTaskForFile(path)) return;
  const f = AppState.allFiles.find(n => n.name === path);
  if (f) selectPreviewFile(f);
}

function onFilterChange() {
  const el = document.getElementById("fileSearchInput");
  AppState.searchQuery = el ? el.value.trim() : "";
  renderCurrentFolder();
}

function setSourceFilter(e) {
  AppState.sourceFilter = e;
  const bAll = document.getElementById("filterBtnAll");
  const bOrig = document.getElementById("filterBtnOrig");
  const bDeriv = document.getElementById("filterBtnDeriv");
  if (bAll) { bAll.classList.toggle("is-primary", e === "all"); bAll.classList.toggle("is-light", e !== "all"); }
  if (bOrig) { bOrig.classList.toggle("is-primary", e === "original"); bOrig.classList.toggle("is-light", e !== "original"); }
  if (bDeriv) { bDeriv.classList.toggle("is-primary", e === "derivative"); bDeriv.classList.toggle("is-light", e !== "derivative"); }
  renderCurrentFolder();
}

function sortTable(e) {
  if (AppState.sortField === e) {
    AppState.sortAsc = !AppState.sortAsc;
  } else {
    AppState.sortField = e;
    AppState.sortAsc = true;
  }
  updateSortIcons();
  renderCurrentFolder();
}

function updateSortIcons() {
  const fields = ["name", "size", "mtime"];
  for (const f of fields) {
    const el = document.getElementById("sortIcon" + f.charAt(0).toUpperCase() + f.slice(1));
    if (el) {
      if (AppState.sortField === f) {
        el.innerHTML = AppState.sortAsc ? '<i class="fa-solid fa-arrow-up-short-wide ml-1 is-size-7"></i>' : '<i class="fa-solid fa-arrow-down-wide-short ml-1 is-size-7"></i>';
      } else {
        el.innerHTML = "";
      }
    }
  }
}

function toggleSelectAll(checked) {
  if (checked) {
    for (const item of AppState.filteredFiles) {
      if (!item.isFolder && !getTaskForFile(item.fullPath)) {
        AppState.selectedFilePaths.add(item.fullPath);
      }
    }
  } else {
    AppState.selectedFilePaths.clear();
  }
  updateSelectionButtons();
  renderCurrentFolder();
}

function toggleSelectFile(path, checked) {
  if (getTaskForFile(path)) return;
  if (checked) AppState.selectedFilePaths.add(path);
  else AppState.selectedFilePaths.delete(path);
  updateSelectionButtons();
}

function updateSelectionButtons() {
  const count = AppState.selectedFilePaths.size;
  document.querySelectorAll(".selected-count").forEach(el => { el.textContent = count; });
  const bDel = document.getElementById("btnBatchDelete");
  const bMov = document.getElementById("btnBatchMove");
  if (bDel) bDel.disabled = count === 0;
  if (bMov) bMov.disabled = count === 0;

  const cbAll = document.getElementById("selectAllCheckbox");
  if (cbAll) {
    const totalFiles = AppState.filteredFiles.filter(i => !i.isFolder).length;
    cbAll.checked = totalFiles > 0 && count === totalFiles;
  }
}

function openBatchDeleteModal() {
  if (AppState.selectedFilePaths.size === 0) return;
  const listEl = document.getElementById("deleteFileList");
  const countEl = document.getElementById("deleteFilesCount");
  const arr = Array.from(AppState.selectedFilePaths);
  if (countEl) countEl.textContent = arr.length;
  if (listEl) listEl.innerHTML = arr.map(p => '<li>' + escapeHtml(p) + '</li>').join("");
  const progArea = document.getElementById("batchDeleteProgressArea");
  if (progArea) progArea.style.display = "none";
  const btn = document.getElementById("btnConfirmBatchDelete");
  if (btn) btn.disabled = false;
  openModal("modalBatchDelete");
}

function openSingleDeleteModal(path) {
  AppState.selectedFilePaths.clear();
  AppState.selectedFilePaths.add(path);
  updateSelectionButtons();
  openBatchDeleteModal();
}

async function executeBatchDelete() {
  const arr = Array.from(AppState.selectedFilePaths);
  if (arr.length === 0 || !checkCredentialsConfigured()) return;

  const cascade = document.getElementById("checkboxCascadeDelete")?.checked !== false;
  const btn = document.getElementById("btnConfirmBatchDelete");
  if (btn) btn.disabled = true;

  const progArea = document.getElementById("batchDeleteProgressArea");
  const prog = document.getElementById("progressBatchDelete");
  const label = document.getElementById("labelBatchDeleteStatus");
  if (progArea) progArea.style.display = "block";

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (label) label.textContent = "Deleting " + (i + 1) + " of " + arr.length + ": " + p;
    if (prog) prog.value = Math.round((i / arr.length) * 100);

    try {
      const res = await s3DeleteFile(p, cascade);
      if (res.ok) successCount++;
      else failCount++;
    } catch {
      failCount++;
    }
  }

  if (prog) prog.value = 100;
  if (label) label.textContent = "Finished! Deleted " + successCount + " file(s)" + (failCount ? ", " + failCount + " failed" : "");

  setTimeout(() => {
    closeModal("modalBatchDelete");
    AppState.selectedFilePaths.clear();
    loadItemFiles();
  }, 1000);
}

function getAvailableFolders() {
  const s = new Set();
  if (Array.isArray(AppState.allFiles)) {
    for (const f of AppState.allFiles) {
      if (!f.name) continue;
      const parts = f.name.split("/");
      const folders = f.name.endsWith("/") ? parts.filter(Boolean) : parts.slice(0, -1);
      let cur = "";
      for (const p of folders) {
        if (p) {
          cur = cur ? cur + "/" + p : p;
          s.add(cur);
        }
      }
    }
  }
  if (AppState.currentPath) s.add(AppState.currentPath);
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

function populateMoveFolders() {
  const sel = document.getElementById("selectAvailableFolders");
  const pills = document.getElementById("quickMoveFolderPills");
  if (!sel) return;

  const folders = getAvailableFolders();
  const curTarget = (document.getElementById("inputTargetFolder")?.value || AppState.currentPath || "").trim().replace(/^\/+/g, "").replace(/\/+$/g, "");

  let opts = '<option value="">/ (Root Directory)</option>';
  for (const f of folders) {
    const isSel = f === curTarget ? " selected" : "";
    opts += '<option value="' + escapeHtml(f) + '"' + isSel + '>' + escapeHtml(f) + '/</option>';
  }
  sel.innerHTML = opts;
  sel.value = curTarget;

  if (pills) {
    let pHtml = '<span class="tag is-clickable ' + (curTarget === "" ? "is-info" : "is-light") + '" onclick="onSelectMoveFolder(\'\')" style="cursor: pointer;"><i class="fa-solid fa-house mr-1"></i> root</span>';
    for (const f of folders) {
      pHtml += '<span class="tag is-clickable ' + (curTarget === f ? "is-info" : "is-light") + '" onclick="onSelectMoveFolder(\'' + escapeHtml(f) + '\')" style="cursor: pointer;"><i class="fa-solid fa-folder mr-1"></i> ' + escapeHtml(f) + '</span>';
    }
    pills.innerHTML = pHtml;
  }
}

function onSelectMoveFolder(folder) {
  const inp = document.getElementById("inputTargetFolder");
  if (inp) inp.value = folder;
  const sel = document.getElementById("selectAvailableFolders");
  if (sel) sel.value = folder;
  updateMovePillsActive(folder);
}

function onTargetFolderInput(val) {
  const clean = val.trim().replace(/^\/+/g, "").replace(/\/+$/g, "");
  const sel = document.getElementById("selectAvailableFolders");
  if (sel) sel.value = clean;
  updateMovePillsActive(clean);
}

function updateMovePillsActive(folder) {
  const pills = document.getElementById("quickMoveFolderPills");
  if (!pills) return;
  pills.querySelectorAll(".tag").forEach(el => {
    const t = el.textContent.trim();
    if ((folder === "" && t.includes("root")) || t === folder || t.endsWith(" " + folder)) {
      el.className = "tag is-clickable is-info";
    } else {
      el.className = "tag is-clickable is-light";
    }
  });
}

function openBatchMoveModal() {
  if (AppState.selectedFilePaths.size === 0) return;
  const listEl = document.getElementById("moveFileList");
  const countEl = document.getElementById("moveFilesCount");
  const arr = Array.from(AppState.selectedFilePaths);
  if (countEl) countEl.textContent = arr.length;
  if (listEl) listEl.innerHTML = arr.map(p => '<li>' + escapeHtml(p) + '</li>').join("");

  const inp = document.getElementById("inputTargetFolder");
  if (inp) inp.value = AppState.currentPath;
  populateMoveFolders();

  const progArea = document.getElementById("batchMoveProgressArea");
  if (progArea) progArea.style.display = "none";
  const btn = document.getElementById("btnConfirmBatchMove");
  if (btn) btn.disabled = false;
  openModal("modalBatchMove");
}

function openSingleMoveModal(path) {
  AppState.selectedFilePaths.clear();
  AppState.selectedFilePaths.add(path);
  updateSelectionButtons();
  openBatchMoveModal();
}

async function executeBatchMove() {
  const arr = Array.from(AppState.selectedFilePaths);
  if (arr.length === 0 || !checkCredentialsConfigured()) return;

  const targetFolder = (document.getElementById("inputTargetFolder")?.value || "").trim().replace(/^\/+/g, "").replace(/\/+$/g, "");
  const btn = document.getElementById("btnConfirmBatchMove");
  if (btn) btn.disabled = true;

  const progArea = document.getElementById("batchMoveProgressArea");
  const prog = document.getElementById("progressBatchMove");
  const label = document.getElementById("labelBatchMoveStatus");
  if (progArea) progArea.style.display = "block";

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    const fileName = p.split("/").pop();
    const dest = targetFolder ? targetFolder + "/" + fileName : fileName;

    if (label) label.textContent = "Moving " + (i + 1) + " of " + arr.length + ": " + fileName;
    if (prog) prog.value = Math.round((i / arr.length) * 100);

    try {
      const res = await s3MoveFile(p, dest);
      if (res.ok) successCount++;
      else failCount++;
    } catch {
      failCount++;
    }
  }

  if (prog) prog.value = 100;
  if (label) label.textContent = "Finished! Moved " + successCount + " file(s)" + (failCount ? ", " + failCount + " failed" : "");

  setTimeout(() => {
    closeModal("modalBatchMove");
    AppState.selectedFilePaths.clear();
    loadItemFiles();
  }, 1000);
}

function openNewFolderModal() {
  const parentSpan = document.getElementById("newFolderParentPath");
  const input = document.getElementById("inputNewFolderName");
  if (parentSpan) parentSpan.textContent = "/" + (AppState.currentPath ? AppState.currentPath + "/" : "");
  if (input) input.value = "";
  openModal("modalNewFolder");
  setTimeout(() => { if (input) input.focus(); }, 100);
}

function submitNewFolder(action) {
  const input = document.getElementById("inputNewFolderName");
  const raw = input ? input.value.trim() : "";
  if (!raw) {
    alert("Please enter a folder name.");
    return;
  }
  const clean = raw.replace(/[\\:*?"<>|]/g, "").replace(/^\/+|\/+$/g, "");
  if (!clean) {
    alert("Invalid folder name.");
    return;
  }
  const fullTarget = AppState.currentPath ? AppState.currentPath.replace(/^\/+|\/+$/g, "") + "/" + clean : clean;
  closeModal("modalNewFolder");

  if (action === "upload") {
    navigateToPath(fullTarget);
    setTimeout(() => {
      openUploadModal();
    }, 150);
  } else if (action === "move") {
    if (AppState.selectedFilePaths.size === 0) {
      alert("No files currently selected to move. Navigating to folder.");
      navigateToPath(fullTarget);
    } else {
      openBatchMoveModal();
      const destInput = document.getElementById("inputTargetFolder");
      if (destInput) {
        destInput.value = fullTarget;
      }
    }
  } else {
    navigateToPath(fullTarget);
  }
}

function promptNewFolder() {
  openNewFolderModal();
}

function openUploadModal() {
  const pathLabel = document.getElementById("uploadModalTargetPath");
  if (pathLabel) {
    pathLabel.textContent = "/" + (AppState.currentPath ? AppState.currentPath + "/" : "");
  }
  openModal("modalUpload");
}

function triggerFolderUploadPicker() {
  const el = document.getElementById("globalFolderFileInput");
  if (el) { el.value = ""; el.click(); }
}

function handleFolderFilesSelected(files) {
  if (!files || files.length === 0 || !checkCredentialsConfigured()) return;
  closeModal("modalUpload");
  const prefix = AppState.currentPath ? AppState.currentPath + "/" : "";
  const tasks = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const rel = f.webkitRelativePath ? f.webkitRelativePath.replace(/^\/+/g, "") : f.name;
    const target = prefix + rel;
    const id = "up_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    tasks.push({
      id: id,
      file: f,
      name: f.name,
      targetPath: target,
      size: f.size,
      uploadedBytes: 0,
      percent: 0,
      status: "queued",
      error: null,
      xhr: null
    });
  }
  enqueueUploads(tasks);
}

function initDragAndDrop() {
  const overlay = document.getElementById("dragDropOverlay");
  let dragCount = 0;

  window.addEventListener("dragenter", e => {
    if (e.dataTransfer && e.dataTransfer.types && !Array.from(e.dataTransfer.types).includes("Files")) {
      return;
    }
    e.preventDefault();
    dragCount++;
    updateOverlayTargetPath();
    if (overlay) overlay.style.display = "flex";
  });

  window.addEventListener("dragleave", e => {
    e.preventDefault();
    dragCount--;
    if (dragCount <= 0) {
      dragCount = 0;
      if (overlay) overlay.style.display = "none";
    }
  });

  window.addEventListener("dragover", e => {
    e.preventDefault();
  });

  window.addEventListener("drop", async e => {
    e.preventDefault();
    dragCount = 0;
    if (overlay) overlay.style.display = "none";
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
      await handleDroppedDataTransfer(e.dataTransfer);
    }
  });

  const uploadDropZone = document.getElementById("uploadModalDropZone");
  if (uploadDropZone) {
    uploadDropZone.addEventListener("dragover", e => {
      e.preventDefault();
      uploadDropZone.style.background = "rgba(0,209,178,0.12)";
    });
    uploadDropZone.addEventListener("dragleave", e => {
      e.preventDefault();
      uploadDropZone.style.background = "var(--bulma-scheme-main-bis, rgba(0,209,178,0.04))";
    });
    uploadDropZone.addEventListener("drop", async e => {
      e.preventDefault();
      uploadDropZone.style.background = "var(--bulma-scheme-main-bis, rgba(0,209,178,0.04))";
      closeModal("modalUpload");
      if (e.dataTransfer) {
        await handleDroppedDataTransfer(e.dataTransfer);
      }
    });
  }
}

async function handleDroppedDataTransfer(dt) {
  if (!dt || !checkCredentialsConfigured()) return;
  closeModal("modalUpload");
  const prefix = AppState.currentPath ? AppState.currentPath + "/" : "";
  const collectedFiles = [];

  const items = dt.items;
  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === "function") {
    const queue = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) queue.push(traverseFileEntry(entry, ""));
    }
    const results = await Promise.all(queue);
    for (const list of results) {
      collectedFiles.push(...list);
    }
  } else if (dt.files && dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      collectedFiles.push({ file: f, path: f.name });
    }
  }

  if (collectedFiles.length === 0) return;

  const tasks = collectedFiles.map(cf => {
    const target = prefix + cf.path.replace(/^\/+/g, "");
    return {
      id: "up_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      file: cf.file,
      name: cf.path,
      targetPath: target,
      size: cf.file.size,
      uploadedBytes: 0,
      percent: 0,
      status: "queued",
      error: null,
      xhr: null
    };
  });
  enqueueUploads(tasks);
}

function traverseFileEntry(entry, currentSubPath) {
  return new Promise(resolve => {
    if (entry.isFile) {
      entry.file(file => {
        const fullRel = currentSubPath ? currentSubPath + "/" + file.name : file.name;
        resolve([{ file, path: fullRel }]);
      }, () => resolve([]));
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries = [];
      const readNext = () => {
        dirReader.readEntries(async batch => {
          if (!batch.length) {
            const nextSub = currentSubPath ? currentSubPath + "/" + entry.name : entry.name;
            const promises = entries.map(child => traverseFileEntry(child, nextSub));
            const subResults = await Promise.all(promises);
            resolve(subResults.flat());
          } else {
            entries.push(...batch);
            readNext();
          }
        }, () => resolve([]));
      };
      readNext();
    } else {
      resolve([]);
    }
  });
}

function onFileRowDragStart(e, fullPath, displayName) {
  if (e.target.closest("button, input")) return;
  const dlUrl = "https://archive.org/download/" + encodeURIComponent(AppState.item) + "/" + encodeURI(fullPath);
  const mime = getMimeType(displayName);
  const downloadUrlStr = mime + ":" + displayName + ":" + dlUrl;
  e.dataTransfer.setData("DownloadURL", downloadUrlStr);
  e.dataTransfer.setData("text/uri-list", dlUrl);
  e.dataTransfer.setData("text/plain", dlUrl);
  e.dataTransfer.effectAllowed = "copy";
}

let _draggedFolderPath = null;
function onFolderRowDragStart(e, fullPath) {
  if (e.target.closest("button, input")) return;
  _draggedFolderPath = fullPath;
  e.dataTransfer.setData("text/plain", fullPath);
  e.dataTransfer.effectAllowed = "copy";
}

function onFolderRowDragEnd(e, fullPath) {
  const isOutside = e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;
  if (isOutside || (e.dataTransfer && e.dataTransfer.dropEffect !== "none")) {
    downloadFolderFiles(fullPath);
  }
  _draggedFolderPath = null;
}

function downloadFolderFiles(folderFullPath) {
  const prefix = folderFullPath.replace(/^\/+/g, "").replace(/\/+$/g, "") + "/";
  const files = AppState.allFiles.filter(f => f.name.startsWith(prefix) && !f.name.endsWith("/"));
  if (files.length === 0) {
    alert("Folder '" + folderFullPath + "' is empty or contains no downloadable files.");
    return;
  }
  files.forEach((f, idx) => {
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = "https://archive.org/download/" + encodeURIComponent(AppState.item) + "/" + encodeURI(f.name);
      a.download = f.name.split("/").pop();
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, idx * 250);
  });
}

function updateOverlayTargetPath() {
  const el = document.getElementById("overlayTargetPath");
  if (el) el.textContent = AppState.currentPath ? "/" + AppState.currentPath + "/" : "/";
}

function triggerBatchUploadPicker() {
  const el = document.getElementById("globalBatchFileInput");
  if (el) { el.value = ""; el.click(); }
}

function handleBatchFilesSelected(files) {
  if (!files || files.length === 0 || !checkCredentialsConfigured()) return;
  closeModal("modalUpload");
  const prefix = AppState.currentPath ? AppState.currentPath + "/" : "";
  const tasks = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const target = prefix + f.name;
    const id = "up_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    tasks.push({
      id: id,
      file: f,
      name: f.name,
      targetPath: target,
      size: f.size,
      uploadedBytes: 0,
      percent: 0,
      status: "queued",
      error: null,
      xhr: null
    });
  }
  enqueueUploads(tasks);
}

function enqueueUploads(tasks) {
  UploadEngine.queue.push(...tasks);
  UploadEngine.totalBytes = UploadEngine.queue.reduce((acc, t) => acc + t.size, 0);
  if (!UploadEngine.startTime) UploadEngine.startTime = Date.now();
  showUploadTray();
  renderUploadTray();
  pumpUploadQueue();
}

function pumpUploadQueue() {
  if (UploadEngine.isPaused) return;
  while (UploadEngine.activeUploads < UploadEngine.maxConcurrency) {
    const next = UploadEngine.queue.find(t => t.status === "queued");
    if (!next) break;
    UploadEngine.activeUploads++;
    startSingleUpload(next);
  }
  updateOverallUploadProgress();
}

function startSingleUpload(task) {
  task.status = "uploading";
  renderUploadTray();

  const useDirect = Boolean(AppState.accessKey && AppState.secretKey);
  const uploadUrl = useDirect ?
    "https://s3.us.archive.org/" + encodeURIComponent(AppState.item) + "/" + encodeURI(task.targetPath) :
    "/api/upload?item=" + encodeURIComponent(AppState.item) + "&path=" + encodeURIComponent(task.targetPath);

  const xhr = new XMLHttpRequest();
  task.xhr = xhr;

  xhr.upload.onprogress = ev => {
    if (ev.lengthComputable) {
      task.uploadedBytes = ev.loaded;
      task.percent = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
      updateTaskRowProgress(task);
      updateOverallUploadProgress();
    }
  };

  xhr.onload = () => {
    UploadEngine.activeUploads--;
    if (xhr.status >= 200 && xhr.status < 300) {
      task.status = "completed";
      task.percent = 100;
      task.uploadedBytes = task.size;
    } else {
      task.status = "failed";
      task.error = "HTTP " + xhr.status;
    }
    renderUploadTray();
    checkAllUploadsComplete();
    pumpUploadQueue();
  };

  xhr.onerror = () => {
    UploadEngine.activeUploads--;
    task.status = "failed";
    task.error = "Network / CORS Error";
    renderUploadTray();
    checkAllUploadsComplete();
    pumpUploadQueue();
  };

  xhr.open("PUT", uploadUrl, true);
  if (useDirect) {
    xhr.setRequestHeader("Authorization", "LOW " + AppState.accessKey + ":" + AppState.secretKey);
  }
  xhr.setRequestHeader("Content-Type", getMimeType(task.targetPath));
  xhr.setRequestHeader("x-archive-keep-old-version", "0");
  xhr.setRequestHeader("x-archive-queue-derive", "1");
  xhr.send(task.file);
}

function updateOverallUploadProgress() {
  const doneBytes = UploadEngine.queue.reduce((acc, t) => acc + (t.uploadedBytes || 0), 0);
  const total = UploadEngine.totalBytes || 1;
  const pct = Math.min(100, Math.round((doneBytes / total) * 100));

  const prog = document.getElementById("trayOverallProgress");
  if (prog) prog.value = pct;
  const bytesEl = document.getElementById("trayBytesProgress");
  if (bytesEl) bytesEl.textContent = formatBytes(doneBytes) + " / " + formatBytes(total);

  if (UploadEngine.startTime && doneBytes > 0) {
    const elapsedSec = (Date.now() - UploadEngine.startTime) / 1000;
    if (elapsedSec > 1) {
      const speed = doneBytes / elapsedSec;
      const speedStr = formatBytes(speed) + "/s";
      const remBytes = Math.max(0, total - doneBytes);
      const etaSec = Math.round(remBytes / (speed || 1));
      const speedEtaEl = document.getElementById("traySpeedAndEta");
      if (speedEtaEl) speedEtaEl.textContent = "Speed: " + speedStr + " &bull; ETA: " + formatSecondsToHuman(etaSec);
    }
  }

  const doneCount = UploadEngine.queue.filter(t => t.status === "completed").length;
  const compCountEl = document.getElementById("trayCompletedCount");
  const totCountEl = document.getElementById("trayTotalCount");
  if (compCountEl) compCountEl.textContent = doneCount;
  if (totCountEl) totCountEl.textContent = UploadEngine.queue.length;
}

function updateTaskRowProgress(t) {
  const pEl = document.getElementById("prog_" + t.id);
  const pctEl = document.getElementById("pct_" + t.id);
  if (pEl) pEl.value = t.percent;
  if (pctEl) pctEl.textContent = t.percent + "%";
}

function renderUploadTray() {
  const el = document.getElementById("uploadTrayFileList");
  if (!el) return;
  el.innerHTML = UploadEngine.queue.map(t => {
    let tag = "";
    if (t.status === "queued") tag = '<span class="tag is-small is-light">Queued</span>';
    else if (t.status === "uploading") tag = '<span class="tag is-small is-info is-light">Uploading</span>';
    else if (t.status === "completed") tag = '<span class="tag is-small is-success is-light"><i class="fa-solid fa-check mr-1"></i> Done</span>';
    else if (t.status === "failed") tag = '<span class="tag is-small is-danger is-light" title="' + escapeHtml(t.error || "") + '">Failed</span>';

    return '<div class="p-2 mb-1" style="border-bottom: 1px solid var(--bulma-border, #eee);">' +
      '<div class="level is-mobile mb-1">' +
      '<div class="level-left is-clipped" style="max-width: 250px;">' +
      '<span class="is-size-7 font-monospace">' + escapeHtml(t.name) + '</span>' +
      '</div>' +
      '<div class="level-right">' +
      tag +
      '<span class="is-size-7 ml-2 font-monospace" id="pct_' + t.id + '">' + t.percent + '%</span>' +
      '</div>' +
      '</div>' +
      '<progress class="progress is-small is-primary mb-0" id="prog_' + t.id + '" value="' + t.percent + '" max="100"></progress>' +
      '</div>';
  }).join("");
}

function checkAllUploadsComplete() {
  const hasActive = UploadEngine.queue.some(t => t.status === "queued" || t.status === "uploading");
  if (!hasActive && UploadEngine.queue.length > 0) {
    setTimeout(() => { loadItemFiles(); }, 1200);
  }
}

function showUploadTray() {
  const el = document.getElementById("uploadTray");
  if (el) el.style.display = "block";
}

function toggleUploadTrayMinimize() {
  const body = document.getElementById("uploadTrayBody");
  const icon = document.getElementById("iconTrayMinMax");
  if (!body) return;
  const isHidden = body.style.display === "none";
  body.style.display = isHidden ? "block" : "none";
  if (icon) icon.className = isHidden ? "fa-solid fa-minus" : "fa-solid fa-plus";
}

function cancelAllActiveUploads() {
  UploadEngine.queue.forEach(t => {
    if (t.xhr && t.status === "uploading") {
      try { t.xhr.abort(); } catch { }
    }
  });
  UploadEngine.queue = [];
  UploadEngine.activeUploads = 0;
  UploadEngine.totalBytes = 0;
  UploadEngine.uploadedBytes = 0;
  UploadEngine.startTime = null;
  const el = document.getElementById("uploadTray");
  if (el) el.style.display = "none";
}

let _pendingReplacePath = null;
function triggerReplaceFilePicker(path) {
  _pendingReplacePath = path || (AppState.currentPreviewFile ? AppState.currentPreviewFile.name : null);
  if (!_pendingReplacePath) return;
  const el = document.getElementById("globalReplaceFileInput");
  if (el) { el.value = ""; el.click(); }
}

function handleReplaceFileSelected(files) {
  if (!files || !files[0] || !_pendingReplacePath || !checkCredentialsConfigured()) return;
  const f = files[0];
  const target = _pendingReplacePath;
  const targetFileName = target.split("/").pop();
  const renamedFile = new File([f], targetFileName, { type: getMimeType(targetFileName) });
  const task = {
    id: "rep_" + Date.now(),
    file: renamedFile,
    name: f.name + " -> " + targetFileName,
    targetPath: target,
    size: f.size,
    uploadedBytes: 0,
    percent: 0,
    status: "queued",
    error: null,
    xhr: null
  };
  _pendingReplacePath = null;
  enqueueUploads([task]);
}

function resetPreviewPane() {
  AppState.currentPreviewFile = null;
  const mName = document.getElementById("metaName");
  const mPath = document.getElementById("metaPath");
  const mSize = document.getElementById("metaSize");
  const mSrc = document.getElementById("metaSource");
  const mFmt = document.getElementById("metaFormat");
  const mMd5 = document.getElementById("metaMd5");
  if (mName) mName.textContent = "-";
  if (mPath) mPath.textContent = "-";
  if (mSize) mSize.textContent = "-";
  if (mSrc) mSrc.textContent = "-";
  if (mFmt) mFmt.textContent = "-";
  if (mMd5) mMd5.textContent = "-";

  const btnDl = document.getElementById("btnDownloadPreview");
  if (btnDl) btnDl.removeAttribute("href");

  const content = document.getElementById("previewContentArea");
  if (content) {
    content.innerHTML = '<div class="has-text-grey is-size-7">Select a file to inspect details and preview</div>';
  }
}

function selectPreviewFile(f) {
  AppState.currentPreviewFile = f;
  const pane = document.getElementById("previewPane");
  if (pane) pane.classList.remove("is-hidden");
  const btnPrev = document.getElementById("btnTogglePreview");
  if (btnPrev) btnPrev.classList.add("is-primary");

  const mName = document.getElementById("metaName");
  const mPath = document.getElementById("metaPath");
  const mSize = document.getElementById("metaSize");
  const mSrc = document.getElementById("metaSource");
  const mFmt = document.getElementById("metaFormat");
  const mMd5 = document.getElementById("metaMd5");

  if (mName) mName.textContent = f.name.split("/").pop();
  if (mPath) mPath.textContent = f.name;
  if (mSize) mSize.textContent = formatBytes(f.size) + " (" + f.size.toLocaleString() + " B)";
  if (mSrc) mSrc.textContent = f.source || "unknown";
  if (mFmt) mFmt.textContent = f.format || (f.name.split(".").pop() || "").toUpperCase();
  if (mMd5) mMd5.textContent = f.md5 || "-";

  const dlUrl = "https://archive.org/download/" + encodeURIComponent(AppState.item) + "/" + encodeURI(f.name);
  const btnDl = document.getElementById("btnDownloadPreview");
  if (btnDl) btnDl.href = dlUrl;

  const ext = (f.name.split(".").pop() || "").toLowerCase();
  const content = document.getElementById("previewContentArea");
  const isSub = ["srt", "vtt", "ass", "ssa"].includes(ext);

  if (!content) return;

  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) {
    content.innerHTML = '<img src="' + dlUrl + '" alt="Preview" style="max-height: 220px; max-width: 100%; border-radius: 4px; object-fit: contain;">';
  } else if (["mp4", "webm"].includes(ext)) {
    content.innerHTML = '<video src="' + dlUrl + '" playsinline controls style="max-height: 200px; width: 100%; border-radius: 4px;"></video>';
  } else if (["mp3", "flac", "ogg", "wav"].includes(ext)) {
    content.innerHTML = '<div class="p-3"><i class="fa-solid fa-file-audio fa-3x has-text-info mb-2"></i><audio src="' + dlUrl + '" controls style="width: 100%;"></audio></div>';
  } else if (isSub) {
    content.innerHTML = '<div class="p-3"><i class="fa-solid fa-closed-captioning fa-3x has-text-primary mb-2"></i><div class="is-size-7">Subtitle File (' + ext.toUpperCase() + ')</div></div>';
  } else {
    content.innerHTML = '<div class="p-3 has-text-grey"><i class="fa-regular fa-file fa-3x mb-2"></i><div class="is-size-7">' + escapeHtml(ext.toUpperCase()) + ' File</div></div>';
  }
}

function togglePreviewPane() {
  const pane = document.getElementById("previewPane");
  const btn = document.getElementById("btnTogglePreview");
  if (!pane) return;
  const isHidden = pane.classList.toggle("is-hidden");
  if (btn) btn.classList.toggle("is-primary", !isHidden);
  localStorage.setItem("ia_preview_pane_hidden", isHidden ? "1" : "0");
}

function closePreviewPane() {
  togglePreviewPane();
}

function promptMoveSelected() {
  if (AppState.currentPreviewFile) openSingleMoveModal(AppState.currentPreviewFile.name);
}

function promptDeleteSelected() {
  if (AppState.currentPreviewFile) openSingleDeleteModal(AppState.currentPreviewFile.name);
}

async function fetchCatalogTasks() {
  const icon = document.getElementById("iconTasksStatus");
  const label = document.getElementById("labelTasksStatus");
  const btn = document.getElementById("btnCatalogTasksStatus");

  try {
    let tData = null;
    try {
      const res = await fetch("/api/ia-tasks?item=" + encodeURIComponent(AppState.item) + "&t=" + Date.now());
      if (res.ok) tData = await res.json();
    } catch { }

    if (!tData) {
      const mRes = await fetch("https://archive.org/metadata/" + encodeURIComponent(AppState.item) + "?t=" + Date.now());
      if (mRes.ok) tData = await mRes.json();
    }

    const tasks = tData && tData.tasks ? tData.tasks : [];
    const isPending = Boolean(tData && tData.is_pending);

    AppState.fileTasks.forEach((val, k) => {
      if (val.source === "catalog") AppState.fileTasks.delete(k);
    });
    AppState.tasksById.forEach((val, k) => {
      if (val.source === "catalog") AppState.tasksById.delete(k);
    });

    for (const t of tasks) {
      const idStr = String(t.task_id || t.id || "");
      if (idStr) AppState.tasksById.set(idStr, { ...t, taskId: idStr, source: "catalog" });
      if (t.file && idStr) {
        AppState.fileTasks.set(t.file, {
          taskId: idStr,
          type: t.type || (t.cmd && t.cmd.includes("delete") ? "delete" : t.cmd && (t.cmd.includes("rename") || t.cmd.includes("move")) ? "move" : "task"),
          status: t.status || "running",
          source: "catalog"
        });
      }
    }

    renderCurrentFolder();

    if (tasks.length > 0 || isPending) {
      if (icon) { icon.className = "icon is-small has-text-warning mr-1"; icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>'; }
      if (label) label.textContent = "Tasks (" + tasks.length + ")";
      if (btn) btn.className = "button is-small is-warning is-light";
    } else {
      if (icon) { icon.className = "icon is-small has-text-success mr-1"; icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>'; }
      if (label) label.textContent = "Tasks";
      if (btn) btn.className = "button is-small is-light";
    }

    renderCatalogTasksModalBody(tData);
  } catch {
    if (label) label.textContent = "Tasks";
  }
}

function openCatalogTasksModal() {
  const el = document.getElementById("taskModalItemName");
  if (el) el.textContent = AppState.item;
  openModal("modalCatalogTasks");
  fetchCatalogTasks();
}

function renderCatalogTasksModalBody(data) {
  const el = document.getElementById("catalogTasksBody");
  if (!el) return;
  if (!data) {
    el.innerHTML = '<div class="has-text-grey">No task data returned.</div>';
    return;
  }
  const tasks = data.tasks || [];
  if (tasks.length === 0) {
    el.innerHTML = '<div class="has-text-centered p-4 has-text-success"><i class="fa-solid fa-circle-check fa-2x mb-2"></i><div>No catalog modification tasks currently running. Item catalog is stable.</div></div>';
    return;
  }

  el.innerHTML = '<table class="table is-narrow is-fullwidth is-size-7">' +
    '<thead><tr><th>Task ID</th><th>Command</th><th>File</th><th>Status</th></tr></thead>' +
    '<tbody>' +
    tasks.map(t => {
      const idStr = String(t.task_id || t.id || "-");
      const cmd = t.cmd || t.task || "task";
      const fName = t.file || getFileForTask(idStr) || "";
      return '<tr>' +
        '<td class="font-monospace">#' + escapeHtml(idStr) + '</td>' +
        '<td>' + escapeHtml(cmd) + '</td>' +
        '<td class="font-monospace">' + escapeHtml(fName || "-") + '</td>' +
        '<td><span class="tag is-small is-info">' + escapeHtml(t.status || "running") + '</span></td>' +
        '</tr>';
    }).join("") +
    '</tbody></table>';
}

function checkCredentialsConfigured() {
  if (AppState.isServerConnected || (AppState.accessKey && AppState.secretKey)) return true;
  openSettingsModal();
  alert("No S3 credentials detected. Please enter your Internet Archive S3 keys in Settings.");
  return false;
}

async function s3DeleteFile(path, cascade) {
  if (AppState.accessKey && AppState.secretKey) {
    try {
      const headers = { "Authorization": "LOW " + AppState.accessKey + ":" + AppState.secretKey };
      if (cascade) headers["x-archive-cascade-delete"] = "1";
      const s3Url = "https://s3.us.archive.org/" + encodeURIComponent(AppState.item) + "/" + encodeURI(path);
      const res = await fetch(s3Url, { method: "DELETE", headers: headers });
      if (res.ok || res.status === 204 || res.status === 200) {
        return { ok: true };
      }
    } catch { }
  }
  return fallbackDeleteProxy(path, cascade);
}

async function fallbackDeleteProxy(path, cascade) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (AppState.accessKey && AppState.secretKey) {
      headers["x-ia-access-key"] = AppState.accessKey;
      headers["x-ia-secret-key"] = AppState.secretKey;
    }
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ item: AppState.item, path: path, cascade: cascade })
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: data } : { ok: false, error: data.error || "Delete failed (" + res.status + ")" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function s3MoveFile(oldPath, newPath) {
  if (AppState.accessKey && AppState.secretKey) {
    try {
      const destUrl = "https://s3.us.archive.org/" + encodeURIComponent(AppState.item) + "/" + encodeURI(newPath);
      const headers = {
        "Authorization": "LOW " + AppState.accessKey + ":" + AppState.secretKey,
        "x-amz-copy-source": "/" + encodeURIComponent(AppState.item) + "/" + encodeURI(oldPath),
        "x-archive-keep-old-version": "0"
      };
      let copyRes = await fetch(destUrl, { method: "PUT", headers: headers });
      let copyOk = copyRes.ok;
      if (!copyOk) {
        const dlUrl = "https://archive.org/download/" + encodeURIComponent(AppState.item) + "/" + encodeURI(oldPath);
        const dlRes = await fetch(dlUrl);
        if (dlRes.ok) {
          const body = await dlRes.arrayBuffer();
          const putHeaders = {
            "Authorization": "LOW " + AppState.accessKey + ":" + AppState.secretKey,
            "Content-Type": getMimeType(newPath),
            "x-archive-keep-old-version": "0",
            "x-archive-queue-derive": "1"
          };
          const putRes = await fetch(destUrl, { method: "PUT", headers: putHeaders, body: body });
          copyOk = putRes.ok;
        }
      }
      if (copyOk) {
        await fetch("https://s3.us.archive.org/" + encodeURIComponent(AppState.item) + "/" + encodeURI(oldPath), {
          method: "DELETE",
          headers: { "Authorization": "LOW " + AppState.accessKey + ":" + AppState.secretKey }
        });
        return { ok: true, oldPath: oldPath, newPath: newPath };
      }
    } catch { }
  }
  return fallbackMoveProxy(oldPath, newPath);
}

async function fallbackMoveProxy(oldPath, newPath) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (AppState.accessKey && AppState.secretKey) {
      headers["x-ia-access-key"] = AppState.accessKey;
      headers["x-ia-secret-key"] = AppState.secretKey;
    }
    const res = await fetch("/api/move", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ item: AppState.item, oldPath: oldPath, newPath: newPath })
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: data } : { ok: false, error: data.error || "Move failed (" + res.status + ")" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function s3UploadFile(path, body, mime) {
  if (AppState.accessKey && AppState.secretKey) {
    try {
      const headers = {
        "Authorization": "LOW " + AppState.accessKey + ":" + AppState.secretKey,
        "Content-Type": mime || getMimeType(path),
        "x-archive-keep-old-version": "0",
        "x-archive-queue-derive": "1"
      };
      const s3Url = "https://s3.us.archive.org/" + encodeURIComponent(AppState.item) + "/" + encodeURI(path);
      const res = await fetch(s3Url, { method: "PUT", headers: headers, body: body });
      if (res.ok) return { ok: true };
    } catch { }
  }
  return fallbackUploadProxy(path, body, mime);
}

async function fallbackUploadProxy(path, body, mime) {
  try {
    const headers = { "Content-Type": mime || "application/octet-stream" };
    if (AppState.accessKey && AppState.secretKey) {
      headers["x-ia-access-key"] = AppState.accessKey;
      headers["x-ia-secret-key"] = AppState.secretKey;
    }
    const res = await fetch("/api/upload?item=" + encodeURIComponent(AppState.item) + "&path=" + encodeURIComponent(path), {
      method: "PUT",
      headers: headers,
      body: body
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error || "Upload failed (" + res.status + ")" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("is-active");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("is-active");
}

function openSettingsModal() {
  openModal("modalSettings");
}

function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function formatSecondsToHuman(sec) {
  if (sec < 60) return sec + "s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + "m " + s + "s";
}

function formatDate(dateVal) {
  const d = new Date(dateVal);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseTimeToSeconds(tStr) {
  if (!tStr) return 0;
  const clean = tStr.trim().replace(",", ".");
  const parts = clean.split(":");
  if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  return parseFloat(clean) || 0;
}

function formatSecondsToTime(sec, sep = ".") {
  if (isNaN(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + sep + String(ms).padStart(3, "0");
}

function getFileIconClass(fName) {
  const ext = (fName.split(".").pop() || "").toLowerCase();
  if (["mp4", "mkv", "webm", "avi", "mov"].includes(ext)) return '<i class="fa-solid fa-file-video has-text-info"></i>';
  if (["mp3", "flac", "ogg", "wav", "aac"].includes(ext)) return '<i class="fa-solid fa-file-audio has-text-primary"></i>';
  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) return '<i class="fa-solid fa-file-image has-text-success"></i>';
  if (["srt", "vtt", "ass", "ssa"].includes(ext)) return '<i class="fa-solid fa-closed-captioning has-text-warning"></i>';
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return '<i class="fa-solid fa-file-zipper has-text-danger"></i>';
  if (["xml", "json", "yaml", "sqlite"].includes(ext)) return '<i class="fa-solid fa-file-code has-text-link"></i>';
  if (["pdf", "epub", "txt"].includes(ext)) return '<i class="fa-solid fa-file-lines has-text-grey"></i>';
  return '<i class="fa-regular fa-file has-text-grey"></i>';
}

function getMimeType(fName) {
  const ext = (fName.split(".").pop() || "").toLowerCase();
  return {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    ass: "text/plain",
    srt: "text/plain",
    vtt: "text/vtt",
    json: "application/json",
    xml: "application/xml",
    pdf: "application/pdf",
    txt: "text/plain"
  }[ext] || "application/octet-stream";
}

function escapeHtml(str) {
  return str ? String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : "";
}

function escapeId(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, "_");
}
