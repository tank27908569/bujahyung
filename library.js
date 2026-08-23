const grid = document.querySelector('#post-grid');
const searchInput = document.querySelector('#post-search');
const modal = document.querySelector('#reader-modal');
const posts = window.BUJAHYUNG_LIBRARY_POSTS || [];

document.querySelector('#year').textContent = new Date().getFullYear();

function escapeHtml(value = '') {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function dateLabel(value) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value));
}

function render(items) {
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state"><strong>검색 결과가 없습니다.</strong><span>다른 책이나 문장으로 찾아보세요.</span></div>';
    return;
  }
  grid.innerHTML = items.map(post => `
    <article class="post-card" tabindex="0" data-id="${post.id}">
      <span class="post-card-no">BUJAHYUNG LIBRARY · ${String(post.source_no).padStart(3, '0')}</span>
      <h3>${escapeHtml(post.title)}</h3>
      <time datetime="${post.published_at}">${dateLabel(post.published_at)}</time>
    </article>`).join('');
}

function openPost(id) {
  const post = posts.find(item => item.id === id);
  if (!post) return;
  document.querySelector('#reader-no').textContent = `부자형의 서재 #${post.source_no}`;
  document.querySelector('#reader-title').textContent = post.title;
  document.querySelector('#reader-body').textContent = post.body;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
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

render(posts);
