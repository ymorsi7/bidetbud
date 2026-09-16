#!/usr/bin/env node
/**
 * Idempotent patches for generated ios/ and android/ trees:
 * display name, bundle id strings, location usage copy, custom URL scheme.
 * Safe to run when platforms have not been added yet (exits 0).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MOBILE = path.resolve(__dirname, '..');
const APP_ID = 'com.bidetbud.app';
const APP_NAME = 'BidetBud';
const LOCATION_COPY =
  'BidetBud uses your location only to find bidet spots near you.';

const IOS_PLIST = path.join(MOBILE, 'ios', 'App', 'App', 'Info.plist');
const IOS_SCENE = path.join(MOBILE, 'ios', 'App', 'App', 'SceneDelegate.swift');
const ANDROID_MANIFEST = path.join(
  MOBILE,
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml'
);
const ANDROID_STRINGS = path.join(
  MOBILE,
  'android',
  'app',
  'src',
  'main',
  'res',
  'values',
  'strings.xml'
);

const SCENE_DELEGATE_SWIFT = `import UIKit
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
        guard let scrollView = webView?.scrollView else { return }
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
        scrollView.contentInsetAdjustmentBehavior = .never
        scrollView.setZoomScale(1.0, animated: false)
        if scrollView.contentOffset != .zero {
            scrollView.contentOffset = .zero
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
`;

function patchSceneDelegate(file) {
  const next = SCENE_DELEGATE_SWIFT;
  const prev = fs.readFileSync(file, 'utf8');
  if (prev === next) return false;
  fs.writeFileSync(file, next);
  return true;
}

function setPlistString(xml, key, value) {
  const re = new RegExp(
    '(<key>' + key + '</key>\\s*<string>)[^<]*(</string>)'
  );
  if (re.test(xml)) {
    const next = xml.replace(re, '$1' + value + '$2');
    return { xml: next, changed: next !== xml };
  }
  const injected =
    '<dict>\n\t<key>' + key + '</key>\n\t<string>' + value + '</string>';
  return { xml: xml.replace(/<dict>/, injected), changed: true };
}

function patchInfoPlist(file) {
  let xml = fs.readFileSync(file, 'utf8');
  let changed = false;

  if (!xml.includes('NSLocationWhenInUseUsageDescription')) {
    xml = xml.replace(
      /<dict>/,
      '<dict>\n\t<key>NSLocationWhenInUseUsageDescription</key>\n\t<string>' +
        LOCATION_COPY +
        '</string>'
    );
    changed = true;
  }

  if (!xml.includes('NSLocationAlwaysAndWhenInUseUsageDescription')) {
    xml = xml.replace(
      /<key>NSLocationWhenInUseUsageDescription<\/key>\n\t<string>[^<]*<\/string>/,
      (m) =>
        m +
        '\n\t<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>\n\t<string>' +
        LOCATION_COPY +
        '</string>'
    );
    changed = true;
  }

  if (!xml.includes('ITSAppUsesNonExemptEncryption')) {
    xml = xml.replace(
      /<dict>/,
      '<dict>\n\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>'
    );
    changed = true;
  }

  if (!xml.includes('<string>bidetbud</string>')) {
    const urlTypes = [
      '\t<key>CFBundleURLTypes</key>',
      '\t<array>',
      '\t\t<dict>',
      '\t\t\t<key>CFBundleURLName</key>',
      '\t\t\t<string>' + APP_ID + '</string>',
      '\t\t\t<key>CFBundleURLSchemes</key>',
      '\t\t\t<array>',
      '\t\t\t\t<string>bidetbud</string>',
      '\t\t\t</array>',
      '\t\t</dict>',
      '\t</array>',
    ].join('\n');
    xml = xml.replace(/<dict>/, '<dict>\n' + urlTypes);
    changed = true;
  }

  const display = setPlistString(xml, 'CFBundleDisplayName', APP_NAME);
  xml = display.xml;
  changed = changed || display.changed;

  if (changed) fs.writeFileSync(file, xml);
  return changed;
}

function ensurePermission(xml, name) {
  const needle = 'android:name="' + name + '"';
  if (xml.includes(needle)) return xml;
  return xml.replace(
    /<manifest\b[^>]*>/,
    (m) => m + '\n    <uses-permission android:name="' + name + '" />'
  );
}

function patchAndroidManifest(file) {
  let xml = fs.readFileSync(file, 'utf8');
  const before = xml;

  xml = ensurePermission(xml, 'android.permission.ACCESS_COARSE_LOCATION');
  xml = ensurePermission(xml, 'android.permission.ACCESS_FINE_LOCATION');

  if (!xml.includes('android:scheme="bidetbud"')) {
    const filter = [
      '            <intent-filter>',
      '                <action android:name="android.intent.action.VIEW" />',
      '                <category android:name="android.intent.category.DEFAULT" />',
      '                <category android:name="android.intent.category.BROWSABLE" />',
      '                <data android:scheme="bidetbud" />',
      '            </intent-filter>',
    ].join('\n');
    if (xml.includes('</activity>')) {
      xml = xml.replace('</activity>', filter + '\n        </activity>');
    }
  }

  if (xml !== before) fs.writeFileSync(file, xml);
  return xml !== before;
}

function setAndroidString(xml, name, value) {
  const re = new RegExp(
    '(<string name="' + name + '">)[^<]*(</string>)'
  );
  if (re.test(xml)) {
    const next = xml.replace(re, '$1' + value + '$2');
    return { xml: next, changed: next !== xml };
  }
  if (!xml.includes('</resources>')) return { xml, changed: false };
  const next = xml.replace(
    '</resources>',
    '    <string name="' + name + '">' + value + '</string>\n</resources>'
  );
  return { xml: next, changed: true };
}

function patchAndroidStrings(file) {
  let xml = fs.readFileSync(file, 'utf8');
  let changed = false;
  const pairs = [
    ['app_name', APP_NAME],
    ['title_activity_main', APP_NAME],
    ['package_name', APP_ID],
    [
      'location_permission_rationale',
      LOCATION_COPY,
    ],
  ];
  for (const [name, value] of pairs) {
    const next = setAndroidString(xml, name, value);
    xml = next.xml;
    changed = changed || next.changed;
  }
  if (changed) fs.writeFileSync(file, xml);
  return changed;
}

function main() {
  let n = 0;
  if (fs.existsSync(IOS_PLIST)) {
    if (patchInfoPlist(IOS_PLIST)) {
      console.log('patch-native: updated ios Info.plist');
      n++;
    } else {
      console.log('patch-native: ios Info.plist already patched');
    }
  } else {
    console.log('patch-native: ios/ not present yet (run npm run cap:add)');
  }

  if (fs.existsSync(IOS_SCENE)) {
    if (patchSceneDelegate(IOS_SCENE)) {
      console.log('patch-native: updated ios SceneDelegate (WebView zoom lock)');
      n++;
    } else {
      console.log('patch-native: ios SceneDelegate already patched');
    }
  }

  if (fs.existsSync(ANDROID_MANIFEST)) {
    if (patchAndroidManifest(ANDROID_MANIFEST)) {
      console.log('patch-native: updated AndroidManifest.xml');
      n++;
    } else {
      console.log('patch-native: AndroidManifest.xml already patched');
    }
  } else {
    console.log('patch-native: android/ not present yet (run npm run cap:add)');
  }

  if (fs.existsSync(ANDROID_STRINGS)) {
    if (patchAndroidStrings(ANDROID_STRINGS)) {
      console.log('patch-native: updated android strings.xml');
      n++;
    } else {
      console.log('patch-native: android strings.xml already patched');
    }
  }

  return n;
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}

module.exports = { APP_ID, APP_NAME, LOCATION_COPY };
