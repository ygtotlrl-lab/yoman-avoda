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
- מנגנון באנר "גרסה חדשה זמינה" קיים באפליקציה — המשתמשים מקבלים את העדכון בלחיצה על הבאנר.
- בנוסף קיים מנגנון אוטו-אפדייט מבוסס `raw.githubusercontent` (`GITHUB_FILE`/`RAW_URL` ב-`index.html`) עבור מכשירים עם ה-APK — ראה כלל קריטי 5.

## Push
```bash
git add . && git commit -m "תיאור השינוי"
git push -u origin <שם-הענף>   # דחיפה לענף העבודה — לא ל-main
```

## סיום משימה
בסיום כל משימה משמעותית — **עדכן קובץ זה בתמצית** לפני סיום הסשן: מה שונה, מה הוחלט. כך הסשן הבא מתחיל עם תמונת מצב עדכנית.

## כללים קריטיים
1. **בדיקת תחביר עם `node --check` לפני כל push** (הסעיף למעלה) — חובה מוחלטת. כל שינוי ב-`index.html` חייב לעבור חילוץ-JS + `node --check` (וגם `sw.js`). דחיפה בלי זה — אסורה.
2. **קידום `CACHE_NAME` בכל שינוי קוד** (הסעיף למעלה) — בלי זה העדכון לא מגיע למשתמשים.
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
- PWA מותקן (sw.js, `CACHE_NAME` נוכחי: `yoman-avoda-v6`)
