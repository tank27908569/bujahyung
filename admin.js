const config = window.BUJAHYUNG_SUPABASE || {};
const isConfigured = config.url && config.anonKey && !config.url.startsWith('__');
const endpoint = isConfigured ? `${config.url}/functions/v1/admin-api` : '';
const categories = {
  'thread-seodang': '스레드 서당',
  library: '부자형의 서재',
  'love-auction-philosophy': '부자형이 전하는 사랑의 경매 철학',
  'auction-stories': '경매실전 이야기',
  'life-stories': '살아가는 이런저런 이야기'
};
const categoryPages = {
  'thread-seodang': 'seodang.html',
  library: 'library.html',
  'love-auction-philosophy': 'love-auction.html',
  'auction-stories': 'auction-stories.html',
  'life-stories': 'life-stories.html'
};
const loginPanel = document.querySelector('#login-panel');
const adminApp = document.querySelector('#admin-app');
const sourceList = document.querySelector('#source-list');
const publishedList = document.querySelector('#published-list');
const inquiryList = document.querySelector('#inquiry-list');
const adminMessage = document.querySelector('#admin-message');
const loginMessage = document.querySelector('#login-message');
const editModal = document.querySelector('#edit-modal');
const sessionKey = 'bujahyung_admin_session';
let adminSession = sessionStorage.getItem(sessionKey) || '';
let sourceEntries = [];
let posts = [];
let inquiries = [];
let selectedNumbers = new Set();

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function message(target, text, error = false) {
  target.innerHTML = text ? `<p class="notice${error ? ' error' : ''}">${escapeHtml(text)}</p>` : '';
}

function categoryOptions(includeAll = false) {
  const options = Object.entries(categories).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  return includeAll ? `<option value="all">전체 분류</option>${options}` : options;
}

document.querySelector('#create-category').innerHTML = categoryOptions();
document.querySelector('#edit-category').innerHTML = categoryOptions();
document.querySelector('#post-category-filter').innerHTML = categoryOptions(true);

async function api(action, payload = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-session': adminSession },
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401) {
    adminSession = '';
    sessionStorage.removeItem(sessionKey);
  }
  if (!response.ok) throw new Error(result.error || '작업을 처리하지 못했습니다.');
  return result;
}

function selectionStatus() {
  document.querySelector('#selection-count').textContent = selectedNumbers.size;
  document.querySelector('#publish-selected').disabled = selectedNumbers.size === 0;
}

function renderSources(items = sourceEntries) {
  const publishedNumbers = new Set(posts.filter(post => post.category === 'thread-seodang').map(post => post.source_no));
  if (!items.length) {
    sourceList.innerHTML = '<div class="empty-state"><strong>검색 결과가 없습니다.</strong></div>';
    return;
  }
  sourceList.innerHTML = items.map(item => {
    const exists = publishedNumbers.has(item.source_no);
    return `<div class="source-item"><input id="source-${item.source_no}" type="checkbox" value="${item.source_no}" ${selectedNumbers.has(item.source_no) ? 'checked' : ''} ${exists ? 'disabled' : ''}><label for="source-${item.source_no}"><span class="source-no">${exists ? '게시됨' : 'THREAD'} · ${String(item.source_no).padStart(3, '0')}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></label></div>`;
  }).join('');
}

function filteredPosts() {
  const category = document.querySelector('#post-category-filter').value;
  const query = document.querySelector('#published-search').value.trim().toLocaleLowerCase('ko');
  return posts.filter(post => (category === 'all' || post.category === category) && `${post.title}\n${post.body}`.toLocaleLowerCase('ko').includes(query));
}

