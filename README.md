# Vardhan Madala — writing site

A typed-manuscript site for notes, quotes, and longer pieces. Open this folder in Cursor.

## Preview

The pages already built are in `docs/`. Open `docs/home.html` in a browser.

To serve them locally:

```bash
cd docs
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765/

## Publish, then edit in the browser

The desk is a private page on the site. From there you can add a quote, a note, or an essay, upload a picture or a file, and change the site name, the tagline, and the About page. Saving publishes the change.

GitHub cannot show a “Log in with GitHub” button on a static site, so the desk asks for a token instead. The screen links to the GitHub page that creates one. Make it a fine-grained token for this repository only, with Contents set to read and write. It stays in that browser. Do not put it in this folder, and sign out on a computer you share.

Do this once:

1. In `src/admin/config.yml`, replace `YOUR_GITHUB_USERNAME/vardhan-writing` with your GitHub username and repository name.
2. Push this folder to a public GitHub repository. On a free account the repository has to be public.
3. In the repository settings, open Pages and set the source to GitHub Actions.
4. Wait for the Publish workflow to finish. The site will be at `https://<github-username>.github.io/<repo-name>/`.
5. Open `https://<github-username>.github.io/<repo-name>/admin/` (there is also an Edit link on the site) and sign in with the token.
6. Open Site settings in the desk and paste that address into Public URL, with no slash at the end. That turns on the RSS feed.

After that, Edit is enough. A save commits the piece, and the workflow rebuilds the live site. Run `node build.js` only when you want `docs/` on this computer to match.

## Add a piece by hand

You can still write the files yourself.

1. Copy `TEMPLATE.md` to `writing/YYYY-MM-DD-short-title.md`.
2. Set `title`, `date`, `kind`, and `summary`. `kind` is `essay`, `note`, or `quote`. A quote also needs `attribution`, and can have `source`.
3. From this folder, run:

```bash
node build.js
```

That rewrites `docs/`. You need Node installed. Pictures and other files go in `writing/images`. In the piece, link to one as `/images/file-name.jpg`.

The type is Courier Prime, licensed under the SIL Open Font License. The license is in `src/fonts/OFL.txt`.
