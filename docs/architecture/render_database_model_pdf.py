from __future__ import annotations

from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PAGE_W = 1920
PAGE_H = 843
OUT = Path(__file__).with_name("database-model-1920x843.pdf")
FONT_REGULAR = Path("/tmp/Montserrat-Regular.ttf")
FONT_SEMIBOLD = Path("/tmp/Montserrat-SemiBold.ttf")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Montserrat", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("Montserrat-SemiBold", str(FONT_SEMIBOLD)))


def rounded_box(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    title: str,
    fields: list[str],
    stereotype: str | None = None,
    header_black: bool = True,
    field_size: float = 10.2,
) -> None:
    radius = 8
    header_h = 36 if stereotype else 28
    c.setLineWidth(1)
    c.setStrokeColorRGB(0.08, 0.08, 0.08)
    c.setFillColorRGB(1, 1, 1)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)

    c.saveState()
    path = c.beginPath()
    path.roundRect(x, y, w, h, radius)
    c.clipPath(path, stroke=0, fill=0)
    if header_black:
        c.setFillColorRGB(0.06, 0.06, 0.06)
        c.rect(x, y + h - header_h, w, header_h, stroke=0, fill=1)
    else:
        c.setFillColorRGB(0.93, 0.93, 0.93)
        c.rect(x, y + h - header_h, w, header_h, stroke=0, fill=1)
    c.restoreState()

    title_color = 1 if header_black else 0.05
    c.setFillColorRGB(title_color, title_color, title_color)
    if stereotype:
        c.setFont("Montserrat", 7.3)
        c.drawString(x + 10, y + h - 12, stereotype.upper())
        c.setFont("Montserrat-SemiBold", 11.4)
        c.drawString(x + 10, y + h - 28, title)
    else:
        c.setFont("Montserrat-SemiBold", 11.4)
        c.drawString(x + 10, y + h - 19, title)

    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont("Montserrat", field_size)
    top = y + h - header_h - 17
    step = 14.2 if field_size >= 9 else 12.4
    for index, field in enumerate(fields):
        c.drawString(x + 10, top - index * step, field)


def line(
    c: canvas.Canvas,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    dashed: bool = False,
    width: float = 0.8,
) -> None:
    c.saveState()
    c.setStrokeColorRGB(0.32, 0.32, 0.32)
    c.setLineWidth(width)
    if dashed:
        c.setDash(4, 3)
    c.line(x1, y1, x2, y2)
    c.restoreState()


def arrow(
    c: canvas.Canvas,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    dashed: bool = False,
) -> None:
    line(c, x1, y1, x2, y2, dashed=dashed)
    import math

    angle = math.atan2(y2 - y1, x2 - x1)
    size = 5
    for delta in (2.6, -2.6):
        c.line(
            x2,
            y2,
            x2 - size * math.cos(angle + delta),
            y2 - size * math.sin(angle + delta),
        )


def label(c: canvas.Canvas, text: str, x: float, y: float) -> None:
    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.setFont("Montserrat", 6.5)
    c.drawCentredString(x, y, text.upper())


