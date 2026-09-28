// app/constants.js — הנתונים: שמות הטבלאות, המחרוזות והקבועים
import { appConfigure } from '../core/util.js';

// ── מסירת התצורה ──
// כאן הנתונים שהליבה קוראת, והחיווט — ב-main.js; הקובץ הזה נטען ראשון, לפני כל קריאה לליבה.
// העידן עולה בשינוי צורת רשומה או מפתחה, ושינוי שם טבלה הוא שינוי כזה — המראה ממופתחת בשם.
// עותק בעידן ישן אינו נדחף — הממתין בו נרשם ביומן, והוא נזרק ונמשך מלא.
var DATA_ERA = 5;

appConfigure({ DATA_ERA: DATA_ERA });

// אין ברירת מחדל לישיבה — ישיבה שאינה במפה אינה נבחרת כלל, ואינה נכתבת לטבלה של אחרת.
var YESHIVOT = [
  { id: 'rishon',    name: 'ראשון לציון',
    full: 'ישיבת תומכי תמימים ליובאוויטש ראשון לציון',
    table: 'ya_settings_rishon',    logo: 'logos/rishon.png' },
  { id: 'ramataviv', name: 'רמת אביב',
    full: 'ישיבת תומכי תמימים ליובאוויטש רמת אביב',
    table: 'ya_settings_ramataviv', logo: 'logos/ramataviv.png' },
];

// ── שכבת Supabase ועוזרים משותפים ──
const SB_URL = self.APP.supabase.url;

const SB_KEY = self.APP.supabase.key;

// ── הודעות פר-אפליקציה ──
var MSG_SYNCED = '✅ מסונכרן';

var MSG_SYNC_FAIL_LOCAL = '⚠️ הסנכרון נכשל — עובד עם הנתונים שבמכשיר';

var MSG_SYNC_PARTIAL = '⚠️ סנכרון חלקי — נכשל: ';

var MSG_OFFLINE_LOCAL = '⚠️ אין חיבור לאינטרנט — עובד עם הנתונים שבמכשיר';

var MSG_DAY_ARCHIVED = '📅 יום חדש! הרשומות הועברו לארכיון אוטומטית';

var MSG_PICK_CATEGORY = '⚠️ יש לבחור קטגוריה';

var MSG_NEED_TASK = '⚠️ יש להזין משימה';

var MSG_NO_ROWS = 'אין רשומות';

var MSG_PDF_PREP = 'מכין PDF...';

var MSG_POPUP_BLOCKED = '⚠️ החלון נחסם — אפשר חלונות קופצים לאתר ונסה שוב';

var MSG_IMG_OFFLINE = '⚠️ יצירת התמונה לא זמינה — נדרש חיבור לאינטרנט פעם אחת';

var MSG_IMG_FAIL = '⚠️ יצירת התמונה נכשלה — נסה שוב';

var MSG_LOCAL_ONLY = '⚠️ נשמר במכשיר בלבד — הענן לא עודכן';

var MSG_CLOUD_NO_FANOUT = '⚠️ נשמר בענן, אך מכשירים אחרים לא יעודכנו כעת';

var MSG_SAVED_CLOUD = '✅ נשמר בענן';

var MSG_SUBTASK_EXISTS = '⚠️ תת-המשימה כבר קיימת';

var MSG_TASK_EXISTS = '⚠️ המשימה כבר קיימת בקטגוריה';

var MSG_INFRA_TABLE = 'טבלת התשתית';

var MSG_SYNC_LOAD_FAIL = '⚠️ לא הצליח לטעון סנכרון';

// המסך הריק אינו מבטיח פעולה — אין במסך דרך להוסיף קטגוריה, וקטגוריות המוסד נבנות במסד.
var MSG_NO_CATS = '⚠️ אין קטגוריות למוסד הזה';

var MSG_SWITCH_YESHIVA = 'החלפת ישיבה';

var MSG_ALREADY_AT = 'כבר במוסד ';

var MSG_YESHIVA_UNKNOWN = '❌ הישיבה אינה מוכרת — לא נבחרה';

var MSG_BOOT_FAIL = '⚠️ שגיאה בעליית האפליקציה — נסה לרענן';

var MSG_NOTHING_TO_SHARE = 'אין רשומות לשיתוף להיום';

var MSG_IMG_PREP = 'מכין תמונה...';

var MSG_EDIT_FORM_CLOSED = '⚠️ טופס העריכה נסגר — נסה שוב';

