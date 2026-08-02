import SwiftUI

struct ContentView: View {
    @State private var message = ""
    @State private var selectedTab: AppTab = .chat
    @State private var selectedScanMode: ScanMode = .scanner
    @State private var selectedNotificationFilter: NotificationFilter = .all
    @State private var isJournalPresented = false
    @State private var isNotificationsPresented = false
    @State private var isJournalInputFocused = false
    @FocusState private var isComposerFocused: Bool

    var body: some View {
        GeometryReader { proxy in
            let horizontalPadding: CGFloat = 16
            let navBottomInset: CGFloat = max(proxy.safeAreaInsets.bottom - 34, 0)
            let isKeyboardFocused = isComposerFocused || isJournalInputFocused
            let isOverlayPresented = isJournalPresented || isNotificationsPresented
            let composerBottomPadding: CGFloat = isComposerFocused ? horizontalPadding : 76
            let headerContentPadding: CGFloat = 82

            ZStack {
                Color.alAppBackground
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture {
                        dismissComposer()
                    }

                tabContent(
                    horizontalPadding: horizontalPadding,
                    composerBottomPadding: composerBottomPadding,
                    headerContentPadding: headerContentPadding
                )
                .id(selectedTab)
                .transition(.opacity)
                .animation(.easeInOut(duration: 0.22), value: selectedTab)
                .animation(.spring(response: 0.34, dampingFraction: 0.88, blendDuration: 0.08), value: isKeyboardFocused)

                VStack(spacing: 0) {
                    AppHeaderGradient()
                        .frame(height: 160 + proxy.safeAreaInsets.top)
                        .offset(y: -proxy.safeAreaInsets.top)
                        .ignoresSafeArea(.container, edges: .top)

                    Spacer(minLength: 0)
                }
                .allowsHitTesting(false)

                VStack(spacing: 0) {
                    TopBar(
                        tab: selectedTab,
                        isJournalPresented: isJournalPresented,
                        isNotificationsPresented: isNotificationsPresented,
                        onNotificationsTap: {
                            isComposerFocused = false
                            isJournalInputFocused = false
                            withAnimation(.easeInOut(duration: 0.22)) {
                                isJournalPresented = false
                                isNotificationsPresented = true
                            }
                        },
                        onJournalTap: {
                            isComposerFocused = false
                            isJournalInputFocused = false
                            withAnimation(.easeInOut(duration: 0.22)) {
                                isNotificationsPresented = false
                                isJournalPresented = true
                            }
                        },
                        onBack: {
                            dismissOverlay()
                        }
                    )
                        .padding(.horizontal, horizontalPadding)
                        .onTapGesture {
                            dismissComposer()
                        }

                    if isNotificationsPresented {
                        NotificationsSegmentedSwitcher(selectedFilter: $selectedNotificationFilter)
                            .padding(.horizontal, horizontalPadding)
                            .padding(.top, horizontalPadding)
                    }

                    if selectedTab == .devices && !isOverlayPresented {
                        ProgramsAddButton()
                            .padding(.horizontal, horizontalPadding)
                            .padding(.top, horizontalPadding)
                    }

                    if selectedTab == .scan && !isOverlayPresented {
                        ScanSegmentedSwitcher(selectedMode: $selectedScanMode)
                            .padding(.horizontal, horizontalPadding)
                            .padding(.top, horizontalPadding)
                    }

                    Spacer(minLength: 0)
                }
                .allowsHitTesting(true)

                if !isKeyboardFocused && !isOverlayPresented {
                    VStack(spacing: 0) {
                        Spacer(minLength: 0)

                        AppBottomGradient()
                            .frame(height: 80 + proxy.safeAreaInsets.bottom)
                            .offset(y: proxy.safeAreaInsets.bottom)
                            .ignoresSafeArea(.container, edges: .bottom)
                    }
                    .allowsHitTesting(false)

                    VStack {
                        Spacer(minLength: 0)

                        BottomNavigation(selectedTab: $selectedTab)
                            .padding(.horizontal, horizontalPadding)
                            .padding(.bottom, navBottomInset)
                    }
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
        }
        .font(.alDisplay(size: 15))
        .onChange(of: selectedTab) { _, newValue in
            isJournalPresented = false
            isNotificationsPresented = false
            isJournalInputFocused = false

            if newValue != .chat {
                isComposerFocused = false
            }
        }
    }

    private func dismissComposer() {
        guard isComposerFocused || isJournalInputFocused else { return }

        isComposerFocused = false
        isJournalInputFocused = false
    }

    private func dismissOverlay() {
        isJournalInputFocused = false

        withAnimation(.easeInOut(duration: 0.22)) {
            isJournalPresented = false
            isNotificationsPresented = false
        }
    }

    @ViewBuilder
    private func tabContent(
        horizontalPadding: CGFloat,
        composerBottomPadding: CGFloat,
        headerContentPadding: CGFloat
    ) -> some View {
        if isNotificationsPresented {
            NotificationsContent(topContentPadding: 119, selectedFilter: $selectedNotificationFilter)
        } else if isJournalPresented {
            JournalContent(topContentPadding: headerContentPadding, isInputFocused: $isJournalInputFocused)
        } else if selectedTab == .profile {
            ProfileContent(topContentPadding: headerContentPadding)
        } else if selectedTab == .labs {
            LabsContent(topContentPadding: 72)
        } else if selectedTab == .scan {
            ScanContent(topContentPadding: 119, selectedMode: $selectedScanMode)
        } else if selectedTab == .devices {
            ProgramsContent(topContentPadding: 119)
        } else {
            VStack(spacing: 0) {
                Color.clear
                    .frame(height: 44)

                if selectedTab == .chat {
                    Spacer(minLength: 24)

                    if !isComposerFocused {
                        BrandLockup()
                            .transition(.opacity.combined(with: .scale(scale: 0.96)))
                    }

                    Spacer(minLength: isComposerFocused ? 0 : 34)

                    ChatComposer(message: $message, isFocused: $isComposerFocused)
                        .padding(.horizontal, horizontalPadding)
                        .padding(.bottom, composerBottomPadding)
                } else {
                    Spacer(minLength: 0)

                    Text(selectedTab.title)
                        .font(.alDisplay(size: 18, weight: .semibold))
                        .foregroundStyle(Color.alText)

                    Spacer(minLength: 0)
                }
            }
        }
    }
}

private struct AppHeaderGradient: View {
    var body: some View {
        LinearGradient(
            stops: [
                .init(color: Color.alAppBackground, location: 0.0),
                .init(color: Color.alAppBackground.opacity(0.92), location: 0.68),
                .init(color: Color.alAppBackground.opacity(0.0), location: 1.0)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .allowsHitTesting(false)
    }
}

private struct AppBottomGradient: View {
    var body: some View {
        LinearGradient(
            stops: [
                .init(color: Color.alAppBackground.opacity(0.0), location: 0.0),
                .init(color: Color.alAppBackground.opacity(0.92), location: 0.32),
                .init(color: Color.alAppBackground, location: 1.0)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .allowsHitTesting(false)
    }
}

private struct TopBar: View {
    let tab: AppTab
    let isJournalPresented: Bool
    let isNotificationsPresented: Bool
    let onNotificationsTap: () -> Void
    let onJournalTap: () -> Void
    let onBack: () -> Void

    var body: some View {
        topBarContent
    }

    private var topBarContent: some View {
        ZStack {
            HStack {
                if isOverlayPresented {
                    HeaderBackButton(action: onBack)
                } else {
                    HeaderPill(title: leadingTitle, assetImage: leadingAsset)
                }

                Spacer()

                HStack(spacing: 8) {
                    HeaderIconButton(
                        assetImage: "notifications_n_a",
                        accessibilityTitle: "Notifications",
                        action: onNotificationsTap
                    )
                    HeaderIconButton(assetImage: "journal_n_a", accessibilityTitle: "Journal", action: onJournalTap)
                }
            }

            Text(title)
                .font(.custom("Stack Sans Notch", size: 18).weight(.regular))
                .tracking(-0.32)
                .foregroundStyle(Color.alText)
        }
        .frame(height: 44)
    }

    private var isOverlayPresented: Bool {
        isJournalPresented || isNotificationsPresented
    }

    private var title: String {
        if isNotificationsPresented {
            "Notifications"
        } else if isJournalPresented {
            "Journal"
        } else {
            tab.title
        }
    }

    private var leadingTitle: String {
        switch tab {
        case .labs:
            "Upload"
        case .profile:
            "Edit"
        default:
            "History"
        }
    }

    private var leadingAsset: String {
        switch tab {
        case .labs:
            "documents"
        case .profile:
            "edit"
        default:
            "history"
        }
    }
}

private struct HeaderBackButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(Color.alText, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("Back"))
    }
}

private struct HeaderPill: View {
    let title: String
    let assetImage: String

    var body: some View {
        HStack(spacing: 5) {
            Image(assetImage)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 17, height: 17)

            Text(title)
                .font(.alDisplay(size: 14, weight: .semibold))
        }
        .foregroundStyle(Color.alText)
        .padding(.horizontal, 18)
        .frame(height: 46)
        .liquidGlassCapsule(isInteractive: true)
    }
}

private struct HeaderIconButton: View {
    let assetImage: String
    let accessibilityTitle: String
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            Image(assetImage)
                .resizable()
                .scaledToFit()
                .frame(width: 20, height: 20)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .liquidGlassCapsule(isInteractive: true)
        .accessibilityLabel(Text(accessibilityTitle))
    }
}

private struct BrandLockup: View {
    var body: some View {
        VStack(spacing: 0) {
            Image("identity")
                .resizable()
                .scaledToFit()
                .frame(width: 56, height: 36)
                .padding(.bottom, -6)

            Text("Medical Artificial Labs")
                .font(.custom("Stack Sans Notch", size: 30).weight(.regular))
                .tracking(-0.56)
                .foregroundStyle(Color.alText)
                .lineLimit(1)
                .minimumScaleFactor(0.85)

            Text("Health. Clarity. Action.")
                .font(.alDisplay(size: 21, weight: .regular))
                .foregroundStyle(Color.alText)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity)
    }
}

private struct LabsContent: View {
    let topContentPadding: CGFloat

    private let tests: [LabsTestCardModel] = [
        .init(
            title: "Lipid Profile",
            subtitle: "Cardiovascular risk check",
            status: .badge("28d"),
            why: "Estimate heart and vessel risk",
            result: "Not added",
            validFor: "12 months",
            primaryAction: "Add Result",
            secondaryAction: "Info"
        ),
        .init(
            title: "Urine Test Strip",
            subtitle: "Kidney & metabolic quick check",
            status: .tick,
            why: "Screens for common urine changes",
            result: "Risks not identified",
            validFor: "1 month",
            primaryAction: "View Result",
            secondaryAction: "Info"
        )
    ]

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 16) {
                LabsScoreCard()

                HStack(spacing: 16) {
                    LabsDeadlineCard(count: "2", period: "1 Month")
                    LabsDeadlineCard(count: "3", period: "3 Months")
                }

                LabsSegmentedFilter()

                ForEach(tests) { test in
                    LabsTestCard(model: test)
                }
            }
            .padding(.top, topContentPadding)
            .padding(.horizontal, 16)
            .padding(.bottom, 104)
        }
    }
}

