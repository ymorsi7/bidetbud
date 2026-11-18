var capacitorSplashScreen = (function (exports, core) {
    'use strict';

    const SplashScreen = core.registerPlugin('SplashScreen', {
        web: () => Promise.resolve().then(function () { return web; }).then((m) => new m.SplashScreenWeb()),
    });

    class SplashScreenWeb extends core.WebPlugin {
        async show(_options) {
            return undefined;
        }
        async hide(_options) {
            return undefined;
        }
    }

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        SplashScreenWeb: SplashScreenWeb
    });

    exports.SplashScreen = SplashScreen;

    return exports;

})({}, capacitorExports);
//# sourceMappingURL=plugin.js.map
