import type { PermissionState } from '@capacitor/core';
export type CameraPermissionState = PermissionState | 'limited';
export type CameraPermissionType = 'camera' | 'photos';
export interface PermissionStatus {
    camera: CameraPermissionState;
    photos: CameraPermissionState;
}
export interface CameraPluginPermissions {
    permissions: CameraPermissionType[];
}
export interface CameraPlugin {
    /**
     * Open the device's camera and allow the user to take a photo.
     *
     * @since 8.1.0
     */
    takePhoto(options: TakePhotoOptions): Promise<MediaResult>;
    /**
     * Open the device's camera and allow the user to record a video.
     * Not available on Web.
     *
     * @since 8.1.0
     */
    recordVideo(options: RecordVideoOptions): Promise<MediaResult>;
    /**
     * Open a native video player.
     * Not available on Web.
     *
     * @since 8.1.0
     */
    playVideo(options: PlayVideoOptions): Promise<void>;
    /**
     * Allow users to choose pictures, videos, or both, directly from their gallery.
     *
     * @since 8.1.0
     */
    chooseFromGallery(options: ChooseFromGalleryOptions): Promise<MediaResults>;
    /**
     * Open an in-app screen to edit a given photo using the provided base64 string.
     * Not available on Web.
     *
     * @since 8.1.0
     */
    editPhoto(options: EditPhotoOptions): Promise<EditPhotoResult>;
    /**
     * Open an in-app screen to edit a photo using the provided URI.
     * Not available on Web.
     *
     * @since 8.1.0
     */
    editURIPhoto(options: EditURIPhotoOptions): Promise<MediaResult>;
    /**
     * Allows the user to update their limited photo library selection.
     * Returns all the limited photos after the picker dismissal.
     * If instead the user gave full access to the photos it returns an empty array.
     *
     * @since 4.1.0
     */
    pickLimitedLibraryPhotos(): Promise<GalleryPhotos>;
    /**
     * Return an array of photos selected from the limited photo library.
     *
     * @since 4.1.0
     */
    getLimitedLibraryPhotos(): Promise<GalleryPhotos>;
    /**
     * Check camera and photo album permissions
     *
     * @since 1.0.0
     */
    checkPermissions(): Promise<PermissionStatus>;
    /**
     * Request camera and photo album permissions
     *
     * @since 1.0.0
     */
    requestPermissions(permissions?: CameraPluginPermissions): Promise<PermissionStatus>;
    /**
     * Prompt the user to pick a photo from an album, or take a new photo
     * with the camera.
     *
     * @since 1.0.0
     * @deprecated Use `takePhoto` for a camera photo, or `chooseFromGallery` to select from the gallery. For creating a prompt for the user to select which source, use `@capacitor/action-sheet` or any UI component of your choosing. Refer to the Camera API documentation for more information on migrating.
     */
    getPhoto(options: ImageOptions): Promise<Photo>;
    /**
     * Allows the user to pick multiple pictures from the photo gallery.
     *
     * @since 1.2.0
     * @deprecated Use `chooseFromGallery` instead. Refer to the Camera API documentation for more information on migrating.
     */
    pickImages(options: GalleryImageOptions): Promise<GalleryPhotos>;
}
export interface TakePhotoOptions {
    /**
     * The quality of image to return, from 0-100.
     * Only applicable for `EncodingType.JPEG`.
     * Note: This option is only supported on Android and iOS.
     *
     * @default 100
     * @since 8.1.0
     */
    quality?: number;
    /**
     * The target width of photos to apply.
     * Must be a positive number, and used along `targetHeight`.
     * Note: This option is only supported on Android and iOS.
     *
     * @since 8.1.0
     */
    targetWidth?: number;
    /**
     * The target width of photos to apply.
     * Must be a positive number, and used along `targetWidth`.
     * Note: This option is only supported on Android and iOS.
     *
     * @since 8.1.0
     */
    targetHeight?: number;
    /**
     * Whether to automatically rotate the image "up" to correct for orientation
     * in portrait mode.
     * Note: This option is only supported on Android and iOS
     * @default true
     *
     * @since 8.1.0
     */
    correctOrientation?: boolean;
    /**
     * The encoding type for the captured photo - JPEG or PNG.
     * Note: This option is only supported on Android and iOS.
     * @default EncodingType.JPEG
     *
     * @since 8.1.0
     */
    encodingType?: EncodingType;
    /**
     * Whether to save the photo to the gallery.
     * Note: This option is only supported on Android and iOS.
     * @default false
     *
     * @since 8.1.0
     */
    saveToGallery?: boolean;
    /**
     * iOS and Web only: The camera direction.
     * @default CameraDirection.Rear
     *
     * @since 8.1.0
     */
    cameraDirection?: CameraDirection;
    /**
     * Determines if and how the user can edit the photo.
     * - 'in-app': Use an in-app editor for photo edition.
     * - 'external': Open a separate (platform-specific) native app to handle photo edition, falling back to the in-app editor if none is available. Note: iOS does not support external editing and will use 'in-app' instead.
     * - 'no': No editing allowed.
     * Not available on Web.
     * @default 'no'
     *
     * @since 8.1.0
     */
    editable?: 'in-app' | 'external' | 'no';
    /**
     * iOS only: The presentation style of the Camera.
     * @default 'fullscreen'
     *
     * @since 8.1.0
     */
    presentationStyle?: 'fullscreen' | 'popover';
    /**
     * Web only: Whether to use the PWA Element experience or file input. The
     * default is to use PWA Elements if installed and fall back to file input.
     * To always use file input, set this to `true`.
     *
     * Learn more about PWA Elements: https://capacitorjs.com/docs/web/pwa-elements
     *
     * @since 8.1.0
     */
    webUseInput?: boolean;
    /**
     * Whether or not MediaResult should include its metadata.
     * If an error occurs when obtaining the metadata, it will return empty.
     * @default false
     *
     * @since 8.1.0
     */
    includeMetadata?: boolean;
}
export interface RecordVideoOptions {
    /**
     * Whether to save the video to the gallery.
     * @default false
     *
     * @since 8.1.0
     */
    saveToGallery?: boolean;
    /**
     * Whether or not MediaResult should include its metadata.
     * If an error occurs when obtaining the metadata, it will return empty.
     * @default false
     *
     * @since 8.1.0
     */
    includeMetadata?: boolean;
    /**
     * Whether the to store the video in persistent app storage or in temporary cache.
     * If you plan to use the returned `MediaResult#URI` across app launches, you may want to set to true.
     * Otherwise, you can set to false.
     * @default true
     *
     * @since 8.1.0
     */
    isPersistent?: boolean;
}
export interface PlayVideoOptions {
    /**
     * The URI of the video to play.
     * You may use the `MediaResult#URI` returned from `recordVideo` or `chooseFromGallery` directly.
     *
     * @since 8.1.0
     */
    uri: string;
}
export interface ChooseFromGalleryOptions {
    /**
     * The type of media to select. Can be pictures, videos, or both.
     * @default MediaTypeSelection.Photo
     *
     * @since 8.1.0
     */
    mediaType?: MediaTypeSelection;
    /**
     * Whether or not to allow selecting multiple media files from the gallery.
     * @default false
     *
     * @since 8.1.0
     */
    allowMultipleSelection?: boolean;
    /**
     * The maximum number of media files that the user can choose.
     * Only applicable if `allowMultipleSelection` is `true`.
     * Any non-positive number will be treated as unlimited.
     * Note: This option is only supported on Android 13+ and iOS.
     * @default 0
     *
     * @since 8.1.0
     */
    limit?: number;
    /**
     * Whether or not MediaResult should include its metadata.
     * If an error occurs when obtaining the metadata, it will return empty.
     * @default false
     *
     * @since 8.1.0
     */
    includeMetadata?: boolean;
    /**
     * Determines if and how the user can edit the photo.
     * - 'in-app': Use an in-app editor for photo edition.
     * - 'external': Open a separate (platform-specific) native app to handle photo edition, falling back to the in-app editor if none is available. Note: iOS does not support external editing and will use 'in-app' instead.
     * - 'no': No editing allowed.
     * Only applicable for `MediaTypeSelection.Photo` and `allowMultipleSelection` set to `false`.
     * Not available on Web.
     * @default 'no'
     *
     * @since 8.1.0
     */
    editable?: 'in-app' | 'external' | 'no';
    /**
     * iOS only: The presentation style of media picker.
     * @default 'fullscreen'
     *
     * @since 8.1.0
     */
    presentationStyle?: 'fullscreen' | 'popover';
    /**
     * The quality of images to return, from 0-100.
     * Only applicable for `MediaType.Photo` and JPEG format.
     * Note: This option is only supported on Android and iOS.
     *
     * @default 100
     * @since 8.1.0
     */
    quality?: number;
    /**
     * The target width of photos to apply.
     * Must be a positive number, and used along `targetHeight`.
     * Not applicable when videos are selected.
     * Note: This option is only supported on Android and iOS.
     *
     * @since 1.0.0
     */
    targetWidth?: number;
    /**
     * The target width of photos to apply.
     * Must be a positive number, and used along `targetWidth`.
     * Not applicable when videos are selected.
     * Note: This option is only supported on Android and iOS.
     *
     * @since 8.1.0
     */
    targetHeight?: number;
    /**
     * Whether to automatically rotate the image "up" to correct for orientation
     * in portrait mode.
     * Not applicable when videos are selected.
     * Note: This option is only supported on Android and iOS
     * @default true
     *
     * @since 8.1.0
     */
    correctOrientation?: boolean;
    /**
     * Web only: Whether to use the PWA Element experience or file input. The
     * default is to use PWA Elements if installed and fall back to file input.
     * To always use file input, set this to `true`.
     *
     * Learn more about PWA Elements: https://capacitorjs.com/docs/web/pwa-elements
     *
     * @since 8.1.0
     */
    webUseInput?: boolean;
}
export interface EditURIPhotoOptions {
    /**
     * The URI that contains the photo to edit.
     *
     * @since 8.1.0
     */
    uri: string;
    /**
     * Whether to save the edited photo to the gallery.
     * @default false
     *
     * @since 8.1.0
     */
    saveToGallery?: boolean;
    /**
     * Whether or not MediaResult should include its metadata.
     * If an error occurs when obtaining the metadata, it will return empty.
     * @default false
     *
     * @since 8.1.0
     */
    includeMetadata?: boolean;
}
export interface EditPhotoOptions {
    /**
     * The base64 encoded image to edit.
     *
     * @since 8.1.0
     */
    inputImage: string;
}
export interface EditPhotoResult {
    /**
     * The edited image, base64 encoded.
     *
     * @since 8.1.0
     */
    outputImage: string;
}
export interface MediaResult {
    /**
     * The type of media result. Either `Photo` or `Video`.
     *
     * @since 8.1.0
     */
    type: MediaType;
    /**
     * The URI pointing to the media file.
     * Not available on Web. Use `webPath` instead for Web.
     *
     * @since 8.1.0
     */
    uri?: string;
    /**
     * Returns the thumbnail of the media, base64 encoded.
     * On Web, for `MediaType.Photo`, the full image is returned here, also base64 encoded.
     * On Web, for `MediaType.Video`, a full-resolution JPEG frame captured from the video is returned, base64 encoded at 80% quality.
     *
     * @since 8.1.0
     */
    thumbnail?: string;
    /**
     * Whether if the media was saved to the gallery successfully or not.
     * Only applicable if `saveToGallery` was set to `true` in input options.
     * Otherwise, `false` is always returned for `save`.
     * Not available on Web.
     *
     * @since 8.1.0
     */
    saved: boolean;
    /**
     * webPath returns a path that can be used to set the src attribute of a media item for efficient
     * loading and rendering.
     *
     * @since 8.1.0
     */
    webPath?: string;
    /**
     * Metadata associated to the media result.
     * Only included if `includeMetadata` was set to `true` in input options.
     *
     * @since 8.1.0
     */
    metadata?: MediaMetadata;
}
export interface MediaMetadata {
    /**
     * File size of the media, in bytes.
     *
     * @since 8.1.0
     */
    size?: number;
    /**
     * Only applicable for `MediaType.Video` - the duration of the media, in seconds.
     *
     * @since 8.1.0
     */
    duration?: number;
    /**
     * The format of the image, ex: jpeg, png, mp4.
     *
     * Android and iOS may return 'jpg' instead of 'jpeg'. The format is the same, just with a different name.
     * Please compare against both 'jpeg' and 'jpg' when checking if the format of the returned media is JPEG.
     * Web supports jpeg, png and gif, but the exact availability may vary depending on the browser.
     * gif is only supported for `chooseFromGallery` on Web.
     *
     * @since 8.1.0
     */
    format: string;
    /**
     * The resolution of the media, in `<width>x<height>` format. Example: '1920x1080'.
     *
     * @since 8.1.0
     */
    resolution?: string;
    /**
     * The date and time the media was created, in ISO 8601 format.
     * If creation date is not available (e.g. Android 7 and below), the last modified date is returned.
     * For Web, the last modified date is always returned.
     *
     * @since 8.1.0
     */
    creationDate?: string;
    /**
     * Exif data, if any, retrieved from the media item.
     * Only available for `MediaType.Photo`.
     * Not available on Web.
     *
     * @since 8.1.0
     */
    exif?: string;
}
export interface MediaResults {
    /**
     * The list of media results.
     *
     * @since 8.1.0
     */
    results: MediaResult[];
}
/**
 * @deprecated This interface is only meant to be used for deprecated `getPhoto` method.
 * It will be removed in a future major version of the plugin, along with `getPhoto`.
 */
