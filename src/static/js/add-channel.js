/**
 * add-channel.js — handles the "Add channel" and "Add video" forms on the feed page.
 */

const addForm = document.getElementById('add-channel-form');
const addMsg = document.getElementById('add-channel-msg');

if (addForm) {
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    addMsg.textContent = '';

    const url = addForm.elements.url.value.trim();
    const displayName = addForm.elements.displayName.value.trim();
    const tags = addForm.elements.tags.value.trim();

    const res = await fetch('/api/channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, displayName, tags }),
    });

    const data = await res.json();

    if (!res.ok) {
      addMsg.textContent = data.error || ADD_STRINGS.error;
      addMsg.className = 'add-channel-msg error';
      return;
    }

    if (data.status === 'exists') {
      addMsg.textContent = ADD_STRINGS.exists;
      addMsg.className = 'add-channel-msg warn';
    } else {
      addMsg.textContent = ADD_STRINGS.added;
      addMsg.className = 'add-channel-msg ok';
      addForm.reset();
    }
  });
}

const addVideoForm = document.getElementById('add-video-form');
const addVideoMsg = document.getElementById('add-video-msg');

if (addVideoForm) {
  addVideoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    addVideoMsg.textContent = '';

    const url = addVideoForm.elements.url.value.trim();

    const res = await fetch('/api/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    if (!res.ok) {
      addVideoMsg.textContent = data.error || ADD_VIDEO_STRINGS.error;
      addVideoMsg.className = 'add-channel-msg error';
      return;
    }

    if (data.status === 'exists') {
      addVideoMsg.textContent = ADD_VIDEO_STRINGS.exists;
      addVideoMsg.className = 'add-channel-msg warn';
    } else {
      addVideoMsg.textContent = ADD_VIDEO_STRINGS.added;
      addVideoMsg.className = 'add-channel-msg ok';
      addVideoForm.reset();
    }
  });
}
