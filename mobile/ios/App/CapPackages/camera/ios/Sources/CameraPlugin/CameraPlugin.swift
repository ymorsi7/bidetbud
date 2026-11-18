import Foundation
import IONCameraLib
import Capacitor
import Photos
import PhotosUI
import ImageIO

@objc(CAPCameraPlugin)
public class CameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CAPCameraPlugin"
    public let jsName = "Camera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "takePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "chooseFromGallery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "editURIPhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "editPhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recordVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickImages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickLimitedLibraryPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLimitedLibraryPhotos", returnType: CAPPluginReturnPromise)
    ]
    private var call: CAPPluginCall?
    private var settings = CameraSettings()
    private let defaultSource = CameraSource.prompt
    private let defaultDirection = CameraDirection.rear
    private var multiple = false

    private lazy var cameraManager = IONCAMRFactory.createCameraManagerWrapper(withDelegate: self, and: self.bridge?.viewController ?? UIViewController())
    private lazy var galleryManager = IONCAMRFactory.createGalleryManagerWrapper(withDelegate: self, and: self.bridge?.viewController ?? UIViewController())
    private lazy var editManager = IONCAMRFactory.createEditManagerWrapper(withDelegate: self, and: self.bridge?.viewController ?? UIViewController())
    private lazy var videoManager = IONCAMRFactory.createVideoManagerWrapper(withDelegate: self, and: self.bridge?.viewController ?? UIViewController())

    private var imageCounter = 0
    
    public override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onAppTerminate),
            name: UIApplication.willTerminateNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    @objc private func onAppTerminate() {
        cameraManager.cleanTemporaryFiles()
    }

    private func decodeParameters<T: Decodable>(from call: CAPPluginCall) -> T? {
        guard let dict = call.options as? [String: Any],
              let data = try? JSONSerialization.data(withJSONObject: dict)
        else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func sendError(_ error: IONCAMRError) {
        DispatchQueue.main.async {
            self.call?.reject(error.localizedDescription, "OS-PLUG-CAMR-" + String(format: "%04d", error.errorCode))
        }
    }

    private func handleCall<T: Decodable>(_ call: CAPPluginCall, error: IONCAMRError, action: @escaping (T) -> Void) {
        self.call = call
        guard let options: T = decodeParameters(from: call) else {
            sendError(error)
            return
        }
        DispatchQueue.main.async {
            action(options)
        }
    }

    @objc func takePhoto(_ call: CAPPluginCall) {
        handleCall(call, error: .takePictureArguments) { (options: IONCAMRTakePhotoOptions) in
            self.cameraManager.takePhoto(with: options)
        }
    }

    @objc func chooseFromGallery(_ call: CAPPluginCall) {
        handleCall(call, error: .chooseMultimediaIssue) { (options: IONCAMRGalleryOptions) in
            self.galleryManager.chooseFromGallery(with: options)
        }
    }

    @objc func editURIPhoto(_ call: CAPPluginCall) {
        handleCall(call, error: .editPictureIssue) { (options: IONCAMRPhotoEditOptions) in
            self.editManager.editPhoto(with: options)
        }
    }

    @objc func editPhoto(_ call: CAPPluginCall) {
        struct Options: Decodable { let inputImage: String }
        handleCall(call, error: .editPictureIssue) { (options: Options) in
            guard let imageData = Data(base64Encoded: options.inputImage),
                  let image = UIImage(data: imageData) else {
                self.sendError(.editPictureIssue)
                return
            }
            self.editManager.editPhoto(image)
        }
    }

    @objc func recordVideo(_ call: CAPPluginCall) {
        handleCall(call, error: .captureVideoIssue) { (options: IONCAMRRecordVideoOptions) in
            self.cameraManager.recordVideo(with: options)
        }
    }

    @objc func playVideo(_ call: CAPPluginCall) {
        handleCall(call, error: .playVideoIssue) { (options: IONCAMRPlayVideoOptions) in
            Task {
                do {
                    try await self.videoManager.playVideo(options.url)
                    call.resolve()
                } catch let error as IONCAMRError {
                    self.callback(error: error)
                } catch {
                    self.callback(error: .playVideoIssue)
                }
            }
        }
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        var result: [String: Any] = [:]
        for permission in CameraPermissionType.allCases {
            let state: String
            switch permission {
            case .camera:
                state = AVCaptureDevice.authorizationStatus(for: .video).authorizationState
            case .photos:
                state = PHPhotoLibrary.authorizationStatus(for: .readWrite).authorizationState
            }
            result[permission.rawValue] = state
        }
        call.resolve(result)
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        // get the list of desired types, if passed
        let typeList = call.getArray("permissions", String.self)?.compactMap({ (type) -> CameraPermissionType? in
            return CameraPermissionType(rawValue: type)
        }) ?? []
        // otherwise check everything
        let permissions: [CameraPermissionType] = (typeList.count > 0) ? typeList : CameraPermissionType.allCases
        // request the permissions
        let group = DispatchGroup()
        for permission in permissions {
            switch permission {
            case .camera:
                group.enter()
                AVCaptureDevice.requestAccess(for: .video) { _ in
                    group.leave()
                }
            case .photos:
                group.enter()
                PHPhotoLibrary.requestAuthorization(for: .readWrite) { (_) in
                    group.leave()
                }
            }
        }
        group.notify(queue: DispatchQueue.main) { [weak self] in
            self?.checkPermissions(call)
        }
    }

    @objc func pickLimitedLibraryPhotos(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { (granted) in
            if granted == .limited {
                if let viewController = self.bridge?.viewController {
                    PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: viewController) { _ in
                        self.getLimitedLibraryPhotos(call)
                    }
                }
            } else {
                call.resolve([
                    "photos": []
                ])
            }
        }
    }

    @objc func getLimitedLibraryPhotos(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { (granted) in
            if granted == .limited {

                self.call = call

                DispatchQueue.global(qos: .utility).async {
                    let assets = PHAsset.fetchAssets(with: .image, options: nil)
                    var processedImages: [ProcessedImage] = []

                    let imageManager = PHImageManager.default()
                    let options = PHImageRequestOptions()
                    options.deliveryMode = .highQualityFormat

                    let group = DispatchGroup()
                    if assets.count > 0 {
                        for index in 0...(assets.count - 1) {
                            let asset = assets.object(at: index)
                            let fullSize = CGSize(width: asset.pixelWidth, height: asset.pixelHeight)

                            group.enter()
                            imageManager.requestImage(for: asset, targetSize: fullSize, contentMode: .default, options: options) { image, _ in
                                guard let image = image else {
                                    group.leave()
                                    return
                                }
                                processedImages.append(self.processedImage(from: image, with: asset.imageData))
                                group.leave()
                            }
                        }
                    }

                    group.notify(queue: .global(qos: .utility)) { [weak self] in
                        self?.returnImages(processedImages)
                    }
                }
            } else {
                call.resolve([
                    "photos": []
                ])
            }
        }
    }

    @available(*, deprecated, message: "Use takePhoto or chooseFromGallery instead")
    @objc func getPhoto(_ call: CAPPluginCall) {
        self.multiple = false
        self.call = call
        self.settings = cameraSettings(from: call)

        // Make sure they have all the necessary info.plist settings
        if let missingUsageDescription = checkUsageDescriptions() {
            CAPLog.print("⚡️ ", self.pluginId, "-", missingUsageDescription)
            call.reject(missingUsageDescription)
            return
        }

        DispatchQueue.main.async {
            switch self.settings.source {
            case .prompt:
                self.showPrompt()
            case .camera:
                self.showCamera()
            case .photos:
                self.showPhotos()
            }
        }
    }

    private func checkUsageDescriptions() -> String? {
        if let dict = Bundle.main.infoDictionary {
            for key in CameraPropertyListKeys.allCases where dict[key.rawValue] == nil {
                return key.missingMessage
            }
        }
        return nil
    }

    @available(*, deprecated, message: "Use chooseFromGallery instead")
    @objc func pickImages(_ call: CAPPluginCall) {
        self.multiple = true
        self.call = call
        self.settings = cameraSettings(from: call)
        DispatchQueue.main.async {
            self.showPhotos()
        }
    }

    private func cameraSettings(from call: CAPPluginCall) -> CameraSettings {
        var settings = CameraSettings()
        settings.jpegQuality = min(abs(CGFloat(call.getFloat("quality") ?? 100.0)) / 100.0, 1.0)
        settings.allowEditing = call.getBool("allowEditing") ?? false
        settings.source = CameraSource(rawValue: call.getString("source") ?? defaultSource.rawValue) ?? defaultSource
        settings.direction = CameraDirection(rawValue: call.getString("direction") ?? defaultDirection.rawValue) ?? defaultDirection
        if let typeString = call.getString("resultType"), let type = CameraResultType(rawValue: typeString) {
            settings.resultType = type
        }
        settings.saveToGallery = call.getBool("saveToGallery") ?? false

        // Get the new image dimensions if provided
        settings.width = CGFloat(call.getInt("width") ?? 0)
        settings.height = CGFloat(call.getInt("height") ?? 0)
        if settings.width > 0 || settings.height > 0 {
            // We resize only if a dimension was provided
            settings.shouldResize = true
        }
        settings.shouldCorrectOrientation = call.getBool("correctOrientation") ?? true
        settings.userPromptText = CameraPromptText(title: call.getString("promptLabelHeader"),
                                                   photoAction: call.getString("promptLabelPhoto"),
                                                   cameraAction: call.getString("promptLabelPicture"),
                                                   cancelAction: call.getString("promptLabelCancel"))
        if let styleString = call.getString("presentationStyle"), styleString == "popover" {
            settings.presentationStyle = .popover
        } else {
            settings.presentationStyle = .fullScreen
        }

        return settings
    }
}