export interface ImageOptions {
    /**
     * The quality of image to return as JPEG, from 0-100
     * Note: This option is only supported on Android and iOS.
     *
     * @since 1.0.0
     */
    quality?: number;
    /**
     * Whether to allow the user to crop or make small edits (platform specific).
     * Note: This option is only supported on Android and iOS.
     * On iOS it's only supported for CameraSource.Camera, but not for CameraSource.Photos.
     *
     * @since 1.0.0
     */
    allowEditing?: boolean;
    /**
     * How the data should be returned. Currently, only 'Base64', 'DataUrl' or 'Uri' is supported
     *
     * @since 1.0.0
     */
    resultType: CameraResultType;
    /**
     * Whether to save the photo to the gallery.
     * If the photo was picked from the gallery, it will only be saved if edited.
     * Note: This option is only supported on Android and iOS.
     * @default false
     *
     * @since 1.0.0
     */
    saveToGallery?: boolean;
    /**
     * The desired maximum width of the saved image. The aspect ratio is respected.
     * Note: This option is only supported on Android and iOS.
     *
     * @since 1.0.0
     */
    width?: number;
    /**
     * The desired maximum height of the saved image. The aspect ratio is respected.
     * Note: This option is only supported on Android and iOS.
     *
     * @since 1.0.0
     */
    height?: number;
    /**
     * Whether to automatically rotate the image "up" to correct for orientation
     * in portrait mode.
     * Note: This option is only supported on Android and iOS.
     * @default true
     *
     * @since 1.0.0
     */
    correctOrientation?: boolean;
    /**
     * The source to get the photo from. By default this prompts the user to select
     * either the photo album or take a photo.
     * @default CameraSource.Prompt
     *
     * @since 1.0.0
     */
    source?: CameraSource;
    /**
     * iOS and Web only: The camera direction.
     * @default CameraDirection.Rear
     *
     * @since 1.0.0
     */
    direction?: CameraDirection;
    /**
     * iOS only: The presentation style of the Camera.
     * @default 'fullscreen'
     *
     * @since 1.0.0
     */
    presentationStyle?: 'fullscreen' | 'popover';
    /**
     * Web only: Whether to use the PWA Element experience or file input. The
     * default is to use PWA Elements if installed and fall back to file input.
     * To always use file input, set this to `true`.
     *
     * Learn more about PWA Elements: https://capacitorjs.com/docs/web/pwa-elements
     *
     * @since 1.0.0
     */
    webUseInput?: boolean;
    /**
     * Text value to use when displaying the prompt.
     * @default 'Photo'
     *
     * @since 1.0.0
     *
     */
    promptLabelHeader?: string;
    /**
     * Text value to use when displaying the prompt.
     * iOS only: The label of the 'cancel' button.
     * @default 'Cancel'
     *
     * @since 1.0.0
     */
    promptLabelCancel?: string;
    /**
     * Text value to use when displaying the prompt.
     * The label of the button to select a saved image.
     * @default 'From Photos'
     *
     * @since 1.0.0
     */
    promptLabelPhoto?: string;
    /**
     * Text value to use when displaying the prompt.
     * The label of the button to open the camera.
     * @default 'Take Picture'
     *
     * @since 1.0.0
     */
    promptLabelPicture?: string;
}
/**
 * @deprecated This interface is only meant to be used for received the result of deprecated `getPhoto` method.
 * It will be removed in a future major version of the plugin, along with `getPhoto`.
 */
