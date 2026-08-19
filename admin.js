const config = window.BUJAHYUNG_SUPABASE || {};
const isConfigured = config.url && config.anonKey && !config.url.startsWith('__');
const endpoint = isConfigured ? `${config.url}/functions/v1/admin-api` : '';
const loginPanel = document.querySelector('#login-panel');
const adminApp = document.querySelector('#admin-app');
const sourceList = document.querySelector('#source-list');
const publishedList = document.querySelector('#published-list');
const adminMessage = document.querySelector('#admin-message');
const loginMessage = document.querySelector('#login-message');
const editModal = document.querySelector('#edit-modal');
const vaultKey = 'bujahyung_admin_vault';
const setupToken = new URLSearchParams(location.hash.slice(1)).get('setup') || '';
let adminToken = '';
let sourceEntries = [];
let publishedPosts = [];
let selectedNumbers = new Set();

const toBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));

function escapeHtml(value = '') {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function message(target, text, error = false) {
  target.innerHTML = text ? `<p class="notice${error ? ' error' : ''}">${escapeHtml(text)}</p>` : '';
}

async function deriveKey(pin, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function saveVault(token, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  localStorage.setItem(vaultKey, JSON.stringify({ salt: toBase64(salt), iv: toBase64(iv), data: toBase64(encrypted) }));
}

async function openVault(pin) {
  const stored = localStorage.getItem(vaultKey);
  if (!stored) throw new Error('이 기기는 아직 관리 기기로 등록되지 않았습니다.');
  const vault = JSON.parse(stored);
  const salt = fromBase64(vault.salt);
  const iv = fromBase64(vault.iv);
  const key = await deriveKey(pin, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, fromBase64(vault.data));
  return new TextDecoder().decode(decrypted);
}

async function api(action, payload = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '작업을 처리하지 못했습니다.');
  return result;
}

function selectionStatus() {
  document.querySelector('#selection-count').textContent = selectedNumbers.size;
  document.querySelector('#publish-selected').disabled = selectedNumbers.size === 0;
}

function renderSources(items = sourceEntries) {
  const publishedNumbers = new Set(publishedPosts.map(post => post.source_no));
  if (!items.length) { sourceList.innerHTML = '<div class="empty-state"><strong>검색 결과가 없습니다.</strong></div>'; return; }
  sourceList.innerHTML = items.map(item => {
    const exists = publishedNumbers.has(item.source_no);
    return `<div class="source-item"><input id="source-${item.source_no}" type="checkbox" value="${item.source_no}" ${selectedNumbers.has(item.source_no) ? 'checked' : ''} ${exists ? 'disabled' : ''}><label for="source-${item.source_no}"><span class="source-no">${exists ? '게시됨' : 'THREAD'} · ${String(item.source_no).padStart(3, '0')}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></label></div>`;
  }).join('');
}

function renderPublished() {
  if (!publishedPosts.length) { publishedList.innerHTML = '<div class="empty-state"><strong>게시된 글이 없습니다.</strong><span>원고에서 원하는 글을 선택해 게시해 주세요.</span></div>'; return; }
  publishedList.innerHTML = publishedPosts.map(post => `<article class="published-item" data-id="${post.id}"><span>#${post.source_no || '—'}</span><div><h3>${escapeHtml(post.title)}</h3><p>${post.is_published ? '공개 중' : '비공개'} · ${new Date(post.updated_at || post.created_at).toLocaleDateString('ko-KR')}</p></div><div class="published-actions"><button class="secondary-button" type="button" data-action="edit">수정</button><button class="secondary-button" type="button" data-action="toggle">${post.is_published ? '비공개' : '공개'}</button><button class="danger-button" type="button" data-action="delete">삭제</button></div></article>`).join('');
}

async function loadSources() {
  const response = await fetch('data/thread-seodang.json');
  if (!response.ok) throw new Error('HWPX 원고 목록을 읽지 못했습니다.');
  sourceEntries = await response.json();
  renderSources();
}

async function loadPublished(preloaded) {
  publishedPosts = preloaded || (await api('list')).posts || [];
  renderPublished();
  renderSources();
}

async function showAdmin(preloaded) {
  await Promise.all([loadSources(), loadPublished(preloaded)]);
  loginPanel.style.display = 'none';
  adminApp.classList.add('active');
  document.querySelector('#logout-button').hidden = false;
}

document.querySelector('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!isConfigured) { message(loginMessage, 'Supabase 연결이 아직 완료되지 않았습니다.', true); return; }
  const pin = document.querySelector('#admin-pin').value;
  message(loginMessage, setupToken ? '이 기기를 관리 기기로 등록하고 있습니다.' : '관리 키를 확인하고 있습니다.');
  try {
    adminToken = setupToken || await openVault(pin);
    const result = await api('list');
    if (setupToken) {
      await saveVault(adminToken, pin);
      history.replaceState(null, '', `${location.pathname}${location.search}`);
    }
    document.querySelector('#admin-pin').value = '';
    await showAdmin(result.posts || []);
  } catch {
    adminToken = '';
    message(loginMessage, setupToken ? '관리 기기 등록에 실패했습니다.' : '비밀번호가 맞지 않거나 관리 기기 등록이 필요합니다.', true);
  }
});

