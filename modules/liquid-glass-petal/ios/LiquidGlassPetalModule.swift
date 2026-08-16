import ExpoModulesCore
import SwiftUI
import UIKit

public final class LiquidGlassPetalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiquidGlassPetal")

    View(LiquidGlassPetalWheelView.self) {
      Prop("activeIndex") { (view: LiquidGlassPetalWheelView, index: Int) in
        view.setActiveIndex(index)
      }

      Events("onPetalPress")
    }
  }
}

public final class LiquidGlassPetalWheelView: ExpoView {
  let onPetalPress = EventDispatcher()

  private var activeIndex = 0
  private var hostingController: UIHostingController<AnyView>?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    updateHostedView()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController?.view.frame = bounds
  }

  func setActiveIndex(_ index: Int) {
    guard activeIndex != index else {
      return
    }
    activeIndex = index
    updateHostedView()
  }

  private func updateHostedView() {
    let rootView: AnyView

    if #available(iOS 26.0, *) {
      rootView = AnyView(
        NativePetalWheel(activeIndex: activeIndex) { [weak self] index in
          self?.onPetalPress(["index": index])
        }
      )
    } else {
      rootView = AnyView(
        FallbackPetalWheel(activeIndex: activeIndex) { [weak self] index in
          self?.onPetalPress(["index": index])
        }
      )
    }

    if let hostingController {
      hostingController.rootView = rootView
      hostingController.view.backgroundColor = .clear
      hostingController.view.frame = bounds
      return
    }

    let controller = UIHostingController(rootView: rootView)
    controller.view.backgroundColor = .clear
    controller.view.isOpaque = false
    controller.view.frame = bounds
    addSubview(controller.view)
    hostingController = controller
  }
}

private struct FallbackPetalWheel: View {
  private struct Petal: Identifiable {
    let id: Int
    let rotation: Double
  }

  private let petals = [
    Petal(id: 0, rotation: -155),
    Petal(id: 1, rotation: -103),
    Petal(id: 2, rotation: -52),
    Petal(id: 3, rotation: 0),
    Petal(id: 4, rotation: 51),
    Petal(id: 5, rotation: 102),
    Petal(id: 6, rotation: 154),
  ]

  let activeIndex: Int
  let onSelect: (Int) -> Void

  var body: some View {
    ZStack {
      ForEach(petals) { petal in
        let active = petal.id == activeIndex
        let completed = petal.id < activeIndex
        let shape = FallbackPositionedPetalShape(rotation: petal.rotation)
        let activeColor = Color(
          red: 234.0 / 255.0,
          green: 64.0 / 255.0,
          blue: 135.0 / 255.0
        )
        let completedColor = Color(
          red: 242.0 / 255.0,
          green: 168.0 / 255.0,
          blue: 203.0 / 255.0
        )
        let tintColor = active
          ? activeColor.opacity(0.24)
          : completed
            ? completedColor.opacity(0.16)
            : Color.white.opacity(0.10)

        shape
          .fill(.ultraThinMaterial)
          .overlay {
            shape.fill(tintColor)
          }
          .overlay {
            LinearGradient(
              colors: [
                Color.white.opacity(active ? 0.46 : 0.36),
                Color.white.opacity(0.04),
                completedColor.opacity(completed ? 0.05 : 0.02),
              ],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
            .clipShape(shape)
          }
          .overlay {
            shape.stroke(
              Color.white.opacity(active ? 0.62 : 0.42),
              lineWidth: active ? 0.9 : 0.8
            )
          }
          .contentShape(shape)
          .zIndex(active ? 1 : 0)
          .onTapGesture {
            onSelect(petal.id)
          }
          .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
          .animation(
            .spring(response: 0.30, dampingFraction: 0.86),
            value: activeIndex
          )
      }
    }
    .frame(width: 402, height: 452)
    .background(Color.clear)
  }
}

private struct FallbackPositionedPetalShape: Shape {
  let rotation: Double

