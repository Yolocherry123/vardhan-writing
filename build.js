#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const root = __dirname;
const writingDir = path.join(root, "writing");
const docsDir = path.join(root, "docs");
const KINDS = { essay: "Essay", note: "Note", quote: "Quote" };
const KIND_FILE = { essay: "essays.html", note: "notes.html", quote: "quotes.html" };
const KIND_HEADING = { essay: "Essays", note: "Notes", quote: "Quotes" };
const KIND_EMPTY = { essay: "No essays yet.", note: "No notes yet.", quote: "No quotes yet." };
const TYPEFACES = ["courier", "newsreader", "lora", "charter"];
const TYPEFACE = "courier";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(url) {
  const trimmed = url.trim();
  if (trimmed.startsWith("//") || trimmed.includes("\\")) return false;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (!scheme) return true;
  return scheme[1].toLowerCase() === "https" || scheme[1].toLowerCase() === "http" || scheme[1].toLowerCase() === "mailto";
}

function mediaUrl(url, depth) {
  const trimmed = url.trim();
  if (!safeUrl(trimmed)) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  const relative = trimmed.replace(/^\//, "");
  if (relative.startsWith("images/")) {
    if (relative.includes("..")) return null;
    return `${"../".repeat(depth)}${relative}`;
  }
  return trimmed;
}

function inline(raw, depth = 0) {
  let text = escapeHtml(raw);
  const codes = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (full, alt, url) => {
    const src = mediaUrl(url, depth);
    if (!src) return alt;
    return `<img src="${src}" alt="${alt}">`;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (full, label, url) => {
    const href = mediaUrl(url, depth);
    if (!href) return label;
    return `<a href="${href}">${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, (full, inner) => {
    if (!inner.trim()) return full;
    return `<strong>${inner}</strong>`;
  });
  text = text.replace(/\*([^*]+)\*/g, (full, inner) => {
    if (!inner.trim() || inner.startsWith(" ") || inner.endsWith(" ")) return full;
    return `<em>${inner}</em>`;
  });
  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[index]}</code>`);
}

function isBlockStart(line) {
  return (
    line.startsWith("```") ||
    line.startsWith(">") ||
    /^#{1,4}\s+/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^(-{3,}|\*{3,})$/.test(line.trim()) ||
    /^\{(left|center|right)\}$/.test(line.trim())
  );
}

function renderMarkdown(markdown, depth = 0) {
  const lines = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks = [];
  let placed = "";
  const emit = (html) => {
    blocks.push(placed ? `<div class="placed align-${placed}">${html}</div>` : html);
    placed = "";
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const alignMarker = /^\{(left|center|right)\}$/.exec(line.trim());
    if (alignMarker) {
      placed = alignMarker[1];
      i += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      emit(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      emit("<hr>");
      i += 1;
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const marks = heading[1].length;
      const level = marks <= 2 ? 2 : marks;
      emit(`<h${level}>${inline(heading[2].trim(), depth)}</h${level}>`);
      i += 1;
      continue;
    }
    if (line.startsWith(">")) {
      const quoted = [];
      while (i < lines.length) {
        if (lines[i].startsWith(">")) {
          quoted.push(lines[i].replace(/^>\s?/, ""));
          i += 1;
          continue;
        }
        if (lines[i].trim() === "" && i + 1 < lines.length && lines[i + 1].startsWith(">")) {
          quoted.push("");
          i += 1;
          continue;
        }
        break;
      }
      const paragraphs = quoted.join("\n").split(/\n\s*\n/).map((part) => part.replace(/\n/g, " ").trim()).filter(Boolean);
      emit(`<blockquote>${paragraphs.map((part) => `<p>${inline(part, depth)}</p>`).join("")}</blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      emit(`<ul>${items.map((item) => `<li>${inline(item.trim(), depth)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      emit(`<ol>${items.map((item) => `<li>${inline(item.trim(), depth)}</li>`).join("")}</ol>`);
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    emit(`<p>${inline(paragraph.join(" "), depth)}</p>`);
  }
  return blocks.join("\n");
}

function parseFrontMatter(raw, filename) {
  const text = raw.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${filename}: start the file with a --- header`);
  const data = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const field = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (!field) throw new Error(`${filename}: could not read the header line "${line}"`);
    let value = field[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[field[1]] = value;
  }
  return { data, body: match[2].trim() };
}

const ZONE = "Asia/Kolkata";

function calendarDay(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`"${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}" is not a real calendar date`);
  }
}

function zoneDay(instant) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function parseStamp(value, filename) {
  const where = filename ? `${filename}: ` : "";
  const raw = String(value ?? "").trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    calendarDay(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
    return { date: dateOnly[0], instant: null };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(raw);
  if (!match) throw new Error(`${where}Date must be YYYY-MM-DD, got "${value}"`);
  calendarDay(Number(match[1]), Number(match[2]), Number(match[3]));
  let zone = match[7] || "+05:30";
  if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] || "00"}${zone}`;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) throw new Error(`${where}"${value}" is not a real date`);
  return { date: zoneDay(instant), instant };
}

function formatDate(iso, style) {
  const stamp = parseStamp(iso);
  const instant = stamp.instant || new Date(`${stamp.date}T00:00:00+05:30`);
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: style === "short" ? "short" : "long",
    year: "numeric",
    timeZone: ZONE,
  }).format(instant);
  if (!stamp.instant) return day;
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: ZONE,
  }).format(instant).toLowerCase();
  return `${day}, ${time}`;
}

function normalizeDate(value, filename) {
  try {
    return parseStamp(value, filename).date;
  } catch (error) {
    if (filename && !error.message.startsWith(filename)) {
      throw new Error(`${filename}: ${error.message}`);
    }
    throw error;
  }
}

function readPieceName(filename, headerDate) {
  const name = /^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.md$/.exec(filename);
  if (!name) throw new Error(`${filename}: rename it to YYYY-MM-DD-short-title.md, using lowercase words`);
  const stamp = parseStamp(headerDate, filename);
  return { date: stamp.date, instant: stamp.instant, slug: name[2] };
}

function loadConfig() {
  const config = JSON.parse(fs.readFileSync(path.join(root, "site.config.json"), "utf8"));
  for (const key of ["title", "description", "author", "about"]) {
    if (!config[key] || typeof config[key] !== "string") {
      throw new Error(`site.config.json needs a "${key}" string`);
    }
  }
  if (typeof config.url !== "string") config.url = "";
  config.url = config.url.replace(/\/$/, "");
  return config;
}

function loadPosts() {
  const filenames = fs.readdirSync(writingDir).filter((name) => name.endsWith(".md") && !name.startsWith("_"));
  const posts = filenames.map((filename) => {
    const raw = fs.readFileSync(path.join(writingDir, filename), "utf8");
    const { data, body } = parseFrontMatter(raw, filename);
    const identity = readPieceName(filename, data.date);
    if (!data.title) throw new Error(`${filename}: add a title`);
    if (!KINDS[data.kind]) throw new Error(`${filename}: kind must be essay, note, or quote`);
    if (!body) throw new Error(`${filename}: the piece is empty`);
    data.summary = (data.summary || firstSentence(body)).replace(/\{(?:left|center|right)\}/g, " ").replace(/\s+/g, " ").trim();
    if (!data.summary) data.summary = firstSentence(body);
    return {
      title: data.title,
      date: identity.date,
      when: String(data.date).trim(),
      instant: identity.instant,
      kind: data.kind,
      summary: data.summary || firstSentence(body),
      attribution: data.attribution || "",
      source: data.source || "",
      align: pieceAlign(data.align),
      slug: identity.slug,
      html: renderMarkdown(body, 1),
      homeHtml: renderMarkdown(body, 0),
    };
  });
  const orderKey = (post) => (post.instant || new Date(`${post.date}T00:00:00+05:30`)).toISOString();
  posts.sort((a, b) => orderKey(b).localeCompare(orderKey(a)) || b.slug.localeCompare(a.slug));
  return posts;
}

function pieceAlign(value) {
  return value === "left" || value === "right" ? value : "center";
}

function firstSentence(body) {
  const plain = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\{(?:left|center|right)\}/g, " ")
    .replace(/[#>*_`[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 180) return plain;
  const cut = plain.slice(0, 180);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).trim()}…`;
}

function page({ config, depth, pathname, title, description, bodyClass, main }) {
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  const fullTitle = title === config.title ? config.title : `${title} · ${config.title}`;
  const links = [
    ["essays.html", "Essays"],
    ["notes.html", "Notes"],
    ["quotes.html", "Quotes"],
    ["about.html", "About"],
    ["edit.html", "Edit"],
  ].map(([href, label]) => `<a href="${prefix}${href}"${pathname === href ? ` aria-current="page"` : ""}>${label}</a>`);
  const nav = `<span class="nav-line">${links.slice(0, 3).join("")}</span><span class="nav-line">${links.slice(3).join("")}</span>`;
  const canonical = config.url && pathname
    ? `<link rel="canonical" href="${escapeHtml(`${config.url}/${pathname}`)}">`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="author" content="${escapeHtml(config.author)}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${prefix}site.css?v=27">
${canonical}
</head>
<body class="${bodyClass} font-${TYPEFACES.includes(TYPEFACE) ? TYPEFACE : "courier"}">
<a class="skip" href="#content">Skip to content</a>
<div class="sheet">
<header class="mast">
<div class="mast-row">
<a class="wordmark" href="${prefix}home.html">${escapeHtml(config.title)}</a>
<nav aria-label="Site">${nav}</nav>
</div>
${bodyClass === "home" ? `<p class="tagline">${escapeHtml(config.description)}</p>` : ""}
</header>
<main id="content">
${main}
</main>
</div>
</body>
</html>
`;
}

function renderHome(config, posts) {
  if (posts.length === 0) {
    return page({
      config,
      depth: 0,
      pathname: "home.html",
      title: config.title,
      description: config.description,
      bodyClass: "home",
      main: `<p class="empty">Nothing posted yet.</p>`,
    });
  }
  const today = posts.filter((post) => post.date === posts[0].date);
  const previous = posts.filter((post) => post.date !== posts[0].date);
  const [latest, ...sameDay] = today;
  const lead = latest.kind === "note"
    ? `<div class="prose align-${latest.align}">${latest.homeHtml}</div>`
    : homePreview(latest);
  const featured = `<article class="featured">
${kindLink(latest.kind, 0)}
<h1><a href="posts/${latest.slug}.html">${escapeHtml(latest.title)}</a></h1>
<p class="dateline"><time datetime="${latest.instant ? latest.instant.toISOString() : latest.date}">${formatDate(latest.when || latest.date)}</time></p>
${lead}
</article>`;
  const list = (items, className, label) =>
    items.length
      ? `<section class="archive${className}" aria-label="${label}">
<ol>
${items.map((post) => pieceItem(post, 0, true, true)).join("\n")}
</ol>
</section>`
      : "";
  return page({
    config,
    depth: 0,
    pathname: "home.html",
    title: config.title,
    description: config.description,
    bodyClass: "home",
    main: featured + list(sameDay, "", "Also today") + list(previous, " previous", "Previous"),
  });
}

function kindLink(kind, depth) {
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  return `<a class="kicker" href="${prefix}${KIND_FILE[kind]}">${KINDS[kind]}</a>`;
}

function quoteCredit(post) {
  if (post.kind !== "quote" || !post.attribution) return "";
  const source = post.source ? `, <cite>${escapeHtml(post.source)}</cite>` : "";
  return `<p class="attribution">— ${escapeHtml(post.attribution)}${source}</p>`;
}

function homePreview(post) {
  if (post.kind === "quote") {
    return `<div class="home-quote prose quote">${post.html}</div>${quoteCredit(post)}`;
  }
  if (post.kind === "essay" && post.summary) {
    return `<p class="dek">${inline(post.summary)}</p>`;
  }
  return "";
}

function pieceItem(post, depth, showKind, preview) {
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  return `<li>
${showKind ? kindLink(post.kind, depth) : ""}
<a class="title" href="${prefix}posts/${post.slug}.html">${escapeHtml(post.title)}</a>
<time datetime="${post.instant ? post.instant.toISOString() : post.date}">${formatDate(post.when || post.date, "short")}</time>
${preview ? homePreview(post) : ""}
</li>`;
}

function renderKind(config, posts, kind) {
  const matching = posts.filter((post) => post.kind === kind);
  const main = matching.length
    ? `<section class="archive" aria-label="${KIND_HEADING[kind]}">
<h1>${KIND_HEADING[kind]}</h1>
<ol>
${matching.map((post) => pieceItem(post, 0, false)).join("\n")}
</ol>
</section>`
    : `<p class="empty">${KIND_EMPTY[kind]}</p>`;
  return page({
    config,
    depth: 0,
    pathname: KIND_FILE[kind],
    title: KIND_HEADING[kind],
    description: KIND_HEADING[kind],
    bodyClass: "home",
    main,
  });
}

function renderPost(config, post) {
  const align = post.kind === "quote" ? "center" : pieceAlign(post.align);
  const credit = quoteCredit(post);
  const proseClass = `${post.kind === "quote" ? "prose quote" : "prose"} align-${align}`;
  return page({
    config,
    depth: 1,
    pathname: `posts/${post.slug}.html`,
    title: post.title,
    description: post.summary,
    bodyClass: "page",
    main: `<article class="post">
<p class="back"><a href="../home.html">All writing</a></p>
${kindLink(post.kind, 1)}
<h1>${escapeHtml(post.title)}</h1>
<p class="dateline"><time datetime="${post.instant ? post.instant.toISOString() : post.date}">${formatDate(post.when || post.date)}</time></p>
<div class="${proseClass}">
${post.html}
</div>
${credit}
</article>`,
  });
}

function renderAbout(config) {
  return page({
    config,
    depth: 0,
    pathname: "about.html",
    title: "About",
    description: config.about.replace(/\s+/g, " ").trim(),
    bodyClass: "page",
    main: `<article class="post">
<h1>About</h1>
<div class="prose">
${renderMarkdown(config.about)}
</div>
</article>`,
  });
}

function renderMissing(config) {
  return page({
    config,
    depth: 0,
    pathname: "404.html",
    title: "Not found",
    description: "This page is not on the site.",
    bodyClass: "page",
    main: `<article class="post">
<h1>This page is not here</h1>
<div class="prose">
<p>That address does not match a piece. The full list is on <a href="home.html">all writing</a>.</p>
</div>
</article>`,
  });
}

function favicon(config) {
  const letter = escapeHtml(config.title.trim().charAt(0) || "W");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" fill="#ffffff"/>
<rect x="1" y="1" width="30" height="30" fill="none" stroke="#000000" stroke-width="2"/>
<text x="16" y="22" text-anchor="middle" font-family="Courier New, Courier, monospace" font-size="16" fill="#000000">${letter}</text>
</svg>
`;
}

function copyStatic() {
  fs.copyFileSync(path.join(root, "src", "site.css"), path.join(docsDir, "site.css"));
  fs.copyFileSync(path.join(root, "src", "edit.html"), path.join(docsDir, "edit.html"));
  fs.copyFileSync(path.join(root, "src", "edit.js"), path.join(docsDir, "edit.js"));
  fs.cpSync(path.join(root, "src", "fonts"), path.join(docsDir, "fonts"), { recursive: true });
  fs.cpSync(path.join(root, "src", "admin"), path.join(docsDir, "admin"), { recursive: true });
  const images = path.join(writingDir, "images");
  if (fs.existsSync(images)) {
    fs.cpSync(images, path.join(docsDir, "images"), { recursive: true });
  }
}

function redirectHome(config) {
  const target = config.url ? `${config.url}/home.html` : "home.html";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(config.title)}</title>
<meta http-equiv="refresh" content="0; url=home.html">
<link rel="canonical" href="${escapeHtml(target)}">
</head>
<body>
<p><a href="home.html">${escapeHtml(config.title)}</a></p>
</body>
</html>
`;
}

function writeSite(config, posts) {
  fs.rmSync(docsDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(docsDir, "posts"), { recursive: true });
  fs.writeFileSync(path.join(docsDir, "home.html"), renderHome(config, posts));
  fs.writeFileSync(path.join(docsDir, "index.html"), redirectHome(config));
  for (const kind of Object.keys(KINDS)) {
    fs.writeFileSync(path.join(docsDir, KIND_FILE[kind]), renderKind(config, posts, kind));
  }
  fs.writeFileSync(path.join(docsDir, "about.html"), renderAbout(config));
  fs.writeFileSync(path.join(docsDir, "404.html"), renderMissing(config));
  fs.writeFileSync(path.join(docsDir, "favicon.svg"), favicon(config));
  fs.writeFileSync(path.join(docsDir, ".nojekyll"), "");
  for (const post of posts) {
    fs.writeFileSync(path.join(docsDir, "posts", `${post.slug}.html`), renderPost(config, post));
  }
  copyStatic();
  writeCname(config);
  if (config.url) writeFeed(config, posts);
}

function writeCname(config) {
  if (!config.url) return;
  let host = "";
  try {
    host = new URL(config.url).host;
  } catch {
    return;
  }
  if (!host || host.endsWith("github.io")) return;
  fs.writeFileSync(path.join(docsDir, "CNAME"), `${host}\n`);
}

function writeFeed(config, posts) {
  const items = posts.map((post) => {
    const pubDate = (post.instant || new Date(`${post.date}T12:00:00+05:30`)).toUTCString();
    const link = `${config.url}/posts/${post.slug}.html`;
    return `<item>
<title>${escapeHtml(post.title)}</title>
<link>${escapeHtml(link)}</link>
<guid>${escapeHtml(link)}</guid>
<pubDate>${pubDate}</pubDate>
<description>${escapeHtml(post.summary)}</description>
</item>`;
  }).join("\n");
  const feed = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
<channel>
<title>${escapeHtml(config.title)}</title>
<link>${escapeHtml(config.url ? `${config.url}/home.html` : "home.html")}</link>
<description>${escapeHtml(config.description)}</description>
${items}
</channel>
</rss>
`;
  fs.writeFileSync(path.join(docsDir, "feed.xml"), feed);
  const home = fs.readFileSync(path.join(docsDir, "home.html"), "utf8");
  fs.writeFileSync(
    path.join(docsDir, "home.html"),
    home.replace("</head>", `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)}" href="feed.xml">\n</head>`),
  );
}

