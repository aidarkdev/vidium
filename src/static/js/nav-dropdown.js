(() => {
  const dropdown = document.getElementById('nav-dropdown');
  if (!dropdown) return;

  const summary = dropdown.querySelector('summary');
  if (!summary) return;

  document.addEventListener('click', (e) => {
    if (!dropdown.open) return;
    const target = e.target;
    if (target instanceof Node && dropdown.contains(target)) return;
    dropdown.open = false;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dropdown.open = false;
  });

  dropdown.addEventListener('toggle', () => {
    if (dropdown.open) summary.setAttribute('aria-expanded', 'true');
    else summary.setAttribute('aria-expanded', 'false');
  });
})();

