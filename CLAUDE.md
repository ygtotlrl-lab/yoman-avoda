# יומן עבודה — CLAUDE.md

## סביבת עבודה
- **ריפו:** `ygtotlrl-lab/yoman-avoda`
- **Pages:** `https://ygtotlrl-lab.github.io/yoman-avoda/`
- **טוקן:** `TOKEN_IN_MEMORY`
- **קובץ ראשי:** `index.html`
- **Supabase:** `kxbtskqobynewvnckaaz`

## התחלת סשן — חובה
```bash
git clone https://TOKEN_IN_MEMORY@github.com/ygtotlrl-lab/yoman-avoda.git /tmp/yoman-avoda
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
git push https://TOKEN_IN_MEMORY@github.com/ygtotlrl-lab/yoman-avoda.git main
```

## כללים קריטיים
1. **node --check לפני כל push** — חובה
2. **smali בלבד** לתיקון URLs ב-APK
3. **cache APK** — תמיד `TS=$(date +%s)` בשם
4. **מקור אמת יחיד = `index.html`** — זה הקובץ שמעטפת ה-APK טוענת (Pages: `.../yoman-avoda/index.html`), שאליו מצביע `start_url` במניפסט, וגם היעד של מנגנון האוטו-אפדייט הפנימי. כל עדכון קוד נכנס לכאן בלבד. **אסור ליצור קבצי HTML כפולים** (בעבר היה `יומן עבודה.html` — שונה ל-`index.html`).
5. **`GITHUB_FILE` במנגנון האוטו-אפדייט חייב להתאים לשם הקובץ האמיתי בריפו** (`index.html`). אם הוא מצביע על שם אחר (כמו `יומן_עבודה.html`) — `RAW_URL` מקבל 404, האפליקציה לא מזהה גרסה חדשה, ועדכונים לא מגיעים למכשירים מותקנים.

## APK
- Keystore: `/tmp/yoman.keystore` | alias=yoman | pass=yoman123
- אייקון: `גרין_מיט_ווייסן_הינטערגרונט.png` (ירוק על לבן)
- URL: `https://ygtotlrl-lab.github.io/yoman-avoda/index.html`
- תקן תמיד ב-smali, לא binary patch

## פיצ'רים קיימים
- PDF/JPEG export, WhatsApp sharing
- ארכיב ועריכה inline
- Hebrew calendar עם leap year
- Supabase sync (polling 3 שניות)
- PWA מותקן
