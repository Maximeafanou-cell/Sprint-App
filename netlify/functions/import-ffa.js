const https = require('https');
const http = require('http');

const MONTHS = {
  'janv': '01', 'janv.': '01', 'janvier': '01',
  'févr': '02', 'févr.': '02', 'fevr': '02', 'fevr.': '02', 'février': '02', 'fevrier': '02',
  'mars': '03',
  'avr': '04', 'avr.': '04', 'avril': '04',
  'mai': '05',
  'juin': '06',
  'juil': '07', 'juil.': '07', 'juillet': '07',
  'août': '08', 'aout': '08',
  'sept': '09', 'sept.': '09', 'septembre': '09',
  'oct': '10', 'oct.': '10', 'octobre': '10',
  'nov': '11', 'nov.': '11', 'novembre': '11',
  'déc': '12', 'déc.': '12', 'dec': '12', 'dec.': '12', 'décembre': '12', 'decembre': '12'
};

function httpGet(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Trop de redirections Athlé.fr'));
      return;
    }

    const parsed = new URL(url);
    const lib = parsed.protocol === 'http:' ? http : https;

    const options = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 SprintPro/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7',
        'Cache-Control': 'no-cache'
      }
    };

    const req = lib.request(options, (res) => {
      const status = res.statusCode || 0;

      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        const nextUrl = new URL(res.headers.location, url).toString();
        res.resume();
        resolve(httpGet(nextUrl, redirectCount + 1));
        return;
      }

      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error('Athlé.fr répond avec le statut HTTP ' + status));
        return;
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('timeout', () => {
      req.destroy(new Error('Timeout : Athlé.fr met trop de temps à répondre'));
    });

    req.on('error', reject);
    req.end();
  });
}