export interface Photo {
    /**
     * The base64 encoded string representation of the image, if using CameraResultType.Base64.
     *
     * @since 1.0.0
     */
    base64String?: string;
    /**
     * The url starting with 'data:image/jpeg;base64,' and the base64 encoded string representation of the image, if using CameraResultType.DataUrl.
     *
     * Note: On web, the file format could change depending on the browser.
     * @since 1.0.0
     */
    dataUrl?: string;
    /**
     * If using CameraResultType.Uri, the path will contain a full,
     * platform-specific file URL that can be read later using the Filesystem API.
     *
     * @since 1.0.0
     */
    path?: string;
    /**
     * webPath returns a path that can be used to set the src attribute of an image for efficient
     * loading and rendering.
     *
     * @since 1.0.0
     */
    webPath?: string;
    /**
     * Exif data, if any, retrieved from the image
     *
     * @since 1.0.0
     */
    exif?: any;
    /**
     * The format of the image, ex: jpeg, png, gif.
     *
     * iOS and Android only support jpeg.
     * Web supports jpeg, png and gif, but the exact availability may vary depending on the browser.
     * gif is only supported if `webUseInput` is set to `true` or if `source` is set to `Photos`.
     *
     * @since 1.0.0
     */
    format: string;
    /**
     * Whether if the image was saved to the gallery or not.
     *
     * On Android and iOS, saving to the gallery can fail if the user didn't
     * grant the required permissions.
     * On Web there is no gallery, so always returns false.
     *
     * @since 1.1.0
     */
    saved: boolean;
}
export interface GalleryPhotos {
    /**
     * Array of all the picked photos.
     *
     * @since 1.2.0
     */
    photos: GalleryPhoto[];
}
export interface GalleryPhoto {
    /**
     * Full, platform-specific file URL that can be read later using the Filesystem API.
     *
     * @since 1.2.0
     */
    path?: string;
    /**
     * webPath returns a path that can be used to set the src attribute of an image for efficient
     * loading and rendering.
     *
     * @since 1.2.0
     */
    webPath: string;
    /**
     * Exif data, if any, retrieved from the image
     *
     * @since 1.2.0
     */
    exif?: any;
    /**
     * The format of the image, ex: jpeg, png, gif.
     *
     * iOS and Android only support jpeg.
     * Web supports jpeg, png and gif.
     *
     * @since 1.2.0
     */
    format: string;
}
/**
 * @deprecated This interface is only meant to be used for deprecated `pickImages` method.
 * It will be removed in a future major version of the plugin, along with `pickImages`.
 */
