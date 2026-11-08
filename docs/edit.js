(function () {
  const REPO = "Yolocherry123/vardhan-writing";
  const BRANCH = "main";
  const TOKEN_KEY = "vardhan-writing-token";
  const main = document.getElementById("content");
  const opened = { sha: "", path: "" };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]));
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function decodeBase64(content) {
    const binary = atob(String(content || "").replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async function github(path, options) {
    const response = await fetch(`https://api.github.com${path}`, {
      method: options && options.method ? options.method : "GET",
      body: options && options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token()}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options && options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (error) { data = { message: text }; }
    }
    if (!response.ok) {
      const failure = new Error((data && data.message) || `GitHub returned ${response.status}`);
      failure.status = response.status;
      throw failure;
    }
    return data;
  }

  async function readFile(path) {
    try {
      const file = await github(`/repos/${REPO}/contents/${path}?ref=${BRANCH}`);
      if (!file || Array.isArray(file)) return null;
      return { sha: file.sha, text: file.content ? decodeBase64(file.content) : "" };
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async function writeFile(path, content, message, previousSha) {
    const current = await readFile(path);
    if (previousSha && current && current.sha !== previousSha) {
      const failure = new Error("This was changed after you opened it. Reload, then save again.");
      failure.status = 409;
      throw failure;
    }
    if (!previousSha && current) {
      const failure = new Error("A file with this name already exists. Change the title, then save again.");
      failure.status = 409;
      throw failure;
    }
    const body = {
      message,
      content: content.base64 || encodeBase64(content.text),
      branch: BRANCH,
    };
    if (current) body.sha = current.sha;
    try {
      const saved = await github(`/repos/${REPO}/contents/${path}`, { method: "PUT", body });
      return saved.content && saved.content.sha ? saved.content.sha : (current ? current.sha : "");
    } catch (error) {
      if (error.status === 409) {
        throw new Error("This was changed after you opened it. Reload, then save again.");
      }
      throw error;
    }
  }

  function parseFrontMatter(raw) {
    const text = String(raw || "").replace(/\r\n/g, "\n");
    const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
    if (!match) return { data: {}, body: text.trim() };
    const data = {};
    for (const line of match[1].split("\n")) {
      if (!line.trim()) continue;
      const field = /^([A-Za-z]+):\s*(.*)$/.exec(line);
      if (!field) continue;
      let value = field[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      data[field[1]] = value;
    }
    return { data, body: match[2].trim() };
  }

  function fieldLine(key, value) {
    return `${key}: ${String(value ?? "").replace(/\r?\n/g, " ").trim()}`;
  }

  function serializePiece(data, body) {
    return [
      "---",
      fieldLine("title", data.title),
      fieldLine("date", data.date),
      ...(data.updated ? [fieldLine("updated", data.updated)] : []),
      fieldLine("kind", data.kind),
      fieldLine("align", data.align),
      fieldLine("summary", data.summary),
      fieldLine("attribution", data.attribution),
      fieldLine("source", data.source),
      "---",
      "",
      String(body || "").replace(/\s+$/, ""),
      "",
    ].join("\n");
  }

  function nowLocal() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  }

  function toLocalInput(value) {
    const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(value || ""));
    if (!match) return nowLocal();
    return `${match[1]}T${match[2] || "00"}:${match[3] || "00"}`;
  }

  function toStoredDate(value) {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
    if (!match) return `${nowLocal()}:00+05:30`;
    return `${match[1]}T${match[2]}:${match[3]}:00+05:30`;
  }

  function displayWhen(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(value || ""));
    if (!match) return "";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
    if (!match[4]) return day;
    const hour = Number(match[4]);
    return `${day}, ${hour % 12 || 12}:${match[5]} ${hour >= 12 ? "pm" : "am"}`;
  }

  function slugify(title) {
    const slug = String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    return slug || "piece";
  }

  function kindLabel(kind) {
    if (kind === "essay") return "Essay";
    if (kind === "quote") return "Quote";
    return "Thought";
  }

  function status(message) {
    const node = document.getElementById("status");
    if (node) node.textContent = message || "";
  }

  function showSignIn(message) {
    main.innerHTML = `<section class="desk-sign">
<h1>Sign in</h1>
<p>A token lets this page save essays, thoughts, quotes, and pictures to your repository. It stays in this browser.</p>
<p>Create a fine-grained token for Yolocherry123/vardhan-writing with Contents set to read and write.</p>
<p><a href="https://github.com/settings/personal-access-tokens/new">Create a token</a></p>
<form id="sign-in">
<label>Token<input id="token" type="password" autocomplete="off" required></label>
<button type="submit">Sign in</button>
</form>
<p id="status" class="desk-status">${escapeHtml(message || "")}</p>
</section>`;
    document.getElementById("sign-in").addEventListener("submit", async (event) => {
      event.preventDefault();
      const entered = document.getElementById("token").value.trim();
      if (!entered) return;
      localStorage.setItem(TOKEN_KEY, entered);
      status("Checking the token…");
      try {
        await github(`/repos/${REPO}/contents/writing?ref=${BRANCH}`);
        await showList();
      } catch (error) {
        localStorage.removeItem(TOKEN_KEY);
        status(error.status === 401 || error.status === 403
          ? "That token cannot read this repository. Check the repository and the Contents permission."
          : error.message);
      }
    });
  }

  async function refreshName() {
    try {
      const file = await readFile("site.config.json");
      if (!file) return;
      const config = JSON.parse(file.text);
      const mark = document.querySelector(".wordmark");
      if (config.title && mark) mark.textContent = config.title;
      if (config.title) document.title = `Edit · ${config.title}`;
    } catch (error) {
      /* The desk still opens if the site name cannot be read. */
    }
  }

  async function showList() {
    main.innerHTML = `<p class="desk-status">Opening your pieces…</p>`;
    await refreshName();
    let listing;
    try {
      listing = await github(`/repos/${REPO}/contents/writing?ref=${BRANCH}`);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        localStorage.removeItem(TOKEN_KEY);
        showSignIn("That token cannot read this repository. Check the repository and the Contents permission.");
        return;
      }
      if (error.status === 404) listing = [];
      else {
        main.innerHTML = `<p class="desk-status">${escapeHtml(error.message)}</p>`;
        return;
      }
    }
    const files = (Array.isArray(listing) ? listing : []).filter((item) => item.type === "file" && item.name.endsWith(".md") && !item.name.startsWith("_"));
    const pieces = await Promise.all(files.map(async (item) => {
      const file = await readFile(item.path);
      const parsed = parseFrontMatter(file ? file.text : "");
      return {
        path: item.path,
        sha: file ? file.sha : item.sha,
        title: parsed.data.title || item.name,
        kind: parsed.data.kind || "note",
        date: parsed.data.date || "",
      };
    }));
    pieces.sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.path.localeCompare(a.path));
    main.innerHTML = `<section>
<div class="desk-bar">
<button type="button" data-new="essay">New essay</button>
<button type="button" data-new="note">New thought</button>
<button type="button" data-new="quote">New quote</button>
<button type="button" id="site-text">Site text</button>
<button type="button" id="sign-out">Sign out</button>
</div>
${pieces.length ? `<ol class="desk-list">${pieces.map((piece) => `<li><button type="button" data-path="${escapeHtml(piece.path)}"><span class="kicker">${kindLabel(piece.kind)}</span><span class="title">${escapeHtml(piece.title)}</span><span>${escapeHtml(displayWhen(piece.date))}</span></button></li>`).join("")}</ol>` : `<p class="empty">Nothing posted yet.</p>`}
</section>`;
    main.querySelectorAll("[data-new]").forEach((button) => {
      button.addEventListener("click", () => showPiece({
        path: "",
        sha: "",
        isNew: true,
        data: {
          title: "",
          date: `${nowLocal()}:00+05:30`,
          kind: button.getAttribute("data-new"),
          align: "center",
          summary: "",
          attribution: "",
          source: "",
        },
        body: "",
      }));
    });
    main.querySelectorAll("[data-path]").forEach((button) => {
      button.addEventListener("click", () => openPiece(button.getAttribute("data-path")));
    });
    document.getElementById("site-text").addEventListener("click", showSite);
    document.getElementById("sign-out").addEventListener("click", () => {
      localStorage.removeItem(TOKEN_KEY);
      showSignIn("Signed out of this browser.");
    });
  }

  async function openPiece(path) {
    main.innerHTML = `<p class="desk-status">Opening…</p>`;
    try {
      const file = await readFile(path);
      if (!file) {
        await showList();
        return;
      }
      const parsed = parseFrontMatter(file.text);
      showPiece({
        path,
        sha: file.sha,
        isNew: false,
        data: parsed.data,
        body: parsed.body,
      });
    } catch (error) {
      main.innerHTML = `<p class="desk-status">${escapeHtml(error.message)}</p><p class="desk-actions"><button type="button" id="back">All pieces</button></p>`;
      document.getElementById("back").addEventListener("click", showList);
    }
  }

  function showPiece(piece) {
    opened.sha = piece.sha || "";
    opened.path = piece.path || "";
    opened.originalDate = (piece.data && piece.data.date) || "";
    const data = piece.data || {};
    const align = data.align === "left" || data.align === "right" ? data.align : "center";
    const kind = data.kind === "essay" || data.kind === "quote" ? data.kind : "note";
    main.innerHTML = `<section>
<p class="desk-actions"><button type="button" id="back">All pieces</button></p>
<label class="title-label">Title<input id="title" class="title-field" type="text" required></label>
<div class="desk-fields">
<label>Kind<select id="kind">
<option value="essay">Essay</option>
<option value="note">Thought</option>
<option value="quote">Quote</option>
</select></label>
<label>Date<input id="date" type="datetime-local" required></label>
<label>Alignment<select id="align">
<option value="center">Center</option>
<option value="left">Left</option>
<option value="right">Right</option>
</select></label>
</div>
<label>Summary<input id="summary" type="text"></label>
<div id="quote-fields">
<label>Attribution<input id="attribution" type="text"></label>
<label>Source<input id="source" type="text"></label>
</div>
<div class="desk-toolbar" aria-label="Writing tools">
<div class="desk-tool-group"><span>Marks</span>
<button type="button" data-tool="bold">Bold</button>
<button type="button" data-tool="italic">Italic</button>
<button type="button" data-tool="code">Code</button>
<button type="button" data-tool="link">Link</button>
</div>
<div class="desk-tool-group"><span>Align</span>
<button type="button" data-tool="align-left">Left</button>
<button type="button" data-tool="align-center">Center</button>
<button type="button" data-tool="align-right">Right</button>
</div>
<div class="desk-tool-group"><span>Blocks</span>
<button type="button" data-tool="text">Text</button>
<button type="button" data-tool="heading">Heading</button>
<button type="button" data-tool="subheading">Subheading</button>
<button type="button" data-tool="small-heading">Small heading</button>
<button type="button" data-tool="bullet">Bullet list</button>
<button type="button" data-tool="number">Numbered list</button>
<button type="button" data-tool="quote">Quote</button>
<button type="button" data-tool="code-block">Code block</button>
<button type="button" data-tool="rule">Divider</button>
<button type="button" id="picture">Picture</button>
</div>
<input id="picture-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
</div>
<textarea id="body" spellcheck="true" aria-label="Body"></textarea>
<div class="desk-actions"><button type="button" id="save">Save</button></div>
<p id="status" class="desk-status"></p>
</section>`;
    document.getElementById("title").value = data.title || "";
    document.getElementById("kind").value = kind;
    document.getElementById("date").value = toLocalInput(data.date);
    document.getElementById("align").value = align;
    document.getElementById("summary").value = data.summary || "";
    document.getElementById("attribution").value = data.attribution || "";
    document.getElementById("source").value = data.source || "";
    document.getElementById("body").value = piece.body || "";
    const quoteFields = document.getElementById("quote-fields");
    const syncKind = () => { quoteFields.hidden = document.getElementById("kind").value !== "quote"; };
    const syncAlign = () => { document.getElementById("body").style.textAlign = document.getElementById("align").value; };
    syncKind();
    syncAlign();
    document.getElementById("kind").addEventListener("change", syncKind);
    document.getElementById("align").addEventListener("change", syncAlign);
    opened.snapshot = serializePiece(readPieceForm(), document.getElementById("body").value);
    document.getElementById("back").addEventListener("click", () => {
      const current = serializePiece(readPieceForm(), document.getElementById("body").value);
      if (current !== opened.snapshot && !window.confirm("Leave without saving?")) return;
      showList();
    });
    main.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => applyTool(button.getAttribute("data-tool")));
    });
    document.getElementById("picture").addEventListener("click", () => document.getElementById("picture-file").click());
    document.getElementById("picture-file").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) uploadPicture(file);
    });
    document.getElementById("save").addEventListener("click", () => savePiece(piece));
  }

  function readPieceForm() {
    return {
      title: document.getElementById("title").value,
      date: opened.originalDate && toLocalInput(opened.originalDate) === document.getElementById("date").value
        ? opened.originalDate
        : toStoredDate(document.getElementById("date").value),
      kind: document.getElementById("kind").value,
      align: document.getElementById("align").value,
      summary: document.getElementById("summary").value,
      attribution: document.getElementById("attribution").value,
      source: document.getElementById("source").value,
    };
  }

  function bodyField() {
    return document.getElementById("body");
  }

  function wrapSelection(before, after) {
    const el = bodyField();
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.slice(start, end) || "text";
    el.setRangeText(before + selected + after, start, end, "select");
    el.setSelectionRange(start + before.length, start + before.length + selected.length);
    el.focus();
  }

  function selectedLines() {
    const el = bodyField();
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = el.value.lastIndexOf("\n", start - 1) + 1;
    const lineEndIndex = el.value.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? el.value.length : lineEndIndex;
    return { el, lineStart, lineEnd, text: el.value.slice(lineStart, lineEnd) };
  }

  function stripBlock(line) {
    return line.replace(/^\s*(?:\{(?:left|center|right)\}\s*|#{1,4}\s+|>\s*|[-*]\s+|\d+\.\s+)/, "");
  }

  function setBlock(kind) {
    const { el, lineStart, lineEnd, text } = selectedLines();
    const placeholders = {
      heading: "Heading",
      subheading: "Subheading",
      "small-heading": "Small heading",
      bullet: "Item",
      number: "Item",
      quote: "Quote",
    };
    if (kind === "code-block") {
      const inner = text.split("\n").map(stripBlock).join("\n").trim() || "code";
      el.setRangeText(`\`\`\`\n${inner}\n\`\`\``, lineStart, lineEnd, "end");
      el.focus();
      return;
    }
    if (kind === "rule") {
      el.setRangeText("---", lineStart, lineEnd, "end");
      el.focus();
      return;
    }
    let number = 0;
    const next = text.split("\n").map((line) => {
      const plain = stripBlock(line).trim();
      if (!plain && !line.trim()) return "";
      if (kind === "text") return plain;
      const words = plain || placeholders[kind] || "Text";
      if (kind === "heading") return `## ${words}`;
      if (kind === "subheading") return `### ${words}`;
      if (kind === "small-heading") return `#### ${words}`;
      if (kind === "bullet") return `- ${words}`;
      if (kind === "quote") return `> ${words}`;
      if (kind === "number") {
        number += 1;
        return `${number}. ${words}`;
      }
      return line;
    }).join("\n");
    el.setRangeText(next, lineStart, lineEnd, "end");
    el.focus();
  }

  function isMarkerLine(line) {
    return /^\{(left|center|right)\}$/.test(line.trim());
  }

  function lineAt(value, index) {
    const start = value.lastIndexOf("\n", Math.max(0, index) - 1) + 1;
    const breakAt = value.indexOf("\n", start);
    const end = breakAt === -1 ? value.length : breakAt;
    return { start, end, text: value.slice(start, end) };
  }

  function blockAtCursor() {
    const el = bodyField();
    const value = el.value;
    let probe = el.selectionStart;
    if (probe > 0 && value[probe - 1] === "\n" && (probe === value.length || value[probe] === "\n")) probe -= 1;
    let line = lineAt(value, probe);
    if (!line.text.trim() && line.start > 0) {
      const previous = lineAt(value, line.start - 1);
      if (previous.text.trim()) line = previous;
    }
    if (isMarkerLine(line.text)) {
      let nextIndex = line.end + 1;
      while (nextIndex <= value.length) {
        const next = lineAt(value, Math.min(nextIndex, value.length));
        if (next.text.trim()) {
          line = next;
          break;
        }
        if (next.end >= value.length) break;
        nextIndex = next.end + 1;
      }
    }
    let start = line.start;
    let end = line.end;
    const fencesBefore = value.slice(0, line.start).split("\n").filter((item) => item.startsWith("```")).length;
    if (line.text.startsWith("```") || fencesBefore % 2 === 1) {
      let open = line;
      while (open.start > 0 && !open.text.startsWith("```")) open = lineAt(value, open.start - 1);
      if (open.text.startsWith("```")) {
        start = open.start;
        end = open.end;
        while (end < value.length) {
          const next = lineAt(value, end + 1);
          end = next.end;
          if (next.text.startsWith("```")) break;
        }
      }
    } else if (/^\s*[-*]\s+/.test(line.text)) {
      const isItem = (item) => /^\s*[-*]\s+/.test(item);
      while (start > 0 && isItem(lineAt(value, start - 1).text)) start = lineAt(value, start - 1).start;
      while (end < value.length && isItem(lineAt(value, end + 1).text)) end = lineAt(value, end + 1).end;
    } else if (/^\s*\d+\.\s+/.test(line.text)) {
      const isItem = (item) => /^\s*\d+\.\s+/.test(item);
      while (start > 0 && isItem(lineAt(value, start - 1).text)) start = lineAt(value, start - 1).start;
      while (end < value.length && isItem(lineAt(value, end + 1).text)) end = lineAt(value, end + 1).end;
    } else if (line.text.startsWith(">")) {
      const isQuote = (item) => item.startsWith(">");
      while (start > 0 && isQuote(lineAt(value, start - 1).text)) start = lineAt(value, start - 1).start;
      while (end < value.length && isQuote(lineAt(value, end + 1).text)) end = lineAt(value, end + 1).end;
    } else if (!/^#{1,4}\s+/.test(line.text) && !/^(-{3,}|\*{3,})$/.test(line.text.trim())) {
      const isParagraph = (item) => item.trim() && !item.startsWith("```") && !item.startsWith(">") && !/^#{1,4}\s+/.test(item) && !/^\s*[-*]\s+/.test(item) && !/^\s*\d+\.\s+/.test(item) && !/^(-{3,}|\*{3,})$/.test(item.trim()) && !isMarkerLine(item);
      while (start > 0 && isParagraph(lineAt(value, start - 1).text)) start = lineAt(value, start - 1).start;
      while (end < value.length && isParagraph(lineAt(value, end + 1).text)) end = lineAt(value, end + 1).end;
    }
    if (start > 0 && isMarkerLine(lineAt(value, start - 1).text)) start = lineAt(value, start - 1).start;
    return { el, start, end };
  }

  function setAlign(direction) {
    const { el, start, end } = blockAtCursor();
    const lines = el.value.slice(start, end).split("\n");
    const content = (isMarkerLine(lines[0] || "") ? lines.slice(1) : lines).join("\n").replace(/^\n/, "");
    const fallback = document.getElementById("align").value;
    const next = direction === fallback ? content : (content.trim() ? `{${direction}}\n${content}` : `{${direction}}`);
    el.setRangeText(next, start, end, "end");
    el.focus();
  }

  function applyTool(tool) {
    if (tool === "bold") wrapSelection("**", "**");
    else if (tool === "italic") wrapSelection("*", "*");
    else if (tool === "code") wrapSelection("`", "`");
    else if (tool === "link") {
      const href = window.prompt("Link address");
      if (!href || !/^https?:\/\//i.test(href.trim())) {
        if (href) status("Use a full http or https address.");
        return;
      }
      wrapSelection("[", `](${href.trim()})`);
    } else if (tool.startsWith("align-")) setAlign(tool.slice("align-".length));
    else setBlock(tool);
  }

  async function uploadPicture(file) {
    const type = (file.type || "").toLowerCase();
    const allowed = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
    if (!allowed[type]) {
      status("Use a PNG, JPEG, GIF, or WebP picture.");
      return;
    }
    const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "picture";
    let name = `${base}.${allowed[type]}`;
    status("Uploading the picture…");
    try {
      for (let n = 2; await readFile(`writing/images/${name}`); n += 1) {
        name = `${base}-${n}.${allowed[type]}`;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      await writeFile(`writing/images/${name}`, { base64: bytesToBase64(bytes) }, `Add picture ${name}`, "");
      const el = bodyField();
      const alt = base.replace(/-/g, " ");
      el.setRangeText(`![${alt}](/images/${name})`, el.selectionStart, el.selectionEnd, "end");
      el.focus();
      status("Picture added. Save the piece to publish it.");
    } catch (error) {
      status(error.message);
    }
  }

  async function savePiece(piece) {
    const data = readPieceForm();
    data.updated = `${nowLocal()}:00+05:30`;
    const body = document.getElementById("body").value;
    if (!data.title.trim()) {
      status("Add a title.");
      return;
    }
    if (!body.trim()) {
      status("Write something in the body.");
      return;
    }
    if (data.kind === "quote" && !data.attribution.trim()) {
      status("A quote needs the person who wrote it.");
      return;
    }
    const save = document.getElementById("save");
    save.disabled = true;
    status("Saving…");
    try {
      let path = piece.path;
      if (!path) {
        const day = data.date.slice(0, 10);
        const base = slugify(data.title);
        path = `writing/${day}-${base}.md`;
        let n = 2;
        while (await readFile(path)) {
          path = `writing/${day}-${base}-${n}.md`;
          n += 1;
        }
      }
      const sha = await writeFile(
        path,
        { text: serializePiece(data, body) },
        `${piece.isNew ? "Create" : "Update"} Piece “${path.split("/").pop().replace(/\.md$/, "")}”`,
        piece.isNew ? "" : opened.sha,
      );
      opened.sha = sha;
      opened.path = path;
      piece.path = path;
      piece.sha = sha;
      piece.isNew = false;
      piece.data = data;
      piece.body = body;
      opened.originalDate = data.date;
      opened.snapshot = serializePiece(data, body);
      status("Saved. The public page updates in about a minute.");
    } catch (error) {
      status(error.message);
    } finally {
      save.disabled = false;
    }
  }

  async function showSite() {
    main.innerHTML = `<p class="desk-status">Opening site text…</p>`;
    try {
      const file = await readFile("site.config.json");
      if (!file) throw new Error("site.config.json is missing.");
      const config = JSON.parse(file.text);
      opened.sha = file.sha;
      opened.path = "site.config.json";
      main.innerHTML = `<section>
<p class="desk-actions"><button type="button" id="back">All pieces</button></p>
<label>Site name<input id="site-title" class="title-field" type="text"></label>
<label>Tagline<textarea id="site-description" rows="3"></textarea></label>
<label>Author<input id="site-author" type="text"></label>
<label>About<textarea id="site-about" rows="6"></textarea></label>
<div class="desk-actions"><button type="button" id="save">Save</button></div>
<p id="status" class="desk-status"></p>
</section>`;
      document.getElementById("site-title").value = config.title || "";
      document.getElementById("site-description").value = config.description || "";
      document.getElementById("site-author").value = config.author || "";
      document.getElementById("site-about").value = config.about || "";
      document.getElementById("back").addEventListener("click", showList);
      document.getElementById("save").addEventListener("click", async () => {
        const next = {
          ...config,
          title: document.getElementById("site-title").value.trim(),
          description: document.getElementById("site-description").value.trim(),
          author: document.getElementById("site-author").value.trim(),
          about: document.getElementById("site-about").value.trim(),
        };
        if (!next.title || !next.description || !next.author || !next.about) {
          status("Name, tagline, author, and About all need text.");
          return;
        }
        const save = document.getElementById("save");
        save.disabled = true;
        status("Saving…");
        try {
          opened.sha = await writeFile("site.config.json", { text: `${JSON.stringify(next, null, 2)}\n` }, "Update site text", opened.sha);
          const mark = document.querySelector(".wordmark");
          if (mark) mark.textContent = next.title;
          status("Saved. The public page updates in about a minute.");
        } catch (error) {
          status(error.message);
        } finally {
          save.disabled = false;
        }
      });
    } catch (error) {
      main.innerHTML = `<p class="desk-status">${escapeHtml(error.message)}</p><p class="desk-actions"><button type="button" id="back">All pieces</button></p>`;
      document.getElementById("back").addEventListener("click", showList);
    }
  }

  if (!token()) showSignIn("");
  else showList().catch((error) => {
    main.innerHTML = `<p class="desk-status">${escapeHtml(error.message)}</p>`;
  });
}());