private struct LabsScoreCard: View {
    var body: some View {
        LabsCard {
            VStack(spacing: 15) {
                LabsScoreMetricsRow()

                LabsVolumeChart()
            }
        }
    }
}

private struct LabsScoreMetricsRow: View {
    private let spacing: CGFloat = 16
    private let dividerWidth: CGFloat = 0.5

    var body: some View {
        GeometryReader { proxy in
            let availableWidth = proxy.size.width - spacing * 4 - dividerWidth * 2
            let firstColumnWidth = availableWidth * 0.44
            let sideColumnWidth = (availableWidth - firstColumnWidth) / 2

            HStack(spacing: spacing) {
                LabsTopMetric(value: "72%", label: "Health Attention\nscoring for 3 months")
                    .frame(width: firstColumnWidth, alignment: .leading)

                LabsVerticalDivider()

                LabsTopMetric(value: "3", label: "Checks\nRecommended")
                    .frame(width: sideColumnWidth, alignment: .leading)

                LabsVerticalDivider()

                LabsTopMetric(value: "2", label: "Results\nExpires soon")
                    .frame(width: sideColumnWidth, alignment: .leading)
            }
        }
        .frame(height: 72)
    }
}

private struct LabsTopMetric: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value)
                .font(.alDisplay(size: 36, weight: .semibold))
                .foregroundStyle(Color.alText)
                .tracking(-0.64)
                .lineLimit(1)

            Text(label)
                .font(.alDisplay(size: 14, weight: .medium))
                .foregroundStyle(Color.alMutedText)
                .tracking(-0.22)
                .lineSpacing(0)
                .lineLimit(2)
                .minimumScaleFactor(0.86)
                .allowsTightening(true)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct LabsVerticalDivider: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(Color.alDivider)
            .frame(width: 0.5)
            .frame(maxHeight: .infinity)
    }
}

private struct LabsVolumeChart: View {
    private let filledBars = 23
    private let totalBars = 31

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("Volume")
                .font(.alDisplay(size: 14, weight: .medium))
                .foregroundStyle(Color.alMutedText)
                .tracking(-0.2)

            HStack(spacing: 0) {
                ForEach(0..<totalBars, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 100)
                        .fill(index < filledBars ? Color.alGreen : Color.alSoftDivider)
                        .frame(width: 2, height: 22)

                    if index < totalBars - 1 {
                        Spacer(minLength: 0)
                    }
                }
            }
            .frame(height: 22)

            HStack {
                Text("Previous ")
                    .foregroundStyle(Color.alMutedText)
                + Text("84%")
                    .foregroundStyle(Color.alText)
                    .fontWeight(.semibold)

                Spacer()

                Text("Best ")
                    .foregroundStyle(Color.alMutedText)
                + Text("96%")
                    .foregroundStyle(Color.alText)
                    .fontWeight(.semibold)
            }
            .font(.alDisplay(size: 14, weight: .medium))
            .tracking(-0.2)
        }
    }
}

private struct LabsDeadlineCard: View {
    let count: String
    let period: String

    var body: some View {
        LabsCard(padding: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .top) {
                    Text(count)
                        .font(.alDisplay(size: 29, weight: .semibold))
                        .foregroundStyle(Color.alText)
                        .tracking(-0.5)

                    Spacer()

                    LabsArrowButton()
                }

                (
                    Text("Tests must be taken over\nthe next ")
                    + Text(period)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.alText)
                )
                    .font(.alDisplay(size: 14, weight: .medium))
                    .foregroundStyle(Color.alMutedText)
                    .tracking(-0.22)
                    .lineSpacing(0)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private enum LabsFilter: String, CaseIterable {
    case all = "All"
    case current = "Current"
    case quarter = "Quarter"
}

private struct LabsSegmentedFilter: View {
    @State private var selectedFilter: LabsFilter = .all

