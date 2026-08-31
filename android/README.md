# yoman-avoda — Native WebView APK

A native Android **WebView** shell (not a TWA) that loads the **live site** over the
network:

```
https://ygtotlrl-lab.github.io/yoman-avoda/
```

It replaces the PWABuilder TWA so that image sharing can attach the file via a
native bridge.

## מה בפנים

| | |
|---|---|
| **Package ID** | `com.yoman.avoda` — זהה למעטפת שהוא מחליף (חובה, אחרת זו אפליקציה נפרדת) |
| **טוען** | `https://ygtotlrl-lab.github.io/yoman-avoda/` — **מהרשת**, לא מנכסים מוטבעים |
| **versionCode** | 17 — קודם בסבב 73 (שקיפויות ארבעת הפסים הוגברו ל-0.60/0.73/0.87/1.0, וכל 16 נכסי האייקון נוצרו מחדש; ⛔ המחולל הוא מקור האמת היחיד ואין עריכה ידנית). 16 — קודם בסבב 71 (כל נכסי האייקון נוצרו מחדש ע"י `tools/gen-icons.mjs`, שהוא מעכשיו מקור האמת היחיד להם). 15 — קודם בסבב 71 (חמשת קובצי `ic_launcher_foreground` נגזרו מחדש לצלע תוכן 48/72/96/144/192 בדיוק, בהכפלה מוקדמת באלפא). 14 — קודם בסבב 68 (היסטוריית הגרסאות ירדה מהערות `build.gradle` — מקור אמת שני; ⛔ הטבלה הזו היא ההיסטוריה). 13 — קודם בסבב 67 (חמשת קובצי `ic_launcher_foreground` הוחלפו — תיקון צבעי הפסים). 12 — קודם בסבב 66 (רקע האייקון הוחלף במדרג שמשחזר את שוליי `ic_launcher`, ועשרת קובצי ה-mipmap הוחלפו). 10 — קודם בסבב 65 (מחיקת `copy-assets.sh` ותיקיית `assets/`, שאפס קוראים נמדדו להם). 9 = סבב 60 (הסרת הפרמטר `appPackage` מחתימת גשר השיתוף, בשני צדדיו: ה-Java וה-`index.html`). 8 = סבב 59 (הסרת מסלול ה-`setPackage` מהשיתוף: כל שיתוף עובר ב-`Intent.createChooser`, וגם הדגל `FLAG_ACTIVITY_NEW_TASK` ירד מבורר השיתוף). 7 = סבבים 57–58 (הסרת `FLAG_ACTIVITY_NEW_TASK` ממסלול השיתוף וממסירת יעד חיצוני ל-`ACTION_VIEW`). 6 = סבב 56 (עשרת אייקוני ה-mipmap של המעטפת הוחלפו). 5 = סבב 46ב (היפוך ברירת המחדל בקובצי התצורה), 4 = סבב 45, 3 = סבב 41 (חילוץ המעטפת), 2 = המעטפת שטוענת מהרשת, 1 = זו שטענה `file://`; חייב להיות גבוה יותר כדי להתקין מעליה |
| **minSdk / targetSdk** | 21 / 34 |
| **WebView** | JavaScript, DOM storage (localStorage — שם יושבים ENTRIES/ARCHIVE), DB. **בלי** גישת `file://` ובלי mixed content פתוח — האתר הוא https בלבד |
| **ניווט** | כל `http`/`https` **נשאר בתוך המעטפת**. שאר הסכימות (`tel:`, `whatsapp:`, …) נמסרות למערכת |
| **גשר שיתוף** | מוגבל לדומיין שלנו — ר' הפרק הבא |
| **בורר קבצים** | `WebChromeClient.onShowFileChooser` מחובר ל-`<input type=file>` |
| **אופליין** | ה-service worker של האתר. המעטפת מציגה דף שגיאה בעברית **רק** בהפעלה ראשונה בלי רשת |

<!-- SHARED:start id="android-web-update" -->
**עדכוני קוד web לא מצריכים APK חדש.** כל דחיפה ל-`main` מגיעה למכשירים דרך
אותו מנגנון service worker + באנר "גרסה חדשה זמינה" שכבר עובד בדפדפן. APK חדש
נדרש רק כששינוי נוגע במעטפת עצמה.
<!-- SHARED:end -->

<!-- SHARED:start id="android-origin-switch" -->
## ⚠️ מעבר-origin חד-פעמי — ולפני כל הפצת APK

ה-WebView של האפליקציה מחזיק **מחיצת אחסון משלו**, נפרדת מזו של הדפדפן באותו
מכשיר. מי שעבד עד עכשיו בדפדפן ועובר ל-APK מתחיל עם localStorage **ריק**:
כניסה מחדש, והעותק המקומי נטען מהענן — שהוא ממילא מקור האמת.

⛔ **מה שכן יכול ללכת לאיבוד: רשומה שנרשמה במכשיר וטרם עלתה לענן.** לכן —
**לפני כל הפצת APK, ודא בכל מכשיר שההגדרות ← «⏳ ממתין לסנכרון» מציג 0.**
רשומה שמסומנת ⏳ יושבת רק באותה מחיצת אחסון, ומעבר ה-origin ישאיר אותה מאחור.

⚠️ **ואותו מעבר קורה גם בהחלפת חתימה, לא רק בהחלפת origin:** התקנה ראשונה של
בנייה שנחתמה במפתח קבוע חדש מחייבת **הסרה חד-פעמית** של האפליקציה הישנה
(חתימה שונה ⇒ אנדרואיד רואה אפליקציה זרה ⇒ `INSTALL_FAILED_UPDATE_INCOMPATIBLE`),
וההסרה מוחקת את מחיצת האחסון שלה. מאותה נקודה ואילך ההתקנות חלקות.
⛔ **גם כאן «⏳ ממתין לסנכרון» נבדק לפני ההסרה ולא אחריה** — אחריה כבר אין מה
לבדוק.
<!-- SHARED:end -->

⚠️ **כאן המעבר הוא מ-`file://`** — גרסה 1 הטמיעה את `index.html` ב-`assets/`,
וגרסה 2 טוענת מהרשת. מי שמתקין את גרסה 2 מעל גרסה 1 מקבל localStorage **ריק**:
בחירת המוסד תתבקש שוב, והנתונים ייטענו מחדש מהענן
(`kv_rishon`/`kv_ramataviv`), שהוא ממילא מקור האמת.

<!-- SHARED:start id="android-icons" -->
## אייקונים

אייקוני המעטפת יושבים ב-`android/app/src/main/res/` — **עשרה קובצי `mipmap`**
(`ic_launcher.png` ו-`ic_launcher_foreground.png` בכל אחת מחמש הרזולוציות)
ו**קובץ XML אדפטיבי אחד**, `mipmap-anydpi-v26/ic_launcher.xml`, שהרקע שלו הוא
`res/drawable/ic_launcher_background.xml`.
⭐ **נמדד בארבעת הריפו — אותו מבנה בדיוק בכולן.**

⛔ **אין לערוך את קובצי ה-`mipmap` ידנית** — כולם נגזרים ממקור גרפי אחד, וכל
עריכה ידנית היא גרסה שנייה שתידרס בגזירה הבאה בלי שאיש יידע.
⚠️ **המקור עצמו נבדל פר-אפליקציה**, והוא מתועד בשורה שמתחת.
<!-- SHARED:end -->

⚠️ **המקור כאן:** `icons/icon-512.png` (לוח משימות + גרף), וממנו נגזרו
`ic_launcher` ו-`ic_launcher_foreground`.

<!-- SHARED:start id="android-shell-split" -->
## המעטפת — ליבה משותפת ומעטפת פר-אפליקציה (סבב 41)

`MainActivity.java` היה עד סבב 41 **ארבעה עותקים חופשיים** של אותה מעטפת:
hanhala ו-schar כמעט זהות בית-לבית, gius נבדלת בניסוח, ו-yoman כפולה בגלל
גשר השיתוף. שער החתימה של סבב 40 הקפיא את המצב, ⛔ אך לא איחד אותו.

מעכשיו הקוד מפוצל לשניים:

| קובץ | מה יש בו |
|---|---|
| `ShellActivity.java` | **הליבה המשותפת** — הגדרות ה-WebView, בורר הקבצים, `shouldOverrideUrlLoading`, דף האופליין, כפתור החזרה ושמירת המצב. ⭐ **זהה בית-לבית בארבעת הריפו** פרט לשורת ה-`package`. |
| `MainActivity.java` | **זהות בלבד** — הכתובת, משפט האופליין וצבע הכפתור, דרך שלוש מתודות. |

⛔ **אין להוסיף לוגיקה ל-`MainActivity`** (סבב 41) — התנהגות שנוספת
לאפליקציה אחת בלבד מחזירה בדיוק את ארבעת העותקים שהחילוץ החליף. מה שנחוץ
לכולן נכנס ל-`ShellActivity`; מה שנחוץ לאחת עובר דרך שתי הווים שהליבה
חושפת — `installBridge()` ו-`onShellNavigation(String)` — ונרשם כחריגה
מנומקת.

⚠️ **החריגה היחידה היום היא גשר השיתוף של yoman-avoda**, והיא מדודה: הליבה
נושאת חתימה אחת בארבעתן (`d8efd10bc6d47354`), ורק המעטפת של yoman נבדלת.
`tools/test_shell.mjs` אוכף את שתי החתימות, ו⛔ **נכשל אם נמצא גשר
בליבה** — גשר שם היה מגיע לארבע האפליקציות בבת אחת.
<!-- SHARED:end -->

## Build

### הדרך המומלצת — GitHub Actions (לא צריך שום דבר מותקן)

`.github/workflows/build-apk.yml`: Actions → **Build APK** → **Run workflow**.
ה-APK **החתום** יורד כ-artifact בשם `yoman-avoda-apk`.

**אין יותר שלב "copy web assets"** — ⛔ ואין להחזיר אותו (ר' הפרק שמעל).
⭐ **וגם `copy-assets.sh` ותיקיית `assets/` נמחקו (סבב 65)** — נמדד: אפס
קוראים בארבעת הריפו (workflow · gradle · manifest · קוד), והאיסור עצמו
כבר מגודר בחמישה מקומות. ⛔ שלד ששרד את תפקידו נקרא כהזמנה להחזירו.

### בנייה מקומית (דורשת Android SDK + Gradle)

⚠️ **בסביבת הענן אין Android SDK ו-`dl.google.com` חסום** — הדרך המעשית
היא ה-workflow. ⛔ ולא PWABuilder: הוא יודע לייצר TWA בלבד.

```bash
cd android
gradle :app:assembleRelease        # או: ./gradlew :app:assembleRelease
# Unsigned APK output:
#   android/app/build/outputs/apk/release/app-release-unsigned.apk
```

## Sign with the PERMANENT key (required so it installs over previous builds)

```bash
../signing/sign-apk.sh app/build/outputs/apk/release/app-release-unsigned.apk yoman-avoda.apk
```

### פרטי המפתח הקבוע

| | |
|---|---|
| **קובץ** | `signing/yoman.keystore` (PKCS12, RSA 2048, תקף עד 2053) |
| **alias** | `yoman` |
| **storepass / keypass** | `yoman123` (זהה לשניהם) |
| **SHA256** | `29:F5:0B:29:60:79:0B:77:28:25:7C:88:79:12:31:28:7A:B8:F1:D9:3E:90:B6:3B:50:F4:1E:41:B9:FA:F8:B5` |

אחרי חתימה מאמתים שה-SHA256 תואם לטבלה. ⚠️ המפתח הקודם (`/tmp/yoman.keystore`)
אבד; ההתקנה הראשונה של APK חתום במפתח הנוכחי דרשה **הסרה חד-פעמית**, ומאז
הוא קבוע. ⛔ לעולם לא להריץ `keytool -genkeypair` לפרויקט הזה.

## Notes
- בדיקת האוטו-אפדייט מול GitHub `raw` **נשארה כפי שהיא**, אבל משמעותה השתנתה:
  מעכשיו `location.reload()` באמת מביא את הקוד החדש (הדף הוא https ולא
  `file://`), ולכן שחרור web כבר לא דורש בניית APK.

<!-- SHARED:start id="android-smali-scope" -->
## תיקון URL ב-APK קיים ובנוי (בלי מקור) — smali בלבד

⚠️ **הפרק הזה רלוונטי רק ל-APK ישן שנבנה לפני `android/`.** בנייה רגילה היום
היא מ-`android/` דרך `.github/workflows/build-apk.yml`, והמעטפת טוענת מהרשת —
ולכן אין בה URL שצריך לתקן.
⛔ **smali בלבד — לא binary patch.** עריכה בינארית של ה-APK שוברת את החתימה
ואינה ניתנת לאימות, ⛔ והחתימה מחדש היא במפתח הקבוע של הריפו בלבד — ר' הפרק
«Sign with the PERMANENT key» שלמעלה.
⭐ **שני הקבצים שנושאים את ה-URL הם `MainActivity.smali` ו-`MainActivity$2.smali`**
— ⛔ וההוראה זהה בארבעת הריפו; הכתובת עצמה, שם תיקיית העבודה והמפתח הם
פר-אפליקציה, ⛔ ויושבים בבלוק שמתחת.
<!-- SHARED:end -->

```bash
apktool d <app>.apk -o /tmp/yw_work -f
rm -rf /tmp/yw_work/build          # חובה לפני בנייה חוזרת
apktool b /tmp/yw_work -o built.apk
zipalign -f 4 built.apk aligned.apk
apksigner sign --ks signing/yoman.keystore --ks-key-alias yoman \
  --ks-pass pass:yoman123 --key-pass pass:yoman123 --out output.apk aligned.apk
```

⚠️ **המפתח הישן שישב ב-`/tmp/yoman.keystore` אבד**; המפתח הקבוע הוא
`signing/yoman.keystore` שבריפו.

<!-- SHARED:start id="android-cache-apk" -->
### ⚠️ Cache APK — כלל זהב

שם קובץ חוזר נתפס במטמון — של הדפדפן, של מנהל ההורדות ושל המכשיר — והמשתמש
מתקין שוב את הבנייה **הקודמת** בלי לדעת. ⛔ **תמיד שם חדש בכל בנייה**, עם
חותמת זמן:
<!-- SHARED:end -->

```bash
TS=$(date +%s) && apksigner sign ... --out yoman-avoda-${TS}.apk
```
