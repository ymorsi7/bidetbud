import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bidetbud.app',
  appName: 'BidetBud',
  webDir: 'www',
  // Bundled www is the source of truth. Do not point the WebView at
  // https://bidetbud.com — that would skip the offline seed copy.
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    // Native HTTP so the optional live seed refresh can reach
    // https://bidetbud.com/bidet-seed.json without WebView CORS issues.
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 400,
      launchAutoHide: true,
      backgroundColor: '#18181b',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Light chrome (dark icons) over the zinc/Inter topbar.
      // Safe-area padding already lives in css/app.css (--safe-top / --safe-bottom).
      style: 'LIGHT',
      backgroundColor: '#f4f4f5',
      overlaysWebView: true,
    },
    Keyboard: {
      // Do not resize/pan the WebView when a field is focused — that is what
      // zoomed the Suggest a spot sheet off-screen on iOS.
      resize: 'none',
    },
  },
  ios: {
    // never: CSS env(safe-area-*) owns the notch. `automatic` double-pads
    // with .topbar { padding-top: var(--safe-top) } and leaves a huge gap.
    contentInset: 'never',
    preferredContentMode: 'mobile',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f4f4f5',
  },
};

export default config;