export interface GalleryImageOptions {
    /**
     * The quality of image to return as JPEG, from 0-100
     * Note: This option is only supported on Android and iOS.
     *
     * @since 1.2.0
     */
    quality?: number;
    /**
     * The desired maximum width of the saved image. The aspect ratio is respected.
     *
     * @since 1.2.0
     */
    width?: number;
    /**
     * The desired maximum height of the saved image. The aspect ratio is respected.
     *
     * @since 1.2.0
     */
    height?: number;
    /**
     * Whether to automatically rotate the image "up" to correct for orientation
     * in portrait mode
     * @default true
     *
     * @since 1.2.0
     */
    correctOrientation?: boolean;
    /**
     * iOS only: The presentation style of the Camera.
     * @default 'fullscreen'
     *
     * @since 1.2.0
     */
    presentationStyle?: 'fullscreen' | 'popover';
    /**
     * Maximum number of pictures the user will be able to choose.
     * Note: This option is only supported on Android 13+ and iOS.
     *
     * @default 0 (unlimited)
     *
     * @since 1.2.0
     */
    limit?: number;
}
/**
 * @deprecated This enum is only meant to be used for deprecated `getPhoto` method.
 * It will be removed in a future major version of the plugin, along with `getPhoto`.
 */
export declare enum CameraSource {
    /**
     * Prompts the user to select either the photo album or take a photo.
     */
    Prompt = "PROMPT",
    /**
     * Take a new photo using the camera.
     */
    Camera = "CAMERA",
    /**
     * Pick an existing photo from the gallery or photo album.
     */
    Photos = "PHOTOS"
}
export declare enum CameraDirection {
    Rear = "REAR",
    Front = "FRONT"
}
/**
 * @deprecated This enum is only meant to be used for `ImageOptions` in deprecated `getPhoto` method.
 * It will be removed in a future major version of the plugin, along with `getPhoto`.
 */
