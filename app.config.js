/* ═══ app.config.js — תצורת האפליקציה ════════════════════════════════════
   ⛔ המקום היחיד של ערכי האפליקציה — ⚠️ הדפדפן טוען אותו בתג, ה-service
      worker ב-`importScripts`, והכלים ב-`tools/gen-app.mjs`: ⭐ ערך שכתוב
      במקום שני הוא שני מקורות שמתיישנים זה מול זה.
   ⛔ קובצי הפלטפורמה נוצרים מכאן — ⚠️ `node tools/gen-app.mjs`, ⭐ ומי שעורך
      אותם ביד נדרס בהרצה הבאה.
   ════════════════════════════════════════════════════════════════════ */
self.APP = Object.freeze({
  /*  ⛔ שם הריפו — ⚠️ ממנו נגזרים ה-scope, קידומת המטמון ושם הפרויקט באנדרואיד. */
  id: 'yoman-avoda',
  name: 'יומן עבודה',
  shortName: 'יומן עבודה',
  description: 'אפליקציית יומן עבודה לניהול שעות ומשימות',
  /*  ⛔ תחילית הטבלאות והאחסון — ⚠️ כל אות בה פותחת מילה בשם הריפו, בסדר. */
  prefix: 'ya_',
  colors: { theme: '#1E6FBF', background: '#F0F4FA' },
  /*  ⚠️ דף האופליין של ה-service worker — ⭐ צבע הרקע והדיו שלו, והסמל. */
  offline: { bg: '#101A3A', ink: '#F5EDD6', mark: '📕' },
  /*  ⚠️ המפתח הוא מפתח `anon` ציבורי — ⛔ ולא מפתח שירות: ההרשאות במסד. */
  supabase: {
    url: 'https://kxbtskqobynewvnckaaz.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4YnRza3FvYnluZXd2bmNrYWF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMDI4NDAsImV4cCI6MjA4ODg3ODg0MH0.WLwPgTJp0Y-p1AuzeXhuHDPWEbWRanVMrvEN4V9Xbeg'
  },
  android: {
    package: 'com.yoman.avoda',
    /*  ⛔ הכתובת שהמעטפת טוענת — ⚠️ וממנה נגזר המקור היחיד שגשר השיתוף מקבל. */
    url: 'https://ygtotlrl-lab.github.io/yoman-avoda/',
    /*  ⚠️ המשפט שלם ⛔ ולא שם בלבד — ⭐ הפועל מתאים למין השם. */
    offlineLine: 'יומן עבודה לא הצליח להתחבר.',
    /*  ⚠️ צבע כפתור הניסיון החוזר בדף האופליין של המעטפת. */
    accent: '#2563eb',
    /*  ⛔ `versionCode` לעולם אינו יורד, ⚠️ ומקודם בכל שינוי תחת `android/` —
        ⭐ בלי קידום המכשיר המותקן אינו מקבל את ה-APK החדש. */
    versionCode: 26,
    versionName: '20.0',
    /*  ⚠️ שוליי `ic_launcher` אינם צבע אחד אלא מדרג באלכסון — ⭐ צבע אחיד
        מחטיא ב-36 יחידות לערוץ, והמדרג ב-5: 315° הוא שמאל-עליון ← ימין-תחתון. */
    launcherBg: { kind: 'gradient', angle: 315, start: '#2B508F', end: '#0D1F42' },
    /*  ⚠️ גשר השיתוף — ⭐ `FileProvider` ו-`androidx`, רק באפליקציה שמייצאת קובץ. */
    share: { chooser: 'שיתוף הדו"ח' }
  },
  /*  ⛔ טביעת מפתח החתימה הקבוע — ⚠️ `sign-apk.sh` מסרב לחתום בכל מפתח אחר. */
  signSha256: 'C1:03:A4:39:26:F0:9B:8F:6D:4E:DB:1A:68:2F:13:37:5A:AC:E2:08:50:72:A6:E1:CE:1D:C8:70:0D:5B:6A:58',
  /*  ⛔ נכסי האייקון — ⚠️ `tools/gen-icons.mjs` קורא אותם. */
  icon: {
    /*  ⛔ הצורה מוצהרת, ⛔ ותואמת את סיומת המאסטר — ⚠️ `svg` הוא
        מאסטר גיאומטרי שנקרא ונצבע, ⭐ ו-`master` הוא ציור רסטרי שהוקטן. */
    art: 'svg',
    master: 'design/icon-master.svg',
    /*  ⛔ חמשת השדות ריקים ⛔ ואינם נשמטים — ⚠️ המאסטר הגיאומטרי נושא בעצמו
        את הרקע, את הדיו ואת תיבת הסמל: ⭐ שדה חסר נקרא «לא נשאל», וריק נקרא
        «נמדד ואין». */
    ink: null,
    bg: null,
    mark: null,
    bgKey: null,
    keyTol: null,
  }
});
