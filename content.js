const grid = document.querySelector('#post-grid');
const searchInput = document.querySelector('#post-search');
const notice = document.querySelector('#reader-notice');
const modal = document.querySelector('#reader-modal');
const config = window.BUJAHYUNG_SUPABASE || {};
const category = document.body.dataset.category;
const sectionLabel = document.body.dataset.sectionLabel || 'BUJAHYUNG';
let posts = [];
// 지금 목록에 보이는 순서(검색 결과 포함). 팝업에서 이전·다음 글로 이동할 때 이 순서를 따릅니다.
let visiblePosts = [];
let currentIndex = -1;

document.querySelector('#year').textContent = new Date().getFullYear();

function configured() {
  return config.url && config.anonKey && !config.url.startsWith('__');
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function dateLabel(value) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value));
}

function postNumber(post) {
  const chronologicalNumber = posts.length - posts.findIndex(item => item.id === post.id);
  // 서당과 서재는 게시 순서 자체가 연재 번호입니다. 저장된 원본 번호는
  // 새 글을 추가할 때 중복될 수 있으므로 공개 목록에서는 일련번호를 계산합니다.
  return category === 'library' || category === 'thread-seodang'
    ? chronologicalNumber
    : (post.source_no || chronologicalNumber);
}

function render(items) {
  visiblePosts = items;
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state"><strong>아직 공개된 글이 없습니다.</strong><span>부자형의 새로운 글을 준비하고 있습니다.</span></div>';
    return;
  }
  grid.innerHTML = items.map(post => `
    <article class="post-card" tabindex="0" data-id="${post.id}">
      <span class="post-card-no">${escapeHtml(sectionLabel)} · ${String(postNumber(post)).padStart(3, '0')}</span>
      <h3>${escapeHtml(post.title)}</h3>
      <time datetime="${post.published_at}">${dateLabel(post.published_at)}</time>
    </article>`).join('');
}

function readableParagraphs(value = '') {
  const lines = String(value).replace(/\u00a0/g, ' ').split(/\r?\n/).map(line => line
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.!?…])/g, '$1')
    .replace(/([“‘(])\s+/g, '$1')
    .replace(/\s+([”’)]|$)/g, '$1')
    .trim());
  const paragraphs = [];
  let current = [];
  const flush = () => {
    if (current.length) paragraphs.push(current.join('\n'));
    current = [];
  };
  lines.forEach(line => {
    if (!line) { flush(); return; }
    current.push(line);
    const sentenceEnd = /[.!?。！？…"'’”)]$/.test(line);
    if ((sentenceEnd && current.length >= 2) || current.length >= 4) flush();
  });
  flush();
  return paragraphs;
}

// youtu.be/ID, watch?v=ID, /shorts/ID, /embed/ID 모두 받아 영상 번호만 꺼냅니다.
function youtubeId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null;
    if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return null;
    if (url.searchParams.get('v')) return url.searchParams.get('v');
    const parts = url.pathname.split('/').filter(Boolean);
    const index = parts.findIndex(part => part === 'shorts' || part === 'embed' || part === 'live');
    return index >= 0 ? parts[index + 1] || null : null;
  } catch {
    return null;
  }
}

