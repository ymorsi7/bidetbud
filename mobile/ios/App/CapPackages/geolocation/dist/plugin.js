var capacitorGeolocationPluginCapacitor = (function (exports, core, synapse) {
    'use strict';

    const Geolocation = core.registerPlugin('Geolocation', {
        web: () => Promise.resolve().then(function () { return web; }).then((m) => new m.GeolocationWeb()),
    });
    synapse.exposeSynapse();

    class GeolocationWeb extends core.WebPlugin {
        constructor() {
            super();
            this.latestOrientation = null;
            if (typeof window !== 'undefined') {
                const win = window;
                if ('ondeviceorientationabsolute' in win) {
                    win.addEventListener('deviceorientationabsolute', (event) => this.updateOrientation(event, true), true);
                }
                else if ('ondeviceorientation' in win) {
                    win.addEventListener('deviceorientation', (event) => this.updateOrientation(event, false), true);
                }
            }
        }
        updateOrientation(event, isAbsolute) {
            let trueHeading = null;
            let magneticHeading = null;
            let headingAccuracy = null;
            if (isAbsolute && event.alpha !== null) {
                trueHeading = (360 - event.alpha) % 360;
            }
            else if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
                magneticHeading = event.webkitCompassHeading;
                headingAccuracy = event.webkitCompassAccuracy;
            }
            else if (event.alpha !== null && event.absolute === true) {
                trueHeading = (360 - event.alpha) % 360;
            }
            else if (event.alpha !== null) {
                magneticHeading = (360 - event.alpha) % 360;
            }
            if (trueHeading !== null || magneticHeading !== null) {
                this.latestOrientation = {
                    trueHeading,
                    magneticHeading,
                    headingAccuracy,
                };
            }
        }
        augmentPosition(pos, isWatch = false) {
            var _a, _b, _c, _d, _e, _f, _g;
            const coords = pos.coords;
            const orientation = isWatch ? this.latestOrientation : null;
            const heading = (_c = (_b = (_a = orientation === null || orientation === void 0 ? void 0 : orientation.trueHeading) !== null && _a !== void 0 ? _a : orientation === null || orientation === void 0 ? void 0 : orientation.magneticHeading) !== null && _b !== void 0 ? _b : (isWatch ? coords.heading : null)) !== null && _c !== void 0 ? _c : null;
            return {
                timestamp: pos.timestamp,
                coords: {
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    accuracy: coords.accuracy,
                    altitude: coords.altitude,
                    altitudeAccuracy: coords.altitudeAccuracy,
                    speed: coords.speed,
                    heading: heading,
                    magneticHeading: (_d = orientation === null || orientation === void 0 ? void 0 : orientation.magneticHeading) !== null && _d !== void 0 ? _d : null,
                    trueHeading: (_e = orientation === null || orientation === void 0 ? void 0 : orientation.trueHeading) !== null && _e !== void 0 ? _e : null,
                    headingAccuracy: (_f = orientation === null || orientation === void 0 ? void 0 : orientation.headingAccuracy) !== null && _f !== void 0 ? _f : null,
                    course: (_g = (isWatch ? coords.heading : null)) !== null && _g !== void 0 ? _g : null,
                },
            };
        }
        async getCurrentPosition(options) {
            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition((pos) => {
                    resolve(this.augmentPosition(pos, false));
                }, (err) => {
                    reject(err);
                }, Object.assign({ enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }, options));
            });
        }
        async watchPosition(options, callback) {
            const id = navigator.geolocation.watchPosition((pos) => {
                callback(this.augmentPosition(pos, true));
            }, (err) => {
                callback(null, err);
            }, Object.assign({ enableHighAccuracy: false, timeout: 10000, maximumAge: 0, minimumUpdateInterval: 5000 }, options));
            return `${id}`;
        }
        async clearWatch(options) {
            navigator.geolocation.clearWatch(parseInt(options.id, 10));
        }
        async checkPermissions() {
            if (typeof navigator === 'undefined' || !navigator.permissions) {
                throw this.unavailable('Permissions API not available in this browser');
            }
            const permission = await navigator.permissions.query({
                name: 'geolocation',
            });
            return { location: permission.state, coarseLocation: permission.state };
        }
        async requestPermissions() {
            throw this.unimplemented('Not implemented on web.');
        }
    }
    new GeolocationWeb();

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        GeolocationWeb: GeolocationWeb
    });

    exports.Geolocation = Geolocation;

    return exports;

})({}, capacitorExports, synapse);
//# sourceMappingURL=plugin.js.map
