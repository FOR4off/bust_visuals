(() => {
  const doc = document.currentScript?.dataset.doc;
  if (!doc) return;
  fetch('/api/legal/' + encodeURIComponent(doc)).then(r => r.ok ? r.json() : null).then(d => {
    if (!d?.html) return;
    const article = document.querySelector('.legal-card');
    if (!article) return;
    article.innerHTML = `<p class="eyebrow">BUST VISUALS · актуальная редакция</p>${d.html}`;
    document.title = d.title + ' — BUST VISUALS';
  }).catch(() => {});
})();