    var body: some View {
        ZStack(alignment: .leading) {
            GeometryReader { proxy in
                Capsule()
                    .fill(Color.alSegmentSelected)
                    .frame(width: proxy.size.width / CGFloat(LabsFilter.allCases.count), height: 39)
                    .offset(x: proxy.size.width / CGFloat(LabsFilter.allCases.count) * CGFloat(selectedIndex))
                    .animation(.easeInOut(duration: 0.22), value: selectedFilter)
            }
            .frame(height: 39)

            HStack(spacing: 0) {
                ForEach(LabsFilter.allCases, id: \.self) { filter in
                    Button {
                        selectedFilter = filter
                    } label: {
                        Text(filter.rawValue)
                            .foregroundStyle(selectedFilter == filter ? Color.alText : Color.alMutedText)
                            .frame(maxWidth: .infinity)
                            .frame(height: 39)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .font(.alDisplay(size: 16, weight: .medium))
        .tracking(-0.24)
        .padding(2)
        .frame(height: 43)
        .background(.white, in: Capsule())
        .alComponentShadow()
    }

    private var selectedIndex: Int {
        LabsFilter.allCases.firstIndex(of: selectedFilter) ?? 0
    }
}

private struct LabsTestCard: View {
    let model: LabsTestCardModel

    var body: some View {
        LabsCard(padding: 12) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(model.title)
                            .font(.alDisplay(size: 16, weight: .semibold))
                            .foregroundStyle(Color.alText)
                            .tracking(-0.28)

                        Text(model.subtitle)
                            .font(.alDisplay(size: 14, weight: .medium))
                            .foregroundStyle(Color.alMutedText)
                            .tracking(-0.24)
                            .lineLimit(1)
                    }

                    Spacer()

                    switch model.status {
                    case .badge(let badge):
                        Text(badge)
                            .font(.alDisplay(size: 13, weight: .medium))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .frame(height: 30)
                            .background(Color.alText, in: Capsule())
                    case .tick:
                        LabsTickStatus()
                    }
                }

                LabsFullDivider()

                LabsInfoLine(label: "Why:", value: model.why)
                LabsInfoLine(label: "Result:", value: model.result)
                LabsInfoLine(label: "Valid for:", value: model.validFor)

                LabsFullDivider()

                HStack(spacing: 10) {
                    LabsActionButton(title: model.secondaryAction, isPrimary: false)
                    LabsActionButton(title: model.primaryAction, isPrimary: true)
                }
            }
        }
    }
}

private enum LabsTestStatus {
    case badge(String)
    case tick
}

private struct LabsTickStatus: View {
    var body: some View {
        Image("tick")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .foregroundStyle(.white)
            .frame(width: 18, height: 18)
            .frame(width: 30, height: 30)
            .background(Color.alGreen, in: Circle())
    }
}

private struct LabsInfoLine: View {
    let label: String
    let value: String

    var body: some View {
        Text(label + " ")
            .font(.alDisplay(size: 14, weight: .semibold))
            .foregroundStyle(Color.alText)
        + Text(value)
            .font(.alDisplay(size: 14, weight: .medium))
            .foregroundStyle(Color.alMutedText)
    }
}

private struct LabsCard<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .alComponentShadow()
    }
}

private struct LabsArrowButton: View {
    var body: some View {
        Image("arrow_up_right_md")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .foregroundStyle(.white)
                .frame(width: 15, height: 15)
                .frame(width: 24, height: 24)
                .background(Color.alText, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct LabsFullDivider: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(Color.alSoftDivider)
            .frame(height: 0.5)
    }
}

private struct LabsActionButton: View {
    let title: String
    let isPrimary: Bool

    var body: some View {
        Button(action: {}) {
            Text(title)
                .font(.alDisplay(size: 15, weight: .semibold))
                .foregroundStyle(isPrimary ? .white : Color.alText)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .frame(maxWidth: .infinity)
                .frame(height: 34)
                .background(isPrimary ? Color.alText : Color.clear, in: Capsule())
                .overlay {
                    Capsule()
                        .stroke(Color.alText, lineWidth: isPrimary ? 0 : 1)
                }
        }
        .buttonStyle(.plain)
    }
}

private struct LabsTestCardModel: Identifiable {
    let title: String
    let subtitle: String
    let status: LabsTestStatus
    let why: String
    let result: String
    let validFor: String
    let primaryAction: String
    let secondaryAction: String

    var id: String { title }
}

private enum ScanMode: String, CaseIterable {
    case scanner = "Scanner"
    case history = "History"
}

private struct ScanContent: View {
    let topContentPadding: CGFloat
    @Binding var selectedMode: ScanMode

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 16) {
                if selectedMode == .scanner {
                    ScanStartCard()

                    ScanRapidCard()

                    HStack(spacing: 16) {
                        ScanLockedCard(
                            title: "OralScanner",
                            subtitle: "Neural Network-Powered Tongue Cancer Scanner"
                        )

                        ScanLockedCard(
                            title: "SkinScanner",
                            subtitle: "Neural Network-Powered Skin Cancer Scanner"
                        )
                    }
                } else {
                    ScanHistoryCard()
                }
            }
            .padding(.top, topContentPadding)
            .padding(.horizontal, 16)
            .padding(.bottom, 104)
        }
    }
}

private struct ScanSegmentedSwitcher: View {
    @Binding var selectedMode: ScanMode

    var body: some View {
        ZStack(alignment: .leading) {
            GeometryReader { proxy in
                Capsule()
                    .fill(Color.alSegmentSelected)
                    .frame(width: proxy.size.width / CGFloat(ScanMode.allCases.count), height: 39)
                    .offset(x: proxy.size.width / CGFloat(ScanMode.allCases.count) * CGFloat(selectedIndex))
                    .animation(.easeInOut(duration: 0.22), value: selectedMode)
            }
            .frame(height: 39)

            HStack(spacing: 0) {
                ForEach(ScanMode.allCases, id: \.self) { mode in
                    Button {
                        selectedMode = mode
                    } label: {
                        Text(mode.rawValue)
                            .foregroundStyle(selectedMode == mode ? Color.alText : Color.alScanMuted)
                            .frame(maxWidth: .infinity)
                            .frame(height: 39)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .font(.alDisplay(size: 16, weight: .medium))
        .tracking(-0.24)
        .padding(2)
        .frame(height: 43)
        .background(.white, in: Capsule())
        .alComponentShadow()
    }

    private var selectedIndex: Int {
        ScanMode.allCases.firstIndex(of: selectedMode) ?? 0
    }
}

private struct ScanHistoryCard: View {
    var body: some View {
        HStack(spacing: 0) {
            Image("rapid_image")
                .resizable()
                .scaledToFill()
                .frame(width: 125, height: 104)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: 15,
                        bottomLeadingRadius: 15,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: 0,
                        style: .continuous
                    )
                )

            HStack(spacing: 15) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Interpretation")
                        .font(.alDisplay(size: 16, weight: .medium))
                        .foregroundStyle(Color.alText)
                        .lineLimit(1)

                    Text("Add any documents: recent research results, tests, reports, medical records, et...")
                        .font(.alDisplay(size: 13, weight: .medium))
                        .foregroundStyle(Color.alText.opacity(0.70))
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Button(action: {}) {
                    Image("edit_w")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 14, height: 14)
                        .frame(width: 30, height: 30)
                        .background(Color.alText, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 104, alignment: .leading)
            .background(
                UnevenRoundedRectangle(
                    topLeadingRadius: 0,
                    bottomLeadingRadius: 0,
                    bottomTrailingRadius: 15,
                    topTrailingRadius: 15,
                    style: .continuous
                )
                .fill(.white)
            )
        }
        .frame(height: 104)
        .alComponentShadow()
    }
}

private struct ScanStartCard: View {
    var body: some View {
        ScanCard {
            VStack(spacing: 10) {
                VStack(spacing: 5) {
                    Image("scan_gr")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 30, height: 30)

                    Text("The application is ready to scan, click the\nStart button to begin")
                        .font(.alDisplay(size: 14, weight: .medium))
                        .foregroundStyle(Color.alScanMuted)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .frame(width: 280)
                }

                Button(action: {}) {
                    Text("Start")
                        .font(.alDisplay(size: 15, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(width: 161, height: 34)
                        .background(Color.alText, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .frame(height: 169)
    }
}

private struct ScanRapidCard: View {
    var body: some View {
        ScanCard(padding: 12) {
            VStack(spacing: 10) {
                Image("rapid_image")
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity)
                    .frame(height: 75)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                ScanDivider()

                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("RapidScanner")
                            .font(.alDisplay(size: 16, weight: .semibold))
                            .foregroundStyle(Color.alText)
                            .lineLimit(1)

                        Text("Instant AI Interpretation of Rapid Tests")
                            .font(.alDisplay(size: 14, weight: .medium))
                            .foregroundStyle(Color.alScanMuted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                    }

                    Spacer(minLength: 0)

                    ScanSmallButton(title: "Chosen")
                }
            }
        }
    }
}

private struct ScanLockedCard: View {
    let title: String
    let subtitle: String

    var body: some View {
        ScanCard(padding: 12) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.alAppBackground)

                    Image("lock")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 28, height: 28)
                }
                .frame(height: 75)

                ScanDivider()

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.alDisplay(size: 16, weight: .semibold))
                        .foregroundStyle(Color.alText)
                        .lineLimit(1)

                    Text(subtitle)
                        .font(.alDisplay(size: 14, weight: .medium))
                        .foregroundStyle(Color.alScanMuted)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(height: 164)
    }
}

private struct ScanSmallButton: View {
    let title: String

