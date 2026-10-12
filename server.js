const http = require('http');
const fs = require('fs');
const path = require('path');
const { lookup } = require('node:dns/promises');
const net = require('node:net');
const { createHash, randomUUID } = require('node:crypto');
const webpush = require('web-push');

const root = __dirname;
const dataDirectory = path.join(root, 'data');
const PORT = Number(process.env.PORT || 8000);
const POLL_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 12_000;
const VIDEO_SCAN_INTERVAL_MS = 60_000;
const VIDEO_SCAN_TIMEOUT_MS = 8_000;
const VIDEO_SCAN_BATCH_PER_SOURCE = 3;
const VIDEO_SCAN_MAX_BYTES = 2 * 1024 * 1024;
const VIDEO_SCAN_RETRY_MS = 6 * 60 * 60 * 1000;
const VIDEO_DISCOVERY_VERSION = 6;
const MAX_STORIES = 600;
const VAPID_CONTACT = process.env.VAPID_CONTACT || 'mailto:giro360@example.com';
const publisherDomains = [
  'tnh1.com.br',
  'gazetaweb.com',
  'alagoas24horas.com.br',
  '7segundos.com.br',
  'globo.com',
  'cnnbrasil.com.br',
  'ebc.com.br',
  'bbc.com',
  'poder360.com.br',
  'uol.com.br',
  'folha.uol.com.br',
  'cadaminuto.com.br',
];
const videoEmbedDomains = [
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
  'vimeo.com',
  'dailymotion.com',
];

const feeds = [
  {
    id: 'tnh1',
    name: 'TNH1',
    region: 'Alagoas',
    url: 'https://www.tnh1.com.br/feed/',
  },
  {
    id: 'gazetaweb',
    name: 'GazetaWeb',
    region: 'Alagoas',
    url: 'https://www.gazetaweb.com/feed/',
  },
  {
    id: 'alagoas24horas',
    name: 'Alagoas 24 Horas',
    region: 'Alagoas',
    url: 'https://www.alagoas24horas.com.br/?feed=rss2',
  },
  {
    id: '7segundos',
    name: '7Segundos',
    region: 'Alagoas',
    url: 'https://www.7segundos.com.br/rss',
  },
  {
    id: 'cadaminuto',
    name: 'CadaMinuto',
    region: 'Alagoas',
    url: 'https://www.cadaminuto.com.br/feed.xml',
  },
  {
    id: 'g1',
    name: 'g1',
    region: 'Brasil',
    url: 'https://g1.globo.com/rss/g1/',
  },
  {
    id: 'cnn-brasil',
    name: 'CNN Brasil',
    region: 'Brasil',
    url: 'https://www.cnnbrasil.com.br/feed/',
  },
  {
    id: 'agencia-brasil',
    name: 'Agência Brasil',
    region: 'Brasil',
    url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',
  },
  {
    id: 'uol',
    name: 'UOL',
    region: 'Brasil',
    url: 'https://www.uol.com.br/rss.xml',
  },
  {
    id: 'folha',
    name: 'Folha de S.Paulo',
    region: 'Brasil',
    url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml',
  },
  {
    id: 'bbc-brasil',
    name: 'BBC News Brasil',
    region: 'Brasil',
    url: 'https://feeds.bbci.co.uk/portuguese/rss.xml',
  },
  {
    id: 'poder360',
    name: 'Poder360',
    region: 'Brasil',
    url: 'https://www.poder360.com.br/feed/',
  },
];

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const zoneKeywords = [
  'atalaia',
  'branquinha',
  'cajueiro',
  'campestre',
  'capela',
  'chã preta',
  'colônia leopoldina',
  'flexeiras',
  'ibateguara',
  'jacuipe',
  'jacuípe',
  'japaratinga',
  'joaquim gomes',
  'jundiá',
  'maragogi',
  'matriz de camaragibe',
  'messias',
  'murici',
  'novo lino',
  'passo de camaragibe',
  'paulo jacinto',
  'pindoba',
  'porto calvo',
  'porto de pedras',
  'que abrangem a mata alagoana',
  'rio largo',
  'santana do mundaú',
  'são josé da laje',
  'são luís do quitunde',
  'são luis do quitunde',
  'união dos palmares',
  'zona da mata alagoana',
  'zona da mata de alagoas',
];
const ambiguousZoneKeywords = new Set([
  'atalaia',
  'cajueiro',
  'campestre',
  'capela',
  'messias',
  'murici',
  'pindoba',
  'rio largo',
]);

let webPushReady = false;
let stories = [];
let feedStates = {};
let customFeeds = [];
let receivedAtByStoryId = {};
let knownStoryIds = new Set();
let hasInitialFeedScan = false;
let pollInProgress = false;
let pushSubscriptions = [];
let discoveredVideos = {};
let videoScanInProgress = false;

function readJson(fileName, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDirectory, fileName), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      console.error(`Unable to read ${fileName}:`, error.message);
    }
    return fallback;
  }
}

function writeJson(fileName, data) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const filePath = path.join(dataDirectory, fileName);
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2));
  fs.renameSync(temporaryPath, filePath);
}

