---
title: Title of the piece
date: 2026-11-08
kind: essay
summary: One sentence that can stand in for the opening.
---

Replace this text.

Copy this file to `writing/YYYY-MM-DD-short-title.md`. The date in the name and the `date` field have to match. This copy is not published, because it does not live in `writing/`.

`kind` is `essay`, `note`, or `quote`.

- An essay is the long form.
- A note is a few paragraphs.
- A quote is someone else's sentence. Add `attribution:` and, if you have it, `source:` to the header. The words stay theirs.

Write the piece in Markdown. `##` starts a section. Then run `node build.js` from the repository root.

Once the site is on GitHub Pages, the desk at `/admin/` writes these files for you.