function renderReaderBody(value) {
  const readerBody = document.querySelector('#reader-body');
  readerBody.replaceChildren();
  const mediaPattern = /^\[\[(사진|동영상|유튜브):(https?:\/\/[^\]]+)\]\]$/gm;
  let offset = 0;
  const appendText = text => readableParagraphs(text).forEach(paragraph => {
    const node = document.createElement('p');
    node.textContent = paragraph;
    readerBody.appendChild(node);
  });
  for (const match of String(value).matchAll(mediaPattern)) {
    appendText(String(value).slice(offset, match.index));
    const figure = document.createElement('figure');
    if (match[1] === '유튜브') {
      // 강의 영상은 유튜브에 두고 여기서 재생만 합니다.
      // 무료 요금제의 저장·전송 한도를 쓰지 않고, 화질도 알아서 맞춰집니다.
      figure.className = 'reader-inline-embed';
      const id = youtubeId(match[2]);
      if (id) {
        const frame = document.createElement('iframe');
        frame.src = `https://www.youtube-nocookie.com/embed/${id}`;
        frame.title = '유튜브 영상';
        frame.loading = 'lazy';
        frame.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        figure.appendChild(frame);
      } else {
        const link = document.createElement('a');
        link.href = match[2];
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = '유튜브에서 영상 보기 ↗';
        figure.appendChild(link);
      }
    } else if (match[1] === '동영상') {
      figure.className = 'reader-inline-video';
      const video = document.createElement('video');
      video.src = match[2];
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      figure.appendChild(video);
    } else {
      figure.className = 'reader-inline-image';
      const image = document.createElement('img');
      image.src = match[2];
      image.alt = '글 내용 사진';
      image.loading = 'lazy';
      figure.appendChild(image);
    }
    readerBody.appendChild(figure);
    offset = match.index + match[0].length;
  }
  appendText(String(value).slice(offset));
}

function renderReaderCover(post) {
  let cover = document.querySelector('#reader-cover');
  if (!cover) {
    cover = document.createElement('div');
    cover.id = 'reader-cover';
    document.querySelector('#reader-body').before(cover);
  }
  const imageUrls = String(post.cover_image_url || '').split('|').map(url => url.trim()).filter(Boolean);
  cover.replaceChildren();
  if (!imageUrls.length) {
    cover.hidden = true;
    return;
  }
  cover.hidden = false;
  imageUrls.forEach((url, index) => {
    const figure = document.createElement('figure');
    figure.className = 'reader-cover';
    const image = document.createElement('img');
    image.src = url;
    image.alt = `${post.title} 사진 ${index + 1}`;
    figure.appendChild(image);
    if (index === 0 && post.cover_quote) {
      const caption = document.createElement('figcaption');
      caption.textContent = post.cover_quote;
      figure.appendChild(caption);
    }
    cover.appendChild(figure);
  });
}

function injectReaderNavStyle() {
  if (document.querySelector('#reader-nav-style')) return;
  const style = document.createElement('style');
  style.id = 'reader-nav-style';
  style.textContent = `
    #reader-modal .modal-panel{padding-bottom:0}
    .reader-nav{position:sticky;bottom:0;z-index:2;display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;gap:10px;margin:44px 0 0;padding:14px 0 18px;background:var(--paper,#f1eee6);border-top:1px solid var(--line,rgba(23,24,21,.15));box-shadow:0 -14px 18px -12px rgba(23,24,21,.12)}
    .reader-nav-btn{display:flex;flex-direction:column;gap:4px;min-width:0;padding:10px 12px;border:1px solid var(--line,rgba(23,24,21,.15));background:transparent;color:var(--ink,#171815);font:inherit;cursor:pointer;text-align:left;transition:background .15s,border-color .15s}
    .reader-nav-btn.next{text-align:right}
    .reader-nav-btn:hover:not(:disabled){background:var(--paper2,#e7e1d4);border-color:var(--gold,#b89b68)}
    .reader-nav-btn:disabled{opacity:.35;cursor:default}
    .reader-nav-dir{font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--red,#8f2e25)}
    .reader-nav-title{font:14px/1.4 'Gowun Batang',serif;color:#4e4c46;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .reader-nav-count{align-self:center;font-size:12px;letter-spacing:.06em;color:var(--muted,#77746c);white-space:nowrap}
    @media(max-width:680px){.reader-nav{gap:8px;margin-top:36px}.reader-nav-btn{padding:9px 10px}.reader-nav-title{font-size:13px}}
  `;
  document.head.appendChild(style);
}