function initializePush() {
  try {
    const storedKeys = readJson('vapid-keys.json', null);
    const keys =
      process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
        ? {
            publicKey: process.env.VAPID_PUBLIC_KEY,
            privateKey: process.env.VAPID_PRIVATE_KEY,
          }
        : storedKeys || webpush.generateVAPIDKeys();

    if (!storedKeys && !process.env.VAPID_PUBLIC_KEY) {
      writeJson('vapid-keys.json', keys);
    }

    webpush.setVapidDetails(VAPID_CONTACT, keys.publicKey, keys.privateKey);
    webPushReady = true;
  } catch (error) {
    console.error('Web Push initialization failed:', error.message);
  }
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (match, number) =>
      String.fromCodePoint(Number(number)),
    )
    .replace(/&#x([\da-f]+);/gi, (match, number) =>
      String.fromCodePoint(parseInt(number, 16)),
    );
}

function getTagValue(xml, tagName) {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(
    new RegExp(`<${escapedTagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTagName}\\s*>`, 'i'),
  );
  return match ? decodeXml(match[1]).trim() : '';
}

function getAttributeValue(xml, tagName, attributeName) {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = xml.match(new RegExp(`<${escapedTagName}\\b[^>]*>`, 'i'));
  if (!tag) return '';

  const escapedAttribute = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = tag[0].match(
    new RegExp(`${escapedAttribute}\\s*=\\s*["']([^"']+)["']`, 'i'),
  );
  return value ? decodeXml(value[1]).trim() : '';
}

function stripHtml(value) {
  return decodeXml(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPublisherExcerpt(html) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const priorities = ['og:description', 'twitter:description', 'description'];
  for (const priority of priorities) {
    for (const tag of metaTags) {
      const name =
        getAttributeValue(tag, 'meta', 'property') ||
        getAttributeValue(tag, 'meta', 'name');
      if (name.toLowerCase() !== priority) continue;
      const excerpt = stripHtml(getAttributeValue(tag, 'meta', 'content'));
      if (excerpt) return excerpt.slice(0, 600).trim();
    }
  }
  return '';
}

function hostnameMatchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isAllowedPublisherUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      publisherDomains.some((domain) =>
        hostnameMatchesDomain(url.hostname.toLowerCase(), domain),
      )
    );
  } catch {
    return false;
  }
}

