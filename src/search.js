(function () {
  const indexNode = document.getElementById("search-index");
  const input = document.getElementById("q");
  const results = document.getElementById("search-results");
  const status = document.getElementById("search-status");
  const form = document.querySelector(".search-form");
  if (!indexNode || !input || !results || !status) return;

  let pieces = [];
  try {
    pieces = JSON.parse(indexNode.textContent);
  } catch {
    status.textContent = "Search is unavailable.";
    return;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      results.innerHTML = "";
      status.textContent = "Type a word to search.";
      return;
    }
    const found = pieces.filter((piece) => {
      const haystack = `${piece.title} ${piece.text}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    if (!found.length) {
      results.innerHTML = "";
      status.textContent = "Nothing matches.";
      return;
    }
    status.textContent = found.length === 1 ? "1 piece" : `${found.length} pieces`;
    results.innerHTML = found.map((piece) => `<li>
<a class="kicker" href="${escapeHtml(piece.kindHref)}">${escapeHtml(piece.kind)}</a>
<time>${escapeHtml(piece.when)}</time>
<a class="title" href="${escapeHtml(piece.href)}">${escapeHtml(piece.title)}</a>
</li>`).join("");
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("q")) input.value = params.get("q");
  if (form) form.addEventListener("submit", (event) => event.preventDefault());
  input.addEventListener("input", render);
  render();
  input.focus();
})();
