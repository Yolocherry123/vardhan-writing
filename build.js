#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const root = __dirname;
const writingDir = path.join(root, "writing");
const docsDir = path.join(root, "docs");
const KINDS = { essay: "Essay", note: "Note", quote: "Quote" };

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
    /^#{1,3}\s+/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^(-{3,}|\*{3,})$/.test(line.trim())
  );
}

function renderMarkdown(markdown, depth = 0) {
  const lines = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
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
      blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push("<hr>");
      i += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length === 1 ? 2 : heading[1].length;
      blocks.push(`<h${level}>${inline(heading[2].trim(), depth)}</h${level}>`);
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
      blocks.push(`<blockquote>${paragraphs.map((part) => `<p>${inline(part, depth)}</p>`).join("")}</blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${inline(item.trim(), depth)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${inline(item.trim(), depth)}</li>`).join("")}</ol>`);
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push(`<p>${inline(paragraph.join(" "), depth)}</p>`);
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

function formatDate(iso, style) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) throw new Error(`Date must be YYYY-MM-DD, got "${iso}"`);
  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  if (date.getUTCFullYear() !== Number(parts[1]) || date.getUTCMonth() !== Number(parts[2]) - 1) {
    throw new Error(`"${iso}" is not a real calendar date`);
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: style === "short" ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function normalizeDate(value, filename) {
  const where = filename ? `${filename}: ` : "";
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(String(value).trim());
  if (!match) throw new Error(`${where}Date must be YYYY-MM-DD, got "${value}"`);
  try {
    formatDate(match[1]);
  } catch (error) {
    throw new Error(`${where}${error.message}`);
  }
  return match[1];
}

function readPieceName(filename, headerDate) {
  const name = /^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.md$/.exec(filename);
  if (!name) throw new Error(`${filename}: rename it to YYYY-MM-DD-short-title.md, using lowercase words`);
  return { date: normalizeDate(headerDate, filename), slug: name[2] };
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
    if ((data.kind === "essay" || data.kind === "note") && !data.summary) {
      throw new Error(`${filename}: add a summary`);
    }
    if (data.kind === "quote" && !data.attribution) {
      throw new Error(`${filename}: a quote needs an attribution`);
    }
    return {
      title: data.title,
      date: identity.date,
      kind: data.kind,
      summary: data.summary || firstSentence(body),
      attribution: data.attribution || "",
      source: data.source || "",
      slug: identity.slug,
      html: renderMarkdown(body, 1),
    };
  });
  posts.sort((a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug));
  return posts;
}

function firstSentence(body) {
  const plain = body.replace(/[#>*_`[\]]/g, "").replace(/\s+/g, " ").trim();
  if (plain.length <= 180) return plain;
  const cut = plain.slice(0, 180);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).trim()}…`;
}

function page({ config, depth, pathname, title, description, bodyClass, main }) {
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  const onWriting = bodyClass === "home" || (pathname && pathname.startsWith("posts/"));
  const onAbout = pathname === "about.html";
  const fullTitle = title === config.title ? config.title : `${title} · ${config.title}`;
  const canonical = config.url && pathname
    ? `<link rel="canonical" href="${escapeHtml(`${config.url}/${pathname}`)}">`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="author" content="${escapeHtml(config.author)}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${prefix}site.css">
${canonical}
</head>
<body class="${bodyClass}">
<a class="skip" href="#content">Skip to content</a>
<div class="sheet">
<header class="mast">
<div class="mast-row">
<a class="wordmark" href="${prefix}index.html">${escapeHtml(config.title)}</a>
<nav aria-label="Site"><a href="${prefix}index.html"${onWriting ? ` aria-current="page"` : ""}>Writing</a><a href="${prefix}about.html"${onAbout ? ` aria-current="page"` : ""}>About</a><a href="${prefix}admin/index.html">Edit site</a></nav>
</div>
${bodyClass === "home" ? `<p class="tagline">${escapeHtml(config.description)}</p>` : ""}
</header>
<main id="content">
${main}
</main>
<footer class="colophon"><a href="${prefix}index.html">${escapeHtml(config.author)}</a></footer>
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
      pathname: "index.html",
      title: config.title,
      description: config.description,
      bodyClass: "home",
      main: `<p class="empty">Nothing posted yet.</p>`,
    });
  }
  const items = posts.map((post) => `<li data-kind="${post.kind}">
<p class="meta"><span class="kicker">${KINDS[post.kind]}</span><time datetime="${post.date}">${formatDate(post.date)}</time></p>
<h3><a href="posts/${post.slug}.html">${escapeHtml(post.title)}</a></h3>
<p class="dek">${inline(post.summary)}</p>
</li>`).join("\n");
  const filters = [
    ["all", "All", true],
    ["essay", "Essays", false],
    ["note", "Notes", false],
    ["quote", "Quotes", false],
  ].map(([kind, label, checked]) => {
    const count = kind === "all" ? posts.length : posts.filter((post) => post.kind === kind).length;
    return `<input type="radio" name="kind" id="kind-${kind}"${checked ? " checked" : ""}><label for="kind-${kind}">${label} <span class="count">${count}</span></label>`;
  }).join("");
  const empty = ["essay", "note", "quote"].map((kind) => `<p class="none" data-for="${kind}">No ${kind}s yet.</p>`).join("\n");
  return page({
    config,
    depth: 0,
    pathname: "index.html",
    title: config.title,
    description: config.description,
    bodyClass: "home",
    main: `<section class="index" aria-label="Writing">
