# יומן עבודה — CLAUDE.md

הטבלה ב-`TABLE.md` — מקור האמת היחיד ליכולת; סשן קורא ממנה את הפרקים שהסבב נוגע בהם.

## מפת המסכים
- מסך ⟵ מודול: בחירת ישיבה ומציג טבלת התשתית ⟵ `app/screens/pick.js` · `entry` (הזנה) ⟵ `app/screens/entry.js` · `log` (יומן) ⟵ `app/screens/log.js` · `settings` (עריכה) ⟵ `app/screens/settings.js` · `archive` (עם עריכה במקום) ⟵ `app/screens/archive.js`. הנתונים והמחרוזות — `app/constants.js`; מצב הריצה ו-`shell` — `app/state.js`; הסנכרון, המיזוג והתאריכים — `app/domain.js`, והדוח היומי — בנייתו, ייצואו ושיתופו — `app/domain.report.js`; החיווט, העלייה, החלפת הישיבה ומפת הפעולות — `app/main.js`.
- בחירת ישיבה בעלייה הראשונה, ובלחיצה על הלוגו — בורר ב-`openModal` ואישור ב-`ask`.
- ייצוא הדוח היומי כתמונה (JPEG, `_buildReportDiv`/`_renderReport`) ושיתופו.
- מציג טבלת התשתית — נמשך בזמן אמת מ-`TABLE.md` שב-GitHub (`RAW_BASE`).

## מונחי התחום
- ישיבה — המוסד: ראשון לציון ורמת אביב. במכשיר — תחילית המראה (`ya_mirror_<ישיבה>_`) וסיומת המפתחות הפרטיים (`_rishon` / `_ramataviv`); בענן — עמודת `yeshiva`. מוסד שלישי דורש אפס DDL.
- רשומה — שורה ביומן היום; «סיום יום» מעביר את רשומות היום לארכיון.
- רשומה בארכיון — אותה שורה ב-`ya_entries`, בדגל `archived`; מסך הארכיון מקבץ לפי `entry_date`.
- קטגוריות (`cats`, מפתח `id`) — מפתח בטבלת ההגדרות; בכל קטגוריה משימות — פריטים במפתח `id` (שם המשימה), ובכל משימה מפתחות-המשנה שלה (`subs`).

## הכרעות מוצר
- החלפת ישיבה בלי טעינה מחדש: `selectYeshiva(y)` מריצה את `yaResetTenantState` בכניסה חוזרת, כי עֵד הדחיפה ואות הבדיקה המחזורית הם זיכרון בלי סיומת; והליבה עולה בכל כניסה — `coreBoot()`, שכל מנגנון בה נדרך פעם אחת.
- בדיקה מחזורית כל 3 שניות, ומיזוג ברמת רשומה.
- מנוע המיזוג: `mergeCore(local, remote, opts)` — הענן בסיס הסדר ומנצח בשוויון, והבסיס בזוג מוכרע ב-`mergeWinner`. נגזרות: `mergeEntries` (`client_id`, החי והארכיון יחד — הדגל נוסע עם הרשומה, ו-`yaAdoptRows` מפצלת לפיו) · `mergeCats` (`id`, והמשימות שבתוכה פר-פריט).
- רשומה בלי `updated_at` נחשבת ts=0, ואינה מוחתמת ב-`Date.now()` בטעינה — מכשיר ישן היה מנצח נתונים חדשים.
- «סיום יום» — `arcMove`: הרשומה נשארת בשורתה, `archived = true` בחותמת חדשה, בלי העתק ובלי מצבה — ארכוב אינו מחיקה.
- גריעת tombstones — רק `deleted:true` עם `updated_at` מספרי, ועל התוצאה הממוזגת.
- `ya_entries` מאוחדת — החי והארכיון יחד, בדגל `archived`. `yaRowsGet(archived)` מסננת `.eq('archived', …)` כשהדגל נמסר ומעמדת לפי `client_id`, ו-`yaSortRows` ממיינת בקוד — `client_id` אינו סדר תאריכים.
- מזהה רשומה — `newClientId()`, בחי ובארכיון כאחד.
- ההגדרות — טבלה לכל ישיבה: `ya_settings_rishon` / `ya_settings_ramataviv`, והן הבית של `cats` ושל `last_changed`.
- המראה — שתי טבלאות: `ya_entries` (החי והארכיון, בדגל) וטבלת ההגדרות של הישיבה (`cats` · `cats_reset` בלבד); הזיכרון (`ENTRIES` · `ARCHIVE` · `CATS`) נבנה ב-`yaMirrorLoad`, והכתיבה לדיסק — `yaMirrorRows` / `yaCatsPut`. שמירה אחת — `saveRows`.
- עֵד הפינוי נרשם בליבה, ב-`pushTable` (`pushedFor(YA_ROWS_TABLE)`), ומתאפס ב-`ctxSwitch` — ולא `_lastKnownTimestamp`, שמתעדכן גם במשיכה.
- `LS_CFG.oldRecords` נבנית ב-`lsRebuildPolicy()` מ-`selectYeshiva`, וחלה על הישיבה הפעילה בלבד; החלון שנתי.
- `entry_date` נשמר ב-ISO (`YYYY-MM-DD`), וזו הצורה היחידה; `gregDateStr` — לתצוגה בלבד, דרך `yaGreg`.
- `CACHE_NAME` ב-`sw.js` הוא מזהה הגרסה היחיד; `RAW_BASE` משמש את מציג הטבלה בלבד.
