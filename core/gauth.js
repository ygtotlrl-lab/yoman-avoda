// core/gauth.js — כניסה עם חשבון Google (Supabase Auth), רשימת המשתמשים המורשים, וניתוק אחרי 30 יום בלי שימוש
// מי שנכנס — לפי הטבלה <prefix>users של האפליקציה (login = כתובת המייל, active); מי שאינו בה — נחסם, נרשם בשער ומתריעים לבעלים.
// במעטפת — כניסה מקורית (הגשר AndroidGoogle, Credential Manager) ואסימון זהות ל-signInWithIdToken: Google חוסמת כניסה בתוך WebView;
// בדפדפן — הפניה ל-Google וחזרה לאותו דף (PKCE). הסשן — במפתח של האפליקציה, ולא משותף עם אפליקציה אחרת באותו מקור.
// הכניסה חובה רק כשהתצורה אומרת (APP.auth.required); בלעדיה — האפליקציה פתוחה כמו תמיד, והמודול אינו עושה דבר.

import { lsGet, lsSet, lsRemove } from './storage.js';
import { closeModal, esc, openModal, toast } from './ui.js';

var AUTH_IDLE_MS = 30 * 864e5;          // ניתוק אחרי 30 יום בלי שימוש — בתוכנית החינמית אין זמן קצוב לסשן בשרת
var AUTH_TOUCH_MS = 60 * 60 * 1000;     // חותמת השימוש נכתבת לכל היותר פעם בשעה
var MSG_NOT_LISTED = 'הכתובת {1} אינה ברשימת המשתמשים של האפליקציה. המנהל קיבל הודעה.';
var MSG_SIGNIN_FAIL = 'הכניסה לא הושלמה — נסו שוב';
var MSG_NEEDS_NET = 'הכניסה הראשונה דורשת חיבור לרשת';

function _app() { return self.APP || {}; }
function _k(n) { return 'gauth_' + n + '_' + _app().id; }
function gauthRequired() { var a = _app().auth; return !!(a && a.required === true); }
function _ways() { var a = _app().auth; return (a && a.ways) || ['google']; }
function _usersTable() { return _app().prefix + 'users'; }
function _gateUrl() { return _app().supabase.url + '/functions/v1/sh-gate'; }

// אפשרויות הלקוח — הסשן במפתח של האפליקציה; ההפניה מ-Google נקלטת בעלייה (detectSessionInUrl)
function gauthClientOpts() {
  return { auth: { storageKey: 'sb-auth-' + _app().id, persistSession: true, autoRefreshToken: true,
                   detectSessionInUrl: true, flowType: 'pkce' } };
}

// ── המשתמש המחובר — השורה מהטבלה, ועותק במכשיר לעלייה בלי רשת ──
var _user = null;
function gauthUser() { return _user; }
function gauthIsAdmin() { return !!_user && _user.role === 'admin'; }
function _cache(u) { if (u) lsSet(_k('user'), JSON.stringify(u)); else lsRemove(_k('user')); }
function _cached() { try { return JSON.parse(lsGet(_k('user')) || 'null'); } catch (e) { return null; } }

// ── 30 יום בלי שימוש ──
var _touched = 0;
function _touch() {
  var now = Date.now();
  if (now - _touched < AUTH_TOUCH_MS) return;
  _touched = now;
  lsSet(_k('seen'), String(now));
}
function _idleExpired() {
  var t = Number(lsGet(_k('seen')) || 0);
  return t > 0 && Date.now() - t > AUTH_IDLE_MS;
}
var _wired = false;
function _wireTouch() {
  if (_wired) return;
  _wired = true;
  ['click', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, _touch, { passive: true }); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) _touch(); });
}

