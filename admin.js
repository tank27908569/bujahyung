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
const threadsImportList = document.querySelector('#threads-import-list');
const publishedList = document.querySelector('#published-list');
const inquiryList = document.querySelector('#inquiry-list');
const adminMessage = document.querySelector('#admin-message');
const loginMessage = document.querySelector('#login-message');
const editModal = document.querySelector('#edit-modal');
const sessionKey = 'bujahyung_admin_session';
let adminSession = sessionStorage.getItem(sessionKey) || '';
let sourceEntries = [];
let threadsImports = [];
let posts = [];
let inquiries = [];
let selectedNumbers = new Set();
let selectedThreads = new Set();
let threadsIntegration = null;

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

function fileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('사진 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function uploadPostImages(fileInput, targetInput, statusTarget) {
  const files = [...fileInput.files];
  if (!files.length) return;
  if (files.length > 6) {
    message(adminMessage, '사진은 한 번에 최대 6장까지 선택할 수 있습니다.', true);
    fileInput.value = '';
    return;
  }
  const uploaded = [];
  fileInput.disabled = true;
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('JPG, PNG, WEBP, GIF 사진만 올릴 수 있습니다.');
      if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} 사진이 8MB를 넘습니다.`);
      statusTarget.textContent = `사진을 올리는 중입니다. (${index + 1}/${files.length})`;
      const result = await api('upload-post-image', {
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        file_base64: await fileBase64(file)
      });
      uploaded.push(result.url);
    }
    const existing = targetInput.value.trim();
    targetInput.value = [existing, ...uploaded].filter(Boolean).join('|');
    statusTarget.textContent = `사진 ${uploaded.length}장을 올렸습니다.`;
    message(adminMessage, `사진 ${uploaded.length}장을 올렸습니다. 글을 저장하면 게시물에 적용됩니다.`);
  } catch (error) {
    statusTarget.textContent = '사진 업로드에 실패했습니다.';
    message(adminMessage, error.message, true);
  } finally {
    fileInput.disabled = false;
    fileInput.value = '';
  }
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

function threadsSelectionStatus() {
  document.querySelector('#threads-selection-count').textContent = selectedThreads.size;
  document.querySelector('#publish-threads-selected').disabled = selectedThreads.size === 0;
}

function filteredThreadsImports() {
  const status = document.querySelector('#threads-status-filter').value;
  const query = document.querySelector('#threads-search').value.trim().toLocaleLowerCase('ko');
  return threadsImports.filter(item => (status === 'all' || item.status === status) && item.combined_body.toLocaleLowerCase('ko').includes(query));
}

function renderThreadsImports() {
  const items = filteredThreadsImports();
  if (!items.length) {
    threadsImportList.innerHTML = '<div class="empty-state"><strong>조건에 맞는 Threads 원고가 없습니다.</strong><span>‘Threads에서 새로 가져오기’를 눌러 동기화해 주세요.</span></div>';
    return;
  }
  threadsImportList.innerHTML = items.map(item => {
    const published = item.status === 'published';
    const replies = Array.isArray(item.replies) ? item.replies : [];
    const replyMarkup = replies.length
      ? `<div class="threads-replies"><small>이어 쓴 답글 ${replies.length}개</small>${replies.map((reply, index) => `<p><b>답글 ${index + 1}</b>${escapeHtml(reply.text)}</p>`).join('')}</div>`
      : '<div class="threads-replies"><small>이어 쓴 답글 없음</small></div>';
    return `<article class="source-item threads-import-item" data-id="${escapeHtml(item.id)}">
      <input id="threads-${escapeHtml(item.id)}" type="checkbox" ${selectedThreads.has(item.id) ? 'checked' : ''} ${published ? 'disabled' : ''}>
      <label for="threads-${escapeHtml(item.id)}"><span class="source-no">${published ? '게시 완료' : '게시 대기'} · ${new Date(item.thread_timestamp).toLocaleDateString('ko-KR')}</span><h3>${escapeHtml(item.root_text.split(/\r?\n/)[0])}</h3><p>${escapeHtml(item.root_text)}</p>${replyMarkup}</label>
      <div class="threads-import-controls"><select aria-label="게시 분류" ${published ? 'disabled' : ''}><option value="life-stories">살아가는 이런저런 이야기</option><option value="auction-stories">경매실전 이야기</option></select>${item.permalink ? `<a class="secondary-button" href="${escapeHtml(item.permalink)}" target="_blank" rel="noopener">원문 보기 ↗</a>` : ''}</div>
    </article>`;
  }).join('');
}

function filteredPosts() {
  const category = document.querySelector('#post-category-filter').value;
  const query = document.querySelector('#published-search').value.trim().toLocaleLowerCase('ko');
  const normalizedQuery = query.replace(/^#/, '').trim();
  return posts.filter(post => {
    if (category !== 'all' && post.category !== category) return false;
    const textMatches = `${post.title}\n${post.body}`.toLocaleLowerCase('ko').includes(query);
    const numberMatches = normalizedQuery !== '' && String(post.source_no ?? '') === normalizedQuery;
    return textMatches || numberMatches;
  });
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

async function loadThreadsImports(preloaded) {
  threadsImports = preloaded || (await api('list-threads-imports')).imports || [];
  selectedThreads = new Set([...selectedThreads].filter(id => threadsImports.some(item => item.id === id && item.status === 'pending')));
  renderThreadsImports();
  threadsSelectionStatus();
}

async function loadThreadsIntegration() {
  threadsIntegration = await api('threads-integration-status');
  const status = document.querySelector('#threads-connection-status');
  const connectButton = document.querySelector('#connect-threads-account');
  if (threadsIntegration.connected) {
    const expiry = threadsIntegration.token_expires_at ? ` · ${new Date(threadsIntegration.token_expires_at).toLocaleDateString('ko-KR')}까지` : '';
    status.textContent = `${threadsIntegration.connected_username ? `@${threadsIntegration.connected_username}` : 'Threads 계정'} 연결 완료${expiry}`;
    connectButton.textContent = 'Threads 계정 다시 연결';
  } else if (threadsIntegration.secret_configured) {
    status.textContent = `앱 ${threadsIntegration.app_id} 설정 완료 · Threads 계정 승인이 필요합니다.`;
    connectButton.textContent = 'Threads 계정 연결';
  } else {
    status.textContent = `앱 ${threadsIntegration.app_id || ''}의 Threads 앱 시크릿을 한 번만 저장해 주세요.`;
  }
}

async function loadInquiries(preloaded) {
  inquiries = preloaded || (await api('list-inquiries')).inquiries || [];
  renderInquiries();
}

async function showAdmin(preloaded) {
  await Promise.all([loadSources(), loadPosts(preloaded), loadThreadsImports(), loadThreadsIntegration(), loadInquiries()]);
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
    cover_image_url: document.querySelector('#create-cover-image').value.trim(),
    cover_quote: document.querySelector('#create-cover-quote').value.trim(),
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

document.querySelector('#create-image-files').addEventListener('change', event => uploadPostImages(
  event.target,
  document.querySelector('#create-cover-image'),
  document.querySelector('#create-upload-status')
));

document.querySelector('#edit-image-files').addEventListener('change', event => uploadPostImages(
  event.target,
  document.querySelector('#edit-cover-image'),
  document.querySelector('#edit-upload-status')
));

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

threadsImportList.addEventListener('change', event => {
  if (!event.target.matches('input[type="checkbox"]')) return;
  const item = event.target.closest('.threads-import-item');
  if (!item) return;
  event.target.checked ? selectedThreads.add(item.dataset.id) : selectedThreads.delete(item.dataset.id);
  threadsSelectionStatus();
});
document.querySelector('#threads-search').addEventListener('input', renderThreadsImports);
document.querySelector('#threads-status-filter').addEventListener('change', renderThreadsImports);
document.querySelector('#sync-threads').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Threads 가져오는 중…';
  try {
    const result = await api('sync-threads');
    await loadThreadsImports();
    message(adminMessage, `Threads 원고 ${result.count}편을 확인했습니다. 원문에 이어 쓴 내 답글도 함께 저장했습니다.`);
  } catch (error) { message(adminMessage, error.message, true); }
  finally { button.disabled = false; button.textContent = 'Threads에서 새로 가져오기'; }
});
document.querySelector('#save-threads-secret').addEventListener('click', async () => {
  const input = document.querySelector('#threads-app-secret');
  const appSecret = input.value.trim();
  if (!appSecret) { message(adminMessage, 'Meta 앱 대시보드의 Threads 앱 시크릿을 입력해 주세요.', true); return; }
  try {
    await api('save-threads-app-secret', { app_secret: appSecret });
    input.value = '';
    await loadThreadsIntegration();
    message(adminMessage, 'Threads 앱 시크릿을 암호화해 저장했습니다. 이제 계정 연결을 눌러 주세요.');
  } catch (error) { message(adminMessage, error.message, true); }
});
document.querySelector('#connect-threads-account').addEventListener('click', async () => {
  try {
    const result = await api('threads-oauth-url');
    location.href = result.url;
  } catch (error) { message(adminMessage, error.message, true); }
});
document.querySelector('#publish-threads-selected').addEventListener('click', async () => {
  const selections = [...selectedThreads].map(id => {
    const item = threadsImportList.querySelector(`.threads-import-item[data-id="${CSS.escape(id)}"]`);
    return { id, category: item?.querySelector('select')?.value || 'life-stories' };
  });
  if (!selections.length) return;
  try {
    const result = await api('publish-threads-imports', { selections });
    selectedThreads.clear();
    await Promise.all([loadThreadsImports(), loadPosts()]);
    message(adminMessage, `${result.count}편을 선택한 분류에 공개 게시했습니다.`);
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
    document.querySelector('#edit-cover-image').value = post.cover_image_url || '';
    document.querySelector('#edit-cover-quote').value = post.cover_quote || '';
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
    body: document.querySelector('#edit-body').value.trim(),
    cover_image_url: document.querySelector('#edit-cover-image').value.trim(),
    cover_quote: document.querySelector('#edit-cover-quote').value.trim()
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
