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
- Public beta installation: `/beta/` (no Auth/Convex; device detection and QR are local)
- Administrative routes belong in `app/(protected)/`; do not move their gate to
  a client-side pathname exception. `/beta/` is the only public content route.
- Design decisions and token roles: `DESIGN.md`

Beta checks: `npm --prefix admin run verify`, then
`npx playwright test --config playwright.beta.config.ts` from the repository root.
Tests serve the actual static export and include WebKit phone/tablet profiles.

Для production выполните `npm run build`: в `out/` попадает только статическая
оболочка. `NEXT_PUBLIC_CONVEX_URL` является публичным endpoint; admin key,
ключ подписи и HMAC secret никогда не являются build arguments.
