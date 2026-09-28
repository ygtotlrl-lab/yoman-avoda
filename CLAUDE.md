# יומן עבודה — CLAUDE.md

הטבלה ב-`TABLE.md` — מקור האמת היחיד ליכולת; סשן קורא ממנה את הפרקים שהסבב נוגע בהם.

## מפת המסכים
- מסך ⟵ מודול: בחירת ישיבה ומציג טבלת התשתית ⟵ `app/screens/pick.js` · `entry` (הזנה) ⟵ `app/screens/entry.js` · `log` (יומן) ⟵ `app/screens/log.js` · `settings` (עריכה) ⟵ `app/screens/settings.js` · `archive` (עם עריכה במקום) ⟵ `app/screens/archive.js`. הנתונים והמחרוזות — `app/constants.js`; מצב הריצה ו-`shell` — `app/state.js`; הסנכרון, המיזוג והתאריכים — `app/domain.js`, והדוח היומי — בנייתו, ייצואו ושיתופו — `app/domain.report.js`; החיווט, העלייה, החלפת הישיבה ומפת הפעולות — `app/main.js`.
- בחירת ישיבה בעלייה הראשונה, ובלחיצה על הלוגו — בורר ב-`openModal` ואישור ב-`ask`.
- ייצוא הדוח היומי כתמונה (JPEG, `_buildReportDiv`/`_renderReport`) ושיתופו.
- מציג טבלת התשתית — נמשך בזמן אמת מ-`TABLE.md` שב-GitHub (`RAW_BASE`).

## מונחי התחום
- ישיבה — המוסד: ראשון לציון ורמת אביב. במכשיר — סיומת למפתח (`_rishon` / `_ramataviv`); בענן — עמודת `yeshiva`. מוסד שלישי דורש אפס DDL.
- רשומה — שורה ביומן היום; «סיום יום» מעביר את רשומות היום לארכיון.
- סנאפשוט — יחידת הארכיון, יום אחד (`entry_date`), ובתוכו רשומות שממוזגות פר-רשומה.
- קטגוריות (`cats`, מפתח `letter`) ותת-נושאים (`subs`, `subs_meta`) — מפתחות בטבלת ההגדרות.

## הכרעות מוצר
- החלפת ישיבה בלי טעינה מחדש: `selectYeshiva(y)` מריצה את `yaResetTenantState` בכניסה חוזרת, כי עֵד הדחיפה ואות הפולינג הם זיכרון בלי סיומת; והכניסה החוזרת מדלגת על `pendBoot` בלבד.
- פולינג כל 3 שניות, ומיזוג ברמת רשומה.
- מנוע המיזוג: `mergeCore(local, remote, opts)` — הענן בסיס הסדר ומנצח בשוויון. נגזרות: `mergeEntries` (`client_id`) · `mergeArchive` (`client_id`, והרשומות שבתוכו פר-רשומה) · `mergeCats` (`letter`) · `mergeSubs` (פר-מפתח לפי `SUBS_META`).
- רשומה בלי `updated_at` נחשבת ts=0, ואינה מוחתמת ב-`Date.now()` בטעינה — מכשיר ישן היה מנצח נתונים חדשים.
- «סיום יום»: העותקים לארכיון וה-tombstones של החיים באותה חותמת, והסנאפשוט מנצח בשוויון — ארכוב אינו מחיקה.
- גריעת tombstones — רק `deleted:true` עם `updated_at` מספרי, ועל התוצאה הממוזגת.
- `ya_entries` מאוחדת — החי והארכיון יחד, בדגל `archived`. `yaRowsGet` מסננת `.eq('archived', …)` ומעמדת לפי `client_id`, ו-`yaSortRows` ממיינת בקוד — `client_id` אינו סדר תאריכים.
- מזהה הסנאפשוט נגזר מיומו — `snapClientId` (`<ישיבה>:<entry_date>`), ושני מכשירים שארכבו אותו יום מגיעים לאותה שורה; רשומה חיה — `newClientId()`.
- פירוק הסנאפשוט לרשומות הוא מנוע מיזוג אחר — החלטת מנהל, לא תופעת לוואי.
- בונה סנאפשוט אחד — `arcPutSnapshot` — ל-`autoArchiveDay` ול-`checkDayChange`.
- ההגדרות — טבלה לכל ישיבה: `ya_settings_rishon` / `ya_settings_ramataviv`, והן הבית של `cats` · `subs` · `subs_meta` ושל `last_changed`.
- עֵד הפינוי הוא `_yaPushedAt[key]` (אחרי `pushTable` שהחזירה `ok`) — ולא `_lastKnownTimestamp`, שמתעדכן גם במשיכה.
- `LS_CFG.oldRecords` נבנית ב-`lsRebuildPolicy()` מ-`selectYeshiva`, וחלה על הישיבה הפעילה בלבד; החלון שנתי.
- `entry_date` נשמר ב-ISO (`YYYY-MM-DD`), וזו הצורה היחידה; `gregDateStr` — לתצוגה בלבד, דרך `yaGreg`.
- `CACHE_NAME` ב-`sw.js` הוא מזהה הגרסה היחיד; `RAW_BASE` משמש את מציג הטבלה בלבד.
