import UIKit
import Capacitor

class BridgeViewController: CAPBridgeViewController, UIScrollViewDelegate {
    override func viewDidLoad() {
        super.viewDidLoad()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(lockWebViewZoom),
            name: UIResponder.keyboardWillChangeFrameNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(lockWebViewZoom),
            name: UIResponder.keyboardDidShowNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(lockWebViewZoom),
            name: UIResponder.keyboardDidHideNotification,
            object: nil
        )
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        lockWebViewZoom()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        lockWebViewZoom()
    }

    @objc private func lockWebViewZoom() {
        guard let webView = webView else { return }
        let scrollView = webView.scrollView
        scrollView.delegate = self
        scrollView.isScrollEnabled = false
        scrollView.minimumZoomScale = 1.0
        scrollView.maximumZoomScale = 1.0
        scrollView.bouncesZoom = false
        scrollView.bounces = false
        scrollView.alwaysBounceVertical = false
        scrollView.alwaysBounceHorizontal = false
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.showsVerticalScrollIndicator = false
        scrollView.pinchGestureRecognizer?.isEnabled = false
        scrollView.panGestureRecognizer.isEnabled = false
        scrollView.delaysContentTouches = false
        scrollView.canCancelContentTouches = false
        scrollView.contentInsetAdjustmentBehavior = .never
        scrollView.setZoomScale(1.0, animated: false)
        if scrollView.contentOffset != .zero {
            scrollView.contentOffset = .zero
        }
        disableWebKitPageGestures(webView)
    }

    // WKContentView installs a double-tap-to-zoom recognizer that swallows
    // the second tap before JavaScript, which breaks map double-tap-drag.
    private func disableWebKitPageGestures(_ root: UIView) {
        var stack = [root]
        while let view = stack.popLast() {
            stack.append(contentsOf: view.subviews)
            guard let recognizers = view.gestureRecognizers else { continue }
            for recognizer in recognizers {
                if let tap = recognizer as? UITapGestureRecognizer, tap.numberOfTapsRequired >= 2 {
                    recognizer.isEnabled = false
                    continue
                }
                if recognizer is UIPinchGestureRecognizer {
                    recognizer.isEnabled = false
                }
            }
        }
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        return nil
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        if scrollView.contentOffset != .zero {
            scrollView.contentOffset = .zero
        }
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        if scrollView.zoomScale != 1.0 {
            scrollView.setZoomScale(1.0, animated: false)
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = BridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
