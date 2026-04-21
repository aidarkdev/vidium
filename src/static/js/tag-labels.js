/**
 * tag-labels.js — checkbox toggles tag editing mode; blur/Enter saves.
 */

(() => {
  const feedTags = document.getElementById('feed-tags');
  const tagsToggle = document.getElementById('tags-toggle');

  if (feedTags && tagsToggle) {
    const store = {
      get: () => {
        try {
          return localStorage.getItem('tags-collapsed');
        } catch {
          return null;
        }
      },
      set: (v) => {
        try {
          localStorage.setItem('tags-collapsed', v);
        } catch {}
      },
    };
    if (store.get() === '1') feedTags.classList.add('collapsed');
    const updateIcon = (collapsed) => {
      tagsToggle.classList.toggle('open', !collapsed);
    };
    updateIcon(feedTags.classList.contains('collapsed'));
    const doToggle = () => {
      const collapsed = feedTags.classList.toggle('collapsed');
      store.set(collapsed ? '1' : '0');
      updateIcon(collapsed);
    };
    tagsToggle.addEventListener('click', doToggle);
    tagsToggle.addEventListener('touchend', (e) => {
      e.preventDefault();
      doToggle();
    });
  }

  const toggle = document.getElementById('edit-tags-toggle');
  const feedTagsEl = document.querySelector('.feed-tags');
  if (!toggle || !feedTagsEl) return;

  const links = [...feedTagsEl.querySelectorAll('a[data-tag]')];

  toggle.addEventListener('change', () => {
    links.forEach((link) => {
      link.contentEditable = toggle.checked ? 'true' : 'false';
      link.classList.toggle('editing', toggle.checked);
    });
    if (toggle.checked && links[0]) links[0].focus();
  });

  links.forEach((link) => {
    const tag = link.dataset.tag;
    let saved = link.textContent;

    link.addEventListener('blur', () => {
      const label = link.textContent.trim();
      if (!label) {
        link.textContent = saved;
        return;
      }
      if (label === saved) return;
      saved = label;
      TAG_LABELS[tag] = label;
      fetch('/api/tag-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, label }),
      });
    });

    link.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        link.blur();
      }
      if (ev.key === 'Escape') {
        link.textContent = saved;
        link.blur();
      }
    });
  });
})();