function normalizeVideoEmbedUrl(value, baseUrl) {
  if (!value) return '';
  try {
    const url = new URL(decodeXml(value.trim()), baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    const hostname = url.hostname.toLowerCase();
    if (
      !videoEmbedDomains.some((domain) =>
        hostnameMatchesDomain(hostname, domain),
      )
    ) {
      return '';
    }

    if (hostname === 'youtu.be') {
      const videoId = url.pathname.split('/').filter(Boolean)[0];
      return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : '';
    }

    if (
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com'
    ) {
      const videoId =
        url.pathname === '/watch'
          ? url.searchParams.get('v')
          : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
      if (videoId) {
        return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
      }
      return '';
    }

    if (
      hostname === 'youtube-nocookie.com' ||
      hostname === 'www.youtube-nocookie.com'
    ) {
      return /^\/embed\/[^/?]+/.test(url.pathname) ? url.href : '';
    }

    if (hostname === 'vimeo.com' || hostname === 'www.vimeo.com') {
      const videoId = url.pathname.match(/^\/(\d+)/)?.[1];
      if (videoId) return `https://player.vimeo.com/video/${videoId}`;
      return '';
    }

    if (hostname === 'player.vimeo.com') {
      return /^\/video\/\d+/.test(url.pathname) ? url.href : '';
    }

    if (
      hostname === 'dailymotion.com' ||
      hostname === 'www.dailymotion.com'
    ) {
      const videoId = url.pathname.match(/^\/video\/([^_/?]+)/)?.[1];
      if (videoId) {
        return `https://www.dailymotion.com/embed/video/${encodeURIComponent(videoId)}`;
      }
      return '';
    }

    if (hostname.endsWith('.dailymotion.com')) {
      return url.pathname === '/player.html' && url.searchParams.has('video')
        ? url.href
        : '';
    }

    return '';
  } catch {
    return '';
  }
}

function isG1VideoPage(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.toLowerCase() === 'g1.globo.com' &&
      /\/video\/[^/]+-\d+\.ghtml$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function extractVideoEmbeds(html, pageUrl) {
  const embedUrls = new Set();
  const iframeTags = html.match(/<iframe\b[^>]*>/gi) || [];
  for (const tag of iframeTags) {
    const embedUrl = normalizeVideoEmbedUrl(
      getAttributeValue(tag, 'iframe', 'src'),
      pageUrl,
    );
    if (embedUrl) embedUrls.add(embedUrl);
  }

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const property =
      getAttributeValue(tag, 'meta', 'property').toLowerCase() ||
      getAttributeValue(tag, 'meta', 'name').toLowerCase();
    if (
      property === 'og:video' ||
      property === 'og:video:url' ||
      property === 'twitter:player'
    ) {
      const embedUrl = normalizeVideoEmbedUrl(
        getAttributeValue(tag, 'meta', 'content'),
        pageUrl,
      );
      if (embedUrl) embedUrls.add(embedUrl);
    }
  }

  const structuredEmbedUrls =
    html.match(/["']embedUrl["']\s*:\s*["']([^"']+)["']/gi) || [];
  for (const match of structuredEmbedUrls) {
    const value = match.match(/:\s*["']([^"']+)["']/)?.[1] || '';
    const embedUrl = normalizeVideoEmbedUrl(value, pageUrl);
    if (embedUrl) embedUrls.add(embedUrl);
  }

  const normalizedHtml = html.replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
  const providerUrls =
    normalizedHtml.match(
      /https?:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|player\.vimeo\.com|dailymotion\.com|globoplay\.globo\.com)[^"'\\\s<>]*/gi,
    ) || [];
  for (const candidate of providerUrls) {
    const embedUrl = normalizeVideoEmbedUrl(candidate, pageUrl);
    if (embedUrl) embedUrls.add(embedUrl);
  }
  return [...embedUrls];
}

function isStableVideoUrl(value, baseUrl) {
  try {
    const url = new URL(decodeXml(value.trim()), baseUrl);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      hostnameMatchesDomain(hostname, 'gvt1.com') ||
      hostnameMatchesDomain(hostname, 'googlevideo.com') ||
      /\/videoplayback(?:\/|$)/i.test(url.pathname) ||
      [...url.searchParams.keys()].some((key) =>
        /^(?:token|access_token|signature|sig|expires|expire|policy|key-pair-id|x-amz-|x-goog-)/i.test(
          key,
        ),
      )
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function extractGloboPlayers(html, story) {
  const playerTags = html.match(/<bs-player\b[^>]*>/gi) || [];
  const videos = [];
  for (const playerTag of playerTags) {
    const videoId = getAttributeValue(playerTag, 'bs-player', 'videoid');
    if (!/^\d{5,20}$/.test(videoId)) continue;
    const serviceId =
      getAttributeValue(playerTag, 'bs-player', 'serviceid') || '151';
    videos.push({
      id: `${story.id}:globo:${videoId}`,
      title: story.title,
      source: story.source,
      region: story.region,
      url: story.url,
      videoProvider: 'globo',
      videoId,
      videoServiceId: /^\d{1,10}$/.test(serviceId) ? serviceId : '151',
      imageUrl: story.imageUrl,
      videoOrientation: 'horizontal',
      publishedAt: story.publishedAt,
      receivedAt: story.receivedAt || story.publishedAt,
      isZoneMata: story.isZoneMata,
    });
  }

  return videos;
}

function extractPublisherVideos(html, pageUrl, story) {
  const scripts =
    html.match(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script\s*>/gi,
    ) || [];
  const videos = [];

  for (const script of scripts) {
    const json = script.match(/>([\s\S]*?)<\/script\s*>/i)?.[1];
    if (!json) continue;
    try {
      const data = JSON.parse(decodeXml(json));
      const pending = [data];
      while (pending.length) {
        const value = pending.pop();
        if (!value || typeof value !== 'object') continue;
        if (Array.isArray(value)) {
          pending.push(...value);
          continue;
        }
        const types = Array.isArray(value['@type'])
          ? value['@type']
          : [value['@type']];
        if (types.includes('VideoObject')) {
          const videoPageUrl = [value.url, value.embedUrl, value.contentUrl]
            .map((candidate) => normalizeVideoEmbedUrl(candidate, pageUrl))
            .find(Boolean);
          const thumbnailUrl = Array.isArray(value.thumbnailUrl)
            ? value.thumbnailUrl[0]
            : value.thumbnailUrl;
          const title =
            typeof value.name === 'string' ? value.name : story.title;
          if (videoPageUrl) {
            videos.push({
              id: `${story.id}:video:${videoPageUrl}`,
              title: stripHtml(title),
              source: story.source,
              region: story.region,
              url: videoPageUrl,
              videoEmbedUrl: videoPageUrl,
              imageUrl: resolveImageUrl(thumbnailUrl, pageUrl),
              videoOrientation:
                value.isVertical === true || value.isVertical === 'true'
                  ? 'vertical'
                  : 'horizontal',
              publishedAt: value.uploadDate || story.publishedAt,
              receivedAt: story.receivedAt || story.publishedAt,
              isZoneMata: story.isZoneMata,
            });
          }
        }
        pending.push(...Object.values(value));
      }
    } catch (error) {
      console.error(`Unable to parse video metadata (${story.source}):`, error.message);
    }
  }

  return [...new Map(videos.map((video) => [video.id, video])).values()];
}

async function readLimitedResponse(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('Article page exceeded the size limit');
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const declaredCharset =
    response.headers
      .get('content-type')
      ?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ||
    buffer
      .subarray(0, 1024)
      .toString('ascii')
      .match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i)?.[1] ||
    '';
  const encoding = /^(?:iso-8859-1|latin1|windows-1252)$/i.test(declaredCharset)
    ? 'windows-1252'
    : 'utf-8';
  return new TextDecoder(encoding).decode(buffer);
}

function isPublicIpAddress(address) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const family = net.isIP(normalized);
  if (family === 4) {
    const [first, second] = normalized.split('.').map(Number);
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 2) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0) ||
      first >= 224
    );
  }

  return (
    family === 6 &&
    /^2[0-9a-f]{3}:/i.test(normalized) &&
    !/^2001:db8:/i.test(normalized)
  );
}

async function assertPublicHttpsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Endereço inválido.');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Use um endereço HTTPS público, sem usuário ou senha.');
  }

  const literalFamily = net.isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('O endereço não aponta para um servidor público.');
  }
  return url;
}

async function fetchPublicResource(value, accept, maxBytes) {
  let currentUrl = value;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    await assertPublicHttpsUrl(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'GIRO360/1.0 (+RSS news reader)',
          Accept: accept,
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirectCount === 3) {
          throw new Error('O endereço redirecionou mais vezes que o permitido.');
        }
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`O site respondeu HTTP ${response.status}.`);
      }
      const body = await readLimitedResponse(response, maxBytes);
      return { body, contentType: response.headers.get('content-type') || '', url: currentUrl };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Tempo limite ao consultar o site.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Não foi possível acessar o endereço informado.');
}

function isRssXml(xml) {
  return /<(?:rss|feed|rdf:rdf)\b/i.test(xml);
}

