// swift-tools-version: 5.9
import PackageDescription

// Capacitor plugins are vendored under ../CapPackages so Xcode Cloud can
// resolve SPM without mobile/node_modules. ci_post_clone re-applies this
// after `cap sync` (which rewrites path deps to node_modules).
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.2"),
        .package(name: "CapacitorApp", path: "../CapPackages/app"),
        .package(name: "CapacitorCamera", path: "../CapPackages/camera"),
        .package(name: "CapacitorGeolocation", path: "../CapPackages/geolocation"),
        .package(name: "CapacitorKeyboard", path: "../CapPackages/keyboard"),
        .package(name: "CapacitorSplashScreen", path: "../CapPackages/splash-screen"),
        .package(name: "CapacitorStatusBar", path: "../CapPackages/status-bar")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorGeolocation", package: "CapacitorGeolocation"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar")
            ]
        )
    ]
)
