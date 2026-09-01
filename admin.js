const config = window.BUJAHYUNG_SUPABASE || {};
const isConfigured = config.url && config.anonKey && !config.url.startsWith('__');
const endpoint = isConfigured ? `${config.url}/functions/v1/admin-api` : '';
const categories = {
  'thread-seodang': '부자형 서당',
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
const threadsImportList = document.querySelector('#threads-import-list');
const publishedList = document.querySelector('#published-list');
const inquiryList = document.querySelector('#inquiry-list');
const pickAdminList = document.querySelector('#pick-admin-list');
const adminMessage = document.querySelector('#admin-message');
const loginMessage = document.querySelector('#login-message');
const editModal = document.querySelector('#edit-modal');
const sessionKey = 'bujahyung_admin_session';
let adminSession = sessionStorage.getItem(sessionKey) || '';
let threadsImports = [];
let posts = [];
let inquiries = [];
let auctionPicks = [];
let selectedThreads = new Set();
let threadsIntegration = null;
let threadsPlans = new Map();

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

async function api(action, payload = {}, timeoutMs = 0) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': adminSession },
      body: JSON.stringify({ action, ...payload }),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
    });
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error(`서버 응답이 ${Math.round(timeoutMs / 1000)}초를 넘겨 중단했습니다.`);
    throw new Error('서버에 연결하지 못했습니다.');
  }
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
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function uploadSelectedVideos(fileInput, statusTarget) {
  const files = [...fileInput.files];
  if (!files.length) return [];
  if (files.length > 3) {
    message(adminMessage, '동영상은 한 번에 최대 3개까지 선택할 수 있습니다.', true);
    fileInput.value = '';
    return [];
  }
  const uploaded = [];
  fileInput.disabled = true;
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!['video/mp4', 'video/webm'].includes(file.type)) throw new Error('MP4, WEBM 동영상만 올릴 수 있습니다.');
      if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} 동영상이 12MB를 넘습니다.`);
      statusTarget.textContent = `동영상을 올리는 중입니다. (${index + 1}/${files.length})`;
      const result = await api('upload-post-image', {
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        file_base64: await fileBase64(file)
      });
      uploaded.push(result.url);
    }
    statusTarget.textContent = `동영상 ${uploaded.length}개를 올렸습니다.`;
    return uploaded;
  } catch (error) {
    statusTarget.textContent = '동영상 업로드에 실패했습니다.';
    message(adminMessage, error.message, true);
    return [];
  } finally {
    fileInput.disabled = false;
    fileInput.value = '';
  }
}

async function uploadSelectedImages(fileInput, statusTarget) {
  const files = [...fileInput.files];
  if (!files.length) return [];
  if (files.length > 6) {
    message(adminMessage, '사진은 한 번에 최대 6장까지 선택할 수 있습니다.', true);
    fileInput.value = '';
    return [];
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
    statusTarget.textContent = `사진 ${uploaded.length}장을 올렸습니다.`;
    return uploaded;
  } catch (error) {
    statusTarget.textContent = '사진 업로드에 실패했습니다.';
    message(adminMessage, error.message, true);
    return [];
  } finally {
    fileInput.disabled = false;
    fileInput.value = '';
  }
}

async function uploadPostImages(fileInput, targetInput, statusTarget) {
  const uploaded = await uploadSelectedImages(fileInput, statusTarget);
  if (!uploaded.length) return;
  const existing = targetInput.value.trim();
  targetInput.value = [existing, ...uploaded].filter(Boolean).join('|');
  message(adminMessage, `대표 사진 ${uploaded.length}장을 올렸습니다. 글을 저장하면 적용됩니다.`);
}

async function uploadInlineImages(fileInput, textarea, positionSelect, statusTarget) {
  const cursorPosition = textarea.selectionStart;
  const uploaded = await uploadSelectedImages(fileInput, statusTarget);
  if (!uploaded.length) return;
  const markers = uploaded.map(url => `[[사진:${url}]]`).join('\n\n');
  const position = positionSelect.value;
  const body = textarea.value;
  if (position === 'start') {
    textarea.value = `${markers}\n\n${body}`.trim();
  } else if (position === 'end') {
    textarea.value = `${body}\n\n${markers}`.trim();
  } else {
    const before = body.slice(0, cursorPosition).replace(/\s*$/, '');
    const after = body.slice(cursorPosition).replace(/^\s*/, '');
    textarea.value = `${before}${before ? '\n\n' : ''}${markers}${after ? `\n\n${after}` : ''}`;
  }
  statusTarget.textContent = `본문에 사진 ${uploaded.length}장을 넣었습니다.`;
  message(adminMessage, `본문에 사진 ${uploaded.length}장을 넣었습니다. 글을 저장하면 적용됩니다.`);
  textarea.focus();
}

async function uploadInlineVideos(fileInput, textarea, positionSelect, statusTarget) {
  const cursorPosition = textarea.selectionStart;
  const uploaded = await uploadSelectedVideos(fileInput, statusTarget);
  if (!uploaded.length) return;
  const markers = uploaded.map(url => `[[동영상:${url}]]`).join('\n\n');
  const position = positionSelect.value;
  const body = textarea.value;
  if (position === 'start') {
    textarea.value = `${markers}\n\n${body}`.trim();
  } else if (position === 'end') {
    textarea.value = `${body}\n\n${markers}`.trim();
  } else {
    const before = body.slice(0, cursorPosition).replace(/\s*$/, '');
    const after = body.slice(cursorPosition).replace(/^\s*/, '');
    textarea.value = `${before}${before ? '\n\n' : ''}${markers}${after ? `\n\n${after}` : ''}`;
  }
  statusTarget.textContent = `본문에 동영상 ${uploaded.length}개를 넣었습니다.`;
  message(adminMessage, `본문에 동영상 ${uploaded.length}개를 넣었습니다. 글을 저장하면 적용됩니다.`);
  textarea.focus();
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
    const plan = threadsPlans.get(item.id);
    const duplicate = plan?.duplicate || null;
    const locked = published || Boolean(duplicate);
    const replies = Array.isArray(item.replies) ? item.replies : [];
    const replyMarkup = replies.length
      ? `<div class="threads-replies"><small>이어 쓴 답글 ${replies.length}개</small>${replies.map((reply, index) => `<p><b>답글 ${index + 1}</b>${escapeHtml(reply.text)}</p>`).join('')}</div>`
      : '<div class="threads-replies"><small>이어 쓴 답글 없음</small></div>';
    const state = published ? '게시 완료' : duplicate ? '이미 게시됨 · 건너뜀' : '게시 대기';
    const planMarkup = duplicate
      ? `<p class="notice error">이미 «${escapeHtml(categories[duplicate.category] || duplicate.category)}»에 «${escapeHtml(duplicate.title || '같은 글')}»로 올라가 있습니다.</p>`
      : plan ? `<p class="notice">제안: ${escapeHtml(categories[plan.suggested_category] || plan.suggested_category)} — ${escapeHtml(plan.reason)}</p>` : '';
    const options = Object.entries(categories)
      .map(([value, label]) => `<option value="${value}"${plan && plan.suggested_category === value ? ' selected' : ''}>${label}</option>`)
      .join('');
    return `<article class="source-item threads-import-item" data-id="${escapeHtml(item.id)}">
      <input id="threads-${escapeHtml(item.id)}" type="checkbox" ${selectedThreads.has(item.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}>
      <label for="threads-${escapeHtml(item.id)}"><span class="source-no">${state} · ${new Date(item.thread_timestamp).toLocaleDateString('ko-KR')}</span><h3>${escapeHtml(item.root_text.split(/\r?\n/)[0])}</h3><p>${escapeHtml(item.root_text)}</p>${planMarkup}${replyMarkup}</label>
      <div class="threads-import-controls"><select aria-label="게시 분류" ${locked ? 'disabled' : ''}>${options}</select>${item.permalink ? `<a class="secondary-button" href="${escapeHtml(item.permalink)}" target="_blank" rel="noopener">원문 보기 ↗</a>` : ''}</div>
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

async function loadPosts(preloaded) {
  posts = preloaded || (await api('list')).posts || [];
  renderPosts();
}

async function loadThreadsImports(preloaded) {
  threadsImports = preloaded || (await api('list-threads-imports')).imports || [];
  selectedThreads = new Set([...selectedThreads].filter(id => threadsImports.some(item => item.id === id && item.status === 'pending')));
  await loadThreadsPlans();
  renderThreadsImports();
  threadsSelectionStatus();
}

// 게시 대기 원고마다 분류 제안과 중복 여부를 받아옵니다. 실패해도 목록은 그대로 보여줍니다.
async function loadThreadsPlans() {
  const planSummary = document.querySelector('#threads-plan-summary');
  if (!threadsImports.some(item => item.status === 'pending')) {
    threadsPlans = new Map();
    message(planSummary, '');
    return;
  }
  try {
    const result = await api('plan-threads-imports', {}, 60000);
    threadsPlans = new Map((result.plans || []).map(plan => [plan.id, plan]));
    const fresh = result.total - result.duplicates;
    message(planSummary, `게시 대기 ${result.total}편 가운데 ${result.duplicates}편은 이미 올라간 글이라 제외했습니다. 새로 게시할 수 있는 글은 ${fresh}편입니다. 분류는 기존 ${result.posts}편을 기준으로 제안한 것이라 바꾸셔도 됩니다.`);
  } catch (error) {
    threadsPlans = new Map();
    message(planSummary, `분류 제안을 불러오지 못했습니다 — ${error.message}`, true);
  }
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

function pickMoney(value) {
  const amount = Number(value || 0);
  return amount ? `${Math.round(amount / 10000).toLocaleString('ko-KR')}만원` : '가격 미정';
}

function renderAuctionPicks() {
  if (!auctionPicks.length) {
    pickAdminList.innerHTML = '<div class="empty-state"><strong>등록한 추천 물건이 없습니다.</strong><span>위 양식에서 첫 물건을 올려 보세요.</span></div>';
    return;
  }
  pickAdminList.innerHTML = auctionPicks.map(item => `<article class="published-item" data-id="${item.id}"><span>${item.is_featured ? '대표 추천' : (item.status === 'closed' ? '마감' : '추천')}</span><div><small class="category-badge">${escapeHtml(item.property_type)} · ${escapeHtml(item.case_number)}</small><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.address)} · <span class="pick-price">최저 ${pickMoney(item.minimum_price)}</span> · ${item.is_published ? '공개 중' : '비공개'}</p></div><div class="published-actions"><a class="secondary-button" href="auction-picks.html" target="_blank" rel="noopener">보기</a><button class="secondary-button" type="button" data-action="edit-pick">수정</button><button class="secondary-button" type="button" data-action="toggle-pick">${item.is_published ? '비공개' : '공개'}</button><button class="danger-button" type="button" data-action="delete-pick">삭제</button></div></article>`).join('');
}

async function loadAuctionPicks(preloaded) {
  auctionPicks = preloaded || (await api('list-auction-recommendations')).items || [];
  renderAuctionPicks();
}

async function showAdmin(preloaded) {
  await Promise.all([loadPosts(preloaded), loadThreadsImports(), loadThreadsIntegration(), loadInquiries(), loadAuctionPicks()]);
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

document.querySelector('#create-inline-image-files').addEventListener('change', event => uploadInlineImages(
  event.target,
  document.querySelector('#create-body'),
  document.querySelector('#create-inline-position'),
  document.querySelector('#create-inline-upload-status')
));

document.querySelector('#edit-inline-image-files').addEventListener('change', event => uploadInlineImages(
  event.target,
  document.querySelector('#edit-body'),
  document.querySelector('#edit-inline-position'),
  document.querySelector('#edit-inline-upload-status')
));

document.querySelector('#create-inline-video-files').addEventListener('change', event => uploadInlineVideos(
  event.currentTarget,
  document.querySelector('#create-body'),
  document.querySelector('#create-inline-video-position'),
  document.querySelector('#create-inline-video-upload-status')
));

document.querySelector('#edit-inline-video-files').addEventListener('change', event => uploadInlineVideos(
  event.currentTarget,
  document.querySelector('#edit-body'),
  document.querySelector('#edit-inline-video-position'),
  document.querySelector('#edit-inline-video-upload-status')
));

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
  const syncStatus = document.querySelector('#threads-sync-status');
  const startedAt = Date.now();
  const elapsed = () => `${Math.round((Date.now() - startedAt) / 1000)}초`;
  const step = (text, isError = false) => message(syncStatus, text, isError);
  const callTimeoutMs = 60000;

  button.disabled = true;
  button.textContent = 'Threads 가져오는 중…';
  step('원문 목록을 가져오고 있습니다…');
  try {
    // 1단계: 원문만 먼저 저장하고 화면에 띄웁니다. 여기서 끊겨도 저장된 만큼은 남습니다.
    let after = '';
    let roots = 0;
    const pending = [];
    do {
      const result = await api('sync-threads-roots', after ? { after } : {}, callTimeoutMs);
      roots += result.count;
      pending.push(...(result.pending || []));
      after = result.next || '';
      step(`원문 ${roots}편 저장 · ${elapsed()} 경과`);
    } while (after);

    await loadThreadsImports();

    // 2단계: 이어 쓴 답글은 묶음으로 나눠 채웁니다.
    let done = 0;
    const failed = [];
    const chunkSize = 8;
    for (let index = 0; index < pending.length; index += chunkSize) {
      const chunk = pending.slice(index, index + chunkSize);
      const result = await api('sync-threads-replies', { ids: chunk }, callTimeoutMs);
      done += chunk.length;
      failed.push(...(result.failed || []));
      step(`원문 ${roots}편 · 이어 쓴 답글 ${done}/${pending.length} · ${elapsed()} 경과`);
    }
    if (pending.length) await loadThreadsImports();

    if (failed.length) {
      step(`원문 ${roots}편은 저장했지만 답글 ${failed.length}건을 가져오지 못했습니다 — ${failed[0].error} (${elapsed()} 소요)`, true);
    } else if (!roots) {
      step(`Threads에서 가져올 원문이 없었습니다. 계정 연결과 토큰 만료일을 확인해 주세요. (${elapsed()} 소요)`, true);
    } else {
      step(`원문 ${roots}편, 이어 쓴 답글 ${done}편을 확인했습니다. (${elapsed()} 소요)`);
    }
    message(adminMessage, `Threads 원고 ${roots}편을 확인했습니다.`);
  } catch (error) {
    // 실패해도 이 영역에 계속 남겨서 어디까지 갔는지 보이게 합니다.
    step(`가져오기 실패 (${elapsed()} 경과) — ${error.message}`, true);
    message(adminMessage, error.message, true);
    await loadThreadsImports().catch(() => {});
  } finally {
    button.disabled = false;
    button.textContent = 'Threads에서 새로 가져오기';
  }
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
    window.open(result.url, '_blank', 'noopener');
  } catch (error) { message(adminMessage, error.message, true); }
});
document.querySelector('#publish-threads-selected').addEventListener('click', async () => {
  const selections = [...selectedThreads].map(id => {
    const item = threadsImportList.querySelector(`.threads-import-item[data-id="${CSS.escape(id)}"]`);
    return { id, category: item?.querySelector('select')?.value || 'life-stories' };
  });
  if (!selections.length) return;
  try {
    const result = await api('publish-threads-imports', { selections }, 120000);
    selectedThreads.clear();
    await Promise.all([loadThreadsImports(), loadPosts()]);
    const skipped = (result.skipped || []).length;
    message(adminMessage, skipped
      ? `${result.count}편을 게시했습니다. 이미 같은 글이 있어 ${skipped}편은 건너뛰었습니다.`
      : `${result.count}편을 선택한 분류에 공개 게시했습니다.`);
  } catch (error) { message(adminMessage, error.message, true); }
});