function norm(s) {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

function perfToSeconds(perf) {
  perf = String(perf || '').trim();
  if (!perf || /DQ|DNS|DNF|NP/i.test(perf)) return null;

  let m = perf.match(/^(\d{1,2})''(\d{2})$/);
  if (m) return Number(m[1]) + Number(m[2]) / 100;

  m = perf.match(/^(\d+)'(\d{2})''(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 100;

  return null;
}

function formatDate(day, month, year) {
  const key = String(month || '').toLowerCase().replace(/\.$/, '');
  const mm = MONTHS[key] || MONTHS[key + '.'];
  if (!mm || !year) return '';
  return String(day).padStart(2, '0') + '/' + mm + '/' + year;
}

function cleanEvent(e) {
  e = String(e || '')
    .replace(/\s*-\s*Salle/i, '')
    .replace(/\s*Piste Courte/i, '')
    .trim();

  if (/^60m/i.test(e)) return '60';
  if (/^100m/i.test(e)) return '100';
  if (/^200m/i.test(e)) return '200';
  if (/^400m/i.test(e)) return '400';
  return '';
}

function extractAthleteName(text) {
  const m = text.match(/#\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]+)\s+([A-ZÀ-Ÿ][A-ZÀ-Ÿ' -]+)/);
  if (m) return (m[1] + ' ' + m[2]).trim();
  return '';
}

function extractResults(text) {
  const results = [];
  const header = 'Date Epreuve Performance Vent Tour Place Niveau Points Lieu';
  const start = text.indexOf(header);
  const end = text.indexOf('Meilleures performances par saison');

  if (start < 0) return results;

  const section = text.slice(start + header.length, end > start ? end : undefined);

  const rowRe = /(\d{1,2})\s+(Janv\.?|Févr\.?|Fevr\.?|Mars|Avr\.?|Mai|Juin|Juil\.?|Août|Aout|Sept\.?|Oct\.?|Nov\.?|Déc\.?|Dec\.?)\s+(60m(?:\s*-\s*Salle)?|100m|200m(?:\s*Piste Courte)?|400m(?:\s*Piste Courte)?)\s+([0-9]+'[0-9]{2}''[0-9]{2}|[0-9]{1,2}''[0-9]{2}|DQ|DNS|DNF)\s*([+-]\d+\.\d+)?\s*(?:(Série|Finale?|Demi(?:-|\s)?finale)\s*)?([^0-9A-Z]*?)\s*([0-9]+|HC)?\s*([A-Z]{1,3}\d?)?\s*(\d{3,4})?\s+([A-Za-zÀ-ÿ' -]+?)(?=\s+\d{1,2}\s+(?:Janv|Févr|Fevr|Mars|Avr|Mai|Juin|Juil|Août|Aout|Sept|Oct|Nov|Déc|Dec)|\s+Meilleures|$)/gi;

  let m;
  const currentYear = new Date().getFullYear();

  while ((m = rowRe.exec(section)) !== null) {
    const dist = cleanEvent(m[3]);
    const time = perfToSeconds(m[4]);

    if (!dist || !time) continue;

    results.push({
      dist,
      time,
      dateStr: formatDate(m[1], m[2], currentYear),
      wind: (m[5] || '').trim(),
      tour: ((m[6] || '') + ' ' + (m[7] || '')).trim(),
      place: (m[8] || '').trim(),
      niveau: (m[9] || '').trim(),
      points: (m[10] || '').trim(),
      lieu: (m[11] || '').trim(),
      compet: 'Résultat FFA'
    });
  }

  return results;
}

function extractSeasonBests(text) {
  const results = [];
  const start = text.indexOf('Meilleures performances par saison');

  if (start < 0) return results;

  const section = text.slice(start);

  const events = [
    '60m - Salle',
    '100m',
    '200m Piste Courte',
    '200m',
    '400m Piste Courte',
    '400m'
  ];

  for (const ev of events) {
    const evEsc = ev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const bRe = new RegExp(
      evEsc +
      '\\s+Saison Date Performance Club Lig\\./Dpt\\. Lieu\\s+([\\s\\S]*?)(?=\\s+(?:60m - Salle|100m|200m Piste Courte|200m|400m Piste Courte|400m)\\s+Saison Date Performance|\\s+[0-9 ]+m\\s+Saison|$)',
      'i'
    );

    const block = section.match(bRe);
    if (!block) continue;

    const rowRe = /(\d{4})\s+(\d{1,2})\s+(Janv\.?|Févr\.?|Fevr\.?|Mars|Avr\.?|Mai|Juin|Juil\.?|Août|Aout|Sept\.?|Oct\.?|Nov\.?|Déc\.?|Dec\.?)\s+(\d{4})\s+([0-9]+'[0-9]{2}''[0-9]{2}|[0-9]{1,2}''[0-9]{2})(?:\s+\(F\))?(?:\s+\(([+-]\d+\.\d+)\))?\s+(.+?)\s+[A-Z]-[A-Z]\s+\/\s+\d{3}\s+([A-Za-zÀ-ÿ' -]+?)(?=\s+Club\s*:|\s+\d{4}\s+\d{1,2}\s+(?:Janv|Févr|Fevr|Mars|Avr|Mai|Juin|Juil|Août|Aout|Sept|Oct|Nov|Déc|Dec)|$)/gi;

    let m;

    while ((m = rowRe.exec(block[1])) !== null) {
      const dist = cleanEvent(ev);
      const time = perfToSeconds(m[5]);

      if (!dist || !time) continue;

      results.push({
        dist,
        time,
        dateStr: formatDate(m[2], m[3], m[4]),
        wind: (m[6] || '').trim(),
        tour: 'Bilan saison ' + m[1],
        place: '',
        niveau: '',
        points: '',
        lieu: (m[8] || '').trim(),
        compet: 'Bilan saison FFA'
      });
    }
  }

  return results;
}

function dedupe(list) {
  const seen = new Set();
  const out = [];

  for (const p of list) {
    const key = [p.dist, p.time, p.dateStr, p.lieu].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  return out.sort((a, b) =>
    b.dateStr.split('/').reverse().join('').localeCompare(
      a.dateStr.split('/').reverse().join('')
    )
  );
}

exports.handler = async function(event) {
  try {
    const rawUrl = event.queryStringParameters && event.queryStringParameters.url;
    const mUrl = String(rawUrl || '').match(/^https?:\/\/(?:www\.)?athle\.fr\/athletes\/(\d+)(?:\/bilans)?/i);

    if (!mUrl) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          success: false,
          error: 'Lien FFA invalide. Colle le lien de la fiche athlète Base Athlé.'
        })
      };
    }

    const athleteId = mUrl[1];
    const url = 'https://www.athle.fr/athletes/' + athleteId + '/bilans';

    const html = await httpGet(url);
    const pageText = norm(html);

    const athleteName = extractAthleteName(pageText);
    const performances = dedupe([
      ...extractResults(pageText),
      ...extractSeasonBests(pageText)
    ]);

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        success: true,
        athleteId,
        athleteName,
        count: performances.length,
        performances
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        success: false,
        error: 'Erreur import FFA : ' + e.message
      })
    };
  }
};
