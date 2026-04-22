(function () {
  const toggle = document.getElementById('sidebar-toggle');
  const panel = document.getElementById('sidebar-panel');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    panel.classList.toggle('open');
  });

  document.addEventListener('click', function (e) {
    if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== toggle) {
      panel.classList.remove('open');
    }
  });
})();
