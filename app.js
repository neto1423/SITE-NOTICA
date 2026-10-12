const STORAGE_KEYS = {
  sources: 'giro360-sources',
  statuses: 'giro360-news-statuses',
  savedStories: 'giro360-saved-stories',
  pushEnabled: 'giro360-push-enabled',
};

const OFFICIAL_SOCIAL_PROFILES = [
  {
    id: 'official-instagram-tnh1',
    type: 'instagram',
    value: '@tnh1oficial',
    profileUrl: 'https://www.instagram.com/tnh1oficial/',
    publisher: 'TNH1',
    monitored: false,
  },
  {
    id: 'official-instagram-gazetaweb',
    type: 'instagram',
    value: '@gazetaweb',
    profileUrl: 'https://www.instagram.com/gazetaweb/',
    publisher: 'GazetaWeb',
    monitored: false,
  },
  {
    id: 'official-tiktok-gazetaweb',
    type: 'tiktok',
    value: '@gazetaweb',
    profileUrl: 'https://www.tiktok.com/@gazetaweb',
    publisher: 'GazetaWeb',
    monitored: false,
  },
  {
    id: 'official-instagram-alagoas24horas',
    type: 'instagram',
    value: '@alagoas24horasoficial',
    profileUrl: 'https://www.instagram.com/alagoas24horasoficial/',
    publisher: 'Alagoas 24 Horas',
    monitored: false,
  },
  {
    id: 'official-instagram-cadaminuto',
    type: 'instagram',
    value: '@portalcadamin',
    profileUrl: 'https://www.instagram.com/portalcadamin/',
    publisher: 'CadaMinuto',
    monitored: false,
  },
  {
    id: 'official-tiktok-cadaminuto',
    type: 'tiktok',
    value: '@portalcadaminuto',
    profileUrl: 'https://www.tiktok.com/@portalcadaminuto',
    publisher: 'CadaMinuto',
    monitored: false,
  },
  {
    id: 'official-instagram-cnnbrasil',
    type: 'instagram',
    value: '@cnnbrasil',
    profileUrl: 'https://www.instagram.com/cnnbrasil/',
    publisher: 'CNN Brasil',
    monitored: false,
  },
  {
    id: 'official-tiktok-cnnbrasil',
    type: 'tiktok',
    value: '@cnnbrasil',
    profileUrl: 'https://www.tiktok.com/@cnnbrasil',
    publisher: 'CNN Brasil',
    monitored: false,
  },
  {
    id: 'official-instagram-folha',
    type: 'instagram',
    value: '@folhadespaulo',
    profileUrl: 'https://www.instagram.com/folhadespaulo/',
    publisher: 'Folha de S.Paulo',
    monitored: false,
  },
  {
    id: 'official-instagram-poder360',
    type: 'instagram',
    value: '@poder360',
    profileUrl: 'https://www.instagram.com/poder360/',
    publisher: 'Poder360',
    monitored: false,
  },
  {
    id: 'official-tiktok-poder360',
    type: 'tiktok',
    value: '@poder360',
    profileUrl: 'https://www.tiktok.com/@poder360',
    publisher: 'Poder360',
    monitored: false,
  },
];

const POLL_INTERVAL_MS = 60_000;
let newsItems = [];
let publisherVideos = [];
let feedSources = [];
let videoPlaylist = [];
let activeVideoIndex = 0;
let videoSwipeStartY = null;
let renderedVideoSignature = '';
let activeArticlePreviewRequest = 0;
let staticSnapshotMode = false;
let newsRefreshIntervalMs = POLL_INTERVAL_MS;
const reservedInstagramPaths = new Set([
  'about',
  'accounts',
  'developer',
  'direct',
  'explore',
  'p',
  'reel',
  'reels',
  'stories',
  'tv',
]);