// public delegate methods
extension CameraPlugin: UIImagePickerControllerDelegate, UINavigationControllerDelegate, UIPopoverPresentationControllerDelegate {
    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        self.call?.reject("User cancelled photos app")
    }

    public func popoverPresentationControllerDidDismissPopover(_ popoverPresentationController: UIPopoverPresentationController) {
        self.call?.reject("User cancelled photos app")
    }

    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        self.call?.reject("User cancelled photos app")
    }

    public func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true) {
            if let processedImage = self.processImage(from: info) {
                self.returnProcessedImage(processedImage)
            } else {
                self.call?.reject("Error processing image")
            }
        }
    }
}

extension CameraPlugin: PHPickerViewControllerDelegate {
    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true, completion: nil)

        guard !results.isEmpty else {
            self.call?.reject("User cancelled photos app")
            return
        }

        self.fetchProcessedImages(from: results) { [weak self] processedImageArray in
            guard let processedImageArray else {
                self?.call?.reject("Error loading image")
                return
            }

            if self?.multiple == true {
                self?.returnImages(processedImageArray)
            } else if var processedImage = processedImageArray.first {
                processedImage.flags = .gallery
                self?.returnProcessedImage(processedImage)
            }
        }
    }

    private func fetchProcessedImages(from pickerResultArray: [PHPickerResult], accumulating: [ProcessedImage] = [], _ completionHandler: @escaping ([ProcessedImage]?) -> Void) {
        func loadImage(from pickerResult: PHPickerResult, _ completionHandler: @escaping (UIImage?) -> Void) {
            let itemProvider = pickerResult.itemProvider
            if itemProvider.canLoadObject(ofClass: UIImage.self) {
                // extract the image
                itemProvider.loadObject(ofClass: UIImage.self) { itemProviderReading, _ in
                    completionHandler(itemProviderReading as? UIImage)
                }
            } else {
                // extract the image's data representation
                itemProvider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in
                    guard let data else {
                        return completionHandler(nil)
                    }
                    completionHandler(UIImage(data: data))
                }
            }
        }

        guard let currentPickerResult = pickerResultArray.first else { return completionHandler(accumulating) }

        loadImage(from: currentPickerResult) { [weak self] loadedImage in
            guard let self, let loadedImage else { return completionHandler(nil) }
            var asset: PHAsset?
            if let assetId = currentPickerResult.assetIdentifier {
                asset = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil).firstObject
            }
            let newElement = self.processedImage(from: loadedImage, with: asset?.imageData)
            self.fetchProcessedImages(
                from: Array(pickerResultArray.dropFirst()),
                accumulating: accumulating + [newElement],
                completionHandler
            )
        }
    }
}

