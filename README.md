# ArtificialLabs

Native iOS app scaffold built with SwiftUI and XcodeGen.

## Stack

- SwiftUI for the app UI.
- XcodeGen for reproducible `.xcodeproj` generation.
- Native `Material` backgrounds for glass-like surfaces on the current Xcode 16.2 toolchain.
- Future migration path: native iOS 26+ Liquid Glass APIs (`glassEffect`, `GlassEffectContainer`, `.buttonStyle(.glass)`) once the installed Xcode/SDK supports them.

## Generate the Xcode project

```sh
xcodegen generate
```

## Open and preview the app

Open `ArtificialLabs.xcodeproj` in Xcode, select an iPhone simulator, then press `Cmd+R`.

You can preview individual SwiftUI views in Xcode Canvas from files such as `ArtificialLabs/Sources/ContentView.swift`.