    var body: some View {
        Button(action: {}) {
            Text(title)
                .font(.alDisplay(size: 15, weight: .medium))
                .foregroundStyle(.white)
                .lineLimit(1)
                .frame(width: 116, height: 34)
                .background(Color.alText, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct ScanCard<Content: View>: View {
    var padding: CGFloat = 12
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .alComponentShadow()
    }
}

private struct ScanDivider: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(Color.alSoftDivider)
            .frame(height: 0.5)
    }
}

private struct ProgramsContent: View {
    let topContentPadding: CGFloat

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 16) {
                ProgramsWeightLossCard()
            }
            .padding(.top, topContentPadding)
            .padding(.horizontal, 16)
            .padding(.bottom, 104)
        }
    }
}

private struct ProgramsAddButton: View {
    var body: some View {
        Button(action: {}) {
            HStack(spacing: 5) {
                Text("Add New Program")
                    .font(.alDisplay(size: 16, weight: .medium))
                    .foregroundStyle(.white)

                Image("add")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(.white)
                    .frame(width: 15, height: 15)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 43)
            .background(Color.alText, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct ProgramsWeightLossCard: View {
    var body: some View {
        ScanCard(padding: 12) {
            VStack(spacing: 10) {
                Image("weight_loss")
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity)
                    .frame(height: 75)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .clipped()

                ScanDivider()

                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Weight Loss")
                            .font(.alDisplay(size: 16, weight: .semibold))
                            .foregroundStyle(Color.alText)
                            .lineLimit(1)

                        Text("Comfortable weight loss program")
                            .font(.alDisplay(size: 14, weight: .medium))
                            .foregroundStyle(Color.alScanMuted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                    }

                    Spacer(minLength: 0)

                    ScanSmallButton(title: "Delete")
                }
            }
        }
    }
}

private enum NotificationFilter: String, CaseIterable {
    case all = "All"
    case viewed = "Viewed"
}

private struct NotificationsContent: View {
    let topContentPadding: CGFloat
    @Binding var selectedFilter: NotificationFilter

    private let notifications: [NotificationItem] = [
        .init(title: "Check Due", date: "Today", description: "Lipid profile is recommended this week based on your current plan.", isViewed: false),
        .init(title: "Result Ready", date: "Yesterday", description: "RapidScanner interpretation is available in your recent checkup history.", isViewed: true),
        .init(title: "Plan Update", date: "Jun 23", description: "Your health plan was adjusted after the latest journal entries.", isViewed: false),
        .init(title: "Data Synced", date: "Jun 21", description: "Profile documents and previous lab results were synchronized.", isViewed: true)
    ]

    private var visibleNotifications: [NotificationItem] {
        switch selectedFilter {
        case .all:
            notifications
        case .viewed:
            notifications.filter(\.isViewed)
        }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            NotificationsListCard(notifications: visibleNotifications)
                .padding(.top, topContentPadding)
                .padding(.horizontal, 16)
                .padding(.bottom, 104)
        }
    }
}

private struct NotificationsSegmentedSwitcher: View {
    @Binding var selectedFilter: NotificationFilter

    var body: some View {
        ZStack(alignment: .leading) {
            GeometryReader { proxy in
                Capsule()
                    .fill(Color.alSegmentSelected)
                    .frame(width: proxy.size.width / CGFloat(NotificationFilter.allCases.count), height: 39)
                    .offset(x: proxy.size.width / CGFloat(NotificationFilter.allCases.count) * CGFloat(selectedIndex))
                    .animation(.easeInOut(duration: 0.22), value: selectedFilter)
            }
            .frame(height: 39)

            HStack(spacing: 0) {
                ForEach(NotificationFilter.allCases, id: \.self) { filter in
                    Button {
                        selectedFilter = filter
                    } label: {
                        Text(filter.rawValue)
                            .foregroundStyle(selectedFilter == filter ? Color.alText : Color.alMutedText)
                            .frame(maxWidth: .infinity)
                            .frame(height: 39)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .font(.alDisplay(size: 16, weight: .medium))
        .tracking(-0.24)
        .padding(2)
        .frame(height: 43)
        .background(.white, in: Capsule())
        .alComponentShadow()
    }

    private var selectedIndex: Int {
        NotificationFilter.allCases.firstIndex(of: selectedFilter) ?? 0
    }
}

private struct NotificationsListCard: View {
    let notifications: [NotificationItem]

    var body: some View {
        VStack(spacing: 12) {
            ForEach(notifications) { notification in
                NotificationRow(notification: notification)
            }
        }
    }
}

private struct NotificationRow: View {
    let notification: NotificationItem

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(notification.title)
                    .font(.alDisplay(size: 16, weight: .semibold))
                    .foregroundStyle(Color.alText)
                    .lineLimit(1)

                Spacer(minLength: 0)

                Text(notification.date)
                    .font(.alDisplay(size: 14, weight: .medium))
                    .foregroundStyle(Color.alMutedText)
                    .lineLimit(1)
            }

            Text(notification.description)
                .font(.alDisplay(size: 14, weight: .medium))
                .foregroundStyle(Color.alScanMuted)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .liquidGlassRoundedRect(cornerRadius: 18, isInteractive: true, tint: .white.opacity(0.92))
    }
}

private struct NotificationItem: Identifiable {
    let title: String
    let date: String
    let description: String
    let isViewed: Bool

    var id: String { title + date }
}

private struct JournalContent: View {
    let topContentPadding: CGFloat
    @Binding var isInputFocused: Bool
    @State private var selectedDay = "Wed"

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 16) {
                JournalCalendarCard(selectedDay: $selectedDay)
                    .onTapGesture {
                        isInputFocused = false
                    }
                JournalTodayCard(isInputFocused: $isInputFocused)
                JournalRationCard(isInputFocused: $isInputFocused)
                JournalEntriesCard(selectedDay: selectedDay)
                    .onTapGesture {
                        isInputFocused = false
                    }
                JournalCheckupHistoryCard()
                    .onTapGesture {
                        isInputFocused = false
                    }
                JournalAnalyticsCard()
                    .onTapGesture {
                        isInputFocused = false
                    }
            }
            .padding(.top, topContentPadding)
            .padding(.horizontal, 16)
            .padding(.bottom, 104)
        }
    }
}

private struct JournalTodayCard: View {
    @Binding var isInputFocused: Bool
    @State private var selectedLogType = "Symptoms"
    @State private var logText = ""
    @FocusState private var isLogFieldFocused: Bool

