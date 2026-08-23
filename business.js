const config = window.BUJAHYUNG_SUPABASE || {};
const form = document.querySelector('#consultation-form');
const messageBox = document.querySelector('#form-message');
const submitButton = form.querySelector('button[type="submit"]');
const endpoint = config.url ? `${config.url}/functions/v1/consultation-api` : '';

document.querySelector('#year').textContent = new Date().getFullYear();

document.querySelectorAll('[data-service]').forEach(link => link.addEventListener('click', () => {
  document.querySelector('#service-type').value = link.dataset.service;
}));

function showMessage(text, type = '') {
  messageBox.textContent = text;
  messageBox.className = `form-message ${type}`.trim();
}

function validPhone(value) {
  return /^[0-9+()\-\s]{8,20}$/.test(value);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(form);
  const payload = {
    service_type: String(data.get('service_type') || ''),
    name: String(data.get('name') || '').trim(),
    phone: String(data.get('phone') || '').trim(),
    preferred_contact_time: String(data.get('preferred_contact_time') || '').trim(),
    message: String(data.get('message') || '').trim(),
    website: String(data.get('website') || '')
  };
  if (!payload.service_type || !payload.name || !validPhone(payload.phone) || !payload.message) {
    showMessage('상담 분야, 성함, 올바른 연락처와 상담 내용을 입력해 주세요.', 'error');
    return;
  }
  if (!document.querySelector('#privacy-consent').checked) {
    showMessage('개인정보 수집·이용 동의가 필요합니다.', 'error');
    return;
  }
  if (!endpoint) {
    showMessage('상담 접수 연결을 준비하고 있습니다.', 'error');
    return;
  }
  submitButton.disabled = true;
  showMessage('상담 신청을 보내고 있습니다.');
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '상담 신청을 보내지 못했습니다.');
    form.reset();
    showMessage('상담 신청이 접수되었습니다. 확인 후 순서대로 연락드리겠습니다.', 'success');
  } catch (error) {
    showMessage(error.message || '잠시 후 다시 시도해 주세요.', 'error');
  } finally {
    submitButton.disabled = false;
  }
});
