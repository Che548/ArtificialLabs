# Логическая структура данных ArtificialLabs

Диаграмма показывает доменную модель в ООП-представлении. Облачные сущности
соответствуют `convex/schema.ts`; локальное хранилище показывает физическую
модель SQLCipher и outbox на мобильном устройстве.

```mermaid
classDiagram
direction TB

class User {
  <<Convex Auth>>
  +Id id
  +string email
}
class AuthIdentity {
  <<aggregate>>
  +AuthAccount[] accounts
  +AuthSession[] sessions
  +AuthRefreshToken[] refreshTokens
}
class Profile {
  <<cloud>>
  +Id id
  +Id userId
  +string displayName
  +Goal goal
  +boolean onboardingCompleted
  +string? phone
  +number? birthDate
  +number? lastPeriodStartAt
  +number? cycleLengthDays
  +number? consentToCloudSyncAt
  +number updatedAt
}
class AccountState {
  <<cloud>>
  +Id userId
  +number? deletionRequestedAt
  +number? scheduledDeletionAt
  +number? restoredAt
}
class AIChatConsent {
  <<cloud>>
  +Id userId
  +string provider
  +string policyVersion
  +number acceptedAt
  +number? revokedAt
}

class SyncEntity {
  <<abstract>>
  +string localId
  +number updatedAt
  +number? deletedAt
}
class MonitoringProgram {
  +Goal type
  +string title
  +ProgramStatus status
  +number startedAt
}
class JournalEntry {
  +number occurredAt
  +JournalKind kind
  +string label
  +string? textValue
  +number? numericValue
  +DataSource source
}
class LabResult {
  +string catalogKey
  +string title
  +number collectedAt
  +LabStatus status
  +Analyte[] analytes
  +boolean hasLocalSourceDocument
}
class ScanResult {
  +string testSystemKey
  +number capturedAt
  +ScanValue confirmedValue
  +ScanSource resultSource
  +number? confidence
  +string[] qualityFlags
  +string algorithmVersion
  +boolean confirmedByUser
  +boolean hasLocalImage
}
class Reminder {
  +ReminderType type
  +string title
  +string body
  +number dueAt
  +number? readAt
}
class MedicalCondition {
  +string title
  +ConditionStatus status
  +number? diagnosedAt
  +string? notes
}
class Medication {
  +string name
  +string? dosage
  +string? frequency
  +boolean active
}
class AllergyRisk {
  +string allergen
  +string? reaction
  +Severity severity
}
class HealthDocument {
  +string title
  +DocumentCategory category
  +number documentDate
  +boolean hasLocalFile
  +string? mimeType
  +number? size
}
class ChatConversation {
  +string title
  +number createdAt
  +number lastMessageAt
}
class ChatMessage {
  +string conversationLocalId
  +MessageRole role
  +MessageSource source
  +string text
  +number sentAt
  +Generation? generation
  +Attachment[] attachments
}
class AppPreferences {
  +boolean notificationsEnabled
  +boolean journalNotifications
  +boolean resultNotifications
  +NotificationTone tone
  +boolean anonymousAnalytics
  +boolean medicalRecommendations
  +string region
}

class TestSystem {
  <<public catalog>>
  +string key
  +string name
  +TestKind testKind
  +string? publishedCalibrationVersion
  +boolean active
}
class CalibrationVersion {
  <<public catalog>>
  +string testSystemKey
  +string version
  +CalibrationStatus status
  +string algorithmVersion
  +string[] instructions
  +string checksum
}

class LocalDatabase {
  <<device / SQLCipher>>
  +settings key-value
  +records entity-localId
  +outbox idempotent queue
}
class LocalRecord {
  <<encrypted JSON envelope>>
  +string entity
  +string localId
  +string payload
  +number occurredAt
  +number updatedAt
}
class OutboxItem {
  <<encrypted pending write>>
  +number id
  +string entity
  +string localId
  +string payload
  +number updatedAt
}
class DeviceFile {
  <<device only>>
  +string uri
  +FileKind kind
  +boolean encryptedAtRest
}

User "1" *-- "1" AuthIdentity : authenticates
User "1" *-- "0..1" Profile : owns
User "1" *-- "0..1" AccountState : lifecycle
User "1" *-- "0..1" AIChatConsent : grants

SyncEntity <|-- MonitoringProgram
SyncEntity <|-- JournalEntry
SyncEntity <|-- LabResult
SyncEntity <|-- ScanResult
SyncEntity <|-- Reminder
SyncEntity <|-- MedicalCondition
SyncEntity <|-- Medication
SyncEntity <|-- AllergyRisk
SyncEntity <|-- HealthDocument
SyncEntity <|-- ChatConversation
SyncEntity <|-- ChatMessage
SyncEntity <|-- AppPreferences

Profile "1" *-- "0..*" MonitoringProgram
Profile "1" *-- "0..*" JournalEntry
Profile "1" *-- "0..*" LabResult
Profile "1" *-- "0..*" ScanResult
Profile "1" *-- "0..*" Reminder
Profile "1" *-- "0..*" MedicalCondition
Profile "1" *-- "0..*" Medication
Profile "1" *-- "0..*" AllergyRisk
Profile "1" *-- "0..*" HealthDocument
Profile "1" *-- "0..*" ChatConversation
Profile "1" *-- "0..*" ChatMessage
Profile "1" *-- "0..1" AppPreferences

ChatConversation "1" o-- "0..*" ChatMessage : conversationLocalId
TestSystem "1" o-- "0..*" CalibrationVersion : versions
ScanResult "0..*" --> "1" TestSystem : testSystemKey
ScanResult "0..*" --> "0..1" CalibrationVersion : calibrationVersion

LocalDatabase "1" *-- "0..*" LocalRecord
LocalDatabase "1" *-- "0..*" OutboxItem
LocalRecord ..> SyncEntity : serializes
LabResult "0..1" --> "0..1" DeviceFile : source document
ScanResult "0..1" --> "0..1" DeviceFile : source image
HealthDocument "0..1" --> "0..1" DeviceFile : content
ChatMessage "0..*" --> "0..*" DeviceFile : attachments
```

## Правила хранения

- `Profile` является корнем агрегата медицинских данных; серверные операции
  дополнительно проверяют владельца через `userId`.
- Все синхронизируемые сущности наследуют логические поля `localId`,
  `updatedAt`, `deletedAt`. `deletedAt` передаёт tombstone между устройствами.
- На устройстве сущности хранятся как типизированный JSON внутри общей таблицы
  `records`; `outbox` содержит последнюю неподтверждённую версию каждой записи.
- URI, фотографии тест-полосок, документы и вложения чата остаются в
  `DeviceFile`. В Convex уходят только структурированные значения и признаки
  наличия локального файла.
