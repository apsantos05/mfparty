(() => {
  'use strict';
  const content = window.MF_LABEL || {};
  const theme = content.theme || {};
  if (/^#[\da-f]{6}$/i.test(theme.accent)) document.documentElement.style.setProperty('--acid', theme.accent);
  if (/^#[\da-f]{6}$/i.test(theme.secondary)) document.documentElement.style.setProperty('--red', theme.secondary);
  document.querySelectorAll('[data-nav]').forEach(a => {
    if (a.dataset.nav === document.body.dataset.page) a.setAttribute('aria-current', 'page');
  });
  const safeUrl = value => {
    if (!value || typeof value !== 'string') return null;
    try { const url = new URL(value, location.href); return ['http:', 'https:', 'file:'].includes(url.protocol) ? url.href : null; } catch { return null; }
  };
  const make = (tag, text, className) => {
    const node = document.createElement(tag); if (text) node.textContent = text;
    if (className) node.className = className; return node;
  };
  const bio = document.getElementById('biography');
  if (bio && Array.isArray(content.biography) && content.biography.length) {
    bio.replaceChildren(...content.biography.map(text => make('p', text)));
    document.querySelector('.bio-chapters')?.remove();
  }
  const contacts = content.contacts || {};
  const cards = document.querySelectorAll('.contact-card');
  const urls = [safeUrl(contacts.instagram), /^\d{10,15}$/.test(contacts.whatsapp || '') ? `https://wa.me/${contacts.whatsapp}` : null, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacts.email || '') ? `mailto:${contacts.email}` : null];
  cards.forEach((card, i) => {
    if (!urls[i]) return;
    const a = make('a', ['Abrir Instagram ↗', 'Conversar no WhatsApp ↗', 'Enviar e-mail ↗'][i], 'text-link');
    a.href = urls[i]; card.querySelector('small').replaceWith(a);
  });
  if (urls.some(Boolean)) document.querySelector('.contact-note > p:not(.eyebrow)')?.remove();
  const current = content.currentEvent;
  if (current) document.querySelectorAll('.current-event').forEach(el => {
    el.querySelector('h2').textContent = current.title;
    el.querySelector('p').textContent = `${current.dateLabel} · ${current.location}`;
    const url = safeUrl(current.url); if (url) el.querySelector('a').href = url;
  });
  const archive = document.getElementById('event-archive');
  const events = content.pastEvents;
  if (!archive || !Array.isArray(events) || !events.length) return;
  archive.replaceChildren();
  const viewer = document.getElementById('photo-viewer');
  let activePhotos = [], position = 0, opener;
  const renderPhoto = () => {
    const photo = activePhotos[position];
    viewer.querySelector('img').src = photo.src;
    viewer.querySelector('img').alt = photo.alt || 'Registro do evento';
    viewer.querySelector('p').textContent = photo.caption || photo.alt || '';
    document.getElementById('photo-position').textContent = `${position + 1} / ${activePhotos.length}`;
    viewer.querySelectorAll('[data-step]').forEach(button => { button.disabled = activePhotos.length < 2; });
  };
  events.forEach(event => {
    const article = make('article', '', 'past-event');
    article.append(make('p', event.dateLabel || '', 'eyebrow'), make('h2', event.title), make('p', event.description || ''));
    const photos = (event.photos || []).filter(photo => safeUrl(photo.src));
    const grid = make('div', '', 'photo-grid');
    photos.forEach((photo, index) => {
      const button = make('button', '', 'photo-button'); button.type = 'button'; button.setAttribute('aria-label', `Ampliar foto ${index + 1} de ${event.title}`);
      const img = make('img'); img.src = photo.src; img.alt = photo.alt || ''; img.loading = 'lazy'; button.append(img);
      button.addEventListener('click', () => { activePhotos = photos; position = index; opener = button; renderPhoto(); viewer.showModal(); });
      grid.append(button);
    });
    article.append(photos.length ? grid : make('p', 'Fotos em breve.', 'status-tag'));
    archive.append(article);
  });
  viewer.querySelector('.viewer-close').addEventListener('click', () => viewer.close());
  viewer.addEventListener('close', () => opener?.focus());
  const step = amount => { position = (position + amount + activePhotos.length) % activePhotos.length; renderPhoto(); };
  viewer.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => step(Number(button.dataset.step))));
  viewer.addEventListener('keydown', e => { if (['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); } });
})();