  func path(in rect: CGRect) -> Path {
    var path = Path()

    path.move(to: CGPoint(x: 40, y: 96))
    path.addQuadCurve(
      to: CGPoint(x: 120, y: 96),
      control: CGPoint(x: 80, y: -8)
    )
    path.addLine(to: CGPoint(x: 155, y: 187))
    path.addCurve(
      to: CGPoint(x: 104, y: 242),
      control1: CGPoint(x: 169, y: 226),
      control2: CGPoint(x: 140, y: 242)
    )
    path.addLine(to: CGPoint(x: 56, y: 242))
    path.addCurve(
      to: CGPoint(x: 5, y: 187),
      control1: CGPoint(x: 20, y: 242),
      control2: CGPoint(x: -9, y: 226)
    )
    path.closeSubpath()

    let radians = rotation * .pi / 180
    let inwardX = sin(radians)
    let inwardY = -cos(radians)
    let center = CGPoint(
      x: 201 - inwardX * 98,
      y: 266 - inwardY * 98
    )

    var transform = CGAffineTransform.identity
    transform = transform.translatedBy(x: center.x, y: center.y)
    transform = transform.rotated(by: radians)
    transform = transform.scaledBy(x: 0.72, y: 0.68)
    transform = transform.translatedBy(x: -80, y: -121)

    return path.applying(transform)
  }
}

@available(iOS 26.0, *)
private struct NativePetalWheel: View {
  private struct Petal: Identifiable {
    let id: Int
    let rotation: Double
  }

  private let petals = [
    Petal(id: 0, rotation: -155),
    Petal(id: 1, rotation: -103),
    Petal(id: 2, rotation: -52),
    Petal(id: 3, rotation: 0),
    Petal(id: 4, rotation: 51),
    Petal(id: 5, rotation: 102),
    Petal(id: 6, rotation: 154),
  ]

  let activeIndex: Int
  let onSelect: (Int) -> Void

  var body: some View {
    ZStack {
      ForEach(petals) { petal in
        let active = petal.id == activeIndex
        let completed = petal.id < activeIndex
        let shape = PositionedPetalShape(rotation: petal.rotation)
        let activeColor = Color(
          red: 211.0 / 255.0,
          green: 20.0 / 255.0,
          blue: 113.0 / 255.0
        )
        let completedColor = Color(
          red: 242.0 / 255.0,
          green: 168.0 / 255.0,
          blue: 203.0 / 255.0
        )
        let tintColor = active
          ? activeColor.opacity(0.28)
          : completed
            ? completedColor.opacity(0.18)
            : Color.white.opacity(0.14)

        Color.clear
          .frame(width: 402, height: 452)
          .contentShape(shape)
          .glassEffect(
            Glass.clear
              .tint(tintColor)
              .interactive(),
            in: shape
          )
          .overlay {
            shape.stroke(
              Color.white.opacity(active ? 0.56 : 0.34),
              lineWidth: active ? 0.9 : 0.8
            )
          }
          .shadow(
            color: Color.clear,
            radius: 0,
            x: 0,
            y: 0
          )
          .zIndex(active ? 1 : 0)
          .onTapGesture {
            onSelect(petal.id)
          }
          .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
          .animation(
            .spring(response: 0.30, dampingFraction: 0.86),
            value: activeIndex
          )
      }
    }
    .frame(width: 402, height: 452)
    .background(Color.clear)
  }
}

@available(iOS 26.0, *)
private struct PositionedPetalShape: Shape {
  let rotation: Double

  func path(in rect: CGRect) -> Path {
    var path = Path()

    path.move(to: CGPoint(x: 40, y: 96))
    path.addQuadCurve(
      to: CGPoint(x: 120, y: 96),
      control: CGPoint(x: 80, y: -8)
    )
    path.addLine(to: CGPoint(x: 155, y: 187))
    path.addCurve(
      to: CGPoint(x: 104, y: 242),
      control1: CGPoint(x: 169, y: 226),
      control2: CGPoint(x: 140, y: 242)
    )
    path.addLine(to: CGPoint(x: 56, y: 242))
    path.addCurve(
      to: CGPoint(x: 5, y: 187),
      control1: CGPoint(x: 20, y: 242),
      control2: CGPoint(x: -9, y: 226)
    )
    path.closeSubpath()

    let radians = rotation * .pi / 180
    let inwardX = sin(radians)
    let inwardY = -cos(radians)
    let center = CGPoint(
      x: 201 - inwardX * 98,
      y: 266 - inwardY * 98
    )

    var transform = CGAffineTransform.identity
    transform = transform.translatedBy(x: center.x, y: center.y)
    transform = transform.rotated(by: radians)
    transform = transform.scaledBy(x: 0.72, y: 0.68)
    transform = transform.translatedBy(x: -80, y: -121)

    return path.applying(transform)
  }
}
