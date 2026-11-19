# Ultra TV 0.24 — контрольная точка / плавное усиление фиолетовой подсветки

Дата: 19.11.2026. Источник: рабочая Ultra TV 0.23 (ветка `feature/uvideo-tv-v023-sort-dpad-clean-wheel`, детальный handoff `ULTRA_TV_V023_HANDOFF.md`). Отдельная ветка текущего исходного кода: `feature/ultra-tv-v024-brighter-focus-halo`.

## Запрос пользователя
«Посмотрим яркость сначала увеличим подсветки, лучше будет выделяться или нет. В целом-то нормально размеры». Поэтому **не менять размеры карточек**, масштаб выделенной карточки (10,5%), межкарточные расстояния, графитовую тему, логотип и код плеера. Увеличить **только яркость центрального оттенка** фиолетового градиента подсветки карточек.

## Изменение
В `android-tv/app/src/main/assets/tv.css` ровно **одно** вхождение заменено:
```diff
-   rgba(171,115,202,.79) 0%,
+   rgba(171,115,202,.90) 0%,
```
Это статический radial-gradient псевдоэлемента `#content .card::before`; других градиентов, `blur`, анимаций и размеров не трогали. Во избежание старого CSS в кеше `tv.html` `tv.css?v=23` -> `tv.css?v=24`, JavaScript остался **исходным** `tv.js?v=23`. Бамп `versionCode` 23 -> 24, `versionName` `0.24-tv-brighter-halo`.

## Проверки, исходники
- Проверка Python: CSS 0.24 является **побайтным эквивалентом CSS 0.23 с единственной указанной заменой**, JavaScript/логотип/фон `tv-bg-graphite-v020.jpg` побайтно совпадают с 0.23.
- Запущен изолированный Chromium тест `D:\UltraTVTools\uvideo-tv-v024-work\check-ui-v024.cjs`: **CHECKS PASS_ALL**. Контроль computed style: `rgba(171, 115, 202, 0.9)`, выбранная карточка `matrix(1.105,...)`; 1,2,8 карточек в верхней карусели, быстрые клавиши и сортировка ←/↑/↓/→ — PASS. Значки Play в карусели по-прежнему отсутствуют.
- Локальные тесты `design-v017.test.cjs`, `initem-progress.test.cjs`, `progress-display.test.cjs`: PASS. Android Gradle 8.10.2 offline с JDK17: **BUILD SUCCESSFUL**. APK Signature Scheme v2/v3 успешно проверены, **исходный сертификат сохранён**.
- Проверка ресурсов внутри APK: CSS, JS, HTML, оригинальный логотип, оригинальный JPG совпадают с файлом исходников. Новых скриптов/зависимостей в приложение не добавляли.
- Ветка с изменениями в GitHub: commit `3d1a94d403fd6a04ed395bf68ecb0f8a208276aa`.
- Локальная рабочая папка: `D:\UltraTVTools\uvideo-tv-v024-work\source\android-tv`.
- Подписанный APK: `D:\UltraTVTools\uvideo-tv-v024-work\UVideoTV_v024_signed.apk`, 612208 байт, SHA256 `6221bfaf8c283b76e561d98badbe21caf11eb226cdd7273925b56763503fd461`.
- Резерв: `D:\UltraTV_Safety\local-signed-versions\UVideoTV_v024_signed.apk`.
- SHA256 сертификата (v2/v3, тот же): `2aa8316ac1888806e45015b5728aa089e74c91439856cd1ade1264be97d56d47`.

## Публикация
GitHub main commit `0f0c20375cc2e0b630d4dc5c05f3597ba95b7567` заменил `a.apk` и `tv-update.json`. Публичный Cloudflare Pages `https://ultra-tv-ai.pages.dev/tv-update.json` проверен: **versionCode 24**. Публичный `https://ultra-tv-ai.pages.dev/a.apk` скачан на PC; **LIVE_MATCH=True** по SHA256 `6221bfaf8c283b76e561d98badbe21caf11eb226cdd7273925b56763503fd461`.

**Следующий шаг:** пользователь сам оценит визуально на KION, отличается ли выделение от 0.23; никаких иных изменений без нового запроса. Размеры/фокус не менять.

## Плеер Initem
Внешний сбой на домене Initem ранее исчез по сообщению пользователя («Заработал!»). В 0.24 **не вносились никакие изменения в интеграцию Initem**. Исследование альтернатив и изолированные тесты хранятся отдельно.
