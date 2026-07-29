# יומן עבודה — CLAUDE.md

## סביבת עבודה
- **ריפו:** `ygtotlrl-lab/yoman-avoda`
- **Pages:** `https://ygtotlrl-lab.github.io/yoman-avoda/`
- **קובץ ראשי:** `index.html`
- **Supabase:** `kxbtskqobynewvnckaaz`
- **אופן העבודה (נכון ליולי 2026):** העבודה מתנהלת בסשני ענן (Claude Code cloud) — הריפו משוכפל טרי בתחילת כל סשן, העבודה נעשית על ענף ייעודי, והדחיפה בסוף הסשן. **אין עותקים מקומיים קבועים.**
- **עבודה מקומית במחשב (אם בכל זאת):** שכפול **אך ורק** לתיקייה יציבה כמו `C:\Users\F\Documents\repos\` — **לעולם לא ל-Temp** (מנקה Windows / Storage Sense מוחק משם קבצים באמצע עבודה; זה גרם ל"מחיקות רפאים" חוזרות). טוקן: מאוחסן ב-Windows Credential Manager (host `github.com`) — לעולם לא בקובץ; `git push`/`clone` מושכים אותו אוטומטית דרך GCM.

## גישת Supabase
כשזמין ה-Supabase MCP, נהג לפי הכללים הבאים — ללא יוצאים מן הכלל:
- **שינויי סכימה** (יצירה/שינוי/מחיקת טבלאות, עמודות, פוליסות, הרשאות) — **אך ורק דרך `apply_migration`** עם שם ברור ותיאורי (למשל `add_sync_log_table`). לא דרך `execute_sql`.
- **שאילתות אבחון וקריאה** (SELECT, בדיקת מבנה, ספירות, `list_tables` וכו') — **חופשיות**, ללא אישור.
- **עדכון או מחיקת נתונים בטבלאות `kv`** (כאן: `kv_rishon` / `kv_ramataviv`, וכל טבלת נתונים אחרת) — **מחייבים אישור מפורש מהמשתמש לפני הרצה**. אין להריץ `UPDATE`/`DELETE`/`upsert` על נתונים בלי אישור.

## כללי ענפים
- כל עבודה נעשית על **ענף ייעודי** — לא ישירות על `main`.
- **מיזוג ל-`main` רק לאחר אישור מפורש מהמשתמש**, אחרי שבדק את השינוי בבדיקה חיצונית.
- **מחיקת ענפים מרוחקים חסומה בסביבת הענן** — אין לנסות למחוק; לדלג ולדווח למשתמש שהענף נותר.

## לפני כל push — חובה: בדיקת תחביר עם node
**כל שינוי בקוד (`index.html` או `sw.js`) חייב לעבור את הבדיקה הזו לפני דחיפה. דחיפה ללא הבדיקה — אסורה.**
בדיקת איזון-סוגריים בלבד אינה מספיקה (עיוורת לשגיאות בתוך מחרוזות). `node --check` = parse מלא אמיתי ב-V8. (node זמין בסביבת הענן.)
```bash
# 1) חלץ את כל ה-JS המוטבע מ-index.html לקובץ
python3 -c "
import io, re
s = io.open('index.html', encoding='utf-8').read()
js = chr(10).join(re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>', s, re.DOTALL))
io.open('_app.js', 'w', encoding='utf-8').write(js)
"
# 2) בדיקת parse — חובה ששתי הפקודות יעברו בלי שגיאה
node --check _app.js
node --check sw.js
rm -f _app.js
```
אם `node --check` מדווח שגיאה — אסור לדחוף עד שהיא מתוקנת.

## עדכוני Service Worker
- **כל שינוי בקוד מחייב קידום `CACHE_NAME` ב-`sw.js` לגרסה הבאה** — בלי זה המשתמשים לא יקבלו את העדכון.
- **וגם קידום `<meta name="app-version">` בראש `index.html`** — זה מזהה הגרסה שמנגנון האוטו-אפדייט משווה מולו (החליף את `simpleHash`, שרץ על 5000 התווים הראשונים ולכן תמיד החזיר אותו ערך והבאנר לא הופיע לעולם). בלי קידום — הבאנר לא יופיע.
- מנגנון באנר "גרסה חדשה זמינה" קיים באפליקציה — המשתמשים מקבלים את העדכון בלחיצה על הבאנר.
- בנוסף קיים מנגנון אוטו-אפדייט מבוסס `raw.githubusercontent` (`GITHUB_FILE`/`RAW_URL` ב-`index.html`) עבור מכשירים עם ה-APK — ראה כלל קריטי 5. הבדיקה רצה **פעם בשעה**, עם `Range: bytes=0-4095` + `cache:'no-store'` + timeout, ו-`sw.js` לא שומר אותה במטמון (קודם: משיכת ~950KB כל 5 דקות, כל אחת נשמרה במטמון תחת `?t=` ייחודי).

## Push
```bash
git add . && git commit -m "תיאור השינוי"
git push -u origin <שם-הענף>   # דחיפה לענף העבודה — לא ל-main
```

## סיום משימה
בסיום כל משימה משמעותית — **עדכן קובץ זה בתמצית** לפני סיום הסשן: מה שונה, מה הוחלט. כך הסשן הבא מתחיל עם תמונת מצב עדכנית.

## כללים קריטיים
1. **בדיקת תחביר עם `node --check` לפני כל push** (הסעיף למעלה) — חובה מוחלטת. כל שינוי ב-`index.html` חייב לעבור חילוץ-JS + `node --check` (וגם `sw.js`). דחיפה בלי זה — אסורה.
2. **קידום `CACHE_NAME` ב-`sw.js` וגם `<meta name="app-version">` ב-`index.html` בכל שינוי קוד** (הסעיף למעלה) — בלי זה העדכון לא מגיע למשתמשים.
3. **smali בלבד** לתיקון URLs ב-APK
4. **cache APK** — תמיד `TS=$(date +%s)` בשם
5. **מקור אמת יחיד = `index.html`** — זה הקובץ שמעטפת ה-APK טוענת (Pages: `.../yoman-avoda/index.html`), שאליו מצביע `start_url` במניפסט, וגם היעד של מנגנון האוטו-אפדייט הפנימי. כל עדכון קוד נכנס לכאן בלבד. **אסור ליצור קבצי HTML כפולים** (בעבר היה `יומן עבודה.html` — שונה ל-`index.html`). **`GITHUB_FILE` במנגנון האוטו-אפדייט חייב להתאים לשם הקובץ האמיתי בריפו** (`index.html`) — אם הוא מצביע על שם אחר, `RAW_URL` מקבל 404, האפליקציה לא מזהה גרסה חדשה, ועדכונים לא מגיעים למכשירים מותקנים.
6. **חתימת APK: רק עם `signing/yoman.keystore` (alias `yoman`, pass `yoman123`)** — המפתח הקבוע. לעולם לא ליצור keystore חדש, אחרת APK עתידי לא יתקין מעל הקיים.

## חתימת APK — מפתח קבוע (לעולם לא משתנה!)
- **Keystore בריפו:** `signing/yoman.keystore` (PKCS12, RSA 2048, תקף עד 2053)
- **alias:** `yoman`
- **storepass / keypass:** `KEYSTORE_PASS_IN_MEMORY` = `yoman123` (זהה לשניהם)
- **SHA256:** `29:F5:0B:29:60:79:0B:77:28:25:7C:88:79:12:31:28:7A:B8:F1:D9:3E:90:B6:3B:50:F4:1E:41:B9:FA:F8:B5`
- **קריטי:** כל APK חדש נחתם **אך ורק** עם המפתח הזה כדי שיתקין מעל הקיים בלי הסרה. לעולם לא ליצור keystore חדש.
- חתימה (כשיש Android SDK / apksigner):
  ```bash
  apksigner sign --ks signing/yoman.keystore --ks-key-alias yoman \
    --ks-pass pass:yoman123 --key-pass pass:yoman123 app.apk
  ```
- חלופת jarsigner (אם אין apksigner):
  ```bash
  jarsigner -keystore signing/yoman.keystore -storepass yoman123 -keypass yoman123 app.apk yoman
  ```
- **שים לב:** המפתח הקודם (`/tmp/yoman.keystore`) אבד; המפתח הקבוע החדש מחליף אותו. ההתקנה הראשונה של APK חתום במפתח החדש דורשת **הסרה חד-פעמית** של האפליקציה הישנה (אי-התאמת חתימה); מאז — קבוע לתמיד.

## APK — מעטפת ושיתוף קבצים
- אייקון: `assets/icons/icon-512.png` (לוח משימות + גרף)
- URL שהמעטפת טוענת: `https://ygtotlrl-lab.github.io/yoman-avoda/index.html`
- תיקוני URL ב-APK קיים: smali בלבד, לא binary patch
- **לתמיכת `navigator.share({files})`** (צירוף תמונה לוואטסאפ/סיגנל): מומלץ **TWA דרך PWABuilder** (Chrome אמיתי — תומך מובנה ב-Web Share עם קבצים), ולחתום עם ה-keystore הקבוע למעלה. WebView פשוט (`com.yoman.avoda.MainActivity`) דורש גישור מקורי (WebChromeClient.onShowFileChooser + Intent ACTION_SEND/FileProvider) וקומפילציה.

## בנייה — דורש כלים שאינם זמינים בכל סביבה
לבניית/חתימת APK צריך Android SDK (`aapt2`, `d8`, `apksigner`/`zipalign`) או Bubblewrap+Node. אם הם חסרים — השתמש ב-PWABuilder ואז חתום עם `signing/yoman.keystore`.

## מצב נוכחי
- PDF/JPEG export, WhatsApp sharing
- ארכיב ועריכה inline
- Hebrew calendar עם leap year
- Supabase sync (polling 3 שניות)
- PWA מותקן (sw.js, `CACHE_NAME` נוכחי: `yoman-avoda-v8`; `app-version` נוכחי: `3b-2026-07-29-1`)
- **סנכרון: מיזוג ברמת רשומה** (`updatedAt` + tombstones) — ראה סבב 3ב למטה

### סבב 3ב (יולי 2026) — מנוע מיזוג ברמת רשומה, ענף `claude/yoman-avoda-round-3a-fixes-f5cw9p`
**הכלל היחיד שחשוב:** היעדר רשומה אצל מכשיר אינו מחיקה. מחיקה = `deleted:true` + `updatedAt` (tombstone).

- **מנוע:** `mergeRecords(local, remote, getKey, mergePair)` — הענן (`remote`) הוא בסיס הסדר ומנצח בשוויון (דטרמיניסטי). נגזרות: `mergeEntries` (לפי `id`), `mergeArchive` (סנאפשוט לפי `gdate`, ובתוכו מיזוג רשומות לפי `id`), `mergeCats` (לפי `letter`), `mergeSubs` (פר-מפתח לפי `SUBS_META`). עזרים: `recTs`/`recTouch`/`recDelete`/`isLive`/`liveOnly`.
- **`autoSyncData` ו-`syncFromCloud` ממזגים** במקום להחליף blob שלם — זה היה מקור אובדן הנתונים.
- **נתוני legacy:** רשומה בלי `updatedAt` נחשבת ts=0 ("ותיקה"), אך **לעולם לא נופלת** רק מפני שהצד השני לא מכיר אותה. **אין stamping של `Date.now()` בטעינה** — זה היה גורם למכשיר ישן לנצח נתונים חדשים.
- **מחיר מודע:** רשומה שנמחקה פיזית ע"י הקוד הישן במכשיר אחר עלולה לחזור **פעם אחת** בסנכרון הראשון. עדיף על אובדן נתונים; מחיקה חוזרת יוצרת tombstone אמיתי.
- **"סיום יום"/יום חדש:** העותקים שנכנסים לארכיון וה-tombstones של העותקים החיים מקבלים **אותה חותמת**; בשוויון הסנאפשוט מנצח, ולכן ארכוב אינו מחיקה מהארכיון.
- **גרנולריות:** משימות ותתי-משימות הן מחרוזות בלי מזהה — הן נוסעות עם רשומת האב (קטגוריה / מפתח SUBS), וכל שינוי בהן מקדם את ה-`updatedAt` של האב.
- **`SUBS_META`** — מפה `{מפתח: updatedAt}`, נשמרת ב-localStorage (`tb_subs_meta`+LS) ובענן (`tb_subs_meta`).
- **מוסדות:** נבדק שאין דליפה בין `kv_rishon` ל-`kv_ramataviv`.

בדיקות: 28 טענות אוטומטיות ב-Chromium מול ענן מדומה לשני מכשירים (הבאג המקורי, legacy בלי `updatedAt`, tombstones בשני הכיוונים, שני מכשירים באותו יום בארכיון, סיום-יום, כפילות סנאפשוטים), בדיקת שדרוג מנתוני legacy אמיתיים משני הצדדים (0 רשומות אבודות, 92 ימי ארכיון נשמרו), בדיקת UI מלאה בשני המוסדות, ו-`node --check`.

**פתוח לסבב הבא:** ניקוי tombstones ישנים (`tb_entries` צובר tombstone לכל רשומה שנמחקה/אורכבה — ~1.3MB בשנה, נדחף בכל שמירה). ההמלצה: גריעה של tombstones ישנים מ-90 יום, בטעינה בלבד.

### סבב 3א (יולי 2026) — ענף `claude/yoman-avoda-round-3a-fixes-f5cw9p`
חמישה תיקונים שאינם נוגעים בליבת הסנכרון (המיזוג — סבב הבא, **לא נגענו** ב-`autoSyncData`/`syncFromCloud` merge):
1. **באנר עדכון** — `simpleHash` הוסר; ההשוואה היא מול `<meta name="app-version">`. ✕ שומר `tb_dismissed_version` כדי לא להציק שוב על אותה גרסה.
2. **תעבורה** — `checkForUpdates`: פעם בשעה, `Range` ל-4KB הראשונים, `cache:'no-store'`, timeout 10ש׳ (AbortController), ו-`!r.ok` נזרק כדי ש-404 לא ייחשב כאפליקציה.
3. **`sw.js` v7** — שמירת סקריפטי CDN במטמון (`mode:'cors'`, best-effort), פסילת opaque/לא-200, `GET` בלבד, נפילה-חזרה של כל ניווט ל-`index.html`, דף אופליין בעברית (503 + Content-Type), מחיקת מטמון ישן רק אחרי אימות ש-`index.html` נכנס לחדש, אף פעם לא `respondWith(undefined)`, ועקיפה מלאה של `supabase.co` ושל בדיקת הגרסה (`raw.githubusercontent`).
4. **הודעות אמת** — `sbSet` מחזירה `{ok,error}`, נוספה `sbGetResult` (`sbGet` נשארה value-only). `syncFromCloud` מדווחת אילו משיכות נכשלו; `addEntry` מציגה "נוסף — שומר בענן…" ורק `scheduleSyncPush` מכריזה על הצלחה/כישלון אמיתי. `scheduleSyncPush` גם **לא כותבת `tb_last_changed` אם דחיפת הנתונים נכשלה** (אחרת מכשירים אחרים מושכים ענן ישן על נתונים חדשים).
5. **דוחות** — נוספו `_renderReport`/`_reportError`; כל חמש שרשראות html2canvas עם `catch` שמסתיר את הפאנל הלבן ומציג הודעה. כש-html2canvas לא נטען (אופליין) אין יותר ReferenceError ולא נשאר מסך לבן.

בדיקות שבוצעו: `node --check` (JS מחולץ + sw.js), טעינה נקייה בשני מצבי המוסד (ראשון לציון / רמת אביב) ב-Chromium, בדיקת באנר (אותה גרסה / 404 / גרסה חדשה / dismiss), בדיקת הודעות סנכרון בהצלחה ובכישלון, ובדיקת SW מול שרת מת (ניווט עמוק → app shell, נכס חסר → דף אופליין 503).
