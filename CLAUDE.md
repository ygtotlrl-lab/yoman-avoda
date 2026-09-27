# יומן עבודה — CLAUDE.md

הטבלה ב-`TABLE.md` — מקור האמת היחיד ליכולת; סשן קורא ממנה את הפרקים שהסבב נוגע בהם.

## מפת המסכים
- מסך ⟵ מודול: בחירת ישיבה ומציג טבלת התשתית ⟵ `app/screens/pick.js` · `entry` (הזנה) ⟵ `app/screens/entry.js` · `log` (יומן, ייצוא הדוח ושיתופו) ⟵ `app/screens/log.js` · `settings` (עריכה) ⟵ `app/screens/settings.js` · `archive` (עם עריכה במקום) ⟵ `app/screens/archive.js`. הסנכרון, המיזוג והתאריכים — `app/domain.js`; העלייה, החלפת הישיבה ומפת הפעולות — `app/main.js`.
- בחירת ישיבה בעלייה הראשונה, ובלחיצה על הלוגו — בורר ב-`openModal` ואישור ב-`ask`.
- ייצוא הדוח היומי כתמונה (JPEG, `_buildReportDiv`/`_renderReport`) ושיתופו.
- מציג טבלת התשתית — נמשך בזמן אמת מ-`TABLE.md` שב-GitHub (`RAW_BASE`).

## מונחי התחום
- ישיבה — המוסד: ראשון לציון ורמת אביב. במכשיר — סיומת למפתח (`_rishon` / `_ramataviv`); בענן — עמודת `yeshiva`. מוסד שלישי דורש אפס DDL.
- רשומה — שורה ביומן היום; «סיום יום» מעביר את רשומות היום לארכיון.
- סנאפשוט — יחידת הארכיון, יום אחד (`gdate`), ובתוכו רשומות שממוזגות פר-רשומה.
- קטגוריות (`ya_cats`, מפתח `letter`) ותת-נושאים (`ya_subs`, `ya_subs_meta`).

## הכרעות מוצר
- החלפת ישיבה בלי טעינה מחדש: `yaResetTenantState` רצה לפני `selectYeshiva`, כי עֵד הדחיפה ואות הפולינג הם זיכרון בלי סיומת; `selectYeshiva(again)` מדלגת על `pendBoot` בלבד.
- פולינג כל 3 שניות, ומיזוג ברמת רשומה.
- מנוע המיזוג: `mergeRecords(local, remote, getKey, mergePair)` — הענן בסיס הסדר ומנצח בשוויון. נגזרות: `mergeEntries` (`id`) · `mergeArchive` (`gdate`) · `mergeCats` (`letter`) · `mergeSubs` (פר-מפתח לפי `SUBS_META`).
- רשומה בלי `updatedAt` נחשבת ts=0, ואינה מוחתמת ב-`Date.now()` בטעינה — מכשיר ישן היה מנצח נתונים חדשים.
- «סיום יום»: העותקים לארכיון וה-tombstones של החיים באותה חותמת, והסנאפשוט מנצח בשוויון — ארכוב אינו מחיקה.
- גריעת tombstones — רק `deleted:true` עם `updatedAt` מספרי, ועל התוצאה הממוזגת.
- `ya_entries` מאוחדת — החי והארכיון יחד, בדגל `archived`. `yaRowsGet` מסננת `.eq('archived', …)` עם `order('rec_key')`, ו-`yaSortRows` ממיינת בקוד — `rec_key` אינו סדר תאריכים.
- `client_id` נגזר ממפתח המיזוג (`entryKey`/`archiveKey`) ואינו uuid חדש.
- פירוק הסנאפשוט לרשומות הוא מנוע מיזוג אחר — החלטת מנהל, לא תופעת לוואי.
- בונה סנאפשוט אחד — `arcPutSnapshot` — ל-`autoArchiveDay` ול-`checkDayChange`; `snapHDate` טהורה.
- ההגדרות — טבלה לכל ישיבה: `ya_settings_rishon` / `ya_settings_ramataviv`, והן הבית של `ya_cats` · `ya_subs` · `ya_subs_meta` ושל `last_changed`.
- עֵד הפינוי הוא `_yaPushedAt[key]` (אחרי `pushTable` שהחזירה `ok`) — ולא `_lastKnownTimestamp`, שמתעדכן גם במשיכה.
- `LS_CFG.oldRecords` נבנית ב-`lsRebuildPolicy()` מ-`selectYeshiva`, וחלה על הישיבה הפעילה בלבד; החלון שנתי.
- `gdate` נשמר בצורת `gregDateStr` («25 נובמבר 2025») ולא ISO, וזו הצורה היחידה; `_yaRecTs` גוזרת ממנו בעוגן צהריים.
- `CACHE_NAME` ב-`sw.js` הוא מזהה הגרסה היחיד; `RAW_BASE` משמש את מציג הטבלה בלבד.
