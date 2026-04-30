(() => {
  const root = document.querySelector('.main');
  if (!root) return;
  if (typeof ADMIN_STRINGS === 'undefined') return;

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || ADMIN_STRINGS.error);
    return data;
  }

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    if (!action || !action.startsWith('admin-')) return;

    try {
      if (action === 'admin-delete-files') {
        if (!confirm(ADMIN_STRINGS.confirmDeleteFiles)) return;
        const youtubeId = btn.dataset.youtubeId;
        if (!youtubeId) return;
        btn.disabled = true;
        btn.textContent = ADMIN_STRINGS.deleting;
        await postJson('/api/admin/video/files/delete', { youtubeId });
        window.location.reload();
      } else if (action === 'admin-delete-video') {
        if (!confirm(ADMIN_STRINGS.confirmDeleteVideo)) return;
        const youtubeId = btn.dataset.youtubeId;
        if (!youtubeId) return;
        btn.disabled = true;
        btn.textContent = ADMIN_STRINGS.deleting;
        await postJson('/api/admin/video/delete', { youtubeId });
        const row = btn.closest('[data-video-row]');
        if (row) row.remove();
      } else if (action === 'admin-delete-job') {
        if (!confirm(ADMIN_STRINGS.confirmDeleteJob)) return;
        const jobId = Number(btn.dataset.jobId);
        if (!Number.isInteger(jobId) || jobId <= 0) return;
        btn.disabled = true;
        btn.textContent = ADMIN_STRINGS.deleting;
        await postJson('/api/admin/job/delete', { jobId });
        const row = btn.closest('tr');
        if (row) row.remove();
      }
    } catch (err) {
      alert((err && err.message) || ADMIN_STRINGS.error);
      btn.disabled = false;
      if (action === 'admin-delete-files') btn.textContent = ADMIN_STRINGS.deleteFiles;
      if (action === 'admin-delete-video') btn.textContent = ADMIN_STRINGS.deleteVideo;
      if (action === 'admin-delete-job') btn.textContent = ADMIN_STRINGS.deleteJob;
    }
  });
})();

