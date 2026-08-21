from __future__ import annotations

from pathlib import Path

from reportlab.pdfgen import canvas

from render_database_model_pdf import PAGE_H, PAGE_W, arrow, line, register_fonts, rounded_box


OUT = Path(__file__).with_name("service-architecture-1920x843.pdf")


def group_frame(c: canvas.Canvas, x: float, y: float, w: float, h: float, title: str) -> None:
    c.setStrokeColorRGB(0.48, 0.48, 0.48)
    c.setLineWidth(0.8)
    c.setDash(5, 4)
    c.roundRect(x, y, w, h, 10, stroke=1, fill=0)
    c.setDash()
    c.setFillColorRGB(1, 1, 1)
    c.rect(x + 13, y + h - 7, max(90, len(title) * 6.8), 16, stroke=0, fill=1)
    c.setFillColorRGB(0.12, 0.12, 0.12)
    c.setFont("Montserrat-SemiBold", 9.4)
    c.drawString(x + 18, y + h - 2, title.upper())


def ortho(
    c: canvas.Canvas,
    points: list[tuple[float, float]],
    dashed: bool = False,
) -> None:
    for start, end in zip(points, points[1:-1]):
        line(c, start[0], start[1], end[0], end[1], dashed=dashed)
    if len(points) >= 2:
        start, end = points[-2], points[-1]
        arrow(c, start[0], start[1], end[0], end[1], dashed=dashed)


def node(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    title: str,
    fields: list[str],
    stereotype: str,
    field_size: float = 9.2,
) -> None:
    rounded_box(c, x, y, w, h, title, fields, stereotype, field_size=field_size)