private extension CameraPlugin {
    func returnImage(_ processedImage: ProcessedImage, isSaved: Bool) {
        guard let jpeg = processedImage.generateJPEG(with: settings.jpegQuality) else {
            self.call?.reject("Unable to convert image to jpeg")
            return
        }

        if settings.resultType == CameraResultType.uri || multiple {
            guard let fileURL = try? saveTemporaryImage(jpeg),
                  let webURL = bridge?.portablePath(fromLocalURL: fileURL) else {
                call?.reject("Unable to get portable path to file")
                return
            }
            if self.multiple {
                call?.resolve([
                    "photos": [[
                        "path": fileURL.absoluteString,
                        "exif": processedImage.exifData,
                        "webPath": webURL.absoluteString,
                        "format": "jpeg"
                    ]]
                ])
                return
            }
            call?.resolve([
                "path": fileURL.absoluteString,
                "exif": processedImage.exifData,
                "webPath": webURL.absoluteString,
                "format": "jpeg",
                "saved": isSaved
            ])
        } else if settings.resultType == CameraResultType.base64 {
            self.call?.resolve([
                "base64String": jpeg.base64EncodedString(),
                "exif": processedImage.exifData,
                "format": "jpeg",
                "saved": isSaved
            ])
        } else if settings.resultType == CameraResultType.dataURL {
            call?.resolve([
                "dataUrl": "data:image/jpeg;base64," + jpeg.base64EncodedString(),
                "exif": processedImage.exifData,
                "format": "jpeg",
                "saved": isSaved
            ])
        }
    }

