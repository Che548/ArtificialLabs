# ArtificialLabs Admin

Защищённая статически экспортируемая Next.js-консоль для каталога тест-систем,
партий, калибровок, CMS, агрегированной телеметрии, мониторинга, доступа Admin
и аудита. Все права и данные проверяются Convex backend; медицинские данные и
профили пользователей в админку не передаются.

```bash
npm ci
npm run dev
```

- Production admin: `/` (Convex Auth + `adminMemberships`)
- Protected component catalog: `/kit`
- Design decisions and token roles: `DESIGN.md`

Для production выполните `npm run build`: в `out/` попадает только статическая
оболочка. `NEXT_PUBLIC_CONVEX_URL` является публичным endpoint; admin key,
ключ подписи и HMAC secret никогда не являются build arguments.