export declare enum CameraResultType {
    Uri = "uri",
    Base64 = "base64",
    DataUrl = "dataUrl"
}
export declare enum MediaType {
    Photo = 0,
    Video = 1
}
export declare enum MediaTypeSelection {
    Photo = 0,
    Video = 1,
    All = 2
}
export declare enum EncodingType {
    JPEG = 0,
    PNG = 1
}
/**
 * @deprecated Use `Photo`.
 * @since 1.0.0
 */
export type CameraPhoto = Photo;
/**
 * @deprecated Use `ImageOptions`.
 * @since 1.0.0
 */
export type CameraOptions = ImageOptions;
/**
 * Error codes returned by the Camera plugin.
 * These values match the `code` field on rejected promises.
 *
 * @since 8.2.0
 */
export declare enum CameraErrorCode {
    /**
     * Camera access was denied by the user.
     */
    CameraPermissionDenied = "OS-PLUG-CAMR-0003",
    /**
     * Photo library / gallery access was denied by the user.
     */
    GalleryPermissionDenied = "OS-PLUG-CAMR-0005",
    /**
     * No camera hardware is available on the device.
     */
    NoCameraAvailable = "OS-PLUG-CAMR-0007",
    /**
     * The user cancelled the take photo action.
     */
    TakePhotoCancelled = "OS-PLUG-CAMR-0006",
    /**
     * Failed to take photo.
     */
    TakePhotoFailed = "OS-PLUG-CAMR-0010",
    /**
     * The take photo action received invalid arguments.
     * @platform ios
     */
    TakePhotoInvalidArguments = "OS-PLUG-CAMR-0014",
    /**
     * The selected file contains invalid image data.
     * @platform ios
     */
    InvalidImageData = "OS-PLUG-CAMR-0008",
    /**
     * Failed to edit image.
     */
    EditPhotoFailed = "OS-PLUG-CAMR-0009",
    /**
     * The user cancelled the edit photo action.
     */
    EditPhotoCancelled = "OS-PLUG-CAMR-0013",
    /**
     * The URI parameter for editing is empty.
     * @platform android
     */
    EditPhotoEmptyUri = "OS-PLUG-CAMR-0024",
    /**
     * Failed to retrieve an image from the gallery.
     */
    ImageNotFound = "OS-PLUG-CAMR-0011",
    /**
     * Failed to process the selected image.
     */
    ProcessImageFailed = "OS-PLUG-CAMR-0012",
    /**
     * Failed to choose media from the gallery.
     */
    ChooseMediaFailed = "OS-PLUG-CAMR-0018",
    /**
     * The user cancelled choosing media from the gallery.
     */
    ChooseMediaCancelled = "OS-PLUG-CAMR-0020",
    /**
     * Failed to retrieve the media file path.
     * @platform android
     */
    MediaPathError = "OS-PLUG-CAMR-0021",
    /**
     * Failed to retrieve an image from the provided URI.
     */
    FetchImageFromUriFailed = "OS-PLUG-CAMR-0028",
    /**
     * Failed to record video.
     */
    RecordVideoFailed = "OS-PLUG-CAMR-0016",
    /**
     * The user cancelled the video recording.
     */
    RecordVideoCancelled = "OS-PLUG-CAMR-0017",
    /**
     * Failed to retrieve a video from the gallery.
     * @platform ios
     */
    VideoNotFound = "OS-PLUG-CAMR-0025",
    /**
     * Failed to play video.
     */
    PlayVideoFailed = "OS-PLUG-CAMR-0023",
    /**
     * Failed to encode the media result.
     * @platform ios
     */
    EncodeResultFailed = "OS-PLUG-CAMR-0019",
    /**
     * The selected file does not exist.
     */
    FileNotFound = "OS-PLUG-CAMR-0027",
    /**
     * Invalid argument provided to a plugin method.
     * @platform android
     */
    InvalidArgument = "OS-PLUG-CAMR-0031",
    /**
     * A general plugin error occurred.
     * @platform ios
     */
    GeneralError = "OS-PLUG-CAMR-0026"
}