function sourceNameFromUrl(value) {
  const hostname = new URL(value).hostname.replace(/^www\./i, '');
  const label = hostname.split('.')[0].replace(/[-_]+/g, ' ');
  return label.replace(/\b\w/g, (character) => character.toUpperCase());
}

async function discoverRssUrl(siteUrl) {
  const page = await fetchPublicResource(
    siteUrl,
    'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/xml',
    VIDEO_SCAN_MAX_BYTES,
  );
  if (isRssXml(page.body)) return page.url;

  const candidates = [];
  const linkTags = page.body.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    const rel = getAttributeValue(tag, 'link', 'rel').toLowerCase().split(/\s+/);
    const type = getAttributeValue(tag, 'link', 'type').toLowerCase();
    const href = getAttributeValue(tag, 'link', 'href');
    if (
      href &&
      rel.includes('alternate') &&
      /rss|atom|xml/.test(type)
    ) {
      candidates.push(new URL(href, page.url).href);
    }
  }

  for (const pathName of ['/feed/', '/feed', '/rss', '/rss.xml', '/feed.xml', '/?feed=rss2']) {
    const candidate = new URL(page.url);
    candidate.pathname = pathName.split('?')[0];
    candidate.search = pathName.includes('?') ? pathName.slice(pathName.indexOf('?')) : '';
    candidates.push(candidate.href);
  }

  const checked = new Set();
  for (const candidate of candidates) {
    if (checked.has(candidate) || checked.size >= 8) continue;
    checked.add(candidate);
    try {
      const result = await fetchPublicResource(
        candidate,
        'application/rss+xml,application/atom+xml,application/xml,text/xml',
        VIDEO_SCAN_MAX_BYTES,
      );
      if (isRssXml(result.body)) return result.url;
    } catch (error) {
      console.warn(`RSS discovery candidate failed (${candidate}):`, error.message);
    }
  }
  throw new Error('Não encontrei um feed RSS/Atom acessível neste site. Cadastre o endereço RSS diretamente.');
}