<div class="filters">
<p class="filters-label" id="show-label">Show</p>
<div role="radiogroup" aria-labelledby="show-label">
${filters}
</div>
</div>
<p class="order">Newest first</p>
${empty}
<ol>
${items}
</ol>
</section>`,
  });
}

function renderPost(config, post) {
  const credit = post.kind === "quote"
    ? `<p class="attribution">${escapeHtml(post.attribution)}${post.source ? `, <cite>${escapeHtml(post.source)}</cite>` : ""}</p>`
    : "";
  const proseClass = post.kind === "quote" ? "prose quote" : "prose";
  return page({
    config,
    depth: 1,
    pathname: `posts/${post.slug}.html`,
    title: post.title,
    description: post.summary,
    bodyClass: "page",
    main: `<article class="post">
<p class="back"><a href="../index.html">Back to writing</a></p>
<p class="kicker">${KINDS[post.kind]}</p>
<h1>${escapeHtml(post.title)}</h1>
<p class="dateline"><time datetime="${post.date}">${formatDate(post.date)}</time></p>
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
<p>That address does not match a piece. The full list is on <a href="index.html">all writing</a>.</p>
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
  fs.cpSync(path.join(root, "src", "fonts"), path.join(docsDir, "fonts"), { recursive: true });
  fs.cpSync(path.join(root, "src", "admin"), path.join(docsDir, "admin"), { recursive: true });
  const images = path.join(writingDir, "images");
  if (fs.existsSync(images)) {
    fs.cpSync(images, path.join(docsDir, "images"), { recursive: true });
  }
}

function writeSite(config, posts) {
  fs.rmSync(docsDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(docsDir, "posts"), { recursive: true });
  fs.writeFileSync(path.join(docsDir, "index.html"), renderHome(config, posts));
  fs.writeFileSync(path.join(docsDir, "about.html"), renderAbout(config));
  fs.writeFileSync(path.join(docsDir, "404.html"), renderMissing(config));
  fs.writeFileSync(path.join(docsDir, "favicon.svg"), favicon(config));
  fs.writeFileSync(path.join(docsDir, ".nojekyll"), "");
  for (const post of posts) {
    fs.writeFileSync(path.join(docsDir, "posts", `${post.slug}.html`), renderPost(config, post));
  }
  copyStatic();
  if (config.url) writeFeed(config, posts);
}

function writeFeed(config, posts) {
  const items = posts.map((post) => {
    const [year, month, day] = post.date.split("-").map(Number);
    const pubDate = new Date(Date.UTC(year, month - 1, day, 12)).toUTCString();
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
<link>${escapeHtml(config.url)}/</link>
<description>${escapeHtml(config.description)}</description>
${items}
</channel>
</rss>
`;
  fs.writeFileSync(path.join(docsDir, "feed.xml"), feed);
  const index = fs.readFileSync(path.join(docsDir, "index.html"), "utf8");
  fs.writeFileSync(
    path.join(docsDir, "index.html"),
    index.replace("</head>", `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)}" href="feed.xml">\n</head>`),
  );
}

function selfCheck() {
  assert.match(renderMarkdown("A **bold** and *italic* word."), /<strong>bold<\/strong> and <em>italic<\/em>/);
  assert.match(renderMarkdown("See [the notes](https://example.com/a)."), /href="https:\/\/example.com\/a"/);
  assert.doesNotMatch(renderMarkdown("[nope](javascript:alert(1))"), /href=/);
  assert.match(renderMarkdown("Use `<script>` carefully."), /&lt;script&gt;/);
  assert.doesNotMatch(renderMarkdown("Use `<script>` carefully."), /<script>/);
  assert.match(renderMarkdown("## Section\n\nHello."), /<h2>Section<\/h2>/);
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
  assert.match(quotePage, /class="prose quote"/);
  assert.match(quotePage, /Simone Weil, <cite>Gravity and Grace<\/cite>/);
  assert.equal(formatDate("2026-11-08"), "8 November 2026");
  assert.equal(formatDate("2026-11-07", "short"), "7 Nov 2026");
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
  const index = fs.readFileSync(path.join(docsDir, "index.html"), "utf8");
  for (const post of posts) assert.match(index, new RegExp(escapeHtml(post.title)));
  assert.match(index, /href="admin\/index.html"/);
  assert.match(index, /Newest first/);
  assert.match(index, /id="kind-quote"/);
  for (let i = 1; i < posts.length; i += 1) {
    assert.ok(posts[i - 1].date >= posts[i].date);
    const newer = index.indexOf(escapeHtml(posts[i - 1].title));
    const older = index.indexOf(escapeHtml(posts[i].title));
    assert.ok(newer !== -1 && older !== -1 && newer < older);
  }
  const built = fs.readFileSync(path.join(docsDir, "posts", `${posts[0].slug}.html`), "utf8");
  assert.doesNotMatch(built, /<script/i);
  assert.match(built, /href="\.\.\/admin\/index.html"/);
  const desk = fs.readFileSync(path.join(docsDir, "admin", "config.yml"), "utf8");
  assert.match(desk, /name: github/);
  console.log(`built ${posts.length} ${posts.length === 1 ? "piece" : "pieces"}`);
  for (const post of posts) console.log(`  ${post.date}  ${post.kind.padEnd(5)}  ${post.title}`);
  console.log("→ docs/");
}

main();
