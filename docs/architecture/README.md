# Архитектура «Сферы» — комплект Markdown

Актуальное уточнение ёмкости: [E2E и фактический учёт запросов](e2e-request-audit.md).

Проверка: 2026-09-13, main `2837cda34bc06c8adf0251c11bbad0bf203af824`.

1. [Текущая система](service-architecture.md) — инфраструктура, простая схема,
   подробные потоки, SMS/email, согласия, OCR, sync, OTA и два абзаца для презентации.
2. [Модель данных](database-model.md) — Convex, SQLCipher, файлы и временная обработка.
3. [Целевая система](target-service-architecture.md) — PostgreSQL/S3/GitLab отдельно от текущей.
4. [Целевой k3s](target-k3s-three-zones.md) — три зоны, девять VM, HA и проверяемый failback.
5. [Инфраструктурный whitepaper](infrastructure-whitepaper.md) — ресурсы Fred/junk и итоговый отчёт DevOps 12:29 MSK: три отдельных K3s на одной площадке, overcommit, реплики, ограничения backup/HA и методика измерения ёмкости.
6. [Ёмкость девяти физических машин](target-capacity-nine-hosts.md) — отдельная цель и реальный изолированный нагрузочный тест приложения на junk, 14:09–14:12 MSK.

В `.md` находятся Mermaid-схемы. Их редактируемые копии находятся в
`diagrams/`; ссылки даны в соответствующих документах. Достаточно переслать
четыре Markdown-файла для чтения в Mermaid-совместимом редакторе.

### Готовые изображения

- [Текущая система — обзор](diagrams/current-simple.drawio.png).
- [Подробные взаимодействия](diagrams/current-interactions.drawio.png).
- [Модель данных](diagrams/database-model.drawio.png).
- [Цель PostgreSQL/S3/GitLab](diagrams/target-services.drawio.png).
- [k3s — обзор](diagrams/target-k3s-simple.drawio.png).
- [k3s — три зоны в трёх колонках](diagrams/target-k3s-placement.drawio.png).

Все шесть схем преобразованы в draw.io, экспортированы в PNG и визуально
проверены. XML прошёл `xmllint`; локальные ссылки основного комплекта и
`git diff --check` проверены. Кодовые ссылки относительны корню репозитория;
для их переходов нужен checkout указанного commit. npm/native/E2E не
запускались: код и конфигурация не менялись, проверка документационная.

Исторические `service-architecture.png`, `database-model.png` и одноимённые
PDF в этом каталоге **не обновлены и не являются актуальным комплектом**.
Они сохранены, чтобы не удалять прежние материалы. Для новой отправки
использовать Markdown и новые файлы из `diagrams/`.

Проверялись код/Compose/workflows и безопасный состав сервисов на junk.
Не проверялись повторно runtime-флаги, полный DNS/ACL, реальные пользовательские
данные и доступность всех внешних провайдеров. Схемы не заменяют HA-испытания.
Push, Telegram, миграции, отправка сообщений и выпуск обновлений не выполнялись.
