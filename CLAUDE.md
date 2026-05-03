# יומן עבודה — CLAUDE.md

## סביבת עבודה
- **ריפו:** `ygtotlrl-lab/yoman-avoda`
- **Pages:** `https://ygtotlrl-lab.github.io/yoman-avoda/`
- **קובץ ראשי:** `index.html`
- **טוקן:** `TOKEN_IN_MEMORY`
- **push:** `git push https://TOKEN@github.com/ygtotlrl-lab/yoman-avoda.git main`
- **Supabase:** `kxbtskqobynewvnckaaz` | טבלת `kv`

## כללים — חובה לפני כל push
1. `node --check index.html` — חובה מוחלטת
2. אין `async function` עם רווח בין המילים
3. אין `var X = [H(...)]` גלובלי
4. `onclick` ב-HTML — תמיד `window.functionName()`

## בדיקת syntax
```bash
python3 -c "
import re, subprocess
c = open('index.html').read()
scripts = re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>', c, re.DOTALL)
open('/tmp/check.js','w').write('\n'.join(scripts))
r = subprocess.run(['node','--check','/tmp/check.js'],capture_output=True,text=True)
print('✅ OK' if r.returncode==0 else '❌ '+r.stderr[:300])
"
```

## APK
- **Keystore:** `/tmp/yoman.keystore` | alias=`yoman` | pass=`yoman123`
- **אייקון:** `גרין_מיט_ווייסן_הינטערגרונט.png` (לוגו ירוק על לבן)
- **URL ב-smali:** `index.html` (לא יומן%20עבודה.html)
- מחק `/tmp/yw_work/build` לפני בנייה
- cache APK: תמיד שם חדש `yoman-$(date +%s).apk`

## ⚠️ cache APK — כלל זהב
Claude.ai שומר cache לפי שם קובץ — תמיד timestamp בשם:
```bash
TS=$(date +%s)
apksigner sign ... --out /mnt/user-data/outputs/yoman-${TS}.apk
```

## ארכיטקטורה
- SPA אחד — `index.html`
- Hebrew calendar עם תמיכה בשנה מעוברת (אדר א/ב)
- Supabase sync + localStorage
- PWA עם Service Worker network-only

## פיצ'רים קיימים
- יומן עבודה יומי עם PDF/JPEG export
- ארכיב ללא כפילויות
- WhatsApp sharing
- Hebrew calendar
- Supabase sync