    private let logTypes = ["Symptoms", "Mood", "Sleep", "Pain", "Weight", "Temperature", "Blood Sugar"]

    var body: some View {
        JournalCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Today Health Log")
                            .font(.alDisplay(size: 18, weight: .semibold))
                            .foregroundStyle(Color.alText)

                        Text("June 24 • Stable")
                            .font(.alDisplay(size: 14, weight: .medium))
                            .foregroundStyle(Color.alMutedText)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    isInputFocused = false
                }

                JournalLogTypeSwitcher(types: logTypes, selectedType: $selectedLogType)
                    .simultaneousGesture(
                        TapGesture().onEnded {
                            isInputFocused = false
                        }
                    )

                TextField(text: $logText, axis: .vertical) {
                    Text("Add \(selectedLogType.lowercased()) note...")
                        .foregroundStyle(Color.alPlaceholder)
                }
                .font(.alDisplay(size: 15, weight: .medium))
                .foregroundStyle(Color.alText)
                .multilineTextAlignment(.leading)
                .tint(Color.alBlue)
                .padding(14)
                .frame(minHeight: 48, alignment: .topLeading)
                .background(Color.alCalendarInactive, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.alSoftDivider, lineWidth: 1)
                }
                .focused($isLogFieldFocused)
                .onChange(of: isLogFieldFocused) { _, newValue in
                    isInputFocused = newValue
                }
                .onChange(of: isInputFocused) { _, newValue in
                    if !newValue {
                        isLogFieldFocused = false
                    }
                }
            }
        }
    }
}

private struct JournalRationCard: View {
    @Binding var isInputFocused: Bool
    @State private var selectedMeal = "Breakfast"
    @State private var rationText = ""
    @FocusState private var isRationFieldFocused: Bool

    private let mealTypes = ["Breakfast", "Lunch", "Dinner"]

    var body: some View {
        JournalCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Ration")
                            .font(.alDisplay(size: 18, weight: .semibold))
                            .foregroundStyle(Color.alText)

                        Text("Meals, hydration and nutrition notes")
                            .font(.alDisplay(size: 14, weight: .medium))
                            .foregroundStyle(Color.alMutedText)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    isInputFocused = false
                }

                JournalLogTypeSwitcher(types: mealTypes, selectedType: $selectedMeal)
                    .simultaneousGesture(
                        TapGesture().onEnded {
                            isInputFocused = false
                        }
                    )

                TextField(text: $rationText, axis: .vertical) {
                    Text("Add \(selectedMeal.lowercased()) note...")
                        .foregroundStyle(Color.alPlaceholder)
                }
                .font(.alDisplay(size: 15, weight: .medium))
                .foregroundStyle(Color.alText)
                .multilineTextAlignment(.leading)
                .tint(Color.alBlue)
                .padding(14)
                .frame(minHeight: 48, alignment: .topLeading)
                .background(Color.alCalendarInactive, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.alSoftDivider, lineWidth: 1)
                }
                .focused($isRationFieldFocused)
                .onChange(of: isRationFieldFocused) { _, newValue in
                    isInputFocused = newValue
                }
                .onChange(of: isInputFocused) { _, newValue in
                    if !newValue {
                        isRationFieldFocused = false
                    }
                }
            }
        }
    }
}

private struct JournalLogTypeSwitcher: View {
    let types: [String]
    @Binding var selectedType: String

    var body: some View {
        VStack(spacing: 6) {
            ForEach(Array(typeRows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 6) {
                    ForEach(row, id: \.self) { type in
                        let isSelected = selectedType == type

                        Button {
                            withAnimation(.easeInOut(duration: 0.18)) {
                                selectedType = type
                            }
                        } label: {
                            Text(type)
                                .font(.alDisplay(size: 13, weight: .semibold))
                                .foregroundStyle(isSelected ? .white : Color.alText)
                                .lineLimit(1)
                                .minimumScaleFactor(0.72)
                                .frame(maxWidth: .infinity)
                                .frame(height: 34)
                                .background(isSelected ? Color.alText : Color.alCalendarInactive, in: Capsule())
                                .overlay {
                                    Capsule()
                                        .stroke(isSelected ? Color.clear : Color.alSoftDivider, lineWidth: 1)
                                }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var typeRows: [[String]] {
        stride(from: 0, to: types.count, by: 4).map { index in
            Array(types[index..<min(index + 4, types.count)])
        }
    }
}

private struct JournalCalendarCard: View {
    @Binding var selectedDay: String
    @State private var weekOffset = 0
    @State private var selectedMonth = 6
    @State private var selectedYear = 2026
    @State private var isMonthPickerPresented = false

    private let calendar = Calendar.current

    var body: some View {
        JournalCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Health Calendar")
                            .font(.alDisplay(size: 18, weight: .semibold))
                            .foregroundStyle(Color.alText)

                        Text(monthYearTitle)
                            .font(.alDisplay(size: 14, weight: .medium))
                            .foregroundStyle(Color.alMutedText)
                    }

                    Spacer()

                    JournalCalendarIconButton(systemName: "chevron.left") {
                        withAnimation(.spring(response: 0.34, dampingFraction: 0.86, blendDuration: 0.08)) {
                            weekOffset -= 1
                        }
                    }

                    JournalCalendarIconButton(systemName: "chevron.right") {
                        withAnimation(.spring(response: 0.34, dampingFraction: 0.86, blendDuration: 0.08)) {
                            weekOffset += 1
                        }
                    }

                    Button {
                        isMonthPickerPresented = true
                    } label: {
                        Image("calendar_n_a")
                            .renderingMode(.template)
                            .resizable()
                            .scaledToFit()
                            .foregroundStyle(Color.alText)
                            .frame(width: 18, height: 18)
                            .frame(width: 34, height: 34)
                            .background(Color.alCalendarInactive, in: Circle())
                            .overlay {
                                Circle()
                                    .stroke(Color.alSoftDivider, lineWidth: 1)
                            }
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 8) {
                    ForEach(weekDays) { day in
                        let isSelected = selectedDay == day.weekday

                        Button {
                            selectedDay = day.weekday
                        } label: {
                            VStack(spacing: 6) {
                                Text(day.weekday)
                                    .font(.alDisplay(size: 12, weight: .medium))

                                Text(day.day)
                                    .font(.alDisplay(size: 15, weight: .semibold))

                                Circle()
                                    .fill(day.hasEntry ? Color.alGreen : Color.clear)
                                    .frame(width: 5, height: 5)
                            }
                            .foregroundStyle(isSelected ? .white : Color.alText)
                            .frame(maxWidth: .infinity)
                            .frame(height: 72)
                            .background(isSelected ? Color.alText : Color.alCalendarInactive, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(isSelected ? Color.clear : Color.alSoftDivider, lineWidth: 1)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .id("\(selectedYear)-\(selectedMonth)-\(weekOffset)")
                .transition(.opacity.combined(with: .scale(scale: 0.98)))
                .animation(.spring(response: 0.34, dampingFraction: 0.86, blendDuration: 0.08), value: weekOffset)
            }
        }
        .sheet(isPresented: $isMonthPickerPresented) {
            JournalMonthYearPickerSheet(month: $selectedMonth, year: $selectedYear) {
                withAnimation(.spring(response: 0.34, dampingFraction: 0.86, blendDuration: 0.08)) {
                    weekOffset = 0
                    selectedDay = weekDays.first?.weekday ?? selectedDay
                    isMonthPickerPresented = false
                }
            }
            .presentationDetents([.height(360)])
            .presentationDragIndicator(.visible)
        }
    }

    private var weekDays: [JournalDay] {
        guard let firstDate = calendar.date(from: DateComponents(year: selectedYear, month: selectedMonth, day: 1)),
              let shiftedDate = calendar.date(byAdding: .weekOfYear, value: weekOffset, to: firstDate) else {
            return []
        }

        let startOfWeek = calendar.dateInterval(of: .weekOfYear, for: shiftedDate)?.start ?? shiftedDate

        return (0..<7).compactMap { offset in
            guard let date = calendar.date(byAdding: .day, value: offset, to: startOfWeek) else {
                return nil
            }

            return JournalDay(
                weekday: weekdayFormatter.string(from: date),
                day: dayFormatter.string(from: date),
                hasEntry: calendar.component(.day, from: date) % 2 == 0
            )
        }
    }

    private var monthYearTitle: String {
        guard let date = calendar.date(from: DateComponents(year: selectedYear, month: selectedMonth, day: 1)) else {
            return ""
        }

        return monthYearFormatter.string(from: date)
    }

    private var weekdayFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEE"
        return formatter
    }

    private var dayFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.dateFormat = "d"
        return formatter
    }

    private var monthYearFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "MMMM yyyy"
        return formatter
    }
}

private struct JournalCalendarIconButton: View {
    let systemName: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.alText)
                .frame(width: 34, height: 34)
                .background(Color.alCalendarInactive, in: Circle())
                .overlay {
                    Circle()
                        .stroke(Color.alSoftDivider, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
    }
}

private struct JournalMonthYearPickerSheet: View {
    @Binding var month: Int
    @Binding var year: Int
    let onDone: () -> Void

    private let months = Calendar.current.monthSymbols
    private let years = Array(2024...2032)

    var body: some View {
        NavigationStack {
            HStack(spacing: 0) {
                Picker("Month", selection: $month) {
                    ForEach(1...12, id: \.self) { monthNumber in
                        Text(months[monthNumber - 1])
                            .font(.alDisplay(size: 22, weight: .medium))
                            .tag(monthNumber)
                    }
                }
                .pickerStyle(.wheel)
                .frame(maxWidth: .infinity)

                Picker("Year", selection: $year) {
                    ForEach(years, id: \.self) { year in
                        Text(String(year))
                            .font(.alDisplay(size: 22, weight: .medium))
                            .tag(year)
                    }
                }
                .pickerStyle(.wheel)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("Select Month")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", action: onDone)
                        .font(.alDisplay(size: 17, weight: .semibold))
                }
            }
        }
    }
}

private struct JournalEntriesCard: View {
    let selectedDay: String

    var body: some View {
        JournalCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("\(selectedDay) Entries")
                        .font(.alDisplay(size: 16, weight: .semibold))
                        .foregroundStyle(Color.alText)

                    Spacer()

                    Text("4 records")
                        .font(.alDisplay(size: 13, weight: .medium))
                        .foregroundStyle(Color.alMutedText)
                }

                JournalEntryRow(time: "08:20", title: "Sleep quality", detail: "7h 40m, light interruptions", accent: Color.alBlue)
                JournalEntryRow(time: "11:10", title: "Fatigue", detail: "Mild, after workout", accent: Color.alGreen)
                JournalEntryRow(time: "18:45", title: "Note", detail: "No headache, appetite normal", accent: Color.alText.opacity(0.72))
            }
        }
    }
}