    func returnImages(_ processedImages: [ProcessedImage]) {
        var photos: [PluginCallResultData] = []
        for processedImage in processedImages {
            guard let jpeg = processedImage.generateJPEG(with: settings.jpegQuality) else {
                self.call?.reject("Unable to convert image to jpeg")
                return
            }

            guard let fileURL = try? saveTemporaryImage(jpeg),
                  let webURL = bridge?.portablePath(fromLocalURL: fileURL) else {
                call?.reject("Unable to get portable path to file")
                return
            }

            photos.append([
                "path": fileURL.absoluteString,
                "exif": processedImage.exifData,
                "webPath": webURL.absoluteString,
                "format": "jpeg"
            ])
        }
        call?.resolve([
            "photos": photos
        ])
    }

    func returnProcessedImage(_ processedImage: ProcessedImage) {
        // conditionally save the image
        if settings.saveToGallery && (processedImage.flags.contains(.edited) == true || processedImage.flags.contains(.gallery) == false) {
            _ = ImageSaver(image: processedImage.image) { error in
                var isSaved = false
                if error == nil {
                    isSaved = true
                }
                self.returnImage(processedImage, isSaved: isSaved)
            }
        } else {
            self.returnImage(processedImage, isSaved: false)
        }
    }

    func showPrompt() {
        // Build the action sheet
        let alert = UIAlertController(title: settings.userPromptText.title, message: nil, preferredStyle: UIAlertController.Style.actionSheet)
        alert.addAction(UIAlertAction(title: settings.userPromptText.photoAction, style: .default, handler: { [weak self] (_: UIAlertAction) in
            self?.showPhotos()
        }))

        alert.addAction(UIAlertAction(title: settings.userPromptText.cameraAction, style: .default, handler: { [weak self] (_: UIAlertAction) in
            self?.showCamera()
        }))

        alert.addAction(UIAlertAction(title: settings.userPromptText.cancelAction, style: .cancel, handler: { [weak self] (_: UIAlertAction) in
            self?.call?.reject("User cancelled photos app")
        }))
        self.setCenteredPopover(alert)
        self.bridge?.viewController?.present(alert, animated: true, completion: nil)
    }