// ── מסך הכניסה ──
var G_LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-3.9 7-9.8 7-17z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';
function _style() {
  if (document.getElementById('ga-css')) return;
  var s = document.createElement('style');
  s.id = 'ga-css';
  s.textContent =
    '#ga-screen{position:fixed;inset:0;z-index:var(--z-7);background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--gutter,24px);font:inherit;color:var(--text)}' +
    '#ga-screen .ga-box{width:100%;max-width:360px;background:var(--card);border-radius:20px;padding:32px 24px;text-align:center}' +
    '#ga-screen .ga-ico{width:72px;height:72px;border-radius:18px;margin:0 auto 14px;display:block}' +
    '#ga-screen .ga-name{font-size:1.35rem;font-weight:800;color:var(--brand-ink);margin-bottom:4px}' +
    '#ga-screen .ga-sub{font-size:.9rem;color:var(--text-2);margin-bottom:22px}' +
    '#ga-screen .ga-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;border:1px solid var(--border);border-radius:999px;background:#fff;color:#1f1f1f;font:inherit;font-weight:600;padding:12px 16px;cursor:pointer}' +
    '#ga-screen .ga-btn svg{width:20px;height:20px}' +
    '#ga-screen .ga-btn[disabled]{opacity:.6;cursor:default}' +
    '#ga-screen .ga-err{margin-top:14px;font-size:.88rem;color:var(--bad);line-height:1.5;min-height:1.2em}' +
    '#ga-screen.ga-hidden{display:none}';
  (document.head || document.documentElement).appendChild(s);
}
function _icon() {
  var l = document.querySelector('link[rel="apple-touch-icon"]');
  return l ? l.getAttribute('href') : '';
}
function _screen(show) {
  var el = document.getElementById('ga-screen');
  if (!show) { if (el) el.classList.add('ga-hidden'); return null; }
  _style();
  if (!el) {
    el = document.createElement('div');
    el.id = 'ga-screen';
    el.innerHTML = '<div class="ga-box">' +
      (_icon() ? '<img class="ga-ico" alt="" src="' + esc(_icon()) + '">' : '') +
      '<div class="ga-name">' + esc(_app().name || '') + '</div>' +
      '<div class="ga-sub">כניסה בחשבון Google שהמנהל אישר</div>' +
      '<button type="button" class="ga-btn" id="ga-go">' + G_LOGO + '<span>כניסה עם Google</span></button>' +
      '<div class="ga-err" id="ga-err" role="alert"></div></div>';
    document.body.appendChild(el);
  }
  el.classList.remove('ga-hidden');
  return el;
}
function _err(msg) { var e = document.getElementById('ga-err'); if (e) e.textContent = msg || ''; }

// ── הכניסה עצמה ──
function _native() { return !!(self.AndroidGoogle && typeof self.AndroidGoogle.postMessage === 'function'); }
function _nativeIdToken() {
  return new Promise(function (resolve) {
    var t = setTimeout(function () { resolve(null); }, 120000);
    self.AndroidGoogle.onmessage = function (e) {
      clearTimeout(t);
      try { resolve(JSON.parse(e.data)); } catch (x) { resolve(null); }
    };
    self.AndroidGoogle.postMessage(JSON.stringify({ op: 'signin' }));
  });
}
async function _signIn(sb) {
  if (!navigator.onLine) { _err(MSG_NEEDS_NET); return false; }
  if (_native()) {
    var r = await _nativeIdToken();
    if (!r || !r.token) { _err(r && r.cancel ? '' : MSG_SIGNIN_FAIL); return false; }
    var res = await sb.auth.signInWithIdToken({ provider: 'google', token: r.token });
    if (res.error) { console.warn('[gauth] idToken', res.error); _err(MSG_SIGNIN_FAIL); return false; }
    return true;
  }
  // בדפדפן — הדף עוזב ל-Google וחוזר; ההמשך בעלייה הבאה
  var o = await sb.auth.signInWithOAuth({ provider: 'google',
    options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } });
  if (o.error) { _err(MSG_SIGNIN_FAIL); return false; }
  return false;
}