private struct JournalCheckupHistoryCard: View {
    var body: some View {
        JournalCard {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Checkup History")
                        .font(.alDisplay(size: 16, weight: .semibold))
                        .foregroundStyle(Color.alText)

                    Spacer()

                    Text("3 checks")
                        .font(.alDisplay(size: 13, weight: .medium))
                        .foregroundStyle(Color.alMutedText)
                }
                .padding(.bottom, 10)

                JournalCheckupRow(title: "RapidScanner", status: "Completed", date: "Today")
                JournalListDivider()
                JournalCheckupRow(title: "Lipid Profile", status: "Needs review", date: "Jun 21")
                JournalListDivider()
                JournalCheckupRow(title: "Urine Test Strip", status: "Completed", date: "Jun 18")
            }
        }
    }
}

private struct JournalAnalyticsCard: View {
    var body: some View {
        JournalCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image("brain")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .foregroundStyle(Color.alText)
                        .frame(width: 19, height: 19)

                    Text("AI Analytics")
                        .font(.alDisplay(size: 16, weight: .semibold))
                        .foregroundStyle(Color.alText)
                }

                Text("Symptoms decreased this week. Sleep quality is still unstable, but energy level improved over the last 3 days.")
                    .font(.alDisplay(size: 14, weight: .medium))
                    .foregroundStyle(Color.alMutedText)
                    .lineSpacing(2)
            }
        }
    }
}

private struct JournalEntryRow: View {
    let time: String
    let title: String
    let detail: String
    let accent: Color

    var body: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 10)
                .fill(accent)
                .frame(width: 4)

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(title)
                        .font(.alDisplay(size: 15, weight: .semibold))
                        .foregroundStyle(Color.alText)

                    Spacer()

                    Text(time)
                        .font(.alDisplay(size: 12, weight: .medium))
                        .foregroundStyle(Color.alMutedText)
                }

                Text(detail)
                    .font(.alDisplay(size: 13, weight: .medium))
                    .foregroundStyle(Color.alMutedText)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}

private struct JournalCheckupRow: View {
    let title: String
    let status: String
    let date: String

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.alDisplay(size: 15, weight: .semibold))
                    .foregroundStyle(Color.alText)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(status)
                        .font(.alDisplay(size: 13, weight: .medium))
                        .foregroundStyle(status == "Needs review" ? Color.alBlue : Color.alMutedText)

                    Circle()
                        .fill(Color.alMutedText.opacity(0.35))
                        .frame(width: 3, height: 3)

                    Text(date)
                        .font(.alDisplay(size: 13, weight: .medium))
                        .foregroundStyle(Color.alMutedText)
                }
            }

            Spacer()

            JournalArrowButton()
        }
        .padding(.vertical, 10)
    }
}

private struct JournalArrowButton: View {
    var body: some View {
        Image("arrow_up_right_md")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .foregroundStyle(.white)
            .frame(width: 12, height: 12)
            .frame(width: 22, height: 22)
            .background(Color.alText, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
    }
}

private struct JournalListDivider: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(Color.alSoftDivider)
            .frame(height: 0.5)
    }
}

private struct JournalCard<Content: View>: View {
    var padding: CGFloat = 14
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .alComponentShadow()
    }
}

private struct JournalDay: Identifiable {
    let weekday: String
    let day: String
    let hasEntry: Bool

    var id: String { weekday }
}

private struct ProfileContent: View {
    let topContentPadding: CGFloat

    private let rowHeight: CGFloat = 50
    private let iconBoxSize: CGFloat = 30
    private let sectionIconSize: CGFloat = 16
    private let rowHorizontalPadding: CGFloat = 12

    private let accountRows: [ProfileAccountRow] = [
        .init(initials: "OT", name: "Oleg Tinkoff"),
        .init(initials: "DS", name: "German Gref")
    ]

    private let primarySections: [ProfileSectionRow] = [
        .init(title: "Main info", icon: "maininfo"),
        .init(title: "Journal", icon: "journal_n_a"),
        .init(title: "Guidance", icon: "guidance"),
        .init(title: "Documents", icon: "documents")
    ]

    private let healthSections: [ProfileSectionRow] = [
        .init(title: "Medical History", icon: "medical_history"),
        .init(title: "Medications", icon: "medications"),
        .init(title: "Allergies & Risks", icon: "allergies_and_risks")
    ]

    private let settingsSections: [ProfileSectionRow] = [
        .init(title: "Language & Locations", icon: "language_and_locations"),
        .init(title: "Permissions & Data", icon: "permissions_and_data")
    ]

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                profileIdentity

