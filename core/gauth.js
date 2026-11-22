// core/gauth.js — כניסה עם חשבון Google (Supabase Auth), רשימת המשתמשים המורשים, וניתוק אחרי 30 יום בלי שימוש
// מי שנכנס — לפי הטבלה <prefix>users של האפליקציה (login = כתובת המייל, active); מי שאינו בה — נחסם, נרשם בשער ומתריעים לבעלים.
// במעטפת — כניסה מקורית (הגשר AndroidGoogle, Credential Manager) ואסימון זהות ל-signInWithIdToken: Google חוסמת כניסה בתוך WebView;
// בדפדפן — הפניה ל-Google וחזרה לאותו דף (PKCE). הסשן — במפתח של האפליקציה, ולא משותף עם אפליקציה אחרת באותו מקור.
// הכניסה חובה רק כשהתצורה אומרת (APP.auth.required); בלעדיה — האפליקציה פתוחה כמו תמיד, והמודול אינו עושה דבר.
// הלקוח — app.GAUTH_CFG.sb(); האייקונים — מהסט של האפליקציה (shellIcon).

import { app } from './util.js';
import { lsGet, lsSet, lsRemove } from './storage.js';
import { closeModal, esc, openModal, toast } from './ui.js';
import { shellIcon } from './icons.js';
import { PUSH_ACTIONS, bellHTML, pushDevices, pushPrompt, pushRefresh, pushSignOut } from './push.js';

var AUTH_IDLE_MS = 30 * 864e5;          // ניתוק אחרי 30 יום בלי שימוש — בתוכנית החינמית אין זמן קצוב לסשן בשרת
var AUTH_TOUCH_MS = 60 * 60 * 1000;     // חותמת השימוש נכתבת לכל היותר פעם בשעה
var MSG_NOT_LISTED = 'הכתובת {1} אינה ברשימת המשתמשים של האפליקציה. המנהל קיבל הודעה.';
var MSG_SIGNIN_FAIL = 'הכניסה לא הושלמה — נסו שוב';
var MSG_NEEDS_NET = 'הכניסה הראשונה דורשת חיבור לרשת';

function _app() { return self.APP || {}; }
function _k(n) { return 'gauth_' + n + '_' + _app().id; }
function _ic(n) { return shellIcon(n); }
function _sb() { return app.GAUTH_CFG && app.GAUTH_CFG.sb ? app.GAUTH_CFG.sb() : null; }
function gauthRequired() { var a = _app().auth; return !!(a && a.required === true); }
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
// סמל Google הרשמי בכפתור הכניסה — כך דורשות הנחיות הכפתור של Google
var G_LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-3.9 7-9.8 7-17z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';
function _icon() {
  var l = document.querySelector('link[rel="apple-touch-icon"]');
  return l ? l.getAttribute('href') : '';
}
function _screen(show) {
  var el = document.getElementById('ga-screen');
  if (!show) { if (el) el.classList.add('ga-hidden'); return null; }
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

// השורה של המשתמש — המסד מחזיר אותה רק למי שברשימה ופעיל; בלעדיה — חסימה: השער רושם, מתריע ומנתק בשרת
async function _row(sb, email) {
  var r = await sb.from(_usersTable()).select('client_id,login,full_name,role,active,notify').eq('login', email).maybeSingle();
  if (r.error) return { net: true };
  return { row: r.data && r.data.active ? r.data : null };
}
async function _blocked(session) {
  try {
    var k = _app().supabase.key;
    await fetch(_gateUrl(), { method: 'POST',
      headers: { apikey: k, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'blocked', app: _app().id }) });
  } catch (e) { /* */ }
}
function _ready() {
  _screen(false);
  setTimeout(function () { pushRefresh(); pushPrompt(); }, 3000);
  return _user;
}