var MSG_ROW_GONE = '⚠️ הרשומה לא נמצאה — לא נשמר';

var MSG_CLEAR_ALL_TITLE = '🗑 מחיקת כל הרשומות';

var MSG_CLEAR_ALL_BODY = 'האם למחוק את כל רשומות היום הנוכחי?';

// ── PUSH_CFG ──
// ya_entries לפני ya_archive — שתיהן נכתבות לאותה טבלה בדגל שונה, והסדר משאיר את הצילום אחרי החי.
// ya_settings הוא שם לוגי ולא טבלה — הכתיבה היא ל-KV_TABLE של המוסד שנלכד.
var SET_PUSH = 'ya_settings';

var PUSH_TABLES = ['ya_entries', 'ya_archive', SET_PUSH];

// ── שכבת השורות בענן ──
// היומן והארכיון בטבלה אחת ומופרדים בעמודת archived; הסנאפשוט הוא יחידת הארכיון — שורה ליום.
// ya_archive הוא מפתח localStorage ולא טבלה; cats נשאר ב-kv, ביתו היחיד בענן.
var YA_ROW_TABLES = { ya_entries: 'ya_entries', ya_archive: 'ya_entries' };

// ── קבועים משותפים ──
// pushTable שהחזירה ok מאשרת כל רשומה שסומנה לפני הצילום — ולא _lastKnownTimestamp, שמתעדכן גם במשיכה.
var PK_ENTRY = 'entry:', PK_ARC = 'arc:', PK_SET = 'setting:';

// חותמת ניקוי שנקבעת בענן ביד אחרי ניקוי: מכשיר שראה חותמת חדשה משלו זורק את העותק המקומי ומושך מלא, פעם אחת.
// חותמת ISO ולא מונה — השוואת מחרוזות ISO היא כרונולוגית.
// _KEY הוא המפתח בענן בלי תחילית ו-_LS המפתח במכשיר עם תחילית — האחסון המקומי משותף לכל ה-origin.
var CATS_RESET_KEY = 'cats_reset';

var CATS_RESET_LS = 'ya_cats_reset';

// אין בו מרחשון — monthKeyOf ממפה אותו לחשון, אחרת לאותה שנה שני כפתורי חשוון.
// אדר ואדר א׳/ב׳ חיים זה לצד זה — בכל שנה מופיע רק אחד מהם.
var HMO = ["תשרי","חשון","כסלו","טבת","שבט","אדר","אדר א׳","אדר ב׳","ניסן","אייר","סיון","תמוז","מנחם אב","אלול"];

// הדלי לא ידוע אינו נשמט מרשימת השנים — אחרת הרשומות שבו בלתי נגישות.
var HUNKNOWN = "לא ידוע";

var DAY_VALUE_MAP = ["יום ראשון","יום שני","יום שלישי","יום רביעי","יום חמישי","ערב שבת","מוצאי שבת"];

export { CATS_RESET_KEY, CATS_RESET_LS, DAY_VALUE_MAP, HMO, HUNKNOWN, MSG_ALREADY_AT,
         MSG_BOOT_FAIL, MSG_CLEAR_ALL_BODY, MSG_CLEAR_ALL_TITLE, MSG_CLOUD_NO_FANOUT,
         MSG_DAY_ARCHIVED, MSG_EDIT_FORM_CLOSED, MSG_IMG_FAIL, MSG_IMG_OFFLINE,
         MSG_IMG_PREP, MSG_INFRA_TABLE, MSG_LOCAL_ONLY, MSG_NEED_TASK,
         MSG_NOTHING_TO_SHARE, MSG_NO_CATS, MSG_NO_ROWS, MSG_OFFLINE_LOCAL, MSG_PDF_PREP,
         MSG_PICK_CATEGORY, MSG_POPUP_BLOCKED, MSG_ROW_GONE, MSG_SAVED_CLOUD,
         MSG_SUBTASK_EXISTS, MSG_SWITCH_YESHIVA, MSG_SYNCED, MSG_SYNC_FAIL_LOCAL,
         MSG_SYNC_LOAD_FAIL, MSG_SYNC_PARTIAL, MSG_TASK_EXISTS, MSG_YESHIVA_UNKNOWN,
         PK_ARC, PK_ENTRY, PK_SET, PUSH_TABLES, SB_KEY, SB_URL, SET_PUSH,
         YA_ROW_TABLES, YESHIVOT };
