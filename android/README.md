# yoman-avoda — Native WebView APK

A native Android **WebView** shell (not a TWA) that loads the **live site** over the
network:

```
https://ygtotlrl-lab.github.io/yoman-avoda/
```

It replaces the PWABuilder TWA so that image sharing can attach the file via a
native bridge.

## Why WebView and never a TWA

**Do not rebuild this as a TWA, and do not use PWABuilder** (it only produces
TWAs). A TWA is not a standalone component — it runs the site *inside Chrome*
and merely hides the address bar. The content filtering installed on the users'
devices blocks Chrome, so a TWA build never opens at all. A WebView renders
in-process and never goes through Chrome, so the filter does not touch it.

This is measured, not theoretical: gius shipped a PWABuilder TWA and did not
open on the users' devices, while this app and hanhala — both WebView — work.
gius has since been converted to a WebView shell built the same way.

## מה בפנים

| | |
|---|---|
| **Package ID** | `com.yoman.avoda` — זהה למעטפת שהוא מחליף (חובה, אחרת זו אפליקציה נפרדת) |
| **טוען** | `https://ygtotlrl-lab.github.io/yoman-avoda/` — **מהרשת**, לא מנכסים מוטבעים |
| **versionCode** | 2 (1 = המעטפת שטענה `file://`; חייב להיות גבוה יותר כדי להתקין מעליה) |
| **minSdk / targetSdk** | 21 / 34 |
| **WebView** | JavaScript, DOM storage (localStorage — שם יושבים ENTRIES/ARCHIVE), DB. **בלי** גישת `file://` ובלי mixed content פתוח — האתר הוא https בלבד |
| **ניווט** | כל `http`/`https` **נשאר בתוך המעטפת**. שאר הסכימות (`tel:`, `whatsapp:`, …) נמסרות למערכת |
| **גשר שיתוף** | מוגבל לדומיין שלנו — ר' הפרק הבא |
| **בורר קבצים** | `WebChromeClient.onShowFileChooser` מחובר ל-`<input type=file>` |
| **אופליין** | ה-service worker של האתר. המעטפת מציגה דף שגיאה בעברית **רק** בהפעלה ראשונה בלי רשת |

**עדכוני קוד web לא מצריכים APK חדש.** כל דחיפה ל-`main` מגיעה למכשירים דרך
אותו מנגנון service worker + באנר "גרסה חדשה זמינה" שכבר עובד בדפדפן. APK חדש
נדרש רק כששינוי נוגע במעטפת עצמה.

## ⛔ הגשר המקורי מוגבל לדומיין שלנו — ולא ניתן לשנות זאת

`addJavascriptInterface` מזריק את האובייקט ל**כל frame של כל דף** שה-WebView
טוען, בלי שום מושג של origin. במעטפת הישנה זה היה חסר-נזק: הדף היחיד היה זה
שנצרב ב-APK. **טעינה מהרשת משנה את זה מהיסוד** — מרגע שהמעטפת יכולה להימצא על
דף שאיננו מגישים, הגשר היה נוסע איתו.

לכן שני מסלולים, והראשון מועדף כי **הפלטפורמה** אוכפת אותו:

1. **`WebViewCompat.addWebMessageListener(webView, "AndroidShareBridge",
   ALLOWED_ORIGINS, …)`** — WebView בודק את רשימת המקורות המותרים
   (`https://ygtotlrl-lab.github.io` בלבד), **פר-frame**, לפני שההודעה נמסרת.
   גם iframe חוצה-origin בתוך דף שלנו אינו מגיע אליו. דורש WebView 88+.
2. **`addJavascriptInterface` הישן**, למכשירים עם WebView ישן יותר. נעול פעמיים:
   הממשק **מחובר רק כשהמעטפת על הדומיין שלנו** ומנותק ברגע שהיא מנווטת משם
   (`onPageStarted`/`onPageFinished` → `syncLegacyBridge`), **וכל קריאה מאמתת
   מחדש** את מקור הדף על ה-UI thread לפני שהיא נוגעת במשהו. קריאה מכל מקום
   אחר נזרקת.

הדף מנסה את שניהם, בסדר הזה (`_androidShareImage` ב-`index.html`).
**אין להחליף את הסדר ואין להסיר את האימות.**