                VStack(spacing: 20) {
                    ProfileCard {
                        VStack(spacing: 0) {
                            ForEach(accountRows) { row in
                                ProfileAccountCell(
                                    row: row,
                                    rowHeight: rowHeight,
                                    iconBoxSize: iconBoxSize,
                                    horizontalPadding: rowHorizontalPadding
                                )
                                ProfileDivider(leadingPadding: iconBoxSize + rowHorizontalPadding + 10)
                            }

                            AddProfileCell(
                                rowHeight: rowHeight,
                                iconBoxSize: iconBoxSize,
                                iconSize: sectionIconSize,
                                horizontalPadding: rowHorizontalPadding
                            )
                        }
                    }

                    ProfileCard {
                        ProfileSectionList(
                            rows: primarySections,
                            rowHeight: rowHeight,
                            iconBoxSize: iconBoxSize,
                            iconSize: sectionIconSize,
                            horizontalPadding: rowHorizontalPadding
                        )
                    }

                    ProfileCard {
                        ProfileSectionList(
                            rows: healthSections,
                            rowHeight: rowHeight,
                            iconBoxSize: iconBoxSize,
                            iconSize: sectionIconSize,
                            horizontalPadding: rowHorizontalPadding
                        )
                    }

                    ProfileCard {
                        ProfileSectionList(
                            rows: settingsSections,
                            rowHeight: rowHeight,
                            iconBoxSize: iconBoxSize,
                            iconSize: sectionIconSize,
                            horizontalPadding: rowHorizontalPadding
                        )
                    }
                }
            }
            .padding(.top, topContentPadding)
            .padding(.horizontal, 16)
            .padding(.bottom, 104)
        }
    }

    private var profileIdentity: some View {
        VStack(spacing: 10) {
            ZStack(alignment: .bottomTrailing) {
                Circle()
                    .fill(Color.alText)
                    .frame(width: 94, height: 94)
                    .overlay {
                        Text("MR")
                            .font(.alDisplay(size: 31, weight: .medium))
                            .foregroundStyle(.white)
                    }

                Circle()
                    .fill(.white)
                    .frame(width: 29, height: 29)
                    .overlay {
                        Image("male")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 14, height: 14)
                    }
                    .offset(x: 1, y: 1)
            }

            VStack(spacing: 1) {
                Text("mr batman")
                    .font(.alDisplay(size: 18, weight: .semibold))
                    .foregroundStyle(Color.alText)

                Text(verbatim: "mrbatman2013@bebra.ru")
                    .font(.alDisplay(size: 15, weight: .medium))
                    .foregroundColor(Color(red: 55 / 255, green: 55 / 255, blue: 55 / 255))
            }
        }
    }
}

private struct ProfileCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white)
            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
            .alComponentShadow()
    }
}

private struct ProfileAccountCell: View {
    let row: ProfileAccountRow
    let rowHeight: CGFloat
    let iconBoxSize: CGFloat
    let horizontalPadding: CGFloat

    var body: some View {
        Button(action: {}) {
            HStack(spacing: 10) {
                AvatarBadge(text: row.initials, size: iconBoxSize, fontSize: 10)

                Text(row.name)
                    .font(.alDisplay(size: 15, weight: .medium))
                    .foregroundStyle(Color.alText)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, horizontalPadding)
            .frame(height: rowHeight)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(ProfileRowButtonStyle())
    }
}

private struct AddProfileCell: View {
    let rowHeight: CGFloat
    let iconBoxSize: CGFloat
    let iconSize: CGFloat
    let horizontalPadding: CGFloat

    var body: some View {
        Button(action: {}) {
            HStack(spacing: 10) {
                Image("add")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(Color.alBlue)
                    .frame(width: iconSize, height: iconSize)
                    .frame(width: iconBoxSize, height: iconBoxSize)

                Text("Add Profile")
                    .font(.alDisplay(size: 15, weight: .medium))
                    .foregroundStyle(Color.alBlue)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, horizontalPadding)
            .frame(height: rowHeight)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(ProfileRowButtonStyle())
    }
}

private struct ProfileSectionList: View {
    let rows: [ProfileSectionRow]
    let rowHeight: CGFloat
    let iconBoxSize: CGFloat
    let iconSize: CGFloat
    let horizontalPadding: CGFloat
    @State private var pressedRowID: String?

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                ProfileSectionCell(
                    row: row,
                    rowHeight: rowHeight,
                    iconBoxSize: iconBoxSize,
                    iconSize: iconSize,
                    horizontalPadding: horizontalPadding,
                    onPressChanged: { isPressed in
                        pressedRowID = isPressed ? row.id : nil
                    }
                )

                if index < rows.count - 1 {
                    ProfileDivider(leadingPadding: iconBoxSize + horizontalPadding + 10)
                        .opacity(shouldHideDivider(after: index) ? 0 : 1)
                        .animation(.easeOut(duration: 0.08), value: pressedRowID)
                }
            }
        }
    }

    private func shouldHideDivider(after index: Int) -> Bool {
        guard let pressedRowID else { return false }

        return rows[index].id == pressedRowID || rows[index + 1].id == pressedRowID
    }
}

private struct ProfileSectionCell: View {
    let row: ProfileSectionRow
    let rowHeight: CGFloat
    let iconBoxSize: CGFloat
    let iconSize: CGFloat
    let horizontalPadding: CGFloat
    let onPressChanged: (Bool) -> Void

    var body: some View {
        Button(action: {}) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(Color.alText)
                        .frame(width: iconBoxSize, height: iconBoxSize)

                    Image(row.icon)
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .foregroundStyle(.white)
                        .frame(width: iconSize, height: iconSize)
                }

                Text(row.title)
                    .font(.alDisplay(size: 15, weight: .medium))
                    .foregroundStyle(Color.alText)

                Spacer(minLength: 0)

                Image("arrow_f")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 15, height: 15)
            }
            .padding(.horizontal, horizontalPadding)
            .frame(height: rowHeight)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(ProfileRowButtonStyle())
        .onLongPressGesture(
            minimumDuration: 0,
            maximumDistance: 12,
            pressing: onPressChanged,
            perform: {}
        )
    }
}

private struct ProfileRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .background(
                Rectangle()
                    .fill(configuration.isPressed ? Color.alDivider : Color.clear)
            )
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private struct ProfileDivider: View {
    let leadingPadding: CGFloat

    var body: some View {
        Rectangle()
            .fill(Color.alDivider)
            .frame(height: 0.5)
            .padding(.leading, leadingPadding)
    }
}

private struct AvatarBadge: View {
    let text: String
    let size: CGFloat
    let fontSize: CGFloat

    var body: some View {
        Circle()
            .fill(Color.alText)
            .frame(width: size, height: size)
            .overlay {
                Text(text)
                    .font(.alDisplay(size: fontSize, weight: .medium))
                    .foregroundStyle(.white)
            }
    }
}

private struct ProfileAccountRow: Identifiable {
    let initials: String
    let name: String

    var id: String { name }
}

private struct ProfileSectionRow: Identifiable {
    let title: String
    let icon: String

    var id: String { title }
}

private struct ChatComposer: View {
    @Binding var message: String
    @FocusState.Binding var isFocused: Bool
    private var hasMessage: Bool {
        !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            TextField(text: $message, axis: .vertical) {
                Text("Ask me anything...")
                    .foregroundStyle(Color.alPlaceholder)
            }
                .font(.alDisplay(size: 15, weight: .regular))
                .foregroundStyle(Color.alText)
                .tint(Color.alBlue)
                .padding(.horizontal, 14)
                .padding(.top, 17)
                .focused($isFocused)

            Spacer(minLength: 0)

            HStack {
                CircleIconButton(assetImage: "add", iconSize: 15, buttonSize: 30, background: Color.alText)

                Spacer()

                HStack(spacing: 8) {
                    CircleIconButton(assetImage: "voice", iconSize: 20, buttonSize: 30, background: Color.alText)
                    CircleIconButton(
                        assetImage: "send",
                        iconSize: 15,
                        buttonSize: 30,
                        background: Color.alText,
                        opacity: hasMessage ? 1.0 : 0.8
                    )
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 14)
        }
        .frame(height: 96)
        .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .alComponentShadow()
    }
}