    func showCamera() {
        // check if we have a camera
        if (bridge?.isSimEnvironment ?? false) || !UIImagePickerController.isSourceTypeAvailable(UIImagePickerController.SourceType.camera) {
            CAPLog.print("⚡️ ", self.pluginId, "-", "Camera not available in simulator")
            call?.reject("Camera not available while running in Simulator")
            return
        }
        // check for permission
        let authStatus = AVCaptureDevice.authorizationStatus(for: .video)
        if authStatus == .restricted || authStatus == .denied {
            call?.reject("User denied access to camera")
            return
        }
        // we either already have permission or can prompt
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            if granted {
                DispatchQueue.main.async {
                    self?.presentCameraPicker()
                }
            } else {
                self?.call?.reject("User denied access to camera")
            }
        }
    }

    func showPhotos() {
        // check for permission
        let authStatus = PHPhotoLibrary.authorizationStatus()
        if authStatus == .restricted || authStatus == .denied {
            call?.reject("User denied access to photos")
            return
        }
        // we either already have permission or can prompt
        if authStatus == .authorized {
            presentSystemAppropriateImagePicker()
        } else {
            PHPhotoLibrary.requestAuthorization({ [weak self] (status) in
                if status == PHAuthorizationStatus.authorized {
                    DispatchQueue.main.async { [weak self] in
                        self?.presentSystemAppropriateImagePicker()
                    }
                } else {
                    self?.call?.reject("User denied access to photos")
                }
            })
        }
    }

    func presentCameraPicker() {
        let picker = UIImagePickerController()
        picker.delegate = self
        picker.allowsEditing = self.settings.allowEditing
        // select the input
        picker.sourceType = .camera
        if settings.direction == .rear, UIImagePickerController.isCameraDeviceAvailable(.rear) {
            picker.cameraDevice = .rear
        } else if settings.direction == .front, UIImagePickerController.isCameraDeviceAvailable(.front) {
            picker.cameraDevice = .front
        }
        // present
        picker.modalPresentationStyle = settings.presentationStyle
        if settings.presentationStyle == .popover {
            picker.popoverPresentationController?.delegate = self
            setCenteredPopover(picker)
        }
        bridge?.viewController?.present(picker, animated: true, completion: nil)
    }

    func presentSystemAppropriateImagePicker() {
        presentPhotoPicker()
    }

    func presentImagePicker() {
        let picker = UIImagePickerController()
        picker.delegate = self
        picker.allowsEditing = self.settings.allowEditing
        // select the input
        picker.sourceType = .photoLibrary
        // present
        picker.modalPresentationStyle = settings.presentationStyle
        if settings.presentationStyle == .popover {
            picker.popoverPresentationController?.delegate = self
            setCenteredPopover(picker)
        }
        bridge?.viewController?.present(picker, animated: true, completion: nil)
    }

    func presentPhotoPicker() {
        var configuration = PHPickerConfiguration(photoLibrary: PHPhotoLibrary.shared())
        configuration.selectionLimit = self.multiple ? (self.call?.getInt("limit") ?? 0) : 1
        configuration.filter = .images
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        // present
        picker.modalPresentationStyle = settings.presentationStyle
        if settings.presentationStyle == .popover {
            picker.popoverPresentationController?.delegate = self
            setCenteredPopover(picker)
        }
        bridge?.viewController?.present(picker, animated: true, completion: nil)
    }

    func saveTemporaryImage(_ data: Data) throws -> URL {
        var url: URL
        repeat {
            imageCounter += 1
            url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("photo-\(imageCounter).jpg")
        } while FileManager.default.fileExists(atPath: url.path)

        try data.write(to: url, options: .atomic)
        return url
    }

    func processImage(from info: [UIImagePickerController.InfoKey: Any]) -> ProcessedImage? {
        var selectedImage: UIImage?
        var flags: PhotoFlags = []
        // get the image
        if let edited = info[UIImagePickerController.InfoKey.editedImage] as? UIImage {
            selectedImage = edited // use the edited version
            flags = flags.union([.edited])
        } else if let original = info[UIImagePickerController.InfoKey.originalImage] as? UIImage {
            selectedImage = original // use the original version
        }
        guard let image = selectedImage else {
            return nil
        }
        var metadata: [String: Any] = [:]
        // get the image's metadata from the picker or from the photo album
        if let photoMetadata = info[UIImagePickerController.InfoKey.mediaMetadata] as? [String: Any] {
            metadata = photoMetadata
        } else {
            flags = flags.union([.gallery])
        }
        if let asset = info[UIImagePickerController.InfoKey.phAsset] as? PHAsset {
            metadata = asset.imageData
        }
        // get the result
        var result = processedImage(from: image, with: metadata)
        result.flags = flags
        return result
    }

    func processedImage(from image: UIImage, with metadata: [String: Any]?) -> ProcessedImage {
        var result = ProcessedImage(image: image, metadata: metadata ?? [:])
        // resizing the image only makes sense if we have real values to which to constrain it
        if settings.shouldResize, settings.width > 0 || settings.height > 0 {
            result.image = result.image.reformat(to: CGSize(width: settings.width, height: settings.height))
            result.overwriteMetadataOrientation(to: 1)
        } else if settings.shouldCorrectOrientation {
            // resizing implicitly reformats the image so this is only needed if we aren't resizing
            result.image = result.image.reformat()
            result.overwriteMetadataOrientation(to: 1)
        }
        return result
    }
}