def render() -> None:
    register_fonts()
    c = canvas.Canvas(str(OUT), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    c.setTitle("ArtificialLabs — сервисная архитектура")
    c.setAuthor("ArtificialLabs")
    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    # Containers.
    group_frame(c, 24, 270, 506, 548, "Expo native clients · iOS / Android")
    group_frame(c, 552, 470, 172, 210, "Public edge")
    group_frame(c, 746, 270, 598, 548, "Self-hosted Convex")
    group_frame(c, 1366, 570, 252, 248, "Server data plane · target")
    group_frame(c, 1640, 270, 256, 548, "External services")
    group_frame(c, 24, 24, 1320, 216, "Self-hosted GitLab delivery plane")

    # Native application.
    node(c, 44, 720, 466, 78, "Expo Router screens", ["профиль · журнал · анализы · скан · чат"], "React Native · TypeScript", 9.8)
    node(c, 44, 620, 466, 78, "React providers", ["AuthSession · HealthStore · Connectivity · Notifications"], "application state", 9.4)
    node(c, 44, 500, 220, 92, "SQLCipher SQLite", ["settings · records", "idempotent outbox"], "encrypted local database", 9.4)
    node(c, 286, 500, 224, 92, "Expo SecureStore", ["database key", "authentication session"], "device security", 9.4)
    node(c, 44, 382, 220, 92, "StripCV", ["test-strip recognition", "structured result"], "native on-device CV", 9.4)
    node(c, 286, 382, 224, 92, "Device files", ["scan photos · documents", "chat attachments"], "document storage", 9.4)
    node(c, 44, 290, 466, 66, "Local notifications", ["on-device schedules"], "expo-notifications", 9.6)

    arrow(c, 277, 720, 277, 698)
    arrow(c, 154, 620, 154, 592)
    arrow(c, 398, 620, 398, 592)
    ortho(c, [(44, 759), (34, 759), (34, 428), (44, 428)])
    arrow(c, 264, 428, 286, 428)
    ortho(c, [(264, 448), (275, 448), (275, 609), (277, 620)])
    ortho(c, [(510, 659), (520, 659), (520, 428), (510, 428)])
    ortho(c, [(510, 640), (526, 640), (526, 323), (510, 323)])

    # Edge.
    node(c, 572, 525, 132, 100, "TLS gateway", ["backend", "site · dashboard"], "frp-easy", 9.2)
    ortho(c, [(510, 659), (540, 659), (540, 575), (572, 575)])

    # Convex backend.
    node(c, 766, 720, 260, 78, "Reactive API", ["queries · mutations", "WebSocket updates"], "Convex", 9.4)
    node(c, 1064, 720, 260, 78, "HTTP actions", ["site proxy · service endpoints"], "Convex", 9.4)
    node(c, 766, 616, 260, 78, "Convex Auth", ["email + password", "sessions · refresh tokens"], "identity", 9.4)
    node(c, 1064, 616, 260, 78, "Domain functions", ["profile · health sync", "ownership checks"], "business logic", 9.4)
    node(c, 766, 512, 260, 78, "Chat action", ["consent · rate limits", "Yandex adapter"], "AI gateway", 9.4)
    node(c, 1064, 512, 260, 78, "Push component", ["token registry", "remote delivery"], "notifications", 9.4)
    node(c, 766, 408, 260, 78, "Cron", ["account purge", "30-day recovery window"], "scheduled jobs", 9.4)
    node(c, 1064, 408, 260, 78, "Convex Dashboard", ["admin-only access"], "operations", 9.4)

    ortho(c, [(704, 585), (736, 585), (736, 759), (766, 759)])
    ortho(c, [(704, 565), (734, 565), (734, 759), (1064, 759)])
    arrow(c, 896, 720, 896, 694)
    arrow(c, 1194, 720, 1194, 694)
    arrow(c, 896, 616, 896, 590)
    arrow(c, 1194, 616, 1194, 590)
    ortho(c, [(896, 486), (896, 499), (1044, 499), (1044, 655), (1064, 655)])

    # Server storage.
    node(c, 1386, 700, 212, 98, "PostgreSQL", ["transactional state", "Convex data"], "target database", 9.5)
    node(c, 1386, 590, 212, 88, "S3-compatible", ["modules · snapshots", "imports · exports · indexes"], "target object storage", 8.9)
    ortho(c, [(1324, 655), (1352, 655), (1352, 749), (1386, 749)])
    ortho(c, [(1324, 759), (1364, 759), (1364, 634), (1386, 634)])

    # External services.
    node(c, 1660, 710, 216, 88, "Yandex AI Studio", ["LLM responses"], "external AI", 9.6)
    node(c, 1660, 596, 216, 88, "Expo Push Service", ["push routing"], "external delivery", 9.6)
    node(c, 1660, 482, 216, 88, "APNs", ["iOS notifications"], "Apple", 9.6)
    node(c, 1660, 368, 216, 88, "FCM", ["Android notifications"], "Google", 9.6)
    ortho(c, [(1026, 551), (1042, 551), (1042, 496), (1628, 496), (1628, 754), (1660, 754)])
    ortho(c, [(1324, 551), (1638, 551), (1638, 640), (1660, 640)])
    arrow(c, 1768, 596, 1768, 570)
    ortho(c, [(1876, 640), (1888, 640), (1888, 412), (1876, 412)])

    # Delivery plane.
    node(c, 44, 92, 224, 108, "GitLab", ["source control", "merge requests"], "self-hosted", 9.6)
    node(c, 288, 92, 224, 108, "CI pipelines", ["verify · E2E", "Convex deploy"], "automation", 9.6)
    node(c, 532, 92, 224, 108, "GitLab Runner", ["isolated", "protected jobs"], "self-hosted", 9.6)
    node(c, 776, 92, 250, 108, "Container Registry", ["pinned infrastructure", "backend · dashboard images"], "GitLab", 9.1)
    node(c, 1046, 92, 278, 108, "Protected artifacts", ["signed APK · IPA", "test and release builds"], "CI output", 9.4)
    arrow(c, 268, 146, 288, 146)
    arrow(c, 512, 146, 532, 146)
    arrow(c, 756, 160, 776, 160)
    arrow(c, 756, 126, 1046, 126)
    ortho(c, [(644, 200), (644, 250), (1040, 250), (1040, 270)])
    ortho(c, [(901, 200), (901, 252), (1180, 252), (1180, 270)])
    ortho(c, [(1185, 200), (1185, 245), (277, 245), (277, 270)], dashed=True)

    c.showPage()
    c.save()


if __name__ == "__main__":
    render()
