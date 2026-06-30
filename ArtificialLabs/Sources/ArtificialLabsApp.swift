import CoreText
import SwiftUI

@main
struct ArtificialLabsApp: App {
    init() {
        FontRegistry.registerFonts()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

private enum FontRegistry {
    static func registerFonts() {
        registerFont(named: "StackSansNotch-VariableFont_wght", extension: "ttf")
    }

    private static func registerFont(named name: String, extension fileExtension: String) {
        let url = Bundle.main.url(forResource: name, withExtension: fileExtension, subdirectory: "Fonts")
            ?? Bundle.main.url(forResource: name, withExtension: fileExtension)

        guard let url else { return }

        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
}
