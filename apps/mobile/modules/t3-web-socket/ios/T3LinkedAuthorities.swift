import ExpoModulesCore
import Foundation
import ObjectiveC
import Security

/// Certificate authorities a pairing link vouched for, each for the one host that link pairs with.
///
/// A team that runs its own entry point signs it with its own authority, and iOS offers an app no
/// way to add one to what it trusts. So each connection to a linked host that iOS refuses is checked
/// again here, against that host's authority alone: a link can vouch for where it leads and for
/// nowhere else.
final class LinkedAuthorities {
  static let shared = LinkedAuthorities()

  private static let defaultsKey = "T3LinkedAuthorities"
  private let lock = NSLock()
  private var byHost: [String: [Data]]

  private init() {
    byHost = (UserDefaults.standard.dictionary(forKey: Self.defaultsKey) as? [String: [Data]]) ?? [:]
  }

  private static func normalize(_ host: String) -> String {
    var name = host.lowercased()
    if name.hasPrefix("["), name.hasSuffix("]") { name = String(name.dropFirst().dropLast()) }
    if name.hasSuffix(".") { name.removeLast() }
    return name
  }

  /// Keeps `der` as an authority for `host`. False when it is not a certificate.
  func remember(host: String, der: Data) -> Bool {
    guard SecCertificateCreateWithData(nil, der as CFData) != nil else { return false }
    let name = Self.normalize(host)
    guard !name.isEmpty else { return false }
    lock.lock()
    defer { lock.unlock() }
    var known = byHost[name] ?? []
    if !known.contains(der) {
      known.append(der)
      byHost[name] = known
      UserDefaults.standard.set(byHost, forKey: Self.defaultsKey)
    }
    return true
  }

  /// What to do with a challenge: accept the server when iOS refuses it but one of its host's linked
  /// authorities signed it, in date and naming the host. Everything else is left to iOS.
  func answer(_ challenge: URLAuthenticationChallenge) -> (URLSession.AuthChallengeDisposition, URLCredential?) {
    let space = challenge.protectionSpace
    guard space.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      let trust = space.serverTrust
    else { return (.performDefaultHandling, nil) }
    lock.lock()
    let stored = byHost[Self.normalize(space.host)] ?? []
    lock.unlock()
    let anchors = stored.compactMap { SecCertificateCreateWithData(nil, $0 as CFData) }
    guard !anchors.isEmpty, !SecTrustEvaluateWithError(trust, nil) else {
      return (.performDefaultHandling, nil)
    }
    SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, space.host as CFString))
    SecTrustSetAnchorCertificates(trust, anchors as CFArray)
    SecTrustSetAnchorCertificatesOnly(trust, true)
    guard SecTrustEvaluateWithError(trust, nil) else { return (.performDefaultHandling, nil) }
    return (.useCredential, URLCredential(trust: trust))
  }

  /// The app's requests leave through Expo's fetch and React Native's HTTP handler. Neither answers a
  /// challenge, so iOS decides alone. Give their delegates the challenge callbacks. Added, never
  /// replaced: if either grows its own, that one wins and this does nothing.
  static func answerForTheApp() {
    typealias Done = @convention(block) (Int, URLCredential?) -> Void
    let forSession: @convention(block) (AnyObject, URLSession, URLAuthenticationChallenge, @escaping Done) -> Void = { _, _, challenge, done in
      let (disposition, credential) = shared.answer(challenge)
      done(disposition.rawValue, credential)
    }
    let forTask: @convention(block) (AnyObject, URLSession, URLSessionTask, URLAuthenticationChallenge, @escaping Done) -> Void = { _, _, _, challenge, done in
      let (disposition, credential) = shared.answer(challenge)
      done(disposition.rawValue, credential)
    }
    let taskLevel = NSSelectorFromString("URLSession:task:didReceiveChallenge:completionHandler:")
    // Expo's session delegate hands a task's challenge to the task's own delegate, if it takes one.
    if let expoTask = NSClassFromString("Expo.ExpoURLSessionTask") {
      class_addMethod(expoTask, taskLevel, imp_implementationWithBlock(forTask), "v@:@@@@?")
    }
    if let handler = NSClassFromString("RCTHTTPRequestHandler") {
      class_addMethod(
        handler, NSSelectorFromString("URLSession:didReceiveChallenge:completionHandler:"),
        imp_implementationWithBlock(forSession), "v@:@@@?")
      class_addMethod(handler, taskLevel, imp_implementationWithBlock(forTask), "v@:@@@@?")
    }
  }
}

public final class T3LinkedAuthoritiesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("T3LinkedAuthorities")

    // Before the first request: URLSession asks its delegate what it answers when the session is made.
    OnCreate {
      LinkedAuthorities.answerForTheApp()
    }

    // For checking a build: whether the delegates this relies on are still there to be given answers.
    Function("covers") { () -> [String] in
      ["Expo.ExpoURLSessionTask", "RCTHTTPRequestHandler"].filter { NSClassFromString($0) != nil }
    }

    Function("remember") { (host: String, certificate: String) -> Bool in
      guard let der = Data(base64Encoded: certificate) else { return false }
      return LinkedAuthorities.shared.remember(host: host, der: der)
    }
  }
}
