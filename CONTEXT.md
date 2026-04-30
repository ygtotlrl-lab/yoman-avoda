# יומן עבודה — קונטקסט פיתוח

## פרטי ריפו
- **ריפו:** `ygtotlrl-lab/yoman-avoda`
- **GitHub Pages:** `https://ygtotlrl-lab.github.io/yoman-avoda/`
- **טוקן:** TOKEN_IN_MEMORY
- **קובץ ראשי:** `index.html`
- **Supabase:** project `kxbtskqobynewvnckaaz` | טבלת `kv`

---

## APK — שיטה עובדת

### Keystore
- `/tmp/yoman.keystore` | alias=yoman | pass=yoman123

### תהליך
```bash
# 1. פרוק את ה-APK המקורי (חובה! לא APK אחר)
apktool d yoman-avoda.apk -o /tmp/yw_work -f

# 2. תקן URL ב-smali
old = 'https://ygtotlrl-lab.github.io/yoman-avoda/%D7%99%D7%95%D7%9E%D7%9F%20%D7%A2%D7%91%D7%95%D7%93%D7%94.html'
new = 'https://ygtotlrl-lab.github.io/yoman-avoda/index.html'
# קבצים: MainActivity.smali, MainActivity$2.smali

# 3. החלף אייקון - גרין_מיט_ווייסן_הינטערגרונט.png
# res/mipmap-*/ic_launcher.png + assets/icons/*.png + assets/index.html

# 4. מחק build!
rm -rf /tmp/yw_work/build

# 5. בנה וחתום
apktool b /tmp/yw_work -o built.apk
zipalign -f 4 built.apk aligned.apk
apksigner sign --ks /tmp/yoman.keystore --ks-key-alias yoman \
  --ks-pass pass:yoman123 --key-pass pass:yoman123 \
  --out output.apk aligned.apk
```

### ⚠️ Cache APK — כלל זהב
Claude.ai שומר cache לפי שם קובץ. תמיד השתמש בשם חדש שלא היה בשימוש:
```bash
TS=$(date +%s) && apksigner sign ... --out /mnt/user-data/outputs/yoman-${TS}.apk
```

### אייקון נכון
- `גרין_מיט_ווייסן_הינטערגרונט.png` — לוגו ירוק על רקע לבן ✅
- **לא** `choice-icon-512.png` — מכיל רקע ירוק עם מסגרת ❌

### URLs ב-APK
- **ONLINE:** `https://ygtotlrl-lab.github.io/yoman-avoda/index.html`
- **OFFLINE:** `file:///android_asset/index.html`
- תמיד לתקן ב-smali, לא ב-binary patch!

---

## פיצ'רים קיימים
- PDF export עם Hebrew + category colors
- JPEG export עם שם עברי
- WhatsApp sharing
- עריכה inline בלוג ובארכיב
- ניהול ארכיב ללא כפילויות
- Hebrew leap year (אדר ראשון/שני)
- שמירת מספר WhatsApp ב-localStorage
- PWA מותקן

## פנדינג
- PWA/APK Enter-key shortcuts