async function fetchPublisherArticle(url) {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    if (!isAllowedPublisherUrl(currentUrl)) {
      throw new Error('Article URL is outside the publisher allowlist');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VIDEO_SCAN_TIMEOUT_MS);
    try {
      const response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'GIRO360/1.0 (+RSS video discovery; contact: giro360@example.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location || redirectCount === 3) {
          throw new Error('Article page redirected too many times');
        }
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }
      if (!response.ok) throw new Error(`Article page returned HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('html')) return { html: '', url: currentUrl };
      return { html: await readLimitedResponse(response, VIDEO_SCAN_MAX_BYTES), url: currentUrl };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Unable to resolve the article page');
}

async function scanForPublisherVideos() {
  if (videoScanInProgress || !stories.length) return;
  videoScanInProgress = true;
  try {
    const now = Date.now();
    const candidatesBySource = new Map();
    for (const story of stories) {
      const priorScan = discoveredVideos[story.id];
      if (
        story.videoUrl ||
        (story.videoEmbedUrl && !isG1VideoPage(story.videoEmbedUrl)) ||
        (priorScan?.version === VIDEO_DISCOVERY_VERSION &&
          priorScan.videoEmbedUrl)
      ) {
        continue;
      }
      if (
        priorScan?.version === VIDEO_DISCOVERY_VERSION &&
        Date.parse(priorScan.nextScanAfter) > now
      ) {
        continue;
      }
      if (!isAllowedPublisherUrl(story.url)) continue;
      if (story.source.trim().toLocaleLowerCase('pt-BR') === 'g1') continue;
      if (!candidatesBySource.has(story.source)) candidatesBySource.set(story.source, []);
      candidatesBySource.get(story.source).push(story);
    }

    const candidates = [...candidatesBySource.values()].flatMap((sourceStories) =>
      sourceStories
        .sort(
          (first, second) =>
            Number(
              /\/(?:playlist|video)\//i.test(second.url) ||
                /vídeo|video|assista|ao vivo/i.test(second.title),
            ) -
            Number(
              /\/(?:playlist|video)\//i.test(first.url) ||
                /vídeo|video|assista|ao vivo/i.test(first.title),
            ),
        )
        .slice(0, VIDEO_SCAN_BATCH_PER_SOURCE),
    );
    await Promise.all(
      candidates.map(async (story) => {
        const scannedAt = new Date().toISOString();
        try {
          const page = await fetchPublisherArticle(story.url);
          const videoEmbedUrls = extractVideoEmbeds(page.html, page.url);
          const videos = [
            ...extractPublisherVideos(page.html, page.url, story),
            ...extractGloboPlayers(page.html, story),
          ];
          for (const videoEmbedUrl of videoEmbedUrls) {
            if (videos.some((video) => video.videoEmbedUrl === videoEmbedUrl)) {
              continue;
            }
            videos.push({
              id: `${story.id}:embedded:${videoEmbedUrl}`,
              title: story.title,
              source: story.source,
              region: story.region,
              url: videoEmbedUrl,
              videoEmbedUrl,
              imageUrl: story.imageUrl,
              videoOrientation: 'horizontal',
              publishedAt: story.publishedAt,
              receivedAt: story.receivedAt,
              isZoneMata: story.isZoneMata,
            });
          }
          discoveredVideos[story.id] = {
            version: VIDEO_DISCOVERY_VERSION,
            scannedAt,
            nextScanAfter: new Date(Date.now() + VIDEO_SCAN_RETRY_MS).toISOString(),
            videoEmbedUrl: videoEmbedUrls[0] || '',
            videos,
          };
        } catch (error) {
          discoveredVideos[story.id] = {
            version: VIDEO_DISCOVERY_VERSION,
            scannedAt,
            nextScanAfter: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
            videoEmbedUrl: '',
          };
          console.error(`Video scan failed (${story.source}):`, error.message);
        }
      }),
    );
    writeJson('discovered-videos.json', discoveredVideos);
  } finally {
    videoScanInProgress = false;
  }
}

function extractImage(itemXml, articleUrl) {
  const articleContentTags = [
    'content:encoded',
    'content',
    'description',
    'summary',
  ];

  for (const contentTag of articleContentTags) {
    const content = getTagValue(itemXml, contentTag);
    const imageElements = content.match(/<img\b[^>]*>/gi) || [];
    for (const imageElement of imageElements) {
      const imageCandidates = [
        getAttributeValue(imageElement, 'img', 'data-src'),
        getAttributeValue(imageElement, 'img', 'data-original'),
        getAttributeValue(imageElement, 'img', 'data-lazy-src'),
        getAttributeValue(imageElement, 'img', 'data-actualsrc'),
        getAttributeValue(imageElement, 'img', 'src'),
        getAttributeValue(imageElement, 'img', 'srcset')
          .split(',')[0]
          .trim()
          .split(/\s+/)[0],
      ];
      for (const imageUrl of imageCandidates) {
        const resolvedUrl = resolveImageUrl(imageUrl, articleUrl);
        if (resolvedUrl) return resolvedUrl;
      }
    }
  }

  const linkedPhoto = resolveImageUrl(
    getTagValue(itemXml, 'linkfoto'),
    articleUrl,
  );
  if (linkedPhoto) return linkedPhoto;

  const imageTags = ['media:content', 'media:thumbnail', 'enclosure', 'image'];

  for (const tag of imageTags) {
    const url = getAttributeValue(itemXml, tag, 'url');
    const type = getAttributeValue(itemXml, tag, 'type');
    if (url && (!type || type.startsWith('image/'))) {
      const resolvedUrl = resolveImageUrl(url, articleUrl);
      if (resolvedUrl) return resolvedUrl;
    }
  }

  return '';
}

function resolveImageUrl(value, articleUrl) {
  if (!value) return '';
  try {
    const url = new URL(decodeXml(value).trim(), articleUrl);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : '';
  } catch {
    return '';
  }
}

function extractVideo(itemXml) {
  const enclosureType = getAttributeValue(itemXml, 'enclosure', 'type');
  const enclosureUrl = getAttributeValue(itemXml, 'enclosure', 'url');
  if (
    (enclosureType.startsWith('video/') ||
      /\.(mp4|webm|m4v)(?:[?#]|$)/i.test(enclosureUrl)) &&
    enclosureUrl &&
    isStableVideoUrl(enclosureUrl)
  ) {
    return enclosureUrl;
  }

  const mediaType = getAttributeValue(itemXml, 'media:content', 'type');
  const mediaUrl = getAttributeValue(itemXml, 'media:content', 'url');
  const mediaKind = getAttributeValue(itemXml, 'media:content', 'medium');
  const isVideo =
    mediaType.startsWith('video/') ||
    mediaKind === 'video' ||
    /\.(mp4|webm|m4v)(?:[?#]|$)/i.test(mediaUrl);
  return isVideo && mediaUrl && isStableVideoUrl(mediaUrl) ? mediaUrl : '';
}

function normalizeForSearch(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function parseFeed(feed, xml) {
  const items = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)\s*>/gi) || [];

  return items
    .map((itemXml) => {
      const title = stripHtml(getTagValue(itemXml, 'title'));
      const parsedDescription = stripHtml(
        getTagValue(itemXml, 'content:encoded') ||
          getTagValue(itemXml, 'content') ||
          getTagValue(itemXml, 'description') ||
          getTagValue(itemXml, 'summary') ||
          '',
      );
      const description =
        parsedDescription.toLowerCase() === 'none' ? '' : parsedDescription;
      const link =
        getTagValue(itemXml, 'link') ||
        getAttributeValue(itemXml, 'link', 'href') ||
        getTagValue(itemXml, 'guid') ||
        getTagValue(itemXml, 'id');
      const publishedAt =
        getTagValue(itemXml, 'pubDate') ||
        getTagValue(itemXml, 'published') ||
        getTagValue(itemXml, 'updated');
      const publishedTimestamp = Date.parse(publishedAt);
      const isTooFarInFuture =
        publishedTimestamp > Date.now() + 5 * 60 * 1000;

      const normalizedLink = link.replace(/^https:(https?:\/\/)/i, '$1');
      if (
        !title ||
        !/^https?:\/\//i.test(normalizedLink) ||
        !Number.isFinite(publishedTimestamp) ||
        isTooFarInFuture
      ) {
        return null;
      }
      const imageUrl = extractImage(itemXml, normalizedLink);

      const searchText = normalizeForSearch(
        `${title} ${description} ${getTagValue(itemXml, 'category')}`,
      ).replace(/[^a-z0-9]+/g, ' ');
      const paddedSearchText = ` ${searchText} `;
      const paddedTitle = ` ${normalizeForSearch(title).replace(/[^a-z0-9]+/g, ' ')} `;

      return {
        id: `${feed.id}:${normalizedLink}`,
        title,
        description,
        source: feed.name,
        region: feed.region,
        url: normalizedLink,
        imageUrl,
        videoUrl: extractVideo(itemXml),
        videoEmbedUrl: normalizeVideoEmbedUrl(link, link),
        publishedAt: new Date(publishedTimestamp).toISOString(),
        isZoneMata: zoneKeywords.some((keyword) => {
          const normalizedKeyword = normalizeForSearch(keyword).replace(
            /[^a-z0-9]+/g,
            ' ',
          );
          const match = ` ${normalizedKeyword} `;
          const isAmbiguous = ambiguousZoneKeywords.has(keyword);
          return isAmbiguous
            ? feed.region === 'Alagoas' && paddedTitle.includes(match)
            : paddedSearchText.includes(match);
        }),
      };
    })
    .filter(Boolean);
}

async function fetchFeed(feed) {
  try {
    const { body: xml } = feed.custom
      ? await fetchPublicResource(
          feed.url,
          'application/rss+xml,application/atom+xml,application/xml,text/xml',
          VIDEO_SCAN_MAX_BYTES,
        )
      : await (async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
          try {
            const response = await fetch(feed.url, {
              signal: controller.signal,
              headers: {
                'User-Agent': 'GIRO360/1.0 (+RSS news reader)',
                Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
              },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return { body: await readLimitedResponse(response, VIDEO_SCAN_MAX_BYTES) };
          } finally {
            clearTimeout(timeout);
          }
        })();

    if (!/<(?:rss|feed)\b/i.test(xml)) {
      throw new Error('A resposta não é um feed RSS ou Atom.');
    }

    feedStates[feed.id] = {
      id: feed.id,
      name: feed.name,
      region: feed.region,
      url: feed.url,
      enabled: true,
      lastCheckedAt: new Date().toISOString(),
      error: '',
    };
    return parseFeed(feed, xml);
  } catch (error) {
    feedStates[feed.id] = {
      id: feed.id,
      name: feed.name,
      region: feed.region,
      url: feed.url,
      enabled: true,
      lastCheckedAt: new Date().toISOString(),
      error: error.name === 'AbortError' ? 'Tempo limite excedido' : error.message,
    };
    console.error(`RSS feed failed (${feed.name}):`, error.message);
    return [];
  }
}

async function notifySubscribers(story) {
  if (!webPushReady || !pushSubscriptions.length) return;

  const payload = JSON.stringify({
    title: `GIRO 360 · ${story.source}`,
    body: story.title,
    url: `/?story=${encodeURIComponent(story.id)}`,
    image: story.imageUrl,
  });

  const results = await Promise.allSettled(
    pushSubscriptions.map((subscription) =>
      webpush.sendNotification(subscription, payload, { TTL: 86_400 }),
    ),
  );

  const invalidEndpoints = new Set();
  results.forEach((result, index) => {
    if (
      result.status === 'rejected' &&
      (result.reason.statusCode === 404 || result.reason.statusCode === 410)
    ) {
      invalidEndpoints.add(pushSubscriptions[index].endpoint);
    } else if (result.status === 'rejected') {
      console.error('Web Push delivery failed:', result.reason.message);
    }
  });

  if (invalidEndpoints.size) {
    pushSubscriptions = pushSubscriptions.filter(
      (subscription) => !invalidEndpoints.has(subscription.endpoint),
    );
    writeJson('push-subscriptions.json', pushSubscriptions);
  }
}

async function pollFeeds() {
  if (pollInProgress) return;
  pollInProgress = true;

  try {
    const results = await Promise.all([...feeds, ...customFeeds].map(fetchFeed));
    const merged = new Map();
    results.flat().forEach((story) => {
      const existing = merged.get(story.id);
      if (!existing || (!existing.imageUrl && story.imageUrl)) {
        merged.set(story.id, story);
      }
    });

    const nextStories = [...merged.values()].sort(
      (first, second) =>
        new Date(second.publishedAt).getTime() -
        new Date(first.publishedAt).getTime(),
    );
    const previousReceivedAt = receivedAtByStoryId;
    const collectedAt = new Date().toISOString();
    receivedAtByStoryId = {};
    nextStories.forEach((story) => {
        story.receivedAt =
          previousReceivedAt[story.id] ||
          stories.find((existing) => existing.id === story.id)?.receivedAt ||
          collectedAt;
        receivedAtByStoryId[story.id] = story.receivedAt;
    });
    writeJson('story-received-at.json', receivedAtByStoryId);
    const nextIds = new Set(nextStories.map((story) => story.id));

    if (hasInitialFeedScan) {
      const freshStories = nextStories.filter(
        (story) => !knownStoryIds.has(story.id),
      );
      await Promise.all(freshStories.map(notifySubscribers));
    }

    knownStoryIds = nextIds;
    hasInitialFeedScan = true;
    stories = nextStories.slice(0, MAX_STORIES);
  } finally {
    pollInProgress = false;
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function readRequestJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 64 * 1024) {
      throw new Error('Request body is too large');
    }
  }
  return body ? JSON.parse(body) : {};
}

function resolvePath(urlPath) {
  if (urlPath === '/' || urlPath === '') return path.join(root, 'index.html');
  if (urlPath === '/fontes') return path.join(root, 'fontes.html');

  const safePath = path.normalize(urlPath.replace(/^[/\\]+/, ''));
  const resolved = path.resolve(root, safePath);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

async function handleApi(request, response, pathname) {
  if (request.method === 'GET' && pathname === '/api/article-preview') {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const articleUrl = requestUrl.searchParams.get('url') || '';
    if (!isAllowedPublisherUrl(articleUrl)) {
      return sendJson(response, 400, {
        error: 'A prévia só pode ser solicitada a um portal de notícias permitido.',
      });
    }

    try {
      const page = await fetchPublisherArticle(articleUrl);
      const excerpt = extractPublisherExcerpt(page.html);
      if (!excerpt) {
        return sendJson(response, 404, {
          error: 'O portal não publicou uma descrição curta para esta matéria.',
        });
      }
      return sendJson(response, 200, {
        excerpt,
        sourceUrl: page.url,
      });
    } catch (error) {
      console.error('Unable to load publisher article preview:', error.message);
      return sendJson(response, 502, {
        error: 'Não foi possível carregar a descrição pública desta matéria.',
      });
    }
  }

  if (request.method === 'GET' && pathname === '/api/news') {
    const scannedStories = stories.filter(
      (story) =>
        !story.videoUrl &&
        !story.videoEmbedUrl &&
        discoveredVideos[story.id]?.version === VIDEO_DISCOVERY_VERSION,
    ).length;
    const pendingStories = stories.filter((story) => {
      if (story.videoUrl || story.videoEmbedUrl) return false;
      const scan = discoveredVideos[story.id];
      return (
        scan?.version !== VIDEO_DISCOVERY_VERSION ||
        !scan.nextScanAfter ||
        Date.parse(scan.nextScanAfter) <= Date.now()
      );
    }).length;
    const lastScannedAt = Object.values(discoveredVideos)
      .filter((video) => video.version === VIDEO_DISCOVERY_VERSION)
      .map((video) => video.scannedAt)
      .sort()
      .at(-1);
    const activeStoryIds = new Set(stories.map((story) => story.id));
    return sendJson(response, 200, {
      news: stories.map((story) => ({
        ...story,
        videoEmbedUrl:
          discoveredVideos[story.id]?.version === VIDEO_DISCOVERY_VERSION
            ? discoveredVideos[story.id].videoEmbedUrl || story.videoEmbedUrl
            : story.videoEmbedUrl,
      })),
      videos: Object.entries(discoveredVideos)
        .filter(
          ([storyId, scan]) =>
            activeStoryIds.has(storyId) &&
            scan.version === VIDEO_DISCOVERY_VERSION,
        )
        .map(([, scan]) => scan)
        .flatMap((scan) => scan.videos || []),
      feeds: Object.values(feedStates),
      updatedAt: Object.values(feedStates)
        .map((feed) => feed.lastCheckedAt)
        .sort()
        .at(-1),
      pollingIntervalMs: POLL_INTERVAL_MS,
      videoScan: {
        scannedStories,
        pendingStories,
        lastScannedAt: lastScannedAt || '',
        intervalMs: VIDEO_SCAN_INTERVAL_MS,
        inProgress: videoScanInProgress,
      },
    });
  }

  if (request.method === 'GET' && pathname === '/api/sources') {
    const customIds = new Set(customFeeds.map((feed) => feed.id));
    const sources = [...feeds, ...customFeeds].map((feed) => ({
      ...feed,
      ...(feedStates[feed.id] || {}),
      custom: customIds.has(feed.id),
    }));
    return sendJson(response, 200, { sources });
  }

  if (request.method === 'POST' && pathname === '/api/sources') {
    let payload;
    try {
      payload = await readRequestJson(request);
    } catch {
      return sendJson(response, 400, { error: 'Não foi possível ler as fontes enviadas.' });
    }
    if (!Array.isArray(payload.sources) || payload.sources.length > 20) {
      return sendJson(response, 400, {
        error: 'Envie uma lista de até 20 sites ou feeds RSS por vez.',
      });
    }
    if (customFeeds.length >= 50) {
      return sendJson(response, 409, {
        error: 'O limite de 50 fontes RSS personalizadas foi atingido.',
      });
    }

    const results = [];
    for (const submitted of payload.sources) {
      try {
        if (
          !submitted ||
          !['site', 'rss'].includes(submitted.type) ||
          typeof submitted.url !== 'string'
        ) {
          throw new Error('Tipo de fonte inválido.');
        }
        const requestedUrl = await assertPublicHttpsUrl(submitted.url);
        let feedUrl = requestedUrl.href;
        if (submitted.type === 'site') {
          feedUrl = await discoverRssUrl(requestedUrl.href);
        } else {
          const result = await fetchPublicResource(
            feedUrl,
            'application/rss+xml,application/atom+xml,application/xml,text/xml',
            VIDEO_SCAN_MAX_BYTES,
          );
          if (!isRssXml(result.body)) {
            throw new Error('O endereço informado não retornou um feed RSS/Atom.');
          }
          feedUrl = result.url;
        }

        const duplicate = [...feeds, ...customFeeds].find(
          (feed) => feed.url === feedUrl,
        );
        if (duplicate) {
          results.push({
            url: submitted.url,
            duplicate: true,
            name: duplicate.name,
          });
          continue;
        }
        if (customFeeds.length >= 50) {
          throw new Error('O limite de 50 fontes RSS personalizadas foi atingido.');
        }

        const hostname = new URL(requestedUrl.href).hostname.toLowerCase();
        const isAlagoas =
          /alagoas|tnh1|gazetaweb|7segundos|cadaminuto/.test(hostname);
        const feed = {
          id: `custom-${randomUUID()}`,
          name: sourceNameFromUrl(requestedUrl.href),
          region: isAlagoas ? 'Alagoas' : 'Brasil',
          url: feedUrl,
          siteUrl: requestedUrl.href,
          custom: true,
        };
        customFeeds.push(feed);
        writeJson('custom-feeds.json', customFeeds);
        results.push({ url: submitted.url, added: true, name: feed.name });
      } catch (error) {
        results.push({
          url: submitted?.url || '',
          error: error.message || 'Não foi possível cadastrar esta fonte.',
        });
      }
    }

    if (results.some((result) => result.added)) {
      pollFeeds().catch((error) =>
        console.error('RSS polling after source registration failed:', error.message),
      );
    }
    return sendJson(response, 200, { results });
  }

  if (request.method === 'DELETE' && pathname === '/api/sources') {
    try {
      const { id } = await readRequestJson(request);
      const previousLength = customFeeds.length;
      customFeeds = customFeeds.filter((feed) => feed.id !== id);
      if (customFeeds.length === previousLength) {
        return sendJson(response, 404, { error: 'Fonte monitorada não encontrada.' });
      }
      delete feedStates[id];
      writeJson('custom-feeds.json', customFeeds);
      pollFeeds().catch((error) =>
        console.error('RSS polling after source removal failed:', error.message),
      );
      return sendJson(response, 200, { removed: true });
    } catch {
      return sendJson(response, 400, { error: 'Não foi possível remover a fonte.' });
    }
  }

  if (request.method === 'GET' && pathname === '/api/push/public-key') {
    const keys = readJson('vapid-keys.json', null);
    const publicKey = process.env.VAPID_PUBLIC_KEY || keys?.publicKey;
    return sendJson(response, 200, {
      enabled: Boolean(webPushReady && publicKey),
      publicKey: publicKey || '',
    });
  }

  if (
    request.method === 'POST' &&
    pathname === '/api/push/subscribe'
  ) {
    if (!webPushReady) {
      return sendJson(response, 503, { error: 'Web Push não está configurado.' });
    }

    try {
      const subscription = await readRequestJson(request);
      if (
        typeof subscription.endpoint !== 'string' ||
        !subscription.endpoint.startsWith('https://') ||
        !subscription.keys?.p256dh ||
        !subscription.keys?.auth
      ) {
        return sendJson(response, 400, { error: 'Assinatura Web Push inválida.' });
      }

      pushSubscriptions = [
        ...pushSubscriptions.filter(
          (saved) => saved.endpoint !== subscription.endpoint,
        ),
        subscription,
      ];
      writeJson('push-subscriptions.json', pushSubscriptions);
      return sendJson(response, 201, { subscribed: true });
    } catch (error) {
      console.error('Unable to save Web Push subscription:', error.message);
      return sendJson(response, 400, { error: 'Não foi possível salvar a assinatura.' });
    }
  }

  if (request.method === 'DELETE' && pathname === '/api/push/subscribe') {
    try {
      const { endpoint } = await readRequestJson(request);
      pushSubscriptions = pushSubscriptions.filter(
        (subscription) => subscription.endpoint !== endpoint,
      );
      writeJson('push-subscriptions.json', pushSubscriptions);
      return sendJson(response, 200, { subscribed: false });
    } catch (error) {
      console.error('Unable to remove Web Push subscription:', error.message);
      return sendJson(response, 400, { error: 'Não foi possível desativar a assinatura.' });
    }
  }

  return sendJson(response, 404, { error: 'API endpoint não encontrado.' });
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    if (requestUrl.pathname.startsWith('/api/')) {
      await handleApi(request, response, requestUrl.pathname);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405);
      response.end('Method not allowed');
      return;
    }

    const filePath = resolvePath(decodeURIComponent(requestUrl.pathname));
    if (!filePath) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500);
        response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
        return;
      }

      response.writeHead(200, {
        'Content-Type':
          mimeTypes[path.extname(filePath).toLowerCase()] ||
          'application/octet-stream',
        'Cache-Control': filePath.endsWith('service-worker.js')
          ? 'no-cache'
          : 'public, max-age=300',
      });
      response.end(request.method === 'HEAD' ? undefined : data);
    });
  } catch (error) {
    console.error('Request failed:', error.message);
    if (!response.headersSent) {
      sendJson(response, 500, { error: 'Erro interno ao processar a solicitação.' });
    } else {
      response.end();
    }
  }
});

async function start() {
  fs.mkdirSync(dataDirectory, { recursive: true });
  pushSubscriptions = readJson('push-subscriptions.json', []);
  customFeeds = readJson('custom-feeds.json', []).filter(
    (feed) =>
      feed &&
      typeof feed.id === 'string' &&
      typeof feed.name === 'string' &&
      typeof feed.url === 'string' &&
      typeof feed.region === 'string' &&
      feed.custom === true,
  );
  receivedAtByStoryId = readJson('story-received-at.json', {});
  discoveredVideos = readJson('discovered-videos.json', {});
  initializePush();

  await pollFeeds();
  setInterval(() => {
    pollFeeds().catch((error) =>
      console.error('RSS polling cycle failed:', error.message),
    );
  }, POLL_INTERVAL_MS);
  setInterval(() => {
    scanForPublisherVideos().catch((error) =>
      console.error('Publisher video scan failed:', error.message),
    );
  }, VIDEO_SCAN_INTERVAL_MS);

  server.listen(PORT, () => {
    console.log(`GIRO 360 running at http://localhost:${PORT}`);
    console.log(`Checking ${feeds.length} RSS feeds every ${POLL_INTERVAL_MS / 1000} seconds.`);
    scanForPublisherVideos().catch((error) =>
      console.error('Publisher video scan failed:', error.message),
    );
  });
}

start().catch((error) => {
  console.error('Unable to start GIRO 360:', error);
  process.exitCode = 1;
});
