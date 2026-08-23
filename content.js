const grid = document.querySelector('#post-grid');
const searchInput = document.querySelector('#post-search');
const notice = document.querySelector('#reader-notice');
const modal = document.querySelector('#reader-modal');
const config = window.BUJAHYUNG_SUPABASE || {};
const category = document.body.dataset.category;
const sectionLabel = document.body.dataset.sectionLabel || 'BUJAHYUNG';
let posts = [];

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

function render(items) {
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state"><strong>아직 공개된 글이 없습니다.</strong><span>부자형의 새로운 글을 준비하고 있습니다.</span></div>';
    return;
  }
  grid.innerHTML = items.map((post, index) => `
    <article class="post-card" tabindex="0" data-id="${post.id}">
      <span class="post-card-no">${escapeHtml(sectionLabel)} · ${String(post.source_no || posts.length - index).padStart(3, '0')}</span>
      <h3>${escapeHtml(post.title)}</h3>
      <time datetime="${post.published_at}">${dateLabel(post.published_at)}</time>
    </article>`).join('');
}

function openPost(id) {
  const post = posts.find(item => item.id === id);
  if (!post) return;
  document.querySelector('#reader-no').textContent = sectionLabel;
  document.querySelector('#reader-title').textContent = post.title;
  document.querySelector('#reader-body').textContent = post.body;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

async function loadPosts() {
  if (!configured()) {
    if (notice) notice.innerHTML = '<p class="notice">글 데이터 연결을 준비하고 있습니다.</p>';
    render([]);
    return;
  }
  const client = window.supabase.createClient(config.url, config.anonKey);
  const { data, error } = await client.from('posts').select('id, source_no, title, body, published_at').eq('category', category).eq('is_published', true).order('published_at', { ascending: false });
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
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

loadPosts();
