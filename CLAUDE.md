# יומן עבודה — CLAUDE.md

## סביבת עבודה
- **ריפו:** `ygtotlrl-lab/yoman-avoda`
- **Pages:** `https://ygtotlrl-lab.github.io/yoman-avoda/`
- **טוקן:** מאוחסן ב-Windows Credential Manager (host `github.com`) — לעולם לא בקובץ. `git push`/`clone` מושכים אותו אוטומטית דרך GCM.
- **קובץ ראשי:** `index.html`
- **Supabase:** `kxbtskqobynewvnckaaz`

## התחלת סשן — חובה
```bash
git clone https://github.com/ygtotlrl-lab/yoman-avoda.git /tmp/yoman-avoda
cd /tmp/yoman-avoda
git config user.email "dev@yeshiva.com" && git config user.name "Dev"
```

## לפני כל push — חובה
```bash
python3 -c "
import re, subprocess
content = open('/tmp/yoman-avoda/index.html').read()
scripts = re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>', content, re.DOTALL)
with open('/tmp/test_syntax.js','w') as f: f.write('\n'.join(scripts))
r = subprocess.run(['node','--check','/tmp/test_syntax.js'],capture_output=True,text=True)
print('✅ OK' if r.returncode==0 else '❌ '+r.stderr[:300])
"
```

## Push
```bash
cd /tmp/yoman-avoda
git add . && git commit -m "תיאור השינוי"
git push origin main   # GCM מספק את הטוקן אוטומטית — אין טוקן בפקודה
```

## כללים קריטיים
1. **node --check לפני כל push** — חובה
2. **smali בלבד** לתיקון URLs ב-APK
3. **cache APK** — תמיד `TS=$(date +%s)` בשם
4. **מקור אמת יחיד = `index.html`** — זה הקובץ שמעטפת ה-APK טוענת (Pages: `.../yoman-avoda/index.html`), שאליו מצביע `start_url` במניפסט, וגם היעד של מנגנון האוטו-אפדייט הפנימי. כל עדכון קוד נכנס לכאן בלבד. **אסור ליצור קבצי HTML כפולים** (בעבר היה `יומן עבודה.html` — שונה ל-`index.html`).
5. **`GITHUB_FILE` במנגנון האוטו-אפדייט חייב להתאים לשם הקובץ האמיתי בריפו** (`index.html`). אם הוא מצביע על שם אחר (כמו `יומן_עבודה.html`) — `RAW_URL` מקבל 404, האפליקציה לא מזהה גרסה חדשה, ועדכונים לא מגיעים למכשירים מותקנים.
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

## פיצ'רים קיימים
- PDF/JPEG export, WhatsApp sharing
- ארכיב ועריכה inline
- Hebrew calendar עם leap year
- Supabase sync (polling 3 שניות)
- PWA מותקן