// השורה של המשתמש — RLS מחזיר אותה רק למי שברשימה ופעיל; בלעדיה — חסימה: השער רושם, מתריע ומנתק בשרת
async function _row(sb, email) {
  var r = await sb.from(_usersTable()).select('client_id,login,full_name,role,active,notify').eq('login', email).maybeSingle();
  if (r.error) return { net: true };
  return { row: r.data && r.data.active ? r.data : null };
}
async function _blocked(sb, session) {
  try {
    var k = _app().supabase.key;
    await fetch(_gateUrl(), { method: 'POST',
      headers: { apikey: k, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'blocked', app: _app().id }) });
  } catch (e) { /* */ }
}

// השער של העלייה — נפתר כשיש משתמש מורשה (או מיד, כשהכניסה אינה חובה). מסך הכניסה נשאר עד אז.
async function gauthGate(sb) {
  if (!gauthRequired()) return null;
  _wireTouch();
  if (_idleExpired()) { await gauthSignOut(sb, true); }
  for (;;) {
    var s = null;
    try { s = (await sb.auth.getSession()).data.session; } catch (e) { s = null; }
    if (s && s.user) {
      var email = String(s.user.email || '').toLowerCase();
      // בלי רשת — העותק שבמכשיר, אם הוא של אותה כתובת
      if (!navigator.onLine) {
        var c = _cached();
        if (c && c.login === email) { _user = c; _touch(); _screen(false); return _user; }
      }
      var got = await _row(sb, email);
      if (got.net) {
        var c2 = _cached();
        if (c2 && c2.login === email) { _user = c2; _touch(); _screen(false); return _user; }
      } else if (got.row) {
        _user = got.row; _cache(_user); lsSet(_k('seen'), String(Date.now())); _screen(false); return _user;
      } else {
        await _blocked(sb, s);
        await gauthSignOut(sb, true);
        _screen(true);
        _err(MSG_NOT_LISTED.replace('{1}', email));
      }
    }
    _screen(true);
    await new Promise(function (resolve) {
      var b = document.getElementById('ga-go');
      b.onclick = async function () {
        b.disabled = true; _err('');
        try { if (await _signIn(sb)) resolve(); } finally { b.disabled = false; }
      };
    });
  }
}

// יציאה — הסשן יורד בשרת ובמכשיר; quiet — בלי מסך (הקורא מציג)
async function gauthSignOut(sb, quiet) {
  _user = null; _cache(null); lsRemove(_k('seen'));
  try { await sb.auth.signOut(); } catch (e) { try { await sb.auth.signOut({ scope: 'local' }); } catch (x) { /* */ } }
  if (!quiet) location.reload();
}
// לשער ההתראות — אסימון הסשן
async function gauthHeaders(sb) {
  var s = null;
  try { s = (await sb.auth.getSession()).data.session; } catch (e) { s = null; }
  return s ? { Authorization: 'Bearer ' + s.access_token } : {};
}

