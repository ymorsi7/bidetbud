import Capacitor
import IONGeolocationLib

extension IONGLOCPositionModel {
    func toJSObject() -> JSObject {
        [
            Constants.Position.timestamp: timestamp,
            Constants.Position.coords: coordsJSObject
        ]
    }

    private var coordsJSObject: JSObject {
        let headingValue = trueHeading ?? magneticHeading ?? (course != -1.0 ? course : nil)
        return [
            Constants.Position.altitude: altitude,
            Constants.Position.heading: headingValue ?? NSNull(),
            Constants.Position.magneticHeading: magneticHeading ?? NSNull(),
            Constants.Position.trueHeading: trueHeading ?? NSNull(),
            Constants.Position.headingAccuracy: headingAccuracy ?? NSNull(),
            Constants.Position.course: course != -1.0 ? course : NSNull(),
            Constants.Position.accuracy: horizontalAccuracy,
            Constants.Position.latitude: latitude,
            Constants.Position.longitude: longitude,
            Constants.Position.speed: speed,
            Constants.Position.altitudeAccuracy: verticalAccuracy
        ]
    }
}