## למה אין יותר נכסים מוטבעים

השאלה נשקלה במפורש: האם להשאיר את `assets/index.html` **כגיבוי** לעלייה ראשונה
בלי רשת. **ההחלטה: לא — והשארתם הייתה מזיקה, לא רק מיותרת.**

- ⛔ **`file://` הוא origin אחסון אחר.** ה-localStorage של `file://` ושל
  `https://ygtotlrl-lab.github.io` הן שתי מחיצות נפרדות לחלוטין. רשומת יומן
  שנכתבת לעותק המוטבע בעלייה הראשונה **לא נראית לאפליקציה האמיתית לעולם** —
  והיא גם לא תסונכרן, כי הסנכרון רץ בדף השני. באפליקציה שכל תפקידה הוא רישום,
  זה אובדן נתונים שקט. גיבוי שמייצר אובדן נתונים אינו גיבוי.
- **זה מקור אמת שני** — בדיוק מה שכלל קריטי 5 אוסר. הוא מתיישן בכל שחרור.
- **מה שהוא אמור לפתור כבר פתור**: אחרי עלייה מוצלחת אחת, ה-service worker
  מגיש הכול אופליין. המקרה היחיד שנשאר הוא **התקנה + הפעלה ראשונה בלי רשת
  בכלל** — ולהתקנת APK ממילא צריך רשת. במקרה הזה המעטפת מציגה דף שגיאה בעברית
  עם כפתור "נסה שוב", וזו אי-נוחות חד-פעמית וניתנת לתיקון.

### ⚠️ מעבר מגרסה 1: העותק המקומי מתאפס פעם אחת
מי שמתקין את גרסה 2 מעל גרסה 1 עובר מ-`file://` ל-`https://…` — כלומר
ל-localStorage **ריק**: בחירת המוסד תתבקש שוב, והנתונים ייטענו מחדש מהענן
(`kv_rishon`/`kv_ramataviv`), שהוא ממילא מקור האמת.

⛔ **מה שכן יכול ללכת לאיבוד: רשומה שנרשמה במכשיר ולא הספיקה לעלות לענן.**
לכן — **לפני הפצת ה-APK, ודא בכל מכשיר שמסך ההגדרות ← «⏳ ממתין לסנכרון»
מציג 0.** רשומה שמסומנת ⏳ יושבת רק על המכשיר, ומעבר ה-origin ישאיר אותה מאחור.

## Build

### הדרך המומלצת — GitHub Actions (לא צריך שום דבר מותקן)

`.github/workflows/build-apk.yml`: Actions → **Build Signed APK** → **Run workflow**.
ה-APK **החתום** יורד כ-artifact בשם `yoman-avoda-signed-apk`.

**אין יותר שלב "copy web assets"** — ואין להחזיר אותו (ר' הפרק שמעל).
`copy-assets.sh` נשאר בריפו כשלד עם הסבר בלבד.

### בנייה מקומית (דורשת Android SDK + Gradle)

```bash
cd android
gradle :app:assembleRelease        # או: ./gradlew :app:assembleRelease
# Unsigned APK output:
#   android/app/build/outputs/apk/release/app-release-unsigned.apk
```

## Sign with the PERMANENT key (required so it installs over previous builds)

```bash
zipalign -p -f 4 app-release-unsigned.apk yoman-aligned.apk
apksigner sign --ks ../signing/yoman.keystore --ks-key-alias yoman \
  --ks-pass pass:yoman123 --key-pass pass:yoman123 \
  --out yoman-avoda.apk yoman-aligned.apk
apksigner verify --print-certs yoman-avoda.apk    # SHA256 must be 29:F5:0B:...:F8:B5
```

(or run `../signing/sign-apk.sh app-release-unsigned.apk yoman-avoda.apk`)

## Notes
- בדיקת האוטו-אפדייט מול GitHub `raw` **נשארה כפי שהיא**, אבל משמעותה השתנתה:
  מעכשיו `location.reload()` באמת מביא את הקוד החדש (הדף הוא https ולא
  `file://`), ולכן שחרור web כבר לא דורש בניית APK.
- First install of a build signed with this permanent key requires a one-time
  uninstall of the old app (different signature). After that, installs are seamless.
