import Capacitor
import IONGeolocationLib

private enum GeolocationCallbackType {
    case requestPermissions
    case location
    case watch

    var shouldKeepCallback: Bool {
        self == .watch
    }

    var shouldClearAfterSending: Bool {
        self == .location || self == .requestPermissions
    }
}

private struct GeolocationCallbackGroup {
    let ids: [CAPPluginCall]
    let type: GeolocationCallbackType
}

final class GeolocationCallbackManager {
    private(set) var requestPermissionsCallbacks: [CAPPluginCall]
    private(set) var locationCallbacks: [CAPPluginCall]
    private(set) var watchCallbacks: [String: CAPPluginCall]
    private(set) var timeout: Int?
    private let capacitorBridge: CAPBridgeProtocol?

    private var allCallbackGroups: [GeolocationCallbackGroup] {
        [
            .init(ids: requestPermissionsCallbacks, type: .requestPermissions),
            .init(ids: locationCallbacks, type: .location),
            .init(ids: Array(watchCallbacks.values), type: .watch)
        ]
    }
    private var requestPermissionsCallbackGroup: GeolocationCallbackGroup? {
        allCallbackGroups.first { $0.type == .requestPermissions }
    }

    init(capacitorBridge: CAPBridgeProtocol?) {
        self.capacitorBridge = capacitorBridge
        self.requestPermissionsCallbacks = []
        self.locationCallbacks = []
        self.watchCallbacks = [:]
    }

    func addRequestPermissionsCallback(capacitorCall call: CAPPluginCall) {
        capacitorBridge?.saveCall(call)
        requestPermissionsCallbacks.append(call)
    }

    func addLocationCallback(capacitorCall call: CAPPluginCall) {
        capacitorBridge?.saveCall(call)
        locationCallbacks.append(call)
        let timeout = call.getInt(Constants.Arguments.timeout)
        self.timeout = timeout
    }

    func addWatchCallback(_ watchId: String, capacitorCall call: CAPPluginCall) {
        capacitorBridge?.saveCall(call)
        watchCallbacks[watchId] = call
        let timeout = call.getInt(Constants.Arguments.timeout)
        self.timeout = timeout
    }

    func clearRequestPermissionsCallbacks() {
        requestPermissionsCallbacks.forEach {
            capacitorBridge?.releaseCall($0)
        }
        requestPermissionsCallbacks.removeAll()
    }

    func clearWatchCallbackIfExists(_ watchId: String) {
        if let callbackToRemove = watchCallbacks[watchId] {
            capacitorBridge?.releaseCall(callbackToRemove)
            watchCallbacks.removeValue(forKey: watchId)
        }
    }

    func clearLocationCallbacks() {
        locationCallbacks.forEach {
            capacitorBridge?.releaseCall($0)
        }
        locationCallbacks.removeAll()
    }

    func sendSuccess(_ call: CAPPluginCall) {
        call.resolve()
    }

    func sendSuccess(_ call: CAPPluginCall, with data: PluginCallResultData) {
        call.resolve(data)
    }

    func sendRequestPermissionsSuccess(_ permissionsResult: String) {
        if let group = requestPermissionsCallbackGroup {
            let data = [
                Constants.AuthorisationStatus.ResultKey.location: permissionsResult,
                Constants.AuthorisationStatus.ResultKey.coarseLocation: permissionsResult
            ]
            send(.success(data), to: group)
        }
    }

    func sendSuccess(with position: IONGLOCPositionModel) {
        createPluginResult(status: .success(position.toJSObject()))
    }

    func sendError(_ call: CAPPluginCall, error: GeolocationError) {
        let errorModel = error.toCodeMessagePair()
        call.reject(errorModel.1, errorModel.0)
    }

    func sendError(_ error: GeolocationError) {
        createPluginResult(status: .error(error.toCodeMessagePair()))

        if case .timeout = error {
            watchCallbacks.keys.forEach { clearWatchCallbackIfExists($0) }
        }
    }
}

private enum CallResultStatus {
    typealias SuccessModel = JSObject
    typealias ErrorModel = (code: String, message: String)

    case success(_ data: SuccessModel)
    case error(_ codeAndMessage: ErrorModel)
}

private extension GeolocationCallbackManager {

    func createPluginResult(status: CallResultStatus) {
        allCallbackGroups.forEach {
            send(status, to: $0)
        }
    }

    func send(_ callResultStatus: CallResultStatus, to group: GeolocationCallbackGroup) {
        group.ids.forEach { call in
            call.keepAlive = group.type.shouldKeepCallback
            switch callResultStatus {
            case .success(let data):
                call.resolve(data)
            case .error(let error):
                call.reject(error.message, error.code)
            }
        }

        if group.type.shouldClearAfterSending {
            clearCallbacks(for: group.type)
        }
    }

    func clearCallbacks(for type: GeolocationCallbackType) {
        if case .location = type {
            clearLocationCallbacks()
        } else if case .requestPermissions = type {
            clearRequestPermissionsCallbacks()
        }
    }
}
