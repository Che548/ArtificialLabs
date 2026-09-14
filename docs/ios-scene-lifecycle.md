---
title: "Жизненный цикл окна iOS"
document_id: SFERA-319FADEF4D
audience: developer
status: active
updated: 2026-09-14
baseline_commit: ea85ac93db13b81d674aefc2cbe55f67428471bf
source_scope: working-tree
---

# Жизненный цикл окна iOS

## Нативный запуск и жизненный цикл окна

Плагин `with-ios-scene-lifecycle` регистрирует одну конфигурацию `UIWindowScene`, отключает несколько сцен и добавляет `SceneDelegate` в Swift AppDelegate. Его место в `app.json` следует за плагином защиты локального хранилища. Это позволяет сохранить уже созданный экран отказа защиты данных и не запустить React поверх него.

В Debug окно и development launcher создаются в `didFinishLaunching`; подключившаяся сцена присоединяет то же окно. В Release React запускается после подключения сцены, если у окна ещё нет `rootViewController`. Начальные URL и universal links переносятся в launch options, последующие события передаются подписчикам Expo. Переходы foreground/background также пробрасываются в существующий AppDelegate.

Преобразование распознаёт собственный маркер и не добавляет второй SceneDelegate при повторном prebuild. Неожиданная форма исходного AppDelegate либо язык, отличный от Swift, приводят к явной ошибке. Нативный класс и manifest сцены требуют новой сборки и установки; пакет JavaScript не может добавить их в уже установленный runtime. Проверяются холодный запуск, возврат из фона, вход по ссылке и сохранение экрана ошибки защищённого хранилища.

## Первичные источники

- [plugins/with-ios-scene-lifecycle.js](<../plugins/with-ios-scene-lifecycle.js>)
- [plugins/with-ios-scene-lifecycle.test.js](<../plugins/with-ios-scene-lifecycle.test.js>)
- [app.json](<../app.json>)

## Связанные материалы

- [Единый индекс](<README.md>)