function selfCheck() {
  assert.match(renderMarkdown("A **bold** and *italic* word."), /<strong>bold<\/strong> and <em>italic<\/em>/);
  assert.match(renderMarkdown("See [the notes](https://example.com/a)."), /href="https:\/\/example.com\/a"/);
  assert.doesNotMatch(renderMarkdown("[nope](javascript:alert(1))"), /href=/);
  assert.match(renderMarkdown("Use `<script>` carefully."), /&lt;script&gt;/);
  assert.doesNotMatch(renderMarkdown("Use `<script>` carefully."), /<script>/);
  assert.match(renderMarkdown("## Section\n\nHello."), /<h2>Section<\/h2>/);
  assert.match(
    renderMarkdown("Before.\n\n{left}\nLeft side.\n\nAfter."),
    /<p>Before\.<\/p>\n<div class="placed align-left"><p>Left side\.<\/p><\/div>\n<p>After\.<\/p>/,
  );
  assert.equal(firstSentence("hi\n\n{left}\nlsdkfpewaoph\n\nefoeshafoh"), "hi lsdkfpewaoph efoeshafoh");
  assert.equal(firstSentence("Line.![plane](/images/plane.webp)"), "Line.");
  assert.match(renderMarkdown("### Smaller"), /<h3>Smaller<\/h3>/);
  assert.match(renderMarkdown("#### Least"), /<h4>Least<\/h4>/);
  assert.match(renderMarkdown("1. one\n2. two"), /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(renderMarkdown("```\nline\n```"), /<pre><code>line<\/code><\/pre>/);
  assert.match(renderMarkdown("> A line\n>\n> Another."), /<blockquote><p>A line<\/p><p>Another\.<\/p><\/blockquote>/);
  assert.match(renderMarkdown("- one\n- two"), /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  const fenced = renderMarkdown("```\n**not bold**\n```");
  assert.match(fenced, /<pre><code>\*\*not bold\*\*<\/code><\/pre>/);
  const parsed = parseFrontMatter("---\ntitle: Hello: there\ndate: 2026-11-08\nkind: note\n---\n\nBody.\n", "sample.md");
  assert.equal(parsed.data.title, "Hello: there");
  assert.equal(parsed.body, "Body.");
  const quotePage = renderPost(
    { title: "T", description: "d", author: "A", about: "b", url: "" },
    {
      title: "On attention",
      date: "2026-11-01",
      kind: "quote",
      summary: "Weil",
      attribution: "Simone Weil",
      source: "Gravity and Grace",
      slug: "on-attention",
      html: "<p>Attention is the rarest and purest form of generosity.</p>",
    },
  );
  assert.match(quotePage, /class="prose quote align-center"/);
  const leftPage = renderPost(
    { title: "T", description: "d", author: "A", about: "b", url: "" },
    {
      title: "A note",
      date: "2026-11-01",
      kind: "note",
      align: "left",
      summary: "Left",
      attribution: "",
      source: "",
      slug: "a-note",
      html: "<p>Body.</p>",
    },
  );
  assert.match(leftPage, /class="prose align-left"/);
  assert.match(quotePage, /— Simone Weil, <cite>Gravity and Grace<\/cite>/);
  const sampleConfig = { title: "T", description: "d", author: "A", about: "b", url: "" };
  const sampleEssay = {
    title: "An essay",
    date: "2026-11-08",
    when: "2026-11-08",
    instant: null,
    kind: "essay",
    summary: "The short account.",
    attribution: "",
    source: "",
    align: "center",
    slug: "an-essay",
    html: "<p>A much longer essay body that should stay off the home page.</p>",
  };
  const sampleQuote = {
    title: "Curious",
    date: "2026-11-07",
    when: "2026-11-07",
    instant: null,
    kind: "quote",
    summary: "The sdkjf",
    attribution: "ikk",
    source: "dd",
    align: "center",
    slug: "curious",
    html: "<p>The sdkjf lsdkjflajkh</p>",
  };
  const home = renderHome(sampleConfig, [sampleEssay, sampleQuote]);
  assert.match(home, /The short account\./);
  assert.doesNotMatch(home, /much longer essay body/);
  assert.match(home, /The sdkjf lsdkjflajkh/);
  assert.match(home, /— ikk, <cite>dd<\/cite>/);
  assert.match(home, /<p class="dek">The short account\.<\/p>/);
  const quoteHome = renderHome(sampleConfig, [sampleQuote, sampleEssay]);
  assert.match(quoteHome, /<div class="home-quote prose quote"><p>The sdkjf lsdkjflajkh<\/p><\/div>/);
  assert.match(quoteHome, /The short account\./);
  const noteHome = renderHome(sampleConfig, [{
    title: "Hello",
    date: "2026-11-08",
    when: "2026-11-08",
    instant: null,
    kind: "note",
    summary: "Line.",
    attribution: "",
    source: "",
    align: "center",
    slug: "hello",
    html: '<p><img src="../images/plane.webp" alt="plane"></p>',
    homeHtml: '<p>Line.</p><p><img src="images/plane.webp" alt="plane"></p>',
  }]);
  assert.match(noteHome, /src="images\/plane.webp"/);
  assert.doesNotMatch(noteHome, /src="\.\.\/images/);
  assert.equal(formatDate("2026-11-08"), "8 November 2026");
  assert.equal(formatDate("2026-11-07", "short"), "7 Nov 2026");
  assert.equal(formatDate("2026-11-08T03:45:06+05:30"), "8 November 2026, 3:45 am");
  assert.equal(formatDate("2026-11-07T03:01:17+05:30", "short"), "7 Nov 2026, 3:01 am");
  assert.throws(() => formatDate("2026-02-31"));
  assert.equal(normalizeDate("2026-11-08"), "2026-11-08");
  assert.equal(normalizeDate("2026-11-08T00:00:00.000Z"), "2026-11-08");
  assert.throws(() => normalizeDate("2026-02-31"));
  assert.throws(() => normalizeDate("8 November 2026"));
  const moved = readPieceName("2026-11-07-keep.md", "2026-12-01T10:00:00Z");
  assert.equal(moved.date, "2026-12-01");
  assert.equal(moved.slug, "keep");
  assert.throws(() => readPieceName("notes.md", "2026-11-08"));
  assert.match(renderMarkdown("![scan](/images/scan.png)", 1), /<img src="\.\.\/images\/scan.png" alt="scan">/);
  assert.match(renderMarkdown("![scan](images/scan.png)", 0), /src="images\/scan.png"/);
  assert.doesNotMatch(renderMarkdown("![scan](/images/scan.png)", 0), /src="\/images/);
  assert.match(renderMarkdown("[file](/images/scan.pdf)", 1), /href="\.\.\/images\/scan.pdf"/);
  assert.doesNotMatch(renderMarkdown("![x](/images/../site.css)", 0), /src=/);
}

function main() {
  selfCheck();
  const config = loadConfig();
  const posts = loadPosts();
  writeSite(config, posts);
  if (config.url && !new URL(config.url).host.endsWith("github.io")) {
    assert.equal(fs.readFileSync(path.join(docsDir, "CNAME"), "utf8").trim(), new URL(config.url).host);
  }
  const index = fs.readFileSync(path.join(docsDir, "home.html"), "utf8");
  for (const post of posts) assert.match(index, new RegExp(escapeHtml(post.title)));
  assert.match(index, /href="edit.html"/);
  assert.match(index, new RegExp(`class="home font-${TYPEFACE}"`));
  assert.match(fs.readFileSync(path.join(docsDir, "index.html"), "utf8"), /url=home\.html/);
  assert.match(index, /href="essays.html"/);
  assert.doesNotMatch(index, />Earlier</);
  assert.doesNotMatch(index, /Read the /);
  for (const kind of Object.keys(KINDS)) {
    const kindPage = fs.readFileSync(path.join(docsDir, KIND_FILE[kind]), "utf8");
    assert.match(kindPage, new RegExp(`<h1>${KIND_HEADING[kind]}</h1>|${KIND_EMPTY[kind]}`));
  }
  const essays = fs.readFileSync(path.join(docsDir, "essays.html"), "utf8");
  assert.match(essays, /<h1>Essays<\/h1>/);
  assert.doesNotMatch(essays, />Note</);
  const built = fs.readFileSync(path.join(docsDir, "posts", `${posts[0].slug}.html`), "utf8");
  assert.doesNotMatch(built, /<script/i);
  assert.match(built, /href="\.\.\/edit.html"/);
  const editor = fs.readFileSync(path.join(docsDir, "edit.js"), "utf8");
  assert.match(editor, /data-tool="small-heading"/);
  assert.match(editor, /data-tool="code-block"/);
  assert.match(editor, /api\.github\.com/);
  assert.match(editor, /previousSha && current && current\.sha !== previousSha/);
  assert.match(fs.readFileSync(path.join(docsDir, "edit.html"), "utf8"), /src="edit\.js"/);
  const desk = fs.readFileSync(path.join(docsDir, "admin", "config.yml"), "utf8");
  assert.match(desk, /name: github/);
  console.log(`built ${posts.length} ${posts.length === 1 ? "piece" : "pieces"}`);
  for (const post of posts) console.log(`  ${post.date}  ${post.kind.padEnd(5)}  ${post.title}`);
  console.log("→ docs/");
}

main();
