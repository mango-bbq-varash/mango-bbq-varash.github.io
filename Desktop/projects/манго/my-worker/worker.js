// Cloudflare Worker: приймає заявку з сайту і надсилає її в Telegram.
// Потрібні змінні: BOT_TOKEN (secret), CHAT_ID (secret), ALLOWED_ORIGIN (адреса сайту, кілька через кому).
const DAYS = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];
const OCC = ['Звичайний візит', 'День народження', 'Банкет', 'Корпоратив', 'Більярд'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    // Origin у браузері — це лише схема + домен (без шляху), тому прибираємо шлях, якщо він випадково є
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => { try { return new URL(s).origin; } catch { return s; } });
    const good = allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': good ? origin : (allowed[0] || ''),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    const out = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return out({ ok: false, error: 'method' }, 405);
    if (!good) return out({ ok: false, error: 'origin' }, 403);

    let d;
    try { d = await request.json(); } catch { return out({ ok: false, error: 'json' }, 400); }
    if (d.website) return out({ ok: true });                      // пастка для ботів
    if (!(d.elapsed > 2500)) return out({ ok: false, error: 'too_fast' }, 429);

    const name = String(d.name || '').trim(), phone = String(d.phone || ''), date = String(d.date || ''), time = String(d.time || '');
    const guests = Number(d.guests), occ = OCC.includes(d.occasion) ? d.occasion : OCC[0];
    const comment = String(d.comment || '').trim().slice(0, 400);
    if (name.length < 2 || name.length > 60 || !/^\+380\d{9}$/.test(phone) || !/^\d{4}-\d{2}-\d{2}$/.test(date)
        || !/^\d{2}:\d{2}$/.test(time) || !(guests >= 1 && guests <= 50)) return out({ ok: false, error: 'invalid' }, 400);

    const todayKyiv = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
    const wd = new Date(date + 'T00:00:00Z').getUTCDay();
    const open = wd === 0 || wd === 6 ? 11 : 9;
    const mins = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    if (date < todayKyiv) return out({ ok: false, error: 'past', today: todayKyiv, got: date }, 400);
    if (mins < open * 60 || mins > 21 * 60) return out({ ok: false, error: 'hours', open, got: time }, 400);

    const text = [
      '🍽 <b>Нова заявка на бронювання</b>',
      `👤 ${esc(name)}`,
      `📞 ${esc(phone)}`,
      `📅 ${esc(date.split('-').reverse().join('.'))} (${DAYS[wd]}) о <b>${esc(time)}</b>`,
      `👥 Гостей: <b>${guests}</b>`,
      `🎉 ${esc(occ)}`,
      comment ? `💬 ${esc(comment)}` : '',
    ].filter(Boolean).join('\n');

    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.CHAT_ID, text, parse_mode: 'HTML' }),
    });
    return r.ok ? out({ ok: true }) : out({ ok: false, error: 'telegram' }, 502);
  },
};
