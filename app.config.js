// app.config.js — תצורת האפליקציה
self.APP = Object.freeze({
  // ממנו נגזרים ה-scope, קידומת המטמון ושם הפרויקט באנדרואיד
  id: 'yoman-avoda',
  name: 'יומן עבודה',
  shortName: 'יומן עבודה',
  description: 'אפליקציית יומן עבודה לניהול שעות ומשימות',
  prefix: 'ya_',
  colors: { theme: '#1E6FBF', background: '#F0F4FA' },
  // דף האופליין של ה-service worker — הכהה לפי אסימוני הערכה הכהה של האפליקציה
  offline: { light: { bg: '#F0F4FA', ink: '#1A2540' }, dark: { bg: '#0d151d', ink: '#e8eef5' } },
  // מפתח anon ציבורי ולא מפתח שירות — ההרשאות נאכפות במסד.
  supabase: {
    url: 'https://kxbtskqobynewvnckaaz.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4YnRza3FvYnluZXd2bmNrYWF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMDI4NDAsImV4cCI6MjA4ODg3ODg0MH0.WLwPgTJp0Y-p1AuzeXhuHDPWEbWRanVMrvEN4V9Xbeg'
  },
  // הכניסה — חובה, בחשבון Google מתוך רשימת המשתמשים (core/gauth.js); דרכים: google · password
  auth: { required: true, ways: ['google'] },
  android: {
    package: 'com.yoman.avoda',
    // ממנה נגזר המקור היחיד שגשר השיתוף מקבל
    url: 'https://ygtotlrl-lab.github.io/yoman-avoda/',
    // משפט שלם ולא שם בלבד — הפועל מתאים למין השם
    offlineLine: 'יומן עבודה לא הצליח להתחבר.',
    // צבע כפתור הניסיון החוזר בדף האופליין של המעטפת
    accent: '#2563eb',
    // לעולם אינו יורד — בלי קידום המכשיר המותקן אינו מקבל את ה-APK החדש.
    versionCode: 45,
    versionName: '23.0',
    launcherBg: { kind: 'solid', color: '#3A6BBE' },
    // אפליקציות אחרות שקישור intent: רשאי לפתוח — שם ⟵ חבילה; ריק — המעטפת אינה פותחת אף אחת
    launch: {},
    // כפתור «יציאה» שהמעטפת קולטת וסוגרת בו את האפליקציה
    exit: false,
    // ההתראות — FCM במעטפת; google-services.json שב-android/app — של האפליקציה הזו בלבד
    push: true,
    // הכניסה עם Google במעטפת — לקוח ה-Web של פרויקט Google (הקהל של אסימון הזהות); ריק — אין כניסה עם Google
    google: '1083124359240-4umlnm6fic0locuq2tm8m4q6udmbrgdv.apps.googleusercontent.com',
    // גשר השיתוף (FileProvider ו-androidx) וגשר ההדפסה — בכל האפליקציות, אחידים
    share: { chooser: 'שיתוף הדו"ח', print: true }
  },
  // sign-apk.sh מסרב לחתום בכל מפתח אחר
  signSha256: 'C1:03:A4:39:26:F0:9B:8F:6D:4E:DB:1A:68:2F:13:37:5A:AC:E2:08:50:72:A6:E1:CE:1D:C8:70:0D:5B:6A:58',
  icon: {
    // svg הוא מאסטר גיאומטרי שנקרא ונצבע, ו-master רסטרי הוא ציור שהוקטן — ותואם את סיומת המאסטר.
    art: 'svg',
    master: 'design/icon-master.svg',
    // ריקים ולא נשמטים — המאסטר הגיאומטרי נושא בעצמו את הרקע, הדיו ותיבת הסמל; שדה חסר נקרא לא נשאל.
    ink: null,
    bg: null,
    mark: null,
    bgKey: null,
    keyTol: null,
  }
});
