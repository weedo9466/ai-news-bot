/* =============================================
   AI PULSE — News Aggregator Logic
   Sources: Multiple RSS feeds via rss2json API
   Auto-refresh: every 60 minutes
   ============================================= */

'use strict';

// ── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG = {
  REFRESH_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
  ARTICLES_PER_PAGE: 18,
  RSS2JSON_API: 'https://api.rss2json.com/v1/api.json?rss_url=',
  RSS2JSON_KEY: '',           // leave empty for free tier (rate-limited)
  CORS_PROXY: 'https://api.allorigins.win/get?url=',
};

// ── RSS FEED SOURCES ─────────────────────────────────────────────────────────
const FEEDS = [
  {
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    color: 'cyan',
    defaultCat: 'business',
    short: 'TCrunch'
  },
  {
    name: 'VentureBeat AI',
    url: 'https://venturebeat.com/category/ai/feed/',
    color: 'purple',
    defaultCat: 'business',
    short: 'VBeat'
  },
  {
    name: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/feed/',
    color: 'cyan',
    defaultCat: 'research',
    short: 'MIT'
  },
  {
    name: 'Wired AI',
    url: 'https://www.wired.com/feed/category/artificial-intelligence/latest/rss',
    color: 'purple',
    defaultCat: 'tools',
    short: 'Wired'
  },
  {
    name: 'The Verge AI',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    color: 'cyan',
    defaultCat: 'business',
    short: 'Verge'
  },
  {
    name: 'Ars Technica AI',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    color: 'purple',
    defaultCat: 'research',
    short: 'ArsTech'
  },
  {
    name: 'AI News',
    url: 'https://www.artificialintelligence-news.com/feed/',
    color: 'cyan',
    defaultCat: 'llm',
    short: 'AI-News'
  },
  {
    name: 'Import AI',
    url: 'https://importai.substack.com/feed',
    color: 'purple',
    defaultCat: 'research',
    short: 'ImportAI'
  },
];

// ── KEYWORDS FOR CATEGORY DETECTION ──────────────────────────────────────────
const CAT_KEYWORDS = {
  llm: ['gpt', 'llm', 'claude', 'gemini', 'llama', 'mistral', 'language model', 'chatgpt', 'openai', 'anthropic', 'transformer', 'token', 'prompt', 'fine-tun'],
  research: ['research', 'paper', 'study', 'arxiv', 'deepmind', 'lab', 'university', 'algorithm', 'dataset', 'benchmark', 'neural'],
  business: ['funding', 'startup', 'billion', 'investment', 'valuation', 'ipo', 'revenue', 'company', 'enterprise', 'deal', 'market'],
  ethics: ['ethic', 'bias', 'safe', 'regulation', 'policy', 'copyright', 'deepfake', 'misinformation', 'privacy', 'risk', 'ban', 'law'],
  tools: ['tool', 'app', 'platform', 'software', 'api', 'plugin', 'launch', 'release', 'product', 'feature', 'update', 'version'],
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let allArticles = [];
let filteredArticles = [];
let displayedCount = 0;
let currentCategory = 'all';
let refreshTimer = null;
let countdownTimer = null;
let secondsLeft = 3600;
let isLoading = false;

// ── DOM ELEMENTS ─────────────────────────────────────────────────────────────
const grid = document.getElementById('news-grid');
const loadingState = document.getElementById('loading-state');
const featuredSection = document.getElementById('featured-section');
const featuredCard = document.getElementById('featured-card');
const countdownEl = document.getElementById('countdown');
const statusDot = document.getElementById('status-dot');
const btnRefresh = document.getElementById('btn-refresh');
const refreshIcon = document.getElementById('refresh-icon');
const loadMoreWrapper = document.getElementById('load-more-wrapper');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const statTotal = document.getElementById('stat-total');
const statSources = document.getElementById('stat-sources');
const statLastUpdate = document.getElementById('stat-last-update');
const tickerContent = document.getElementById('ticker-content');
const toast = document.getElementById('toast');

// ── UTILITY ──────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return 'Date inconnue';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
    if (diff < 172800) return 'Hier';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  } catch { return dateStr; }
}

