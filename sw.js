/*  ⛔ ה-service worker של האפליקציה — הגרסה והרשימות בלבד: ⚠️ הלוגיקה
 *  ב-`core/sw.js`, ⭐ וערכי האפליקציה ב-`app.config.js`, שנטען ראשון. */
importScripts('./app.config.js');
/*  ⛔ מכאן נגזרת גרסת האפליקציה — ⚠️ ואין לה ליטרל שני ב-`index.html`. */
var CACHE_NAME = self.APP.id + '-v205';

// קליפת האפליקציה — חייבת להיות במטמון כדי שהאפליקציה תעבוד אופליין.
var CORE = [
  './',
  './index.html',
  './app.config.js',
  './core/sw.js',
  './core/ui.css',
  './app.css',
  './core/util.js',
  './core/sync.js',
  './core/storage.js',
  './core/backup.js',
  './core/ui.js',
  './core/hebrew.js',
  './manifest.json',
  './icons/icon-192.49794220.png',
  './icons/icon-512.e53983fc.png',
  /*  ⛔ לוגואי המוסדות מוטמנים מראש כמו האייקונים — ⚠️ נכס שאינו
   *  במטמון אינו נטען אופליין, ⭐ והכותרת נשארת בלי לוגו. */
  './logos/rishon.png',
  './logos/ramataviv.png'
];

// ⚠️ גרסאות נעוצות במדויק — ⛔ לעולם לא major צף ('@2'/'@4') — שחרור מצד
// הספק היה שובר את האפליקציה בלי שום שינוי קוד כאן, ובלי שניתן לשחזר
// מהריפו. חייב להיות זהה לתגיות שב-index.html.
var CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

importScripts('./core/sw.js');
