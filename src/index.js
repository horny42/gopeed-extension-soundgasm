// Soundgasm Gopeed extension.
// Handles:
//   1. Single track: https://soundgasm.net/u/<user>/<slug>
//   2. User profile: https://soundgasm.net/u/<user>/  -> resolves every track to its direct audio file
//   3. Direct audio file (ends with .mp3/.m4a/...): passed through directly
//
// Track pages are server-rendered jPlayer pages containing:
//   <div class="jp-title">TITLE</div>
//   jPlayer("setMedia", { m4a: "https://media.soundgasm.net/sounds/xxx.m4a" });

var AUDIO_EXTS = ['m4a', 'mp3', 'ogg', 'oga', 'wav', 'opus', 'flac', 'webm'];
var CONCURRENCY_DEFAULT = 5;

function fail(message) {
  if (typeof MessageError !== 'undefined') {
    throw new MessageError(message);
  }
  throw new Error(message);
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, function (_, n) {
      try {
        return String.fromCharCode(parseInt(n, 10));
      } catch (e) {
        return _;
      }
    });
}

function sanitizeFilename(name, maxLen) {
  var clean = (name || 'audio')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) {
    clean = 'audio';
  }
  maxLen = maxLen || 180;
  if (clean.length > maxLen) {
    clean = clean.slice(0, maxLen).trim();
  }
  return clean;
}

function extensionFromUrl(url, fallback) {
  try {
    var path = new URL(url).pathname;
    var m = path.match(/\.([a-z0-9]{2,5})$/i);
    if (m) {
      var ext = m[1].toLowerCase();
      if (AUDIO_EXTS.indexOf(ext) !== -1) {
        return ext;
      }
      return ext;
    }
  } catch (e) {
    // ignore
  }
  return fallback || 'm4a';
}

function isDirectAudioUrl(url) {
  try {
    var path = new URL(url).pathname.toLowerCase();
    return AUDIO_EXTS.some(function (ext) {
      return path.endsWith('.' + ext);
    });
  } catch (e) {
    return false;
  }
}

function extractTitle(html) {
  var m = html.match(/<div class="jp-title"[^>]*>([^<]+)<\/div>/i);
  if (m) {
    return decodeEntities(m[1].trim());
  }
  return null;
}

function extractMediaUrl(html) {
  // Prefer m4a (native soundgasm format), then any other supported audio key.
  var m = html.match(/m4a\s*:\s*"([^"]+)"/i);
  if (m) {
    return m[1];
  }
  m = html.match(/(?:mp3|ogg|oga|wav|opus|flac|webm)\s*:\s*"([^"]+)"/i);
  if (m) {
    return m[1];
  }
  return null;
}

function extractTrackLinks(html, user) {
  var re = /https:\/\/soundgasm\.net\/u\/[A-Za-z0-9_-]+\/[A-Za-z0-9_\-.%]+/g;
  var found = html.match(re) || [];
  var prefix = 'https://soundgasm.net/u/' + user + '/';
  var seen = {};
  var out = [];
  for (var i = 0; i < found.length; i++) {
    var link = found[i].replace(/\/$/, '');
    // Keep only links belonging to this user profile (case-insensitive compare).
    if (link.toLowerCase().indexOf(prefix.toLowerCase()) !== 0) {
      continue;
    }
    var key = link.toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      out.push(link);
    }
  }
  return out;
}

async function fetchText(url) {
  var resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'text/html',
    },
  });
  if (!resp.ok) {
    fail('Request failed (' + resp.status + '): ' + url);
  }
  return await resp.text();
}

async function resolveSingleTrack(pageUrl) {
  gopeed.logger.info('soundgasm: resolving track ' + pageUrl);
  var html = await fetchText(pageUrl);
  var mediaUrl = extractMediaUrl(html);
  if (!mediaUrl) {
    fail('Could not find audio URL on page: ' + pageUrl);
  }
  var title = extractTitle(html) || pageUrl.split('/').filter(Boolean).pop() || 'audio';
  var ext = extensionFromUrl(mediaUrl, 'm4a');
  var fileName = sanitizeFilename(title);
  if (!fileName.toLowerCase().endsWith('.' + ext)) {
    fileName += '.' + ext;
  }
  return { title: sanitizeFilename(title), fileName: fileName, mediaUrl: mediaUrl };
}