function detectCategory(title, desc) {
  const text = ((title || '') + ' ' + (desc || '')).toLowerCase();
  for (const [cat, keywords] of Object.entries(CAT_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return cat;
  }
  return 'tools';
}

function catLabel(cat) {
  const labels = { llm: 'LLM', research: 'Recherche', business: 'Business', ethics: 'Éthique', tools: 'Outils' };
  return labels[cat] || 'Tech';
}

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

function formatCountdown(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function setStatusLoading() {
  statusDot.className = 'status-dot loading';
  btnRefresh.classList.add('spinning');
}
function setStatusOk() {
  statusDot.className = 'status-dot';
  btnRefresh.classList.remove('spinning');
}
function setStatusError() {
  statusDot.className = 'status-dot error';
  btnRefresh.classList.remove('spinning');
}

// ── FETCH VIA RSS2JSON ────────────────────────────────────────────────────────
async function fetchFeedViaRss2Json(feedUrl) {
  const url = CONFIG.RSS2JSON_API + encodeURIComponent(feedUrl)
    + (CONFIG.RSS2JSON_KEY ? `&api_key=${CONFIG.RSS2JSON_KEY}` : '')
    + '&count=15';
  const res = await fetch(url);
  if (!res.ok) throw new Error('rss2json network error');
  const data = await res.json();
  if (data.status !== 'ok') throw new Error('rss2json status not ok');
  return data.items || [];
}

// ── PARSE FEED ITEMS ──────────────────────────────────────────────────────────
function parseFeedItems(items, feed) {
  return items.map(item => {
    const title = stripHtml(item.title) || 'Sans titre';
    const desc = stripHtml(item.description || item.content) || '';
    const cat = detectCategory(title, desc);
    return {
      id: item.guid || item.link || title,
      title: truncate(title, 120),
      description: truncate(desc, 220),
      link: item.link || '#',
      source: feed.name,
      short: feed.short,
      date: item.pubDate || item.published || '',
      category: cat,
      image: item.thumbnail || item.enclosure?.link || null,
    };
  });
}

// ── FETCH ALL FEEDS ───────────────────────────────────────────────────────────
async function fetchAllFeeds() {
  if (isLoading) return;
  isLoading = true;
  setStatusLoading();

  const results = await Promise.allSettled(
    FEEDS.map(feed => fetchFeedViaRss2Json(feed.url).then(items => ({ feed, items })))
  );

  const articles = [];
  let successCount = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { feed, items } = result.value;
      const parsed = parseFeedItems(items, feed);
      articles.push(...parsed);
      successCount++;
    }
  }

  // De-duplicate by link
  const seen = new Set();
  const unique = articles.filter(a => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  // Sort by date desc
  unique.sort((a, b) => {
    const da = new Date(a.date || 0);
    const db = new Date(b.date || 0);
    return db - da;
  });

  allArticles = unique;
  isLoading = false;

  if (allArticles.length === 0) {
    setStatusError();
    renderError();
    return;
  }

  setStatusOk();
  updateStats(successCount);
  updateTicker();
  applyFiltersAndRender();
  showToast(`✅ ${allArticles.length} articles chargés depuis ${successCount} sources`);

  // Reset countdown
  secondsLeft = 3600;
}

// ── STATS ─────────────────────────────────────────────────────────────────────
function updateStats(sourceCount) {
  statTotal.textContent = allArticles.length;
  statSources.textContent = sourceCount;
  const now = new Date();
  statLastUpdate.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ── TICKER ────────────────────────────────────────────────────────────────────
function updateTicker() {
  if (allArticles.length === 0) return;
  const headlines = allArticles.slice(0, 12).map(a => `◆ ${a.title}`).join('  ·  ');
  tickerContent.textContent = headlines + '  ·  ';
}

// ── FILTER & RENDER ───────────────────────────────────────────────────────────
function applyFiltersAndRender() {
  const query = searchInput.value.trim().toLowerCase();
  filteredArticles = allArticles.filter(a => {
    const matchCat = currentCategory === 'all' || a.category === currentCategory;
    const matchSearch = !query || a.title.toLowerCase().includes(query) || a.description.toLowerCase().includes(query);
    return matchCat && matchSearch;
  });

  displayedCount = 0;
  // Clear grid (keep loading state hidden)
  loadingState.style.display = 'none';

  // Remove existing cards
  Array.from(grid.querySelectorAll('.news-card, .featured-card-wrap, .empty-state, .error-state'))
    .forEach(el => el.remove());

  if (filteredArticles.length === 0) {
    renderEmpty();
    loadMoreWrapper.style.display = 'none';
    featuredSection.style.display = 'none';
    return;
  }

  // Featured (first article)
  const featured = filteredArticles[0];
  renderFeatured(featured);

  // Grid starts from index 1
  displayedCount = 0;
  loadMore();
}

// ── FEATURED CARD ─────────────────────────────────────────────────────────────
function renderFeatured(art) {
  featuredSection.style.display = 'block';
  const cat = art.category;
  featuredCard.innerHTML = `
    <a href="${art.link}" target="_blank" rel="noopener noreferrer" class="featured-card" id="featured-link">
      <div class="featured-content">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span class="featured-badge">⚡ À la Une</span>
          <span class="card-category cat-${cat}">${catLabel(cat)}</span>
        </div>
        <h2 class="featured-title">${art.title}</h2>
        <p class="featured-desc">${art.description || 'Cliquez pour lire l\'article complet.'}</p>
        <div class="featured-meta">
          <span class="featured-source-tag">${art.source}</span>
          <span class="featured-date">${formatDate(art.date)}</span>
          <button class="featured-read-btn">Lire l'article →</button>
        </div>
      </div>
    </a>
  `;
}

// ── NEWS CARD ─────────────────────────────────────────────────────────────────
function renderCard(art, delay = 0) {
  const cat = art.category;
  const el = document.createElement('a');
  el.className = 'news-card';
  el.href = art.link;
  el.target = '_blank';
  el.rel = 'noopener noreferrer';
  el.style.animationDelay = `${delay}ms`;
  el.innerHTML = `
    <div class="card-header">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="card-source">${art.short || art.source}</span>
        <span class="card-category cat-${cat}">${catLabel(cat)}</span>
      </div>
    </div>
    <h3 class="card-title">${art.title}</h3>
    ${art.description ? `<p class="card-desc">${art.description}</p>` : ''}
    <div class="card-footer">
      <span class="card-date">${formatDate(art.date)}</span>
      <div class="card-arrow">↗</div>
    </div>
  `;
  grid.appendChild(el);
}

// ── LOAD MORE ─────────────────────────────────────────────────────────────────
function loadMore() {
  // Skip index 0 (featured)
  const start = displayedCount + 1;
  const end = Math.min(start + CONFIG.ARTICLES_PER_PAGE, filteredArticles.length);

  for (let i = start; i < end; i++) {
    renderCard(filteredArticles[i], (i - start) * 40);
  }
  displayedCount = end - 1;

  const hasMore = end < filteredArticles.length;
  loadMoreWrapper.style.display = hasMore ? 'block' : 'none';
}

// ── EMPTY / ERROR STATES ─────────────────────────────────────────────────────
function renderEmpty() {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = `<span>🔍</span><p>Aucun article trouvé pour cette recherche.</p>`;
  grid.appendChild(el);
}

function renderError() {
  loadingState.style.display = 'none';
  featuredSection.style.display = 'none';
  loadMoreWrapper.style.display = 'none';
  Array.from(grid.querySelectorAll('.news-card, .empty-state, .error-state')).forEach(el => el.remove());
  const el = document.createElement('div');
  el.className = 'error-state';
  el.innerHTML = `
    <span class="error-emoji">📡</span>
    <h3 class="error-title">Impossible de charger les actualités</h3>
    <p class="error-msg">
      Les flux RSS sont bloqués par des restrictions CORS dans votre navigateur.<br>
      Essayez d'ouvrir le site via un serveur local (ex : <code>npx serve .</code>)<br>
      ou utilisez l'extension <strong>Allow CORS</strong> dans votre navigateur.
    </p>
    <button class="error-btn-retry" onclick="manualRefresh()">🔄 Réessayer</button>
  `;
  grid.appendChild(el);
}

// ── SEARCH & FILTERS ─────────────────────────────────────────────────────────
window.filterArticles = function () {
  searchClear.style.display = searchInput.value ? 'block' : 'none';
  applyFiltersAndRender();
};

window.clearSearch = function () {
  searchInput.value = '';
  searchClear.style.display = 'none';
  applyFiltersAndRender();
};

window.setCategory = function (btn, cat) {
  currentCategory = cat;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFiltersAndRender();
};

// ── MANUAL REFRESH ────────────────────────────────────────────────────────────
window.manualRefresh = async function () {
  await fetchAllFeeds();
};

// ── COUNTDOWN TIMER ───────────────────────────────────────────────────────────
function startCountdown() {
  clearInterval(countdownTimer);
  secondsLeft = 3600;
  countdownTimer = setInterval(() => {
    secondsLeft--;
    countdownEl.textContent = formatCountdown(Math.max(0, secondsLeft));
    if (secondsLeft <= 0) {
      secondsLeft = 3600;
    }
  }, 1000);
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    fetchAllFeeds();
    startCountdown();
  }, CONFIG.REFRESH_INTERVAL_MS);
}

// ── INIT ─────────────────────────────────────────────────────────────────────
(async function init() {
  startCountdown();
  startAutoRefresh();

  // Show loading skeletons
  loadingState.style.display = 'contents';
  featuredSection.style.display = 'none';
  loadMoreWrapper.style.display = 'none';

  await fetchAllFeeds();
})();
