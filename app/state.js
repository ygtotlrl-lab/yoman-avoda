// app/state.js — המצב המשותף בין המודולים

// מצב שמודולים שונים כותבים — אובייקט אחד, כי קישור מיובא אינו ניתן להשמה.
const S = {
  // ── משתני רב-הדיירות (מוסד) ──
  YESHIVA: null,
  // נבחר בכל עלייה ואינו נשמר לדיסק
  KV_TABLE: null,
  LS: '',
  _sb: null,
  // ── עֵד הסנכרון ──
  // _lastKnownTimestamp אינו עֵד — הוא מתעדכן גם במשיכה ובשמירה בלי לבדוק את תוצאת הדחיפה.
  // _yaPushedAt נכתב רק אחרי pushTable שהחזירה ok.
  _yaPushedAt: {},
  // send ו-mark רצים אחרי await — קריאת הגלובלי בהם הייתה זוקפת דחיפה של מוסד אחד לחשבון השני.
  _yaPushEp: 0,
  _yaPushTbl: null,
  _catsResetSeen: '',
  // מחזור הסנכרון בודק את מונה ההקשר ולא את YESHIVA — החלפה הלוך-ושוב מחזירה אותו שם,
  // והזיכרון בינתיים כבר הוחלף.
  _yaPullLogged: false,
  // אין ערך קבוע שנכנס למיזוג — ערך מוזרק חוזר לענן, ומוסד אחד מקבל את הקטגוריות של השני.
  CATS: [],
  ENTRIES: [],
  selCat: null,
  selTask: null,
  selSub: null,
  selDay: "",
  // מתמלא פר-מוסד מהדיסק בלבד — אין זרע מוטבע, וההיסטוריה מגיעה מהענן.
  ARCHIVE: [],
  // ── הארכיון ──
  arcSelYear: null,
  arcSelMonth: null,
  // entry_date של היום שנבחר
  arcSelDayKey: null,
  arcEditMode: false,
  _lastKnownTimestamp: 0,
  // נכתב על כל שיחה מוצלחת עם הענן, גם במשיכה — ולכן אינו עד דחיפה ואינו משמש לפינוי; העד הוא _yaPushedAt פר-מפתח.
  _yaLastSyncAt: 0,
  _yaNetWarned: false,
  _infData: undefined,
  _infOpen: undefined
};

// ── מה שמסך צריך מ-main ──
// main רושם כאן בעלייה — מודול שמייבא מ-main סוגר מעגל, והרישום הוא הכיוון האחד.
const shell = { renderLog: null, renderArcDetail: null, buildCatGrid: null, buildTaskBtns: null };

export { S, shell };
