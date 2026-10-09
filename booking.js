// ====== НАЛАШТУВАННЯ ======
// Вставте адресу вашого Cloudflare Worker (див. SETUP-TELEGRAM.md), напр. 'https://mango-booking.ВАШ-НІК.workers.dev'
const BOOKING_ENDPOINT = 'https://restaurant-booking.tieleshovandrey.workers.dev';
const OPEN = { weekday: 9, weekend: 11 }; // година відкриття
const LAST = 21;                           // останній початок броні
const PHONE_TEXT = '093 609 05 08';
// ==========================

(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('bookForm'); if (!form) return;
  const f = { name: $('bName'), phone: $('bPhone'), date: $('bDate'), time: $('bTime'), guests: $('bGuests'), occ: $('bOcc'), note: $('bNote') };
  const msg = $('bookMsg'), ok = $('bookOk'), loaded = Date.now();
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // Дата й час рахуються за Києвом, як і на сервері
  const kyivISO = (dt) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(dt || new Date());
  const kyivNowMin = () => { const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number); return h * 60 + m; };
  const max = new Date(); max.setDate(max.getDate() + 90);
  f.date.min = kyivISO(); f.date.max = kyivISO(max);

  const DATE_HINT = () => 'Оберіть дату від сьогодні до ' + max.toLocaleDateString('uk-UA');
  function err(el, text) {
    const s = el.closest('.field').querySelector('.ferr');
    if (!s) return;
    s.textContent = text || ''; s.hidden = !text;
    el.setAttribute('aria-invalid', text ? 'true' : 'false');
  }
  function slots() {
    f.time.innerHTML = '';
    if (!f.date.value) { f.time.disabled = true; f.time.innerHTML = '<option value="">Спочатку оберіть дату</option>'; return; }
    if (f.date.value < f.date.min || f.date.value > f.date.max) { f.time.disabled = true; f.time.innerHTML = '<option value="">Оберіть коректну дату</option>'; return; }
    const [y, m, d] = f.date.value.split('-').map(Number);
    const day = new Date(y, m - 1, d), wk = day.getDay() % 6 === 0 ? OPEN.weekend : OPEN.weekday;
    const isToday = f.date.value === kyivISO(), limit = kyivNowMin() + 60;
    let html = '<option value="">Оберіть час</option>', n = 0;
    for (let t = wk * 60; t <= LAST * 60; t += 30) {
      if (isToday && t < limit) continue;
      const v = `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
      html += `<option value="${v}">${v}</option>`; n++;
    }
    f.time.innerHTML = n ? html : '<option value="">На цей день вільних годин немає</option>';
    f.time.disabled = !n;
  }
  f.date.addEventListener('change', () => { err(f.date, ''); slots(); });
  f.date.addEventListener('blur', () => { if (f.date.value && (f.date.value < f.date.min || f.date.value > f.date.max)) err(f.date, DATE_HINT()); });
  form.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const v = Math.min(50, Math.max(1, (parseInt(f.guests.value, 10) || 1) + Number(b.dataset.step)));
    f.guests.value = v; err(f.guests, '');
  }));

  function normPhone(v) {
    const d = v.replace(/\D/g, '');
    if (/^380\d{9}$/.test(d)) return '+' + d;
    if (/^0\d{9}$/.test(d)) return '+38' + d;
    return '';
  }
  function validate() {
    let bad = null; const fail = (el, t) => { err(el, t); bad = bad || el; };
    [f.name, f.phone, f.date, f.time, f.guests].forEach((el) => err(el, ''));
    if (f.name.value.trim().length < 2) fail(f.name, "Вкажіть ім'я");
    if (!normPhone(f.phone.value)) fail(f.phone, 'Введіть номер у форматі 0XX XXX XX XX');
    if (!f.date.value) fail(f.date, 'Оберіть дату');
    else if (f.date.value < f.date.min || f.date.value > f.date.max) fail(f.date, DATE_HINT());
    if (!f.time.value) fail(f.time, 'Оберіть час');
    const g = parseInt(f.guests.value, 10);
    if (!(g >= 1 && g <= 50)) fail(f.guests, 'Від 1 до 50 гостей');
    if (bad) bad.focus();
    return !bad;
  }
  function show(text) { msg.textContent = text; msg.hidden = !text; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); show('');
    if (!validate()) return;
    if (!BOOKING_ENDPOINT) { show('Онлайн-бронювання ще не підключене. Зателефонуйте нам: ' + PHONE_TEXT); return; }
    const btn = form.querySelector('button[type=submit]'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Надсилаємо…';
    const payload = {
      name: f.name.value.trim(), phone: normPhone(f.phone.value), date: f.date.value, time: f.time.value,
      guests: parseInt(f.guests.value, 10), occasion: f.occ.value, comment: f.note.value.trim(),
      website: form.elements.website.value, elapsed: Date.now() - loaded
    };
    try {
      const r = await fetch(BOOKING_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'fail');
      const [y, m, d] = payload.date.split('-').map(Number);
      const dateTxt = new Date(y, m - 1, d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
      $('bookOkText').textContent = `${payload.name}, ми отримали вашу заявку на ${dateTxt} о ${payload.time} (гостей: ${payload.guests}). Зателефонуємо на ${f.phone.value.trim()} для підтвердження.`;
      form.hidden = true; ok.hidden = false;
      ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      console.error('Бронювання: помилка відправки', err);
      const code = err && err.message;
      console.log(code);
      if (code === 'past') show('Ця дата вже минула. Оберіть сьогоднішню чи пізнішу дату або зателефонуйте: ' + PHONE_TEXT);
      else if (code === 'hours' || code === 'invalid') show('Перевірте дату й час: вони мають бути в майбутньому та в години роботи. Або зателефонуйте: ' + PHONE_TEXT);
      else if (code === 'too_fast') show('Спробуйте ще раз за кілька секунд.');
      else show('Не вдалося надіслати заявку. Спробуйте ще раз або зателефонуйте: ' + PHONE_TEXT);
    } finally { btn.disabled = false; btn.textContent = label; }
  });
  $('bookAgain').addEventListener('click', () => { form.reset(); f.guests.value = 2; slots(); ok.hidden = true; form.hidden = false; f.name.focus(); });
})();