def render() -> None:
    register_fonts()
    c = canvas.Canvas(str(OUT), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    c.setTitle("ArtificialLabs — логическая структура данных")
    c.setAuthor("ArtificialLabs")
    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    # Top-level identity and infrastructure.
    rounded_box(c, 30, 735, 180, 90, "User", ["+ Id id", "+ string email"], "Convex Auth", field_size=9.5)
    rounded_box(
        c,
        230,
        720,
        230,
        105,
        "AuthIdentity",
        ["+ AuthAccount[] accounts", "+ AuthSession[] sessions", "+ AuthRefreshToken[] refreshTokens"],
        "aggregate",
        field_size=8.7,
    )
    rounded_box(
        c,
        490,
        655,
        310,
        170,
        "Profile",
        [
            "+ Id userId · string displayName",
            "+ Goal goal · boolean onboardingCompleted",
            "+ string? phone · number? birthDate",
            "+ number? lastPeriodStartAt",
            "+ number? cycleLengthDays",
            "+ number? consentToCloudSyncAt",
            "+ number updatedAt",
        ],
        "cloud · aggregate root",
        field_size=9.3,
    )
    rounded_box(
        c,
        830,
        720,
        240,
        105,
        "AccountState",
        ["+ number? deletionRequestedAt", "+ number? scheduledDeletionAt", "+ number? restoredAt"],
        "cloud",
        field_size=8.8,
    )
    rounded_box(
        c,
        1100,
        720,
        250,
        105,
        "AIChatConsent",
        ["+ string provider · policyVersion", "+ number acceptedAt", "+ number? revokedAt"],
        "cloud",
        field_size=8.8,
    )
    rounded_box(
        c,
        1380,
        720,
        250,
        105,
        "LocalDatabase",
        ["+ settings key-value", "+ records entity-localId", "+ outbox idempotent queue"],
        "device · SQLCipher",
        field_size=8.8,
    )
    rounded_box(
        c,
        1660,
        770,
        230,
        55,
        "LocalRecord",
        ["entity · localId · payload · timestamps"],
        "encrypted JSON envelope",
        field_size=7.8,
    )
    rounded_box(
        c,
        1660,
        700,
        230,
        55,
        "OutboxItem",
        ["id · entity · localId · payload · updatedAt"],
        "encrypted pending write",
        field_size=7.8,
    )

    arrow(c, 210, 780, 230, 780)
    arrow(c, 460, 772, 490, 772)
    arrow(c, 800, 772, 830, 772)
    line(c, 800, 670, 1084, 670)
    arrow(c, 1084, 670, 1100, 720)
    line(c, 1630, 780, 1660, 797)
    line(c, 1630, 752, 1660, 727)

    rounded_box(
        c,
        810,
        580,
        300,
        64,
        "SyncEntity",
        ["+ string localId · number updatedAt · number? deletedAt"],
        "abstract",
        field_size=9.1,
    )
    arrow(c, 645, 655, 810, 612)
    line(c, 1775, 700, 1775, 665, dashed=True)
    line(c, 1775, 665, 1110, 612, dashed=True)

    entity_x = [38, 347, 656, 965, 1274, 1583]
    entity_w = 299
    row1_y, row2_y, entity_h = 385, 190, 170

    row1 = [
        ("MonitoringProgram", ["+ Goal type", "+ string title", "+ ProgramStatus status", "+ number startedAt"]),
        ("JournalEntry", ["+ number occurredAt · JournalKind kind", "+ string label", "+ string? textValue", "+ number? numericValue · unit", "+ DataSource source · sourceLocalId"]),
        ("LabResult", ["+ string catalogKey · title", "+ number collectedAt · LabStatus status", "+ Analyte[] analytes", "+ boolean hasLocalSourceDocument"]),
        ("ScanResult", ["+ string testSystemKey · number capturedAt", "+ ScanValue confirmedValue", "+ ScanSource · confidence · qualityFlags", "+ calibrationVersion · algorithmVersion", "+ confirmedByUser · hasLocalImage"]),
        ("Reminder", ["+ ReminderType type", "+ string title · body", "+ number dueAt", "+ number? readAt"]),
        ("MedicalCondition", ["+ string title", "+ ConditionStatus status", "+ number? diagnosedAt", "+ string? notes"]),
    ]
    row2 = [
        ("Medication", ["+ string name", "+ string? dosage · frequency", "+ boolean active", "+ startedAt · endedAt · notes"]),
        ("AllergyRisk", ["+ string allergen", "+ string? reaction", "+ Severity severity", "+ string? notes"]),
        ("HealthDocument", ["+ string title · DocumentCategory", "+ number documentDate", "+ boolean hasLocalFile", "+ mimeType · size"]),
        ("ChatConversation", ["+ string title", "+ number createdAt", "+ number lastMessageAt"]),
        ("ChatMessage", ["+ string conversationLocalId", "+ MessageRole role · MessageSource", "+ string text · number sentAt", "+ Generation? generation", "+ Attachment[] attachments"]),
        ("AppPreferences", ["+ notificationsEnabled · journalNotifications", "+ resultNotifications · notificationTone", "+ anonymousAnalytics", "+ medicalRecommendations · region"]),
    ]
    line(c, entity_x[0] + entity_w / 2, 570, entity_x[-1] + entity_w / 2, 570)
    line(c, 960, 580, 960, 570)
    line(c, entity_x[0] + entity_w / 2, 375, entity_x[-1] + entity_w / 2, 375)
    line(c, entity_x[0] + entity_w / 2, 570, entity_x[0] + entity_w / 2, 375)
    for x, (title, fields) in zip(entity_x, row1):
        rounded_box(c, x, row1_y, entity_w, entity_h, title, fields, "cloud · synchronized")
        line(c, x + entity_w / 2, 570, x + entity_w / 2, row1_y + entity_h)
    for x, (title, fields) in zip(entity_x, row2):
        rounded_box(c, x, row2_y, entity_w, entity_h, title, fields, "cloud · synchronized")
        line(c, x + entity_w / 2, 375, x + entity_w / 2, row2_y + entity_h)

    # Explicit logical associations.
    arrow(c, 1120, row2_y + entity_h, 1423, row2_y + entity_h, dashed=True)

    # Catalog and device-only layer.
    rounded_box(
        c,
        240,
        25,
        420,
        130,
        "TestSystem",
        ["+ string key · string name", "+ TestKind testKind", "+ string? publishedCalibrationVersion", "+ boolean active"],
        "public catalog",
    )
    rounded_box(
        c,
        750,
        25,
        420,
        130,
        "CalibrationVersion",
        ["+ string testSystemKey · version", "+ CalibrationStatus status", "+ string algorithmVersion", "+ string[] instructions · checksum"],
        "public catalog",
    )
    rounded_box(
        c,
        1260,
        25,
        420,
        130,
        "DeviceFile",
        ["+ string uri", "+ FileKind kind", "+ boolean encryptedAtRest"],
        "device only",
    )
    arrow(c, 660, 90, 750, 90)
    line(c, 450, 155, 450, 172, dashed=True)
    line(c, 450, 172, 960, 172, dashed=True)
    line(c, 960, 172, 960, 370, dashed=True)
    arrow(c, 960, 370, 980, 385, dashed=True)
    arrow(c, 1410, 155, 806, 190, dashed=True)
    line(c, 1410, 155, 1410, 172, dashed=True)
    arrow(c, 1410, 172, 1423, 190, dashed=True)

    c.showPage()
    c.save()


if __name__ == "__main__":
    render()