extension CameraPlugin: IONCAMRCallbackDelegate {

    public func callback(error: IONCAMRError) {
        sendError(error)
    }

    public func callback(result: IONCAMRMediaResult) {
        resolve(result)
    }

    public func callback(result: [IONCAMRMediaResult]) {
        resolve(["results": result])
    }

    private func resolve<T: Encodable>(_ value: T) {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(value)
            var json = try JSONSerialization.jsonObject(with: data)

            if var dict = json as? [String: Any] {
                if dict["uri"] != nil {
                    dict = resolveMediaResult(dict)
                } else if let results = dict["results"] as? [[String: Any]] {
                    dict["results"] = results.map(resolveMediaResult)
                }
                json = dict
            }

            DispatchQueue.main.async {
                self.call?.resolve(json as? [String: Any] ?? [:])
            }
        } catch {
            sendError(.invalidEncodeResultMedia)
        }
    }

    private func resolveMediaResult(_ item: [String: Any]) -> [String: Any] {
        guard let uri = item["uri"] as? String, !uri.isEmpty else {
            if let thumbnail = item["thumbnail"] as? String {
                return ["outputImage": thumbnail]
            }
            return item
        }
        var result = item
        result["webPath"] = resolveWebPath(from: uri)
        if var metadata = result["metadata"] as? [String: Any] {
            metadata["exif"] = resolveExif(from: uri)
            result["metadata"] = metadata
        }
        return result
    }

    private func resolveWebPath(from uri: String) -> String? {
        guard !uri.isEmpty,
              let fileURL = URL(string: uri),
              let webURL = bridge?.portablePath(fromLocalURL: fileURL) else {
            return nil
        }
        return webURL.absoluteString
    }

    private func resolveExif(from uri: String) -> [String: Any]? {
        guard !uri.isEmpty,
              let fileURL = URL(string: uri),
              let imageSource = CGImageSourceCreateWithURL(fileURL as CFURL, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [String: Any] else {
            return nil
        }
        var exif = properties[kCGImagePropertyExifDictionary as String] as? [String: Any] ?? [:]
        exif["Orientation"] = properties[kCGImagePropertyOrientation as String]
        exif["GPS"] = properties[kCGImagePropertyGPSDictionary as String]
        return exif.isEmpty ? nil : exif
    }
}
