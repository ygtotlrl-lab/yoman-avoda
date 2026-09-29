// sw.js — service worker של האפליקציה
importScripts('./app.config.js');
// מכאן נגזרת גרסת האפליקציה שבבאנר.
var CACHE_NAME = self.APP.id + '-v260';

var CORE = [
  './',
  './index.html',
  './app.config.js',
  './core/boot.js',
  './core/sw.js',
  './core/ui.css',
  './app/style.css',
  './core/util.js',
  './core/sync.js',
  './core/storage.js',
  './core/backup.js',
  './core/ui.js',
  './core/hebrew.js',
  './app/constants.js',
  './app/state.js',
  './app/domain.js',
  './app/domain.report.js',
  './app/screens/archive.js',
  './app/screens/entry.js',
  './app/screens/log.js',
  './app/screens/pick.js',
  './app/screens/settings.js',
  './app/main.js',
  './manifest.json',
  './icons/icon-192.49794220.png',
  './icons/icon-512.e53983fc.png',
  // לוגואי המוסדות מוטמנים מראש — בלעדיהם הכותרת נשארת בלי לוגו אופליין.
  './logos/rishon.png',
  './logos/ramataviv.png'
];

// גרסאות נעוצות במדויק ולא major צף — שחרור של הספק שובר את האפליקציה בלי שינוי כאן.
// הרשימה זהה לתגיות ה-CDN של הדף: נכס שאינו כאן אינו במטמון.
var CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

importScripts('./core/sw.js');