function getStoredData(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getLocalSources() {
  return getStoredData(STORAGE_KEYS.sources, []);
}

function seedOfficialSocialProfiles() {
  const seedVersion = '2026-10-12';
  if (localStorage.getItem('giro360-social-profiles-seed') === seedVersion) return;

  const sources = getLocalSources();
  const existingKeys = new Set(
    sources.map(
      (source) => `${source.type}:${source.value.toLocaleLowerCase('pt-BR')}`,
    ),
  );
  const profilesToAdd = OFFICIAL_SOCIAL_PROFILES.filter((profile) => {
    const key = `${profile.type}:${profile.value.toLocaleLowerCase('pt-BR')}`;
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
  if (profilesToAdd.length) {
    saveData(STORAGE_KEYS.sources, [...sources, ...profilesToAdd]);
  }
  localStorage.setItem('giro360-social-profiles-seed', seedVersion);
}

function normalizeSavedSource(type, rawValue) {
  const value = rawValue.trim();
  if (!value) throw new Error('item vazio');

  if (type === 'instagram' || type === 'tiktok') {
    const host = type === 'instagram' ? 'instagram.com' : 'tiktok.com';
    let username = value;
    if (!value.startsWith('@')) {
      const profileUrl = new URL(
        /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
      );
      if (
        profileUrl.protocol !== 'https:' ||
        (profileUrl.hostname !== host && profileUrl.hostname !== `www.${host}`)
      ) {
        throw new Error(`informe um @ ou link de perfil do ${type}`);
      }
      username =
        type === 'instagram'
          ? profileUrl.pathname.split('/').filter(Boolean)[0] || ''
          : profileUrl.pathname.match(/^\/@([^/]+)/)?.[1] || '';
    }

    username = username.replace(/^@/, '');
    const usernamePattern =
      type === 'instagram' ? /^[A-Za-z0-9._]{1,30}$/ : /^[A-Za-z0-9._]{2,24}$/;
    if (!usernamePattern.test(username)) {
      throw new Error(`perfil do ${type} inválido`);
    }
    if (
      type === 'instagram' &&
      reservedInstagramPaths.has(username.toLocaleLowerCase('pt-BR'))
    ) {
      throw new Error('informe o link do perfil, não o de uma publicação');
    }

    return {
      type,
      value: `@${username}`,
      profileUrl: `https://www.${host}/${type === 'tiktok' ? '@' : ''}${encodeURIComponent(username)}/`,
      monitored: false,
    };
  }

  const sourceUrl = new URL(
    /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
  );
  if (
    sourceUrl.protocol !== 'https:' ||
    sourceUrl.username ||
    sourceUrl.password
  ) {
    throw new Error('use um endereço HTTPS público');
  }

  return {
    type,
    value: sourceUrl.href,
    profileUrl: sourceUrl.href,
    monitored: false,
  };
}

function getStatuses() {
  return getStoredData(STORAGE_KEYS.statuses, {});
}

function getStatus(story) {
  return getStatuses()[story.id] || 'new';
}

function getSavedStories() {
  return getStoredData(STORAGE_KEYS.savedStories, []);
}

function isStorySaved(story) {
  return getSavedStories().includes(story.id);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : '';
  } catch {
    return '';
  }
}

function safeVideoEmbedUrl(value) {
  const safeUrl = safeHttpUrl(value);
  if (!safeUrl) return '';
  try {
    const url = new URL(safeUrl);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return '';
    const allowed = [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com',
      'player.vimeo.com',
      'dailymotion.com',
      'www.dailymotion.com',
      'geo.dailymotion.com',
    ].includes(hostname);
    return allowed ? url.href : '';
  } catch {
    return '';
  }
}

function videoFeedSource(story) {
  if (story.videoProvider === 'globo' && /^\d{5,20}$/.test(story.videoId || '')) {
    return `globo:${story.videoId}`;
  }
  return safeVideoEmbedUrl(story.videoEmbedUrl) || safeHttpUrl(story.videoUrl);
}

function isG1Video(story) {
  if (
    story.videoProvider === 'globo' ||
    String(story.source || '').trim().toLocaleLowerCase('pt-BR') === 'g1'
  ) {
    return true;
  }
  return [story.videoEmbedUrl, story.videoUrl].some((value) => {
    const safeUrl = safeHttpUrl(value);
    if (!safeUrl) return false;
    try {
      return new URL(safeUrl).hostname.toLocaleLowerCase('pt-BR') === 'g1.globo.com';
    } catch {
      return false;
    }
  });
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data não informada'
    : new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

function whatsappLink(story) {
  const url = safeHttpUrl(story.url);
  if (!url) return '';
  const imageUrl = safeHttpUrl(story.imageUrl);
  const message = [
    story.title,
    '',
    `🔗 Link da notícia: ${url}`,
    imageUrl ? `🖼️ Imagem oficial: ${imageUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function renderNewsCard(story, zoneFeed = false) {
  const imageUrl = safeHttpUrl(story.imageUrl);
  const videoUrl = safeHttpUrl(story.videoUrl);
  const embedUrl = safeVideoEmbedUrl(story.videoEmbedUrl);
  const media = embedUrl
    ? `<iframe class="story-media story-video-embed" src="${escapeHtml(embedUrl)}" title="${escapeHtml(story.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`
    : videoUrl
    ? `<video class="story-media" src="${escapeHtml(videoUrl)}" poster="${escapeHtml(imageUrl)}" controls playsinline preload="metadata">Seu navegador não reproduz este vídeo.</video>`
    : imageUrl
      ? `<img class="story-media" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />`
      : '<div class="story-media media-unavailable">Esta publicação não trouxe uma imagem no feed do portal.</div>';
  if (zoneFeed) {
    return `
      <article class="zone-post">
        ${media}
        <div class="zone-post-body">
          <p class="story-source">${escapeHtml(story.source)} · publicado ${escapeHtml(formatDate(story.publishedAt))}</p>
          <button class="headline-button" type="button" data-open-story="${escapeHtml(story.id)}">${escapeHtml(story.title)}</button>
        </div>
      </article>`;
  }

  return `
    <article class="news-card">
      ${imageUrl ? `<button class="news-image-button" type="button" data-open-story="${escapeHtml(story.id)}" aria-label="Abrir notícia: ${escapeHtml(story.title)}"><img class="thumb" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" /></button>` : '<div class="thumb media-unavailable">Sem imagem</div>'}
      <div class="news-card-content">
        <button class="headline-button" type="button" data-open-story="${escapeHtml(story.id)}">${escapeHtml(story.title)}</button>
        <div class="news-meta">
          <span>${escapeHtml(story.source)}</span>
          <time datetime="${escapeHtml(story.publishedAt)}">Publicado ${escapeHtml(formatDate(story.publishedAt))}</time>
        </div>
      </div>
    </article>`;
}

function renderNews() {
  const list = document.getElementById('newsList');
  if (!list) return;

  const activeFilter =
    document.querySelector('.tab.active')?.dataset.filter || 'all';
  const searchTerm = normalizeText(
    document.getElementById('newsSearch')?.value || '',
  );
  const filtered = newsItems.filter((story) => {
    if (activeFilter === 'saved' && !isStorySaved(story)) return false;
    if (
      activeFilter !== 'all' &&
      activeFilter !== 'saved' &&
      getStatus(story) !== activeFilter
    ) {
      return false;
    }
    if (
      searchTerm &&
      !normalizeText(`${story.title} ${story.source} ${story.description}`).includes(
        searchTerm,
      )
    ) {
      return false;
    }
    return true;
  }).sort((first, second) => {
    const publishedDifference =
      Date.parse(second.publishedAt) - Date.parse(first.publishedAt);
    return Number.isNaN(publishedDifference)
      ? Date.parse(second.receivedAt) - Date.parse(first.receivedAt)
      : publishedDifference;
  });

  list.innerHTML = filtered.length
    ? filtered.map((story) => renderNewsCard(story)).join('')
    : '<div class="empty">Nenhuma notícia deste filtro foi recebida dos portais.</div>';
}

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function renderZoneFeed() {
  const feed = document.getElementById('zoneFeed');
  if (!feed) return;
  const zoneStories = newsItems.filter((story) => story.isZoneMata);

  feed.innerHTML = zoneStories.length
    ? zoneStories.map((story) => renderNewsCard(story, true)).join('')
    : '<div class="empty">Ainda não chegaram notícias dos portais sobre os municípios da Zona da Mata. O feed será atualizado automaticamente a cada minuto.</div>';
}

function renderVideoFeed() {
  const feed = document.getElementById('videoFeed');
  if (!feed) return;
  const videoByUrl = new Map();
  [...publisherVideos, ...newsItems].forEach((story) => {
    if (isG1Video(story)) return;
    const url = videoFeedSource(story);
    if (!url) return;
    if (!videoByUrl.has(url)) videoByUrl.set(url, story);
  });
  const videos = [...videoByUrl.values()];
  videos.sort(
    (first, second) =>
      new Date(second.publishedAt).getTime() -
      new Date(first.publishedAt).getTime(),
  );
  const scan = window.videoScanStatus;
  const signature = JSON.stringify(
    videos.map((story) => [
      videoFeedSource(story),
      story.title,
      story.videoOrientation,
    ]),
  );
  if (videos.length && signature === renderedVideoSignature) return;

  const activeVideoKey = videoPlaylist[activeVideoIndex]
    ? videoFeedSource(videoPlaylist[activeVideoIndex])
    : '';
  videoPlaylist = videos;
  activeVideoIndex = Math.max(
    0,
    videos.findIndex((story) => videoFeedSource(story) === activeVideoKey),
  );
  feed.innerHTML = videos.length
    ? renderVideoPlayer(videos[activeVideoIndex], activeVideoIndex, videos.length)
    : `<div class="empty">${scan?.pendingStories ? `Procurando vídeos incorporados nas matérias dos portais. ${scan.scannedStories} tentativa(s) concluída(s); ${scan.pendingStories} matéria(s) na fila. A varredura respeita os limites de acesso e pode levar algum tempo.` : 'Nenhum vídeo incorporado foi encontrado nas matérias disponíveis. A varredura dos portais continua a cada minuto.'}</div>`;
  renderedVideoSignature = signature;
}

function renderVideoPlayer(story, index, total) {
  const embedUrl = safeVideoEmbedUrl(story.videoEmbedUrl);
  const videoUrl = safeHttpUrl(story.videoUrl);
  const isGloboVideo = story.videoProvider === 'globo';
  const hasPlayableSource = Boolean(isGloboVideo || embedUrl || videoUrl);
  const player = isGloboVideo
    ? `<div class="video-unavailable">${safeHttpUrl(story.imageUrl) ? `<img src="${escapeHtml(safeHttpUrl(story.imageUrl))}" alt="" />` : ''}<span>O g1 exige o player oficial e não permite incorporar este vídeo no GIRO 360.</span></div>`
    : embedUrl
    ? `<iframe class="video-player" src="${escapeHtml(embedUrl)}" title="${escapeHtml(story.title)}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`
    : videoUrl
      ? `<video class="video-player" src="${escapeHtml(videoUrl)}" poster="${escapeHtml(safeHttpUrl(story.imageUrl))}" controls playsinline preload="metadata">Seu navegador não reproduz este vídeo.</video>`
      : `<div class="video-unavailable">${safeHttpUrl(story.imageUrl) ? `<img src="${escapeHtml(safeHttpUrl(story.imageUrl))}" alt="" />` : ''}<span>O portal não disponibilizou um player incorporável para este vídeo.</span></div>`;
  const orientation =
    story.videoOrientation === 'vertical' ? 'vertical' : 'horizontal';

  return `
    <article class="video-post video-post-${orientation}" aria-label="Vídeo ${index + 1} de ${total}">
      <div class="video-player-frame">${player}</div>
      <div class="video-post-body">
        <p class="story-source">${escapeHtml(story.source)} · ${orientation === 'vertical' ? 'Vertical' : 'Horizontal'} · <span aria-live="polite">${index + 1} / ${total}</span></p>
        <h3>${escapeHtml(story.title)}</h3>
        ${hasPlayableSource && safeHttpUrl(story.url) ? `<a class="action-pill" href="${escapeHtml(safeHttpUrl(story.url))}" target="_blank" rel="noopener noreferrer">${isGloboVideo ? 'Assistir no site oficial do g1' : 'Abrir no portal original'}</a>` : ''}
      </div>
      <nav class="video-player-navigation" aria-label="Navegação da playlist">
        <button class="video-navigation-button" type="button" data-video-step="-1" aria-label="Vídeo anterior"${index === 0 ? ' disabled' : ''}>↑</button>
        <button class="video-navigation-button" type="button" data-video-step="1" aria-label="Próximo vídeo"${index === total - 1 ? ' disabled' : ''}>↓</button>
      </nav>
    </article>`;
}

function selectVideo(index) {
  if (index < 0 || index >= videoPlaylist.length || index === activeVideoIndex) return;
  activeVideoIndex = index;
  const feed = document.getElementById('videoFeed');
  if (feed) {
    feed.innerHTML = renderVideoPlayer(
      videoPlaylist[activeVideoIndex],
      activeVideoIndex,
      videoPlaylist.length,
    );
  }
}

function renderPortalProfiles() {
  const profiles = document.getElementById('portalProfiles');
  if (!profiles) return;
  profiles.innerHTML = feedSources
    .map((source) => {
      const count = newsItems.filter((story) => story.source === source.name).length;
      let faviconUrl = '';
      let faviconFallbackUrl = '';
      try {
        const sourceUrl = new URL(source.siteUrl || source.url);
        faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(sourceUrl.hostname)}&sz=128`;
        faviconFallbackUrl = `${sourceUrl.origin}/favicon.ico`;
      } catch {
        faviconUrl = '';
      }
      return `
        <button class="portal-profile" type="button" data-portal-profile="${escapeHtml(source.name)}">
          <span class="portal-avatar" aria-hidden="true">
            <span class="portal-avatar-fallback">${escapeHtml(source.name.slice(0, 1))}</span>
            ${faviconUrl ? `<img class="portal-avatar-image" src="${escapeHtml(faviconUrl)}" data-fallback="${escapeHtml(faviconFallbackUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=''}else{this.hidden=true}" />` : ''}
          </span>
          <span class="portal-profile-copy">
            <strong>${escapeHtml(source.name)}</strong>
            <small>${escapeHtml(source.region)} · ${count} notícias</small>
          </span>
        </button>`;
    })
    .join('');
}

function renderPortalStories(sourceName) {
  const list = document.getElementById('portalStories');
  if (!list) return;
  const stories = newsItems.filter((story) => story.source === sourceName);
  list.innerHTML = stories.length
    ? `<h3 class="portal-stories-title">${escapeHtml(sourceName)} · ${stories.length} notícias</h3>${stories.map((story) => renderNewsCard(story)).join('')}`
    : '<div class="empty">Nenhuma notícia recebida deste portal ainda.</div>';
}

function renderNotifications() {
  const badges = document.querySelectorAll('#notificationsBadge');
  const list = document.getElementById('notificationList');
  const items = newsItems.filter((story) => getStatus(story) === 'new');
  const zoneBadge = document.getElementById('zoneNotificationsBadge');
  if (zoneBadge) {
    const zoneUnreadCount = items.filter((story) => story.isZoneMata).length;
    zoneBadge.textContent = String(zoneUnreadCount);
    zoneBadge.classList.toggle('empty', zoneUnreadCount === 0);
  }

  badges.forEach((badge) => {
    badge.textContent = String(items.length);
    badge.style.display = items.length ? 'inline-flex' : 'none';
  });

  if (!list) return;
  list.innerHTML = items.length
    ? items
        .slice(0, 8)
        .map(
          (story) => `
            <li class="notification-item">
              <span class="notification-dot"></span>
              <div>
                <strong>${escapeHtml(story.source)}</strong>
                <span>${escapeHtml(story.title)}</span>
              </div>
            </li>`,
        )
        .join('')
    : '<li class="empty">Nenhuma notícia nova.</li>';
}

function renderSyncStatus(data, error = '') {
  const status = document.getElementById('syncStatus');
  if (!status) return;

  if (error) {
    const connectionError = isConnectionError(new Error(error));
    status.textContent = connectionError
      ? 'Não foi possível conectar ao servidor do GIRO 360. Verifique se o servidor está ligado e tente novamente.'
      : `Não foi possível atualizar as notícias: ${error}`;
    status.classList.add('sync-error');
    return;
  }

  const checkedFeeds = (data.feeds || []).filter((feed) => !feed.error).length;
  const totalFeeds = (data.feeds || []).length;
  const errors = (data.feeds || []).filter((feed) => feed.error).length;
  const updatedAt = (staticSnapshotMode ? data.generatedAt : data.updatedAt)
    ? new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(staticSnapshotMode ? data.generatedAt : data.updatedAt))
    : 'aguardando';

  status.textContent = staticSnapshotMode
    ? `${checkedFeeds}/${totalFeeds} portais consultados · snapshot do GitHub atualizado ${updatedAt} · publicação automática a cada 15 minutos`
    : `${checkedFeeds}/${totalFeeds} portais consultados · última verificação ${updatedAt}${errors ? ` · ${errors} fonte(s) indisponível(is)` : ''} · atualização a cada minuto`;
  status.classList.toggle('sync-error', checkedFeeds === 0);
}

async function fetchStaticNewsData() {
  const dataUrl = new URL('news-data.json', document.baseURI);
  const response = await fetch(dataUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`snapshot respondeu ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.news) || !Array.isArray(data.feeds)) {
    throw new Error('snapshot de notícias inválido');
  }
  return data;
}

async function refreshNews() {
  let data;
  try {
    const response = await fetch('/api/news', { cache: 'no-store' });
    if (!response.ok) {
      if (response.status !== 404) throw new Error(`servidor respondeu ${response.status}`);
      data = await fetchStaticNewsData();
      staticSnapshotMode = true;
      newsRefreshIntervalMs =
        data.pollingIntervalMs || 15 * 60 * 1000;
    } else {
      data = await response.json();
      staticSnapshotMode = Boolean(data.staticSnapshot);
      newsRefreshIntervalMs = staticSnapshotMode
        ? data.pollingIntervalMs || 15 * 60 * 1000
        : POLL_INTERVAL_MS;
    }
  } catch (error) {
    if (!staticSnapshotMode && !(error instanceof TypeError)) throw error;
    data = await fetchStaticNewsData();
    staticSnapshotMode = true;
    newsRefreshIntervalMs = data.pollingIntervalMs || 15 * 60 * 1000;
  }
  if (!Array.isArray(data.news)) throw new Error('resposta inválida do servidor');

  const selectedPortal =
    document.querySelector('[data-portal-profile].selected')?.dataset.portalProfile;
  newsItems = data.news;
  publisherVideos = Array.isArray(data.videos) ? data.videos : [];
  window.videoScanStatus = data.videoScan || null;
  renderNews();
  renderZoneFeed();
  renderVideoFeed();
  renderPortalProfiles();
  if (selectedPortal) {
    const selectedProfile = [...document.querySelectorAll('[data-portal-profile]')].find(
      (profile) => profile.dataset.portalProfile === selectedPortal,
    );
    selectedProfile?.classList.add('selected');
    renderPortalStories(selectedPortal);
  }
  renderNotifications();
  renderSyncStatus(data);
}

function renderSources() {
  const list = document.getElementById('sourcesList');
  if (!list) return;

  const portalItems = feedSources
    .map((source) => {
      const sourceUrl = safeHttpUrl(source.siteUrl || source.url);
      const state = source.error
        ? `Falha: ${source.error}`
        : source.lastCheckedAt
          ? staticSnapshotMode
            ? 'Incluído no snapshot periódico'
            : 'Monitorando'
          : 'Aguardando primeira consulta';
      return `
        <li class="source-item">
          <div class="label">
            <span class="kind">${escapeHtml(source.region)} · ${staticSnapshotMode ? 'RSS no GitHub Pages' : 'RSS monitorado'}</span>
            ${sourceUrl ? `<a class="value source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}</a>` : `<span class="value">${escapeHtml(source.name)}</span>`}
            ${source.custom ? `<small class="kind">Feed: ${escapeHtml(source.url)}</small>` : ''}
          </div>
          <span class="source-state${source.error ? ' source-state-error' : ''}">${escapeHtml(state)}</span>
          ${source.custom ? `<button class="action-pill" data-remove-monitored-source="${escapeHtml(source.id)}" type="button">Excluir</button>` : ''}
        </li>`;
    })
    .join('');
  const savedItems = getLocalSources()
    .map((source) => {
      const profileUrl = safeHttpUrl(source.profileUrl);
      const typeLabel = source.type === 'instagram'
        ? 'Instagram · atalho sem monitoramento'
        : source.type === 'tiktok'
          ? 'TikTok · atalho sem monitoramento'
          : source.type === 'rss'
            ? 'Feed RSS salvo · não monitorado'
            : 'Site salvo · não monitorado';
      return `
        <li class="source-item">
          <div class="label">
            <span class="kind">${escapeHtml(source.publisher ? `${source.publisher} · ${typeLabel}` : typeLabel)}</span>
            ${profileUrl ? `<a class="value source-link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.value)}</a>` : `<span class="value">${escapeHtml(source.value)}</span>`}
          </div>
          <button class="action-pill" data-remove-source="${escapeHtml(source.id)}" type="button">Excluir</button>
        </li>`;
    })
    .join('');

  list.innerHTML = portalItems + savedItems ||
    '<li class="empty">Nenhuma fonte disponível.</li>';
  renderPortalProfiles();
}

async function refreshSources() {
  const response = await fetch('/api/sources', { cache: 'no-store' });
  let data;
  if (!response.ok) {
    if (response.status !== 404) throw new Error(`servidor respondeu ${response.status}`);
    data = await fetchStaticNewsData();
    staticSnapshotMode = true;
    newsRefreshIntervalMs =
      data.pollingIntervalMs || 15 * 60 * 1000;
  } else {
    data = await response.json();
  }
  feedSources = Array.isArray(data.sources) ? data.sources : [];
  if (!feedSources.length && Array.isArray(data.feeds)) {
    feedSources = data.feeds;
  }
  renderSources();
}

function isConnectionError(error) {
  return (
    error instanceof TypeError ||
    ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'].includes(
      error.message,
    )
  );
}

function apiResponseError(response) {
  if (response.status === 404) {
    return new Error(
      'Esta função exige o servidor GIRO 360. No GitHub Pages, o site usa notícias pré-atualizadas automaticamente; para cadastrar fontes ou ativar notificações, use o servidor Node.',
    );
  }
  return new Error(`servidor respondeu ${response.status}`);
}

function toggleNotificationPanel(forceOpen) {
  const panel = document.getElementById('notificationPanel');
  if (!panel) return;
  const shouldOpen =
    typeof forceOpen === 'boolean'
      ? forceOpen
      : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !shouldOpen);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInstalledPwa() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true;
}

function renderPushState(message) {
  const button = document.getElementById('pushToggle');
  const status = document.getElementById('pushStatus');
  if (message && status) status.textContent = message;
  if (!button) return;

  const enabled = localStorage.getItem(STORAGE_KEYS.pushEnabled) === 'true';
  button.setAttribute('aria-pressed', String(enabled));
  button.textContent = enabled
    ? 'Desativar notificações'
    : 'Ativar notificações';
  button.classList.toggle('enabled', enabled);
}

async function enablePushNotifications() {
  const status = document.getElementById('pushStatus');
  if (staticSnapshotMode) {
    renderPushState('Notificações push exigem o servidor Node; o GitHub Pages publica apenas o snapshot das notícias.');
    return;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    renderPushState('Este navegador não oferece notificações push.');
    return;
  }

  if (isIosDevice() && !isInstalledPwa()) {
    renderPushState('No iPhone, primeiro use Compartilhar → Adicionar à Tela de Início; abra o ícone instalado e ative os alertas.');
    return;
  }

  if (!('Notification' in window)) {
    renderPushState('Este navegador não oferece notificações.');
    return;
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
  if (permission !== 'granted') {
    renderPushState('Permissão negada. Ative as notificações do GIRO 360 nos ajustes do navegador.');
    return;
  }

  const keyResponse = await fetch('/api/push/public-key', { cache: 'no-store' });
  if (!keyResponse.ok) throw new Error('Não foi possível obter a chave de notificações.');
  const keyData = await keyResponse.json();
  if (!keyData.enabled || !keyData.publicKey) {
    renderPushState('O servidor ainda não está configurado para Web Push.');
    return;
  }

  const registration = await navigator.serviceWorker.register('./service-worker.js', {
    scope: './',
  });
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
  });
  const saveResponse = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });

  if (!saveResponse.ok) {
    const error = await saveResponse.json();
    await subscription.unsubscribe();
    throw new Error(error.error || 'Não foi possível registrar este dispositivo.');
  }

  localStorage.setItem(STORAGE_KEYS.pushEnabled, 'true');
  renderPushState('Notificações ativadas. Novas notícias serão enviadas pelo servidor.');
}

async function disablePushNotifications() {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const response = await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    if (!response.ok) throw new Error('Não foi possível desativar as notificações no servidor.');
    await subscription.unsubscribe();
  }

  localStorage.setItem(STORAGE_KEYS.pushEnabled, 'false');
  renderPushState('Alertas do iPhone desativados.');
}

async function togglePushNotifications() {
  const button = document.getElementById('pushToggle');
  const enabled = localStorage.getItem(STORAGE_KEYS.pushEnabled) === 'true';
  if (button) button.disabled = true;
  try {
    if (enabled) {
      await disablePushNotifications();
    } else {
      await enablePushNotifications();
    }
  } catch (error) {
    renderPushState(`Erro ao alterar notificações: ${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

function changeView(viewName) {
  document.querySelectorAll('[data-view]:not([href])').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewName);
  });
  document.getElementById('newsView')?.classList.toggle('hidden', viewName !== 'news');
  document.getElementById('zoneView')?.classList.toggle('hidden', viewName !== 'zone');
  document.getElementById('videoView')?.classList.toggle('hidden', viewName !== 'videos');
  document.getElementById('sourceView')?.classList.toggle('hidden', viewName !== 'sources');
  if (viewName === 'sources') {
    refreshSources().catch((error) => {
      console.error('Source refresh failed:', error);
    });
  }
}

function attachEventHandlers() {
  document.getElementById('newsSearch')?.addEventListener('input', renderNews);

  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
      button.classList.add('active');
      renderNews();
    });
  });

  document.querySelectorAll('[data-view]:not([href])').forEach((button) => {
    button.addEventListener('click', () => changeView(button.dataset.view));
  });
  document.getElementById('videoFeed')?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const navigationButton = event.target.closest('[data-video-step]');
    if (!navigationButton) return;
    selectVideo(activeVideoIndex + Number(navigationButton.dataset.videoStep));
  });
  document.getElementById('videoFeed')?.addEventListener('touchstart', (event) => {
    if (event.touches.length === 1) {
      videoSwipeStartY = event.touches[0].clientY;
    }
  }, { passive: true });
  document.getElementById('videoFeed')?.addEventListener('touchend', (event) => {
    const startY = videoSwipeStartY;
    videoSwipeStartY = null;
    if (typeof startY !== 'number' || event.changedTouches.length !== 1) return;
    const distance = event.changedTouches[0].clientY - startY;
    if (Math.abs(distance) < 60) return;
    selectVideo(activeVideoIndex + (distance < 0 ? 1 : -1));
  }, { passive: true });

  document.querySelectorAll('#toggleNotifications').forEach((button) => {
    button.addEventListener('click', () => toggleNotificationPanel());
  });

  document.getElementById('closeNotifications')?.addEventListener('click', () =>
    toggleNotificationPanel(false),
  );
  document.getElementById('pushToggle')?.addEventListener('click', togglePushNotifications);
  document.getElementById('portalProfiles')?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const profile = event.target.closest('[data-portal-profile]');
    if (!profile) return;
    document.querySelectorAll('[data-portal-profile]').forEach((item) =>
      item.classList.toggle('selected', item === profile),
    );
    renderPortalStories(profile.dataset.portalProfile);
  });

  const sourceForm = document.getElementById('sourceForm');
  sourceForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('sourceInput');
    const status = document.getElementById('sourceFormStatus');
    const type =
      document.querySelector('.source-type.active')?.dataset.sourceType ||
      'instagram';
    const values = (input?.value || '')
      .split(/[,;\n]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!values.length) {
      input?.focus();
      if (status) {
        status.textContent = 'Digite pelo menos um perfil ou endereço.';
        status.classList.add('error');
      }
      return;
    }

    const sources = getLocalSources();
    const existingKeys = new Set(
      sources.map(
        (source) => `${source.type}:${source.value.toLocaleLowerCase('pt-BR')}`,
      ),
    );
    const added = [];
    const duplicates = [];
    const invalid = [];
    const serverSources = [];
    values.forEach((value) => {
      try {
        const normalized = normalizeSavedSource(type, value);
        const key = `${normalized.type}:${normalized.value.toLocaleLowerCase('pt-BR')}`;
        const existsOnServer = feedSources.some((source) =>
          [source.siteUrl, source.url]
            .filter(Boolean)
            .some((url) => url.toLocaleLowerCase('pt-BR') === normalized.value.toLocaleLowerCase('pt-BR')),
        );
        if (existingKeys.has(key) || existsOnServer) {
          duplicates.push(value);
          return;
        }
        existingKeys.add(key);
        if (type === 'site' || type === 'rss') {
          serverSources.push({ type, url: normalized.value, original: value });
        } else {
          added.push({ id: crypto.randomUUID(), ...normalized });
        }
      } catch (error) {
        invalid.push(`${value}: ${error.message}`);
      }
    });

    if (added.length) {
      saveData(STORAGE_KEYS.sources, [...sources, ...added]);
      renderSources();
    }

    if (serverSources.length) {
      const submitButton = sourceForm.querySelector('[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      if (status) {
        status.textContent = 'Conectando os sites ao monitoramento do servidor…';
        status.classList.remove('error');
      }
      try {
        const response = await fetch('/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sources: serverSources.map(({ type: sourceType, url }) => ({
              type: sourceType,
              url,
            })),
          }),
        });
        if (!response.ok) {
          throw apiResponseError(response);
        }
        const data = await response.json();
        data.results.forEach((result, index) => {
          if (result.added) added.push(result);
          else if (result.duplicate) duplicates.push(serverSources[index].original);
          else invalid.push(`${serverSources[index].original}: ${result.error}`);
        });
        await refreshSources();
        refreshNews().catch((error) => {
          console.error('News refresh after source registration failed:', error);
        });
      } catch (error) {
        const message = isConnectionError(error)
          ? 'não foi possível conectar ao servidor; confirme se o GIRO 360 está ligado'
          : error.message;
        serverSources.forEach(({ original }) => invalid.push(`${original}: ${message}`));
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    }

    if (status) {
      const messages = [];
      const registered = added.length;
      if (registered) messages.push(`${registered} fonte(s) adicionada(s) ao sistema.`);
      if (duplicates.length) messages.push(`${duplicates.length} duplicada(s).`);
      if (invalid.length) {
        messages.push(`Não adicionadas: ${invalid.slice(0, 3).join('; ')}${invalid.length > 3 ? `; e mais ${invalid.length - 3}` : ''}.`);
      }
      status.textContent = messages.join(' ') || 'Nenhuma fonte nova para adicionar.';
      status.classList.toggle('error', invalid.length > 0);
    }
    if (added.length) input.value = '';
  });

  document.querySelectorAll('.source-type').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.source-type').forEach((typeButton) =>
        typeButton.classList.remove('active'),
      );
      button.classList.add('active');
      const input = document.getElementById('sourceInput');
      const status = document.getElementById('sourceFormStatus');
      if (input) {
        const placeholders = {
          instagram: '@perfil1, @perfil2',
          tiktok: '@perfil1, @perfil2',
          site: 'https://portal.com, https://outro.com',
          rss: 'https://portal.com/feed/, https://www.youtube.com/feeds/videos.xml?channel_id=ID_DO_CANAL',
        };
        input.placeholder = placeholders[button.dataset.sourceType];
      }
      if (status) {
        status.textContent = '';
        status.classList.remove('error');
      }
    });
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const openStoryButton = event.target.closest('[data-open-story]');
    if (openStoryButton) {
      openStory(newsItems.find((story) => story.id === openStoryButton.dataset.openStory));
      return;
    }

    const markButton = event.target.closest('[data-mark-story]');
    if (markButton) {
      const statuses = getStatuses();
      statuses[markButton.dataset.markStory] = markButton.dataset.nextStatus;
      saveData(STORAGE_KEYS.statuses, statuses);
      renderNews();
      renderNotifications();
      const nextStatus = markButton.dataset.nextStatus === 'read' ? 'reviewed' : 'read';
      markButton.dataset.nextStatus = nextStatus;
      markButton.textContent = nextStatus === 'read' ? 'Marcar como lida' : 'Marcar para revisar';
      return;
    }

    const saveButton = event.target.closest('[data-save-story]');
    if (saveButton) {
      const id = saveButton.dataset.saveStory;
      const saved = new Set(getSavedStories());
      if (saved.has(id)) saved.delete(id);
      else saved.add(id);
      saveData(STORAGE_KEYS.savedStories, [...saved]);
      renderNews();
      renderZoneFeed();
      renderVideoFeed();
      const selectedPortal =
        document.querySelector('[data-portal-profile].selected')?.dataset.portalProfile;
      if (selectedPortal) renderPortalStories(selectedPortal);
      document
        .querySelectorAll('#storyDialog [data-save-story]')
        .forEach((button) => {
          if (button.dataset.saveStory === id) {
            button.textContent = isStorySaved({ id })
              ? 'Remover dos salvos'
              : 'Salvar notícia';
          }
        });
      return;
    }

    const removeButton = event.target.closest('[data-remove-source]');
    if (removeButton) {
      const nextSources = getLocalSources().filter(
        (source) => source.id !== removeButton.dataset.removeSource,
      );
      saveData(STORAGE_KEYS.sources, nextSources);
      renderSources();
      return;
    }

    const removeMonitoredButton = event.target.closest('[data-remove-monitored-source]');
    if (removeMonitoredButton) {
      removeMonitoredButton.disabled = true;
      fetch('/api/sources', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: removeMonitoredButton.dataset.removeMonitoredSource }),
      })
      .then(async (response) => {
        if (!response.ok) throw apiResponseError(response);
        await refreshSources();
          await refreshNews();
        })
        .catch((error) => {
          console.error('Monitored source removal failed:', error);
          removeMonitoredButton.disabled = false;
          const status = document.getElementById('sourceFormStatus');
          if (status) {
            status.textContent = `Erro ao excluir a fonte: ${error.message}`;
            status.classList.add('error');
          }
        });
    }
  });

  document.getElementById('closeStoryDialog')?.addEventListener('click', () => {
    document.getElementById('storyDialog')?.close();
  });
  document.getElementById('storyDialog')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
}