private struct CircleIconButton: View {
    let assetImage: String
    let iconSize: CGFloat
    let buttonSize: CGFloat
    let background: Color
    var opacity: Double = 1.0

    var body: some View {
        Button(action: {}) {
            Image(assetImage)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .foregroundStyle(.white)
                .frame(width: iconSize, height: iconSize)
                .frame(width: buttonSize, height: buttonSize)
                .background(background, in: Circle())
                .opacity(opacity)
        }
        .buttonStyle(.plain)
    }
}

private struct BottomNavigation: View {
    @Binding var selectedTab: AppTab

    private let items: [NavigationItem] = [
        .init(tab: .devices, title: "Programs", activeAsset: "programs_a", inactiveAsset: "programs_n_a"),
        .init(tab: .scan, title: "Scan", activeAsset: "scan_a", inactiveAsset: "scan_n_a"),
        .init(tab: .chat, title: "Chat", activeAsset: "chat_a", inactiveAsset: "chat_n_a"),
        .init(tab: .labs, title: "Labs", activeAsset: "labs_a", inactiveAsset: "labs_n_a"),
        .init(tab: .profile, title: "Profile", activeAsset: "profile_a", inactiveAsset: "profile_n_a")
    ]

    var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: 8) {
                navigationContent
            }
        } else {
            navigationContent
        }
    }

    private var navigationContent: some View {
        GeometryReader { geometry in
            let edgeInset: CGFloat = 6
            let itemSpacing: CGFloat = 2
            let selectionHeight: CGFloat = 54
            let tabWidth = (geometry.size.width - edgeInset * 2 - itemSpacing * CGFloat(items.count - 1)) / CGFloat(items.count)
            let selectionWidth = tabWidth + itemSpacing * 2
            let selectionX = edgeInset + (tabWidth + itemSpacing) * CGFloat(selectedTab.index) - itemSpacing

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.alBlue.opacity(0.12))
                    .frame(width: selectionWidth, height: selectionHeight)
                    .offset(x: selectionX)
                    .animation(.spring(response: 0.42, dampingFraction: 0.86, blendDuration: 0.10), value: selectedTab)

                HStack(spacing: itemSpacing) {
                    ForEach(items) { item in
                        let isSelected = item.tab == selectedTab

                        Button {
                            selectedTab = item.tab
                        } label: {
                            VStack(spacing: 4) {
                                TabIconView(item: item, isSelected: isSelected)

                                Text(item.title)
                                    .font(.alDisplay(size: 10, weight: isSelected ? .semibold : .regular))
                                    .lineLimit(1)
                            }
                            .foregroundStyle(isSelected ? Color.alBlue : Color.alText.opacity(0.72))
                            .frame(width: tabWidth)
                            .frame(height: selectionHeight)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text(item.title))
                    }
                }
                .padding(.horizontal, edgeInset)
            }
            .frame(maxHeight: .infinity, alignment: .center)
        }
        .frame(height: 62)
        .liquidGlassCapsule(isInteractive: true, isProminent: false)
    }
}

private struct TabIconView: View {
    let item: NavigationItem
    let isSelected: Bool

    var body: some View {
        ZStack {
            Image(item.inactiveAsset)
                .resizable()
                .scaledToFit()
                .opacity(isSelected ? 0 : 1)

            Image(item.activeAsset)
                .resizable()
                .scaledToFit()
                .opacity(isSelected ? 1 : 0)
        }
        .frame(width: 24, height: 20)
        .animation(.easeInOut(duration: 0.18), value: isSelected)
    }
}

private struct NavigationItem: Identifiable {
    let tab: AppTab
    let title: String
    let activeAsset: String
    let inactiveAsset: String

    var id: AppTab { tab }
}

private enum AppTab: Hashable {
    case devices
    case scan
    case chat
    case labs
    case profile

    var title: String {
        switch self {
        case .devices:
            "Programs"
        case .scan:
            "Scan"
        case .chat:
            "Chat"
        case .labs:
            "Labs"
        case .profile:
            "Profile"
        }
    }

    var index: Int {
        switch self {
        case .devices:
            0
        case .scan:
            1
        case .chat:
            2
        case .labs:
            3
        case .profile:
            4
        }
    }
}

private extension Font {
    static func alDisplay(size: CGFloat, weight: Weight = .regular) -> Font {
        .custom("Montserrat", size: size).weight(weight)
    }
}

private extension View {
    func alComponentShadow() -> some View {
        shadow(color: .black.opacity(0.10), radius: 20, x: 0, y: 0)
    }

    func liquidGlassCapsule(isInteractive: Bool, isProminent: Bool = false) -> some View {
        modifier(LiquidGlassCapsuleModifier(isInteractive: isInteractive, isProminent: isProminent))
    }

    func liquidGlassRoundedRect(cornerRadius: CGFloat, isInteractive: Bool, tint: Color? = nil) -> some View {
        modifier(LiquidGlassRoundedRectModifier(cornerRadius: cornerRadius, isInteractive: isInteractive, tint: tint))
    }
}

private struct LiquidGlassCapsuleModifier: ViewModifier {
    let isInteractive: Bool
    let isProminent: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            if isInteractive {
                content
                    .glassEffect(.regular.interactive(), in: .capsule)
                    .alComponentShadow()
            } else {
                content
                    .glassEffect(.regular, in: .capsule)
                    .alComponentShadow()
            }
        } else {
            content
                .background(.ultraThinMaterial, in: Capsule())
                .overlay {
                    Capsule()
                        .stroke(.primary.opacity(0.08), lineWidth: 0.7)
                }
                .alComponentShadow()
        }
    }
}

private struct LiquidGlassRoundedRectModifier: ViewModifier {
    let cornerRadius: CGFloat
    let isInteractive: Bool
    let tint: Color?

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            if let tint, isInteractive {
                content
                    .glassEffect(.regular.tint(tint).interactive(), in: .rect(cornerRadius: cornerRadius))
                    .alComponentShadow()
            } else if let tint {
                content
                    .glassEffect(.regular.tint(tint), in: .rect(cornerRadius: cornerRadius))
                    .alComponentShadow()
            } else if isInteractive {
                content
                    .glassEffect(.regular.interactive(), in: .rect(cornerRadius: cornerRadius))
                    .alComponentShadow()
            } else {
                content
                    .glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
                    .alComponentShadow()
            }
        } else {
            content
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                .background((tint ?? .clear), in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(.primary.opacity(0.08), lineWidth: 0.7)
                }
                .alComponentShadow()
        }
    }
}

private extension Color {
    static let alAppBackground = Color(red: 0.969, green: 0.969, blue: 0.969)
    static let alCalendarInactive = Color(red: 0.949, green: 0.949, blue: 0.949)
    static let alText = Color(red: 0.09, green: 0.09, blue: 0.09)
    static let alSecondaryText = Color(red: 0.376, green: 0.376, blue: 0.376)
    static let alMutedText = Color(red: 0.314, green: 0.314, blue: 0.314)
    static let alScanMuted = Color(red: 0.365, green: 0.365, blue: 0.365)
    static let alPlaceholder = Color(red: 0.376, green: 0.376, blue: 0.376)
    static let alBlue = Color(red: 0.0, green: 0.553, blue: 0.788)
    static let alDivider = Color(red: 0.902, green: 0.902, blue: 0.902)
    static let alSoftDivider = Color(red: 0.894, green: 0.894, blue: 0.894)
    static let alSegmentSelected = Color(red: 0.941, green: 0.941, blue: 0.941)
    static let alGreen = Color(red: 0.122, green: 0.733, blue: 0.455)
}

#Preview {
    ContentView()
}