// ── ניהול המשתמשים — מנהל בלבד, דרך השער (הטבלה נכתבת רק במפתח השירות) ──
var ROLE_LABELS = { admin: 'מנהל', manager: 'צוות בכיר', junior: 'צוות' };
var _rows = [];
async function _gate(sb, body) {
  var k = _app().supabase.key;
  var h = Object.assign({ apikey: k, 'Content-Type': 'application/json' }, await gauthHeaders(sb));
  var r = await fetch(_gateUrl(), { method: 'POST', headers: h, body: JSON.stringify(Object.assign({ app: _app().id }, body)) });
  try { return await r.json(); } catch (e) { return { error: 'net' }; }
}
function _listHTML(icon) {
  if (!_rows.length) return '<div class="ga-empty">אין משתמשים</div>';
  return _rows.map(function (u) {
    return '<button type="button" class="ga-ur' + (u.active ? '' : ' is-off') + '" data-act="ga-user-edit" data-id="' + esc(u.client_id) + '">' +
      '<span class="ga-ur-n"><b>' + esc(u.full_name || u.login) + '</b><small>' + esc(u.login) + '</small></span>' +
      (u.notify ? '<span class="ga-ur-b" title="מקבל התראות">' + icon('bell') + '</span>' : '') +
      '<span class="ga-ur-r">' + esc(u.active ? ROLE_LABELS[u.role] || u.role : 'מושבת') + '</span></button>';
  }).join('');
}
async function gauthUsersOpen(sb, icon) {
  openModal('משתמשים', '<div class="ga-list" id="ga-list"><div class="ga-empty">טוען…</div></div>',
    '<button class="btn" data-act="ga-user-edit" data-id="">' + icon('plus') + 'הוספת משתמש</button>', icon('user'));
  var r = await _gate(sb, { action: 'users_list' });
  if (!r || !r.rows) { var l0 = document.getElementById('ga-list'); if (l0) l0.innerHTML = '<div class="ga-empty">אין חיבור לשרת</div>'; return; }
  _rows = r.rows;
  var l = document.getElementById('ga-list'); if (l) l.innerHTML = _listHTML(icon);
}
function gauthUserEdit(id, icon) {
  var u = _rows.filter(function (x) { return x.client_id === id; })[0] || { client_id: '', login: '', full_name: '', role: 'junior', active: true, notify: false };
  var me = _user && _user.client_id === u.client_id;
  openModal(u.client_id ? 'עריכת משתמש' : 'הוספת משתמש',
    '<input type="hidden" id="ga-id" value="' + esc(u.client_id) + '">' +
    '<label for="ga-name">שם</label><input type="text" id="ga-name" value="' + esc(u.full_name) + '">' +
    '<label for="ga-login">כתובת Google *</label><input type="email" id="ga-login" dir="ltr" value="' + esc(u.login) + '" placeholder="name@gmail.com">' +
    '<label for="ga-role">תפקיד</label><select id="ga-role"' + (me ? ' disabled' : '') + '>' +
      ['admin', 'manager', 'junior'].map(function (r) { return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + ROLE_LABELS[r] + '</option>'; }).join('') + '</select>' +
    '<label class="ga-sw"><span>' + icon('bell') + 'מקבל התראות</span><input type="checkbox" class="ga-swi" id="ga-notify"' + (u.notify ? ' checked' : '') + '></label>' +
    '<label class="ga-sw"><span>' + icon('power') + 'פעיל</span><input type="checkbox" class="ga-swi" id="ga-active"' + (u.active ? ' checked' : '') + (me ? ' disabled' : '') + '></label>' +
    '<div class="ga-err2" id="ga-err2"></div>',
    '<button class="btn out" data-act="ga-users">חזרה</button><button class="btn" data-act="ga-user-save">' + icon('save') + 'שמירה</button>', icon('user'));
}
var SAVE_ERR = { bad_request: 'כתובת לא תקינה', dup: 'הכתובת כבר ברשימה', self: 'אי אפשר להוריד את עצמך מניהול', perm: 'רק מנהל מנהל משתמשים' };
async function gauthUserSave(sb, icon) {
  var row = {
    client_id: document.getElementById('ga-id').value || undefined,
    full_name: document.getElementById('ga-name').value.trim(),
    login: document.getElementById('ga-login').value.trim().toLowerCase(),
    role: document.getElementById('ga-role').value,
    notify: document.getElementById('ga-notify').checked,
    active: document.getElementById('ga-active').checked
  };
  var r = await _gate(sb, { action: 'users_save', row: row });
  if (!r || !r.ok) { var e = document.getElementById('ga-err2'); if (e) e.textContent = SAVE_ERR[r && r.error] || 'השמירה נכשלה'; return; }
  toast('המשתמש נשמר', null, 'good');
  if (_user && r.row && r.row.client_id === _user.client_id) { _user = r.row; _cache(_user); }
  await gauthUsersOpen(sb, icon);
}

export { AUTH_IDLE_MS, gauthClientOpts, gauthGate, gauthHeaders, gauthIsAdmin, gauthRequired, gauthSignOut, gauthUser,
         gauthUserEdit, gauthUserSave, gauthUsersOpen, closeModal as gauthClose };