function renderPosts() {
  const items = filteredPosts();
  if (!items.length) {
    publishedList.innerHTML = '<div class="empty-state"><strong>조건에 맞는 글이 없습니다.</strong><span>새 글을 작성하거나 검색 조건을 바꿔 주세요.</span></div>';
    return;
  }
  publishedList.innerHTML = items.map(post => `<article class="published-item" data-id="${post.id}"><span>${post.source_no ? `#${post.source_no}` : 'NEW'}</span><div><small class="category-badge">${escapeHtml(categories[post.category] || post.category)}</small><h3>${escapeHtml(post.title)}</h3><p>${post.is_published ? '공개 중' : '비공개'} · ${new Date(post.updated_at || post.created_at).toLocaleDateString('ko-KR')}</p></div><div class="published-actions"><a class="secondary-button" href="${categoryPages[post.category] || 'index.html'}" target="_blank" rel="noopener">보기</a><button class="secondary-button" type="button" data-action="edit">수정</button><button class="secondary-button" type="button" data-action="toggle">${post.is_published ? '비공개' : '공개'}</button><button class="danger-button" type="button" data-action="delete">삭제</button></div></article>`).join('');
}

const inquiryServices = {
  'auction-consulting': '경매 투자·사업 상담',
  'auction-course': '경매강의',
  'property-recommendation': '경매 물건추천',
  'property-consulting': '경매 물건상담',
  'winning-bid-consulting': '낙찰컨설팅',
  'lending-business': '대부업 사업 준비 상담',
  other: '기타 사업 제안'
};
const inquiryStatuses = { new: '새 신청', contacted: '연락 완료', completed: '상담 완료', archived: '보관' };

function renderInquiries() {
  const filter = document.querySelector('#inquiry-status-filter').value;
  const items = inquiries.filter(item => filter === 'all' || item.status === filter);
  const newCount = inquiries.filter(item => item.status === 'new').length;
  const countBadge = document.querySelector('#new-inquiry-count');
  countBadge.hidden = newCount === 0;
  countBadge.textContent = newCount;
  if (!items.length) {
    inquiryList.innerHTML = '<div class="empty-state"><strong>해당하는 상담 신청이 없습니다.</strong></div>';
    return;
  }
  inquiryList.innerHTML = items.map(item => `<article class="inquiry-item" data-id="${item.id}">
    <div class="inquiry-meta"><span>${escapeHtml(inquiryServices[item.service_type] || item.service_type)}</span><time datetime="${item.created_at}">${new Date(item.created_at).toLocaleString('ko-KR')}</time><small class="status-pill ${item.status}">${escapeHtml(inquiryStatuses[item.status] || item.status)}</small></div>
    <div class="inquiry-content"><h3>${escapeHtml(item.name)}</h3><p class="inquiry-contact">${escapeHtml(item.phone)}</p><blockquote>${escapeHtml(item.message)}</blockquote>${item.preferred_contact_time ? `<p class="inquiry-time">연락 가능 시간 · ${escapeHtml(item.preferred_contact_time)}</p>` : ''}</div>
    <div class="inquiry-actions"><select aria-label="상담 처리 상태">${Object.entries(inquiryStatuses).map(([value, label]) => `<option value="${value}" ${item.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select><button class="secondary-button" type="button" data-action="save-inquiry">상태 저장</button><button class="danger-button" type="button" data-action="delete-inquiry">삭제</button></div>
  </article>`).join('');
}

async function loadSources() {
  const response = await fetch('data/thread-seodang.json');
  if (!response.ok) throw new Error('스레드 원고 목록을 읽지 못했습니다.');
  sourceEntries = await response.json();
  renderSources();
}

async function loadPosts(preloaded) {
  posts = preloaded || (await api('list')).posts || [];
  renderPosts();
  renderSources();
}

async function loadInquiries(preloaded) {
  inquiries = preloaded || (await api('list-inquiries')).inquiries || [];
  renderInquiries();
}

async function showAdmin(preloaded) {
  await Promise.all([loadSources(), loadPosts(preloaded), loadInquiries()]);
  loginPanel.style.display = 'none';
  adminApp.classList.add('active');
  document.querySelector('#logout-button').hidden = false;
}

document.querySelector('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!isConfigured) { message(loginMessage, 'Supabase 연결이 아직 완료되지 않았습니다.', true); return; }
  const pin = document.querySelector('#admin-pin').value;
  if (!/^\d{4}$/.test(pin)) { message(loginMessage, '숫자 4자리를 입력해 주세요.', true); return; }
  message(loginMessage, '관리 비밀번호를 확인하고 있습니다.');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', pin })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.session) throw new Error(result.error || '관리 비밀번호를 확인하지 못했습니다.');
    adminSession = result.session;
    sessionStorage.setItem(sessionKey, adminSession);
    document.querySelector('#admin-pin').value = '';
    await showAdmin();
  } catch (error) {
    adminSession = '';
    sessionStorage.removeItem(sessionKey);
    message(loginMessage, error.message || '관리 비밀번호가 맞지 않습니다.', true);
  }
});

document.querySelector('#logout-button').addEventListener('click', () => {
  adminSession = '';
  sessionStorage.removeItem(sessionKey);
  location.reload();
});

document.querySelector('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    category: document.querySelector('#create-category').value,
    title: document.querySelector('#create-title').value.trim(),
    body: document.querySelector('#create-body').value.trim(),
    is_published: document.querySelector('#create-published').checked
  };
  try {
    await api('create', payload);
    event.target.reset();
    document.querySelector('#create-published').checked = true;
    await loadPosts();
    message(adminMessage, payload.is_published ? '새 글을 공개 게시했습니다.' : '새 글을 비공개로 저장했습니다.');
  } catch (error) { message(adminMessage, error.message, true); }
});

sourceList.addEventListener('change', event => {
  if (!event.target.matches('input[type="checkbox"]')) return;
  const number = Number(event.target.value);
  event.target.checked ? selectedNumbers.add(number) : selectedNumbers.delete(number);
  selectionStatus();
});
document.querySelector('#source-search').addEventListener('input', event => {
  const query = event.target.value.trim().toLocaleLowerCase('ko');
  renderSources(sourceEntries.filter(item => `${item.source_no} ${item.title} ${item.body}`.toLocaleLowerCase('ko').includes(query)));
});
document.querySelector('#clear-selection').addEventListener('click', () => {
  selectedNumbers.clear();
  renderSources();
  selectionStatus();
});
document.querySelector('#publish-selected').addEventListener('click', async () => {
  const selected = sourceEntries.filter(item => selectedNumbers.has(item.source_no));
  if (!selected.length) return;
  try {
    await api('publish', { posts: selected });
    selectedNumbers.clear();
    selectionStatus();
    await loadPosts();
    message(adminMessage, `${selected.length}편을 스레드 서당에 공개 게시했습니다.`);
  } catch (error) { message(adminMessage, error.message, true); }
});

document.querySelectorAll('.admin-tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.admin-tab').forEach(item => item.classList.toggle('active', item === tab));
  document.querySelectorAll('.admin-view').forEach(view => view.classList.toggle('active', view.id === `view-${tab.dataset.view}`));
}));
document.querySelector('#post-category-filter').addEventListener('change', renderPosts);
document.querySelector('#published-search').addEventListener('input', renderPosts);
document.querySelector('#inquiry-status-filter').addEventListener('change', renderInquiries);

inquiryList.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  const item = event.target.closest('.inquiry-item');
  if (!button || !item) return;
  const inquiry = inquiries.find(entry => entry.id === item.dataset.id);
  if (!inquiry) return;
  if (button.dataset.action === 'save-inquiry') {
    try {
      await api('update-inquiry', { id: inquiry.id, status: item.querySelector('select').value });
      await loadInquiries();
      message(adminMessage, '상담 처리 상태를 저장했습니다.');
    } catch (error) { message(adminMessage, error.message, true); }
  }
  if (button.dataset.action === 'delete-inquiry' && confirm(`${inquiry.name}님의 상담 신청을 삭제하시겠습니까?`)) {
    try {
      await api('delete-inquiry', { id: inquiry.id });
      await loadInquiries();
      message(adminMessage, '상담 신청을 삭제했습니다.');
    } catch (error) { message(adminMessage, error.message, true); }
  }
});

publishedList.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  const item = event.target.closest('.published-item');
  if (!button || !item) return;
  const post = posts.find(entry => entry.id === item.dataset.id);
  if (!post) return;
  if (button.dataset.action === 'edit') {
    document.querySelector('#edit-id').value = post.id;
    document.querySelector('#edit-category').value = post.category;
    document.querySelector('#edit-title').value = post.title;
    document.querySelector('#edit-body').value = post.body;
    editModal.classList.add('open');
  }
  if (button.dataset.action === 'toggle') {
    try { await api('update', { id: post.id, changes: { is_published: !post.is_published } }); await loadPosts(); }
    catch (error) { message(adminMessage, error.message, true); }
  }
  if (button.dataset.action === 'delete' && confirm(`「${post.title}」 글을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`)) {
    try { await api('delete', { id: post.id }); await loadPosts(); message(adminMessage, '글을 삭제했습니다.'); }
    catch (error) { message(adminMessage, error.message, true); }
  }
});

document.querySelector('#edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = document.querySelector('#edit-id').value;
  const changes = {
    category: document.querySelector('#edit-category').value,
    title: document.querySelector('#edit-title').value.trim(),
    body: document.querySelector('#edit-body').value.trim()
  };
  try {
    await api('update', { id, changes });
    editModal.classList.remove('open');
    await loadPosts();
    message(adminMessage, '수정 내용을 저장했습니다.');
  } catch (error) { message(adminMessage, error.message, true); }
});

function closeEdit() { editModal.classList.remove('open'); }
editModal.querySelector('.modal-close').addEventListener('click', closeEdit);
document.querySelector('#edit-cancel').addEventListener('click', closeEdit);
editModal.addEventListener('click', event => { if (event.target === editModal) closeEdit(); });

if (!isConfigured) message(loginMessage, 'Supabase 프로젝트 연결이 필요합니다.', true);
else if (adminSession) showAdmin().catch(() => {
  adminSession = '';
  sessionStorage.removeItem(sessionKey);
  message(loginMessage, '관리 시간이 만료되었습니다. 비밀번호를 다시 입력해 주세요.', true);
});