document.querySelector('#logout-button').addEventListener('click', () => { adminToken = ''; location.reload(); });
sourceList.addEventListener('change', event => { if (!event.target.matches('input[type="checkbox"]')) return; const number = Number(event.target.value); event.target.checked ? selectedNumbers.add(number) : selectedNumbers.delete(number); selectionStatus(); });
document.querySelector('#source-search').addEventListener('input', event => { const query = event.target.value.trim().toLocaleLowerCase('ko'); renderSources(sourceEntries.filter(item => `${item.source_no} ${item.title} ${item.body}`.toLocaleLowerCase('ko').includes(query))); });
document.querySelector('#clear-selection').addEventListener('click', () => { selectedNumbers.clear(); renderSources(); selectionStatus(); });
document.querySelector('#publish-selected').addEventListener('click', async () => {
  const selected = sourceEntries.filter(item => selectedNumbers.has(item.source_no));
  if (!selected.length) return;
  try { await api('publish', { posts: selected }); selectedNumbers.clear(); selectionStatus(); await loadPublished(); message(adminMessage, `${selected.length}편을 공개 게시했습니다.`); }
  catch (error) { message(adminMessage, error.message, true); }
});

document.querySelectorAll('.admin-tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.admin-tab').forEach(item => item.classList.toggle('active', item === tab)); document.querySelectorAll('.admin-view').forEach(view => view.classList.toggle('active', view.id === `view-${tab.dataset.view}`)); }));
publishedList.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]'); const item = event.target.closest('.published-item');
  if (!button || !item) return;
  const post = publishedPosts.find(entry => entry.id === item.dataset.id); if (!post) return;
  if (button.dataset.action === 'edit') { document.querySelector('#edit-id').value = post.id; document.querySelector('#edit-title').value = post.title; document.querySelector('#edit-body').value = post.body; editModal.classList.add('open'); }
  if (button.dataset.action === 'toggle') { try { await api('update', { id: post.id, changes: { is_published: !post.is_published } }); await loadPublished(); } catch (error) { message(adminMessage, error.message, true); } }
  if (button.dataset.action === 'delete' && confirm(`#${post.source_no} 글을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`)) { try { await api('delete', { id: post.id }); await loadPublished(); message(adminMessage, '글을 삭제했습니다.'); } catch (error) { message(adminMessage, error.message, true); } }
});
document.querySelector('#edit-form').addEventListener('submit', async event => { event.preventDefault(); const id = document.querySelector('#edit-id').value; const changes = { title: document.querySelector('#edit-title').value.trim(), body: document.querySelector('#edit-body').value.trim() }; try { await api('update', { id, changes }); editModal.classList.remove('open'); await loadPublished(); message(adminMessage, '수정 내용을 저장했습니다.'); } catch (error) { message(adminMessage, error.message, true); } });
function closeEdit() { editModal.classList.remove('open'); }
editModal.querySelector('.modal-close').addEventListener('click', closeEdit);
document.querySelector('#edit-cancel').addEventListener('click', closeEdit);
editModal.addEventListener('click', event => { if (event.target === editModal) closeEdit(); });

if (!isConfigured) message(loginMessage, 'Supabase 프로젝트 연결이 필요합니다.', true);
else if (!setupToken && !localStorage.getItem(vaultKey)) message(loginMessage, '최초 1회 관리 기기 등록이 필요합니다.', true);