async function resolveProfile(profileUrl, user, concurrency) {
  gopeed.logger.info('soundgasm: resolving profile ' + profileUrl);
  var html = await fetchText(profileUrl);
  var links = extractTrackLinks(html, user);
  gopeed.logger.info('soundgasm: found ' + links.length + ' tracks for user ' + user);
  if (links.length === 0) {
    fail('No audio tracks found for user: ' + user);
  }

  var files = [];
  var limit = Math.min(Math.max(concurrency || CONCURRENCY_DEFAULT, 1), 10);
  // Chunked parallel fetch to avoid hammering soundgasm and to stay goja-safe.
  for (var i = 0; i < links.length; i += limit) {
    var chunk = links.slice(i, i + limit);
    var results = await Promise.all(
      chunk.map(async function (trackUrl) {
        try {
          var single = await resolveSingleTrack(trackUrl);
          return single;
        } catch (e) {
          gopeed.logger.warn('soundgasm: skip ' + trackUrl + ': ' + (e && e.message ? e.message : e));
          return null;
        }
      })
    );
    for (var j = 0; j < results.length; j++) {
      if (results[j]) {
        results[j].fileName = dedupeName(files, results[j].fileName);
        files.push({
          name: results[j].fileName,
          req: { url: results[j].mediaUrl },
        });
      }
    }
  }

  if (files.length === 0) {
    fail('Could not resolve any audio for user: ' + user);
  }
  return files;
}

function dedupeName(existingFiles, name) {
  var taken = {};
  for (var i = 0; i < existingFiles.length; i++) {
    taken[existingFiles[i].name.toLowerCase()] = true;
  }
  if (!taken[name.toLowerCase()]) {
    return name;
  }
  var dot = name.lastIndexOf('.');
  var base = dot > 0 ? name.slice(0, dot) : name;
  var ext = dot > 0 ? name.slice(dot) : '';
  var n = 2;
  while (taken[(base + ' (' + n + ')' + ext).toLowerCase()]) {
    n++;
  }
  return base + ' (' + n + ')' + ext;
}

gopeed.events.onResolve(async function (ctx) {
  var rawUrl = ctx.req.url;
  var url;
  try {
    url = new URL(rawUrl);
  } catch (e) {
    fail('Invalid URL: ' + rawUrl);
  }

  // Direct audio file shortcut: https://.../something.mp3 (or m4a/ogg/...)
  if (isDirectAudioUrl(rawUrl)) {
    var seg = url.pathname.split('/').filter(Boolean).pop() || 'audio.m4a';
    var ext = extensionFromUrl(rawUrl, 'm4a');
    var name = sanitizeFilename(decodeURIComponent(seg).replace(/\.[a-z0-9]{2,5}$/i, ''));
    ctx.res = {
      name: name,
      files: [{ name: name + '.' + ext, req: { url: rawUrl } }],
    };
    return;
  }

  var parts = url.pathname.split('/').filter(Boolean);
  // Expected: ['u', '<user>'] or ['u', '<user>', '<slug>']
  if (parts.length < 2 || parts[0] !== 'u') {
    fail('Unsupported soundgasm URL (expected https://soundgasm.net/u/<user>/...): ' + rawUrl);
  }
  var user = parts[1];

  var concurrency = CONCURRENCY_DEFAULT;
  try {
    if (gopeed.settings && gopeed.settings.concurrency) {
      var c = parseInt(gopeed.settings.concurrency, 10);
      if (!isNaN(c)) {
        concurrency = c;
      }
    }
  } catch (e) {
    // keep default
  }

  if (parts.length >= 3) {
    // Single track page.
    var single = await resolveSingleTrack(rawUrl);
    ctx.res = {
      name: single.title,
      files: [{ name: single.fileName, req: { url: single.mediaUrl } }],
    };
    return;
  }

  // User profile page: normalize trailing slash.
  var profileUrl = 'https://soundgasm.net/u/' + user + '/';
  var files = await resolveProfile(profileUrl, user, concurrency);
  ctx.res = {
    name: sanitizeFilename(user),
    files: files,
  };
});
