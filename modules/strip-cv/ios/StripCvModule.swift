import ExpoModulesCore
import Foundation

public final class StripCvModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StripCv")

    AsyncFunction("detectStripJsonAsync") { (requestJson: String) throws -> String in
      guard let data = requestJson.data(using: .utf8),
            let request = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let uri = request["imageUri"] as? String,
            let url = URL(string: uri), url.isFileURL else {
        throw InvalidRequestException()
      }
      return try StripCvBridge.detectStripImage(at: url, error: ())
    }

    AsyncFunction("analyzeLearnedStripJsonAsync") { (requestJson: String) throws -> String in
      guard let data = requestJson.data(using: .utf8),
            let request = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let uri = request["imageUri"] as? String,
            let url = URL(string: uri), url.isFileURL else {
        throw InvalidRequestException()
      }
      return try StripCvBridge.analyzeLearnedImage(at: url, error: ())
    }

    AsyncFunction("analyzeStripJsonAsync") { (requestJson: String) throws -> String in
      guard let requestData = requestJson.data(using: .utf8),
            let request = try JSONSerialization.jsonObject(with: requestData) as? [String: Any],
            let imageUri = request["imageUri"] as? String,
            let imageURL = URL(string: imageUri),
            let assayProfile = request["assayProfile"],
            let options = request["options"] else {
        throw InvalidRequestException()
      }

      let assayJson = try Self.encodeJson(assayProfile)
      let cardJson = request["cardProfile"] is NSNull
        ? nil
        : try request["cardProfile"].map(Self.encodeJson)
      let optionsJson = try Self.encodeJson(options)
      let result = try StripCvBridge.analyzeImage(
        at: imageURL,
        assayProfileJson: assayJson,
        cardProfileJson: cardJson,
        optionsJson: optionsJson,
        error: ()
      )
      return result
    }
  }

  private static func encodeJson(_ value: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value)
    guard let encoded = String(data: data, encoding: .utf8) else {
      throw InvalidRequestException()
    }
    return encoded
  }
}

private final class InvalidRequestException: Exception {
  override var reason: String { "StripCV received an invalid analysis request." }
}
