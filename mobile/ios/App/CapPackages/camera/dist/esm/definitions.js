/**
 * @deprecated This enum is only meant to be used for deprecated `getPhoto` method.
 * It will be removed in a future major version of the plugin, along with `getPhoto`.
 */
export var CameraSource;
(function (CameraSource) {
    /**
     * Prompts the user to select either the photo album or take a photo.
     */
    CameraSource["Prompt"] = "PROMPT";
    /**
     * Take a new photo using the camera.
     */
    CameraSource["Camera"] = "CAMERA";
    /**
     * Pick an existing photo from the gallery or photo album.
     */
    CameraSource["Photos"] = "PHOTOS";
})(CameraSource || (CameraSource = {}));
export var CameraDirection;
(function (CameraDirection) {
    CameraDirection["Rear"] = "REAR";
    CameraDirection["Front"] = "FRONT";
})(CameraDirection || (CameraDirection = {}));
/**
 * @deprecated This enum is only meant to be used for `ImageOptions` in deprecated `getPhoto` method.
 * It will be removed in a future major version of the plugin, along with `getPhoto`.
 */
export var CameraResultType;
(function (CameraResultType) {
    CameraResultType["Uri"] = "uri";
    CameraResultType["Base64"] = "base64";
    CameraResultType["DataUrl"] = "dataUrl";
})(CameraResultType || (CameraResultType = {}));
export var MediaType;
(function (MediaType) {
    MediaType[MediaType["Photo"] = 0] = "Photo";
    MediaType[MediaType["Video"] = 1] = "Video";
})(MediaType || (MediaType = {}));
export var MediaTypeSelection;
(function (MediaTypeSelection) {
    MediaTypeSelection[MediaTypeSelection["Photo"] = 0] = "Photo";
    MediaTypeSelection[MediaTypeSelection["Video"] = 1] = "Video";
    MediaTypeSelection[MediaTypeSelection["All"] = 2] = "All";
})(MediaTypeSelection || (MediaTypeSelection = {}));
export var EncodingType;
(function (EncodingType) {
    EncodingType[EncodingType["JPEG"] = 0] = "JPEG";
    EncodingType[EncodingType["PNG"] = 1] = "PNG";
})(EncodingType || (EncodingType = {}));
/**
 * Error codes returned by the Camera plugin.
 * These values match the `code` field on rejected promises.
 *
 * @since 8.2.0
 */
export var CameraErrorCode;
(function (CameraErrorCode) {
    // Permissions
    /**
     * Camera access was denied by the user.
     */
    CameraErrorCode["CameraPermissionDenied"] = "OS-PLUG-CAMR-0003";
    /**
     * Photo library / gallery access was denied by the user.
     */
    CameraErrorCode["GalleryPermissionDenied"] = "OS-PLUG-CAMR-0005";
    /**
     * No camera hardware is available on the device.
     */
    CameraErrorCode["NoCameraAvailable"] = "OS-PLUG-CAMR-0007";
    // Take Photo
    /**
     * The user cancelled the take photo action.
     */
    CameraErrorCode["TakePhotoCancelled"] = "OS-PLUG-CAMR-0006";
    /**
     * Failed to take photo.
     */
    CameraErrorCode["TakePhotoFailed"] = "OS-PLUG-CAMR-0010";
    /**
     * The take photo action received invalid arguments.
     * @platform ios
     */
    CameraErrorCode["TakePhotoInvalidArguments"] = "OS-PLUG-CAMR-0014";
    // Edit Photo
    /**
     * The selected file contains invalid image data.
     * @platform ios
     */
    CameraErrorCode["InvalidImageData"] = "OS-PLUG-CAMR-0008";
    /**
     * Failed to edit image.
     */
    CameraErrorCode["EditPhotoFailed"] = "OS-PLUG-CAMR-0009";
    /**
     * The user cancelled the edit photo action.
     */
    CameraErrorCode["EditPhotoCancelled"] = "OS-PLUG-CAMR-0013";
    /**
     * The URI parameter for editing is empty.
     * @platform android
     */
    CameraErrorCode["EditPhotoEmptyUri"] = "OS-PLUG-CAMR-0024";
    // Choose from Gallery
    /**
     * Failed to retrieve an image from the gallery.
     */
    CameraErrorCode["ImageNotFound"] = "OS-PLUG-CAMR-0011";
    /**
     * Failed to process the selected image.
     */
    CameraErrorCode["ProcessImageFailed"] = "OS-PLUG-CAMR-0012";
    /**
     * Failed to choose media from the gallery.
     */
    CameraErrorCode["ChooseMediaFailed"] = "OS-PLUG-CAMR-0018";
    /**
     * The user cancelled choosing media from the gallery.
     */
    CameraErrorCode["ChooseMediaCancelled"] = "OS-PLUG-CAMR-0020";
    /**
     * Failed to retrieve the media file path.
     * @platform android
     */
    CameraErrorCode["MediaPathError"] = "OS-PLUG-CAMR-0021";
    /**
     * Failed to retrieve an image from the provided URI.
     */
    CameraErrorCode["FetchImageFromUriFailed"] = "OS-PLUG-CAMR-0028";
    // Record Video
    /**
     * Failed to record video.
     */
    CameraErrorCode["RecordVideoFailed"] = "OS-PLUG-CAMR-0016";
    /**
     * The user cancelled the video recording.
     */
    CameraErrorCode["RecordVideoCancelled"] = "OS-PLUG-CAMR-0017";
    /**
     * Failed to retrieve a video from the gallery.
     * @platform ios
     */
    CameraErrorCode["VideoNotFound"] = "OS-PLUG-CAMR-0025";
    // Play Video
    /**
     * Failed to play video.
     */
    CameraErrorCode["PlayVideoFailed"] = "OS-PLUG-CAMR-0023";
    // General
    /**
     * Failed to encode the media result.
     * @platform ios
     */
    CameraErrorCode["EncodeResultFailed"] = "OS-PLUG-CAMR-0019";
    /**
     * The selected file does not exist.
     */
    CameraErrorCode["FileNotFound"] = "OS-PLUG-CAMR-0027";
    /**
     * Invalid argument provided to a plugin method.
     * @platform android
     */
    CameraErrorCode["InvalidArgument"] = "OS-PLUG-CAMR-0031";
    /**
     * A general plugin error occurred.
     * @platform ios
     */
    CameraErrorCode["GeneralError"] = "OS-PLUG-CAMR-0026";
})(CameraErrorCode || (CameraErrorCode = {}));
//# sourceMappingURL=definitions.js.map