const detailConfig = window.BUJAHYUNG_SUPABASE || {};
const detailRoot = document.querySelector('#pick-detail');
const pickId = new URLSearchParams(location.search).get('id') || '';

const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

// 4억 3,700만원처럼 억과 만원을 함께 적어야 금액이 한눈에 들어온다.
function money(value) {
  const amount = Number(value || 0);
  if (!amount) return '미정';
  const eok = Math.floor(amount / 100000000);
  const man = Math.round((amount % 100000000) / 10000);
  if (eok && man) return `${eok}억 ${man.toLocaleString('ko-KR')}만원`;
  if (eok) return `${eok}억원`;
  return `${man.toLocaleString('ko-KR')}만원`;
}

function bidDate(value) {
  if (!value) return '기일 미정';
  return new Date(`${value}T00:00:00`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function priceRatio(item) {
  const appraisal = Number(item.appraisal_price || 0);
  const minimum = Number(item.minimum_price || 0);
  if (!appraisal || !minimum) return '-';
  return `${Math.round((minimum / appraisal) * 100)}%`;
}

// 한 문단씩 끊어 읽히도록 줄바꿈을 그대로 살린다.
function paragraphs(text) {
  return String(text || '')
    .split(/\n{1,}/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<p>${esc(line)}</p>`)
    .join('') || '<p>요약을 준비하고 있습니다.</p>';
}

function galleryImages(item) {
  const list = Array.isArray(item.source_images) ? item.source_images.slice() : [];
  if (item.image_url) list.unshift(item.image_url);
  return [...new Set(list.filter(Boolean).map(String))];
}


// 기존 상세링크는 살려두되, 결제회원만 볼 수 있는 유료 사이트는 연결하지 않는다.
function extraLink(item) {
  const link = String(item.detail_url || '').trim();
  if (!link) return '';
  let host = '';
  try { host = new URL(link).hostname; } catch (error) { return ''; }
  if (host.includes('speedauction')) return '';
  const label = host.includes('threads') ? '스레드 원문 글 보기 →' : '상세 자료 보기 →';
  return `<a class="back" href="${esc(link)}" target="_blank" rel="noopener">${label}</a>`;
}

function showState(title, message) {
  detailRoot.innerHTML = `<div class="state"><h2>${esc(title)}</h2><p>${esc(message)}</p><a class="back" href="auction-picks.html">추천 물건 목록으로 돌아가기 →</a></div>`;
}

function render(item) {
  document.title = `${item.title} | 부자형 경매물건요약`;
  const tags = [item.property_type, item.court, item.status === 'closed' ? '입찰 마감' : '추천 중']
    .filter(Boolean)
    .map(tag => `<span>${esc(tag)}</span>`)
    .join('');
  const images = galleryImages(item);
  const gallery = images.length
    ? `<div class="gallery">
        <div class="gallery-head"><h2>물건 상세 자료</h2><p>사진을 눌러 원본 크기로 확인할 수 있습니다.</p></div>
        ${images.map((url, index) => `<figure><a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(item.title)} 자료 ${index + 1}" loading="lazy"></a><figcaption>${String(index + 1).padStart(2, '0')} · 물건 자료</figcaption></figure>`).join('')}
      </div>`
    : '';

  detailRoot.innerHTML = `
    <section class="hero">
      <p class="eyebrow">BUJAHYUNG AUCTION PICK${item.case_number ? ` · ${esc(item.case_number)}` : ''}</p>
      <h1>${esc(item.title)}</h1>
      <p class="address">${esc(item.address || '소재지는 상담 시 확인해 주세요.')}</p>
      ${tags ? `<div class="tags">${tags}</div>` : ''}
      <div class="facts">
        <div><small>감정가</small><strong>${money(item.appraisal_price)}</strong></div>
        <div><small>최저가</small><strong>${money(item.minimum_price)}</strong></div>
        <div><small>감정가 대비</small><strong>${priceRatio(item)}</strong></div>
        <div><small>입찰기일</small><strong>${bidDate(item.bid_date)}</strong></div>
      </div>
    </section>
    <section class="body">
      <div class="summary">
        <div><h2>부자형 경매물건요약</h2>${paragraphs(item.recommendation_reason)}</div>
        <aside class="notice">
          <strong>입찰 전 꼭 다시 확인할 점</strong>
          <p>${esc(item.risk_note || '매각물건명세서·현황조사서·등기부와 점유 상태를 직접 확인하고, 관리비 체납과 수리비까지 입찰가에 반영하세요.')}</p>
        </aside>
      </div>
      ${gallery}
      <div class="cta">
        <div><h3>이 물건, 같이 봐 드립니다.</h3><p>권리·총투입비용·출구까지 함께 확인하고 입찰가를 잡아 드립니다.</p></div>
        <a href="business.html#consultation">물건 상담 신청 →</a>
      </div>
      <div class="links"><a class="back" href="auction-picks.html">추천 물건 목록으로 돌아가기 →</a>${extraLink(item)}</div>
    </section>`;
}

async function loadPick() {
  if (!pickId) return showState('물건을 찾을 수 없습니다.', '목록에서 다시 선택해 주세요.');
  if (!detailConfig.url || !detailConfig.anonKey) return showState('요약을 불러오지 못했습니다.', '잠시 후 다시 시도해 주세요.');
  const client = supabase.createClient(detailConfig.url, detailConfig.anonKey);
  const { data, error } = await client
    .from('auction_recommendations')
    .select('*')
    .eq('id', pickId)
    .eq('is_published', true)
    .maybeSingle();
  if (error || !data) return showState('물건을 찾을 수 없습니다.', '공개가 끝났거나 주소가 잘못되었습니다.');
  render(data);
}

loadPick();
