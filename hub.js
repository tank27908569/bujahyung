/* 허브 링크 클릭 집계.
   어떤 카드가 실제로 눌리는지 남겨서, 바이오 링크가 무엇으로 이어지는지 확인합니다.
   개인정보는 남기지 않습니다. 어떤 링크를 눌렀는지와 어디서 들어왔는지(도메인)만 기록합니다.
   테이블이 아직 없거나 네트워크가 실패해도 페이지 동작에는 영향을 주지 않습니다. */

const config = window.BUJAHYUNG_SUPABASE || {};
const endpoint = config.url ? `${config.url}/rest/v1/hub_clicks` : '';

const yearEl = document.querySelector('#year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

function referrerHost() {
  if (!document.referrer) return 'direct';
  try {
    return new URL(document.referrer).hostname;
  } catch (error) {
    return 'unknown';
  }
}

function recordClick(linkId) {
  if (!endpoint || !config.anonKey) return;
  try {
    fetch(endpoint, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ link_id: linkId, source: referrerHost() })
    }).catch(() => {});
  } catch (error) {
    /* 집계 실패는 무시합니다. */
  }
}

document.querySelectorAll('[data-track]').forEach(element => {
  element.addEventListener('click', () => recordClick(element.dataset.track));
});