function openStory(story) {
  if (!story) return;
  const dialog = document.getElementById('storyDialog');
  const content = document.getElementById('storyDialogContent');
  const source = document.getElementById('storyDialogSource');
  if (!dialog || !content || !source) return;

  source.textContent = `${story.source} · chegou ${formatDate(story.receivedAt || story.publishedAt)}`;
  const status = getStatus(story);
  const hasFeedContent = Boolean(story.description?.trim());
  const videoEmbedUrl = safeVideoEmbedUrl(story.videoEmbedUrl);
  const previewRequest = ++activeArticlePreviewRequest;
  content.innerHTML = `
    <h2 id="storyDialogTitle">${escapeHtml(story.title)}</h2>
    ${story.imageUrl ? `<img class="dialog-story-image" src="${escapeHtml(safeHttpUrl(story.imageUrl))}" alt="" />` : ''}
    ${hasFeedContent ? `<p class="feed-attribution">Conteúdo disponibilizado no feed público de ${escapeHtml(story.source)}:</p><p class="dialog-story-description">${escapeHtml(story.description)}</p>` : `<p class="feed-attribution" data-article-preview-attribution>Buscando uma descrição pública de ${escapeHtml(story.source)}…</p><p class="dialog-story-description" data-article-preview-text>O feed não inclui o texto da matéria. Aguarde enquanto consultamos apenas o trecho de apresentação publicado pelo portal.</p>`}
    ${videoEmbedUrl ? `<iframe class="dialog-story-video story-video-embed" src="${escapeHtml(videoEmbedUrl)}" title="${escapeHtml(story.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>` : ''}
    ${story.videoUrl ? `<video class="dialog-story-video" src="${escapeHtml(safeHttpUrl(story.videoUrl))}" controls playsinline preload="metadata"></video>` : ''}
    <div class="dialog-story-actions">
      <button class="action-pill" type="button" data-mark-story="${escapeHtml(story.id)}" data-next-status="${status === 'new' ? 'read' : 'reviewed'}">${status === 'new' ? 'Marcar como lida' : 'Marcar para revisar'}</button>
      <button class="action-pill" type="button" data-save-story="${escapeHtml(story.id)}">${isStorySaved(story) ? 'Remover dos salvos' : 'Salvar notícia'}</button>
      ${whatsappLink(story) ? `<a class="whatsapp-button" href="${escapeHtml(whatsappLink(story))}" target="_blank" rel="noopener noreferrer">Enviar pelo WhatsApp</a>` : ''}
      ${safeHttpUrl(story.url) ? `<a class="action-pill" href="${escapeHtml(safeHttpUrl(story.url))}" target="_blank" rel="noopener noreferrer">Ver matéria original</a>` : ''}
    </div>`;
  if (!dialog.open) dialog.showModal();
  if (!hasFeedContent) {
    loadArticlePreview(story, content, previewRequest).catch((error) => {
      console.error('Unable to load article preview:', error);
      if (previewRequest !== activeArticlePreviewRequest) return;
      const attribution = content.querySelector('[data-article-preview-attribution]');
      const previewText = content.querySelector('[data-article-preview-text]');
      if (attribution) attribution.textContent = 'Prévia da matéria indisponível.';
      if (previewText) {
        previewText.textContent = `${error.message} O texto integral só pode ser exibido quando o portal o disponibiliza no feed ou autoriza seu uso.`;
      }
    });
  }
}

async function loadArticlePreview(story, content, requestId) {
  if (staticSnapshotMode) {
    throw new Error(
      'A prévia do portal exige o servidor Node; no GitHub Pages estático, só o texto publicado no RSS está disponível.',
    );
  }
  const articleUrl = safeHttpUrl(story.url);
  if (!articleUrl) throw new Error('O endereço desta matéria é inválido.');

  const response = await fetch(
    `/api/article-preview?url=${encodeURIComponent(articleUrl)}`,
    { cache: 'no-store' },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `servidor respondeu ${response.status}`);
  }
  if (
    requestId !== activeArticlePreviewRequest ||
    !document.getElementById('storyDialog')?.open
  ) {
    return;
  }

  const attribution = content.querySelector('[data-article-preview-attribution]');
  const previewText = content.querySelector('[data-article-preview-text]');
  if (attribution) {
    attribution.textContent = `Trecho de apresentação publicado por ${story.source}; o texto integral não está disponível no feed.`;
  }
  if (previewText) previewText.textContent = data.excerpt;
}

async function init() {
  seedOfficialSocialProfiles();
  attachEventHandlers();
  renderPushState(
    localStorage.getItem(STORAGE_KEYS.pushEnabled) === 'true'
      ? 'Notificações ativadas neste dispositivo.'
      : 'Alertas do iPhone desativados.',
  );

  try {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
    }
  } catch (error) {
    console.error('Service worker registration failed:', error);
  }

  await Promise.allSettled([refreshNews(), refreshSources()]).then((results) => {
    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.error('Initial data loading failed:', result.reason);
        renderSyncStatus(null, result.reason.message);
      }
    });
  });

  const notificationStoryId = new URLSearchParams(window.location.search).get('story');
  if (notificationStoryId) {
    const story = newsItems.find((item) => item.id === notificationStoryId);
    if (story) openStory(story);
  }

  const scheduleNewsRefresh = () => {
    setTimeout(async () => {
      try {
        await refreshNews();
      } catch (error) {
        console.error('Automatic news refresh failed:', error);
        renderSyncStatus(null, error.message);
      } finally {
        scheduleNewsRefresh();
      }
    }, newsRefreshIntervalMs);
  };
  scheduleNewsRefresh();
}

document.addEventListener('DOMContentLoaded', init);