// 중복이 아닌 게시 대기 원고를 제안 분류 그대로 한 번에 고릅니다.
document.querySelector('#select-suggested-threads').addEventListener('click', () => {
  const targets = filteredThreadsImports()
    .filter(item => item.status === 'pending' && !threadsPlans.get(item.id)?.duplicate);
  if (!targets.length) { message(adminMessage, '선택할 수 있는 새 원고가 없습니다.', true); return; }
  targets.forEach(item => selectedThreads.add(item.id));
  renderThreadsImports();
  threadsSelectionStatus();
  message(adminMessage, `${targets.length}편을 제안 분류로 선택했습니다. 분류를 바꾸고 싶은 글은 각 항목의 선택 상자에서 고치시면 됩니다.`);
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

function resetPickForm() {
  document.querySelector('#pick-form').reset();
  document.querySelector('#pick-id').value = '';
  document.querySelector('#pick-published').checked = true;
  document.querySelector('#pick-submit-label').textContent = '추천 물건 저장';
  document.querySelector('#pick-upload-status').textContent = 'JPG·PNG·WEBP·GIF, 최대 8MB';
}

document.querySelector('#pick-reset').addEventListener('click', resetPickForm);
document.querySelector('#pick-image-file').addEventListener('change', async event => {
  const urls = await uploadSelectedImages(event.target, document.querySelector('#pick-upload-status'));
  if (urls[0]) document.querySelector('#pick-image-url').value = urls[0];
});

document.querySelector('#pick-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = document.querySelector('#pick-id').value;
  const item = {
    title: document.querySelector('#pick-title').value.trim(),
    case_number: document.querySelector('#pick-case-number').value.trim(),
    court: document.querySelector('#pick-court').value.trim(),
    property_type: document.querySelector('#pick-property-type').value,
    address: document.querySelector('#pick-address').value.trim(),
    appraisal_price: document.querySelector('#pick-appraisal-price').value || null,
    minimum_price: document.querySelector('#pick-minimum-price').value || null,
    bid_date: document.querySelector('#pick-bid-date').value || null,
    detail_url: document.querySelector('#pick-detail-url').value.trim(),
    recommendation_reason: document.querySelector('#pick-reason').value.trim(),
    risk_note: document.querySelector('#pick-risk').value.trim(),
    image_url: document.querySelector('#pick-image-url').value.trim(),
    is_featured: document.querySelector('#pick-featured').checked,
    is_published: document.querySelector('#pick-published').checked,
    status: document.querySelector('#pick-closed').checked ? 'closed' : 'open'
  };
  try {
    await api(id ? 'update-auction-recommendation' : 'create-auction-recommendation', id ? { id, changes: item } : item);
    resetPickForm();
    await loadAuctionPicks();
    message(adminMessage, id ? '추천 물건을 수정했습니다.' : '추천 물건을 저장했습니다.');
  } catch (error) { message(adminMessage, error.message, true); }
});

pickAdminList.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  const row = event.target.closest('.published-item');
  if (!button || !row) return;
  const item = auctionPicks.find(entry => entry.id === row.dataset.id);
  if (!item) return;
  if (button.dataset.action === 'edit-pick') {
    document.querySelector('#pick-id').value = item.id;
    document.querySelector('#pick-title').value = item.title || '';
    document.querySelector('#pick-case-number').value = item.case_number || '';
    document.querySelector('#pick-court').value = item.court || '';
    document.querySelector('#pick-property-type').value = item.property_type || '기타';
    document.querySelector('#pick-address').value = item.address || '';
    document.querySelector('#pick-appraisal-price').value = item.appraisal_price || '';
    document.querySelector('#pick-minimum-price').value = item.minimum_price || '';
    document.querySelector('#pick-bid-date').value = item.bid_date || '';
    document.querySelector('#pick-detail-url').value = item.detail_url || '';
    document.querySelector('#pick-reason').value = item.recommendation_reason || '';
    document.querySelector('#pick-risk').value = item.risk_note || '';
    document.querySelector('#pick-image-url').value = item.image_url || '';
    document.querySelector('#pick-featured').checked = Boolean(item.is_featured);
    document.querySelector('#pick-published').checked = Boolean(item.is_published);
    document.querySelector('#pick-closed').checked = item.status === 'closed';
    document.querySelector('#pick-submit-label').textContent = '수정 내용 저장';
    document.querySelector('#pick-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (button.dataset.action === 'toggle-pick') {
    try { await api('update-auction-recommendation', { id: item.id, changes: { is_published: !item.is_published } }); await loadAuctionPicks(); }
    catch (error) { message(adminMessage, error.message, true); }
  }
  if (button.dataset.action === 'delete-pick' && confirm(`「${item.title}」 추천 물건을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`)) {
    try { await api('delete-auction-recommendation', { id: item.id }); await loadAuctionPicks(); message(adminMessage, '추천 물건을 삭제했습니다.'); }
    catch (error) { message(adminMessage, error.message, true); }
  }
});

if (!isConfigured) message(loginMessage, 'Supabase 프로젝트 연결이 필요합니다.', true);
else if (adminSession) showAdmin().catch(() => {
  adminSession = '';
  sessionStorage.removeItem(sessionKey);
  message(loginMessage, '관리 시간이 만료되었습니다. 비밀번호를 다시 입력해 주세요.', true);
});