function ensureReaderNav() {
  let nav = document.querySelector('#reader-nav');
  if (nav) return nav;
  injectReaderNavStyle();
  nav = document.createElement('nav');
  nav.id = 'reader-nav';
  nav.className = 'reader-nav';
  nav.setAttribute('aria-label', '글 이동');
  nav.innerHTML = '<button type="button" class="reader-nav-btn prev" data-dir="-1"><span class="reader-nav-dir">‹ 이전 글</span><span class="reader-nav-title"></span></button>'
    + '<span class="reader-nav-count" aria-live="polite"></span>'
    + '<button type="button" class="reader-nav-btn next" data-dir="1"><span class="reader-nav-dir">다음 글 ›</span><span class="reader-nav-title"></span></button>';
  modal.querySelector('.modal-panel').appendChild(nav);
  nav.addEventListener('click', event => {
    const button = event.target.closest('.reader-nav-btn');
    if (button && !button.disabled) stepPost(Number(button.dataset.dir));
  });
  return nav;
}

function updateReaderNav() {
  const nav = ensureReaderNav();
  const list = visiblePosts.length ? visiblePosts : posts;
  const setButton = (selector, target) => {
    const button = nav.querySelector(selector);
    button.disabled = !target;
    button.querySelector('.reader-nav-title').textContent = target ? target.title : '';
    button.title = target ? target.title : '';
  };
  setButton('.prev', list[currentIndex - 1]);
  setButton('.next', list[currentIndex + 1]);
  nav.querySelector('.reader-nav-count').textContent = currentIndex >= 0 ? `${currentIndex + 1} / ${list.length}` : '';
}

function stepPost(direction) {
  const list = visiblePosts.length ? visiblePosts : posts;
  const target = list[currentIndex + direction];
  if (target) openPost(target.id);
}

function openPost(id) {
  const post = posts.find(item => item.id === id);
  if (!post) return;
  const list = visiblePosts.length ? visiblePosts : posts;
  currentIndex = list.findIndex(item => item.id === id);
  document.querySelector('#reader-no').textContent = sectionLabel;
  document.querySelector('#reader-title').textContent = post.title;
  renderReaderCover(post);
  renderReaderBody(post.body);
  updateReaderNav();
  modal.querySelector('.modal-panel').scrollTop = 0;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
  currentIndex = -1;
  // 팝업을 닫으면 재생 중인 영상도 멈춥니다.
  modal.querySelectorAll('video').forEach(video => video.pause());
}

async function loadPosts() {
  if (!configured()) {
    if (notice) notice.innerHTML = '<p class="notice">글 데이터 연결을 준비하고 있습니다.</p>';
    render([]);
    return;
  }
  const client = window.supabase.createClient(config.url, config.anonKey);
  const { data, error } = await client.from('posts').select('id, source_no, title, body, cover_image_url, cover_quote, published_at').eq('category', category).eq('is_published', true).order('published_at', { ascending: false });
  if (error) {
    if (notice) notice.innerHTML = '<p class="notice error">글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
    render([]);
    return;
  }
  posts = data || [];
  render(posts);
}

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLocaleLowerCase('ko');
  render(posts.filter(post => `${post.title}\n${post.body}`.toLocaleLowerCase('ko').includes(query)));
});
grid.addEventListener('click', event => {
  const card = event.target.closest('.post-card');
  if (card) openPost(card.dataset.id);
});
grid.addEventListener('keydown', event => {
  const card = event.target.closest('.post-card');
  if (card && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openPost(card.dataset.id);
  }
});
modal.querySelector('.modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', event => {
  if (!modal.classList.contains('open')) return;
  if (event.key === 'Escape') closeModal();
  if (event.target.closest && event.target.closest('input, textarea')) return;
  if (event.key === 'ArrowLeft') stepPost(-1);
  if (event.key === 'ArrowRight') stepPost(1);
});
(() => {
  const panel = modal.querySelector('.modal-panel');
  let startX = 0, startY = 0, tracking = false;
  panel.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    tracking = true;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }, { passive: true });
  panel.addEventListener('touchend', event => {
    if (!tracking) return;
    tracking = false;
    const dx = event.changedTouches[0].clientX - startX;
    const dy = event.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) stepPost(dx < 0 ? 1 : -1);
  }, { passive: true });
})();

loadPosts();
