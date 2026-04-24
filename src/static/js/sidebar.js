(() => {
  const toggle = document.getElementById('sidebar-toggle');
  const panel = document.getElementById('sidebar-panel');
  const editToggle = document.getElementById('sidebar-edit-toggle');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== toggle) {
      panel.classList.remove('open');
    }
  });

  function updateMoveButtons() {
    const rows = panel.querySelectorAll('.sidebar-channel-row');
    rows.forEach((row, index) => {
      const up = row.querySelector('[data-direction="up"]');
      const down = row.querySelector('[data-direction="down"]');
      if (up) up.disabled = index === 0;
      if (down) down.disabled = index === rows.length - 1;
    });
  }

  if (editToggle) {
    editToggle.addEventListener('change', () => {
      panel.classList.toggle('edit-mode', editToggle.checked);
    });
  }

  panel.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="move-channel"]');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const row = btn.closest('.sidebar-channel-row');
    if (!row || btn.disabled) return;

    const direction = btn.dataset.direction;
    const channelId = Number(btn.dataset.channelId);
    const swapRow = direction === 'up' ? row.previousElementSibling : row.nextElementSibling;
    if (!swapRow) return;

    const buttons = row.querySelectorAll('.sidebar-order-btn');
    buttons.forEach((item) => {
      item.disabled = true;
    });

    try {
      const res = await fetch('/api/channel/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channelId, direction: direction }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.moved) return;

      if (direction === 'up') {
        row.parentNode.insertBefore(row, swapRow);
      } else {
        row.parentNode.insertBefore(swapRow, row);
      }
      updateMoveButtons();
    } catch (_err) {
    } finally {
      buttons.forEach((item) => {
        item.disabled = false;
      });
      updateMoveButtons();
    }
  });

  updateMoveButtons();
})();