// השער של העלייה — נפתר כשיש משתמש מורשה (או מיד, כשהכניסה אינה חובה). מסך הכניסה נשאר עד אז.
async function gauthGate() {
  if (!gauthRequired()) return null;
  var sb = _sb();
  _wireTouch();
  if (_idleExpired()) await gauthSignOut(true);
  for (;;) {
    var s = null;
    try { s = (await sb.auth.getSession()).data.session; } catch (e) { s = null; }
    if (s && s.user) {
      var email = String(s.user.email || '').toLowerCase();
      var c = _cached();
      // בלי רשת — העותק שבמכשיר, אם הוא של אותה כתובת
      if (!navigator.onLine && c && c.login === email) { _user = c; _touch(); return _ready(); }
      var got = await _row(sb, email);
      if (got.net && c && c.login === email) { _user = c; _touch(); return _ready(); }
      if (got.row) { _user = got.row; _cache(_user); lsSet(_k('seen'), String(Date.now())); return _ready(); }
      if (!got.net) {
        await _blocked(s);
        await gauthSignOut(true);
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

// יציאה — המכשיר יורד מרשימת ההתראות, והסשן יורד בשרת ובמכשיר; quiet — בלי טעינה מחדש (הקורא מציג)
async function gauthSignOut(quiet) {
  var sb = _sb();
  await pushSignOut();
  _user = null; _cache(null); lsRemove(_k('seen'));
  try { await sb.auth.signOut(); } catch (e) { try { await sb.auth.signOut({ scope: 'local' }); } catch (x) { /* */ } }
  if (!quiet) location.reload();
}
// לשער ההתראות — אסימון הסשן
async function gauthHeaders() {
  var s = null;
  try { s = (await _sb().auth.getSession()).data.session; } catch (e) { s = null; }
  return s ? { Authorization: 'Bearer ' + s.access_token } : {};
}

// ── הכרטיס «החשבון» במסך ההגדרות — אחיד בכל האפליקציות עם כניסה ──
function gauthCardHTML() {
  if (!gauthRequired() || !_user) return '';
  return '<div class="card ga-card">' +
    '<div class="ga-me">' + _ic('user') + '<span><b>' + esc(_user.full_name || _user.login) + '</b><small>' + esc(_user.login) + '</small></span></div>' +
    '<div class="ga-acts">' +
      (gauthIsAdmin() ? '<button class="btn out" data-act="ga-users">' + _ic('user') + 'משתמשים</button>' : '') +
      '<button class="btn out" data-act="push-open">' + _ic('bell') + 'התראות במכשיר הזה</button>' +
      '<button class="btn out" data-act="ga-signout">' + _ic('logout') + 'יציאה</button>' +
    '</div></div>';
}

// ── ניהול המשתמשים — מנהל בלבד, דרך השער (הטבלה נכתבת רק במפתח השירות) ──
var ROLE_LABELS = { admin: 'מנהל', manager: 'צוות בכיר', junior: 'צוות' };
var _rows = [], _devs = {};
async function _gate(body) {
  var k = _app().supabase.key;
  var h = Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, await gauthHeaders());
  var r = await fetch(_gateUrl(), { method: 'POST', headers: h, body: JSON.stringify(Object.assign({ app: _app().id }, body)) });
  try { return await r.json(); } catch (e) { return { error: 'net' }; }
}
function _listHTML() {
  if (!_rows.length) return '<div class="ga-empty">אין משתמשים</div>';
  return _rows.map(function (u) {
    return '<button type="button" class="ga-ur' + (u.active ? '' : ' is-off') + '" data-act="ga-user-edit" data-id="' + esc(u.client_id) + '">' +
      '<span class="ga-ur-n"><b>' + esc(u.full_name || u.login) + '</b><small>' + esc(u.login) + '</small></span>' +
      bellHTML(u.notify, _devs[u.client_id]) +
      '<span class="ga-ur-r">' + esc(u.active ? ROLE_LABELS[u.role] || u.role : 'מושבת') + '</span></button>';
  }).join('');
}
async function gauthUsersOpen() {
  openModal('משתמשים', '<div class="ga-list" id="ga-list"><div class="ga-empty">טוען…</div></div>',
    '<button class="btn" data-act="ga-user-edit" data-id="">' + _ic('plus') + 'הוספת משתמש</button>', _ic('user'));
  var r = await _gate({ action: 'users_list' });
  _devs = await pushDevices();
  var l = document.getElementById('ga-list');
  if (!r || !r.rows) { if (l) l.innerHTML = '<div class="ga-empty">אין חיבור לשרת</div>'; return; }
  _rows = r.rows;
  if (l) l.innerHTML = _listHTML();
}
function gauthUserEdit(id) {
  var u = _rows.filter(function (x) { return x.client_id === id; })[0] || { client_id: '', login: '', full_name: '', role: 'junior', active: true, notify: false };
  var me = _user && _user.client_id === u.client_id;
  openModal(u.client_id ? 'עריכת משתמש' : 'הוספת משתמש',
    '<input type="hidden" id="ga-id" value="' + esc(u.client_id) + '">' +
    '<label for="ga-name">שם</label><input type="text" id="ga-name" value="' + esc(u.full_name) + '">' +
    '<label for="ga-login">כתובת Google *</label><input type="email" id="ga-login" dir="ltr" value="' + esc(u.login) + '" placeholder="name@gmail.com">' +
    '<label for="ga-role">תפקיד</label><select id="ga-role"' + (me ? ' disabled' : '') + '>' +
      ['admin', 'manager', 'junior'].map(function (r) { return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + ROLE_LABELS[r] + '</option>'; }).join('') + '</select>' +
    '<label class="ga-sw"><span>' + _ic('bell') + 'מקבל התראות</span><input type="checkbox" class="ga-swi" id="ga-notify"' + (u.notify ? ' checked' : '') + '></label>' +
    '<label class="ga-sw"><span>' + _ic('power') + 'פעיל</span><input type="checkbox" class="ga-swi" id="ga-active"' + (u.active ? ' checked' : '') + (me ? ' disabled' : '') + '></label>' +
    '<div class="ga-err2" id="ga-err2"></div>',
    '<button class="btn out" data-act="ga-users">חזרה</button><button class="btn" data-act="ga-user-save">' + _ic('save') + 'שמירה</button>', _ic('user'));
}
var SAVE_ERR = { bad_request: 'כתובת לא תקינה', dup: 'הכתובת כבר ברשימה', self: 'אי אפשר להוריד את עצמך מניהול', perm: 'רק מנהל מנהל משתמשים' };
async function gauthUserSave() {
  var row = {
    client_id: document.getElementById('ga-id').value || undefined,
    full_name: document.getElementById('ga-name').value.trim(),
    login: document.getElementById('ga-login').value.trim().toLowerCase(),
    role: document.getElementById('ga-role').value,
    notify: document.getElementById('ga-notify').checked,
    active: document.getElementById('ga-active').checked
  };
  var r = await _gate({ action: 'users_save', row: row });
  if (!r || !r.ok) { var e = document.getElementById('ga-err2'); if (e) e.textContent = SAVE_ERR[r && r.error] || 'השמירה נכשלה'; return; }
  toast('המשתמש נשמר', null, 'good');
  if (_user && r.row && r.row.client_id === _user.client_id) { _user = r.row; _cache(_user); }
  await gauthUsersOpen();
}

// מפת הפעולות — האפליקציה פורשת אותה לתוך DOM_ACTIONS שלה (כולל פעולות ההתראות)
var GAUTH_ACTIONS = Object.assign({}, PUSH_ACTIONS, {
  'ga-users': function () { return gauthUsersOpen(); },
  'ga-user-edit': function (el) { gauthUserEdit(el.getAttribute('data-id') || ''); },
  'ga-user-save': function () { return gauthUserSave(); },
  'ga-signout': function () { closeModal(); return gauthSignOut(false); }
});

export { AUTH_IDLE_MS, GAUTH_ACTIONS, gauthCardHTML, gauthClientOpts, gauthGate, gauthHeaders, gauthIsAdmin,
         gauthRequired, gauthSignOut, gauthUser };
