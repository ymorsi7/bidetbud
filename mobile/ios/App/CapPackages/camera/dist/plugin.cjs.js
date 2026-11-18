'use strict';

var core = require('@capacitor/core');

/**
 * @deprecated This enum is only meant to be used for deprecated `getPhoto` method.
 * It will be removed in a future major version of the plugin, along with `getPhoto`.
 */
exports.CameraSource = void 0;
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
})(exports.CameraSource || (exports.CameraSource = {}));
exports.CameraDirection = void 0;
(function (CameraDirection) {
    CameraDirection["Rear"] = "REAR";
    CameraDirection["Front"] = "FRONT";
})(exports.CameraDirection || (exports.CameraDirection = {}));
/**
 * @deprecated This enum is only meant to be used for `ImageOptions` in deprecated `getPhoto` method.
 * It will be removed in a future major version of the plugin, along with `getPhoto`.
 */
exports.CameraResultType = void 0;
(function (CameraResultType) {
    CameraResultType["Uri"] = "uri";
    CameraResultType["Base64"] = "base64";
    CameraResultType["DataUrl"] = "dataUrl";
})(exports.CameraResultType || (exports.CameraResultType = {}));
exports.MediaType = void 0;
(function (MediaType) {
    MediaType[MediaType["Photo"] = 0] = "Photo";
    MediaType[MediaType["Video"] = 1] = "Video";
})(exports.MediaType || (exports.MediaType = {}));
exports.MediaTypeSelection = void 0;
(function (MediaTypeSelection) {
    MediaTypeSelection[MediaTypeSelection["Photo"] = 0] = "Photo";
    MediaTypeSelection[MediaTypeSelection["Video"] = 1] = "Video";
    MediaTypeSelection[MediaTypeSelection["All"] = 2] = "All";
})(exports.MediaTypeSelection || (exports.MediaTypeSelection = {}));
exports.EncodingType = void 0;
(function (EncodingType) {
    EncodingType[EncodingType["JPEG"] = 0] = "JPEG";
    EncodingType[EncodingType["PNG"] = 1] = "PNG";
})(exports.EncodingType || (exports.EncodingType = {}));
/**
 * Error codes returned by the Camera plugin.
 * These values match the `code` field on rejected promises.
 *
 * @since 8.2.0
 */
exports.CameraErrorCode = void 0;
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
})(exports.CameraErrorCode || (exports.CameraErrorCode = {}));

class CameraWeb extends core.WebPlugin {
    async takePhoto(options) {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            if (options.webUseInput) {
                this.takePhotoCameraInputExperience(options, resolve, reject);
            }
            else {
                this.takePhotoCameraExperience(options, resolve, reject);
            }
        });
    }
    async recordVideo(_options) {
        throw this.unimplemented('recordVideo is not implemented on Web.');
    }
    async playVideo(_options) {
        throw this.unimplemented('playVideo is not implemented on Web.');
    }
    async chooseFromGallery(options) {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            this.galleryInputExperience(options, resolve, reject);
        });
    }
    async editPhoto(_options) {
        throw this.unimplemented('editPhoto is not implemented on Web.');
    }
    async editURIPhoto(_options) {
        throw this.unimplemented('editURIPhoto is not implemented on Web.');
    }
    async getPhoto(options) {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            if (options.webUseInput || options.source === exports.CameraSource.Photos) {
                this.fileInputExperience(options, resolve, reject);
            }
            else if (options.source === exports.CameraSource.Prompt) {
                let actionSheet = document.querySelector('pwa-action-sheet');
                if (!actionSheet) {
                    actionSheet = document.createElement('pwa-action-sheet');
                    document.body.appendChild(actionSheet);
                }
                actionSheet.header = options.promptLabelHeader || 'Photo';
                actionSheet.cancelable = false;
                actionSheet.options = [
                    { title: options.promptLabelPhoto || 'From Photos' },
                    { title: options.promptLabelPicture || 'Take Picture' },
                ];
                actionSheet.addEventListener('onSelection', async (e) => {
                    const selection = e.detail;
                    if (selection === 0) {
                        this.fileInputExperience(options, resolve, reject);
                    }
                    else {
                        this.cameraExperience(options, resolve, reject);
                    }
                });
            }
            else {
                this.cameraExperience(options, resolve, reject);
            }
        });
    }
    async pickImages(_options) {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            this.multipleFileInputExperience(resolve, reject);
        });
    }
    async cameraExperience(options, resolve, reject) {
        await this._setupPWACameraModal(options.direction, (photo) => this._getCameraPhoto(photo, options), () => this.fileInputExperience(options, resolve, reject), resolve, reject);
    }
    fileInputExperience(options, resolve, reject) {
        let input = document.querySelector('#_capacitor-camera-input');
        const cleanup = () => {
            var _a;
            (_a = input.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(input);
        };
        if (!input) {
            input = document.createElement('input');
            input.id = '_capacitor-camera-input';
            input.type = 'file';
            input.hidden = true;
            document.body.appendChild(input);
            input.addEventListener('change', (_e) => {
                const file = input.files[0];
                let format = 'jpeg';
                if (file.type === 'image/png') {
                    format = 'png';
                }
                else if (file.type === 'image/gif') {
                    format = 'gif';
                }
                if (options.resultType === 'dataUrl' || options.resultType === 'base64') {
                    const reader = new FileReader();
                    reader.addEventListener('load', () => {
                        if (options.resultType === 'dataUrl') {
                            resolve({
                                dataUrl: reader.result,
                                format,
                            });
                        }
                        else if (options.resultType === 'base64') {
                            const b64 = reader.result.split(',')[1];
                            resolve({
                                base64String: b64,
                                format,
                            });
                        }
                        cleanup();
                    });
                    reader.readAsDataURL(file);
                }
                else {
                    resolve({
                        webPath: URL.createObjectURL(file),
                        format: format,
                    });
                    cleanup();
                }
            });
            input.addEventListener('cancel', (_e) => {
                reject(new core.CapacitorException('User cancelled photos app'));
                cleanup();
            });
        }
        input.accept = 'image/*';
        input.capture = true;
        if (options.source === exports.CameraSource.Photos || options.source === exports.CameraSource.Prompt) {
            input.removeAttribute('capture');
        }
        else if (options.direction === exports.CameraDirection.Front) {
            input.capture = 'user';
        }
        else if (options.direction === exports.CameraDirection.Rear) {
            input.capture = 'environment';
        }
        input.click();
    }
    multipleFileInputExperience(resolve, reject) {
        let input = document.querySelector('#_capacitor-camera-input-multiple');
        const cleanup = () => {
            var _a;
            (_a = input.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(input);
        };
        if (!input) {
            input = document.createElement('input');
            input.id = '_capacitor-camera-input-multiple';
            input.type = 'file';
            input.hidden = true;
            input.multiple = true;
            document.body.appendChild(input);
            input.addEventListener('change', (_e) => {
                const photos = [];
                // eslint-disable-next-line @typescript-eslint/prefer-for-of
                for (let i = 0; i < input.files.length; i++) {
                    const file = input.files[i];
                    let format = 'jpeg';
                    if (file.type === 'image/png') {
                        format = 'png';
                    }
                    else if (file.type === 'image/gif') {
                        format = 'gif';
                    }
                    photos.push({
                        webPath: URL.createObjectURL(file),
                        format: format,
                    });
                }
                resolve({ photos });
                cleanup();
            });
            input.addEventListener('cancel', (_e) => {
                reject(new core.CapacitorException('User cancelled photos app'));
                cleanup();
            });
        }
        input.accept = 'image/*';
        input.click();
    }
    _getCameraPhoto(photo, options) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const format = this._getFileFormat(photo);
            if (options.resultType === 'uri') {
                resolve({
                    webPath: URL.createObjectURL(photo),
                    format,
                    saved: false,
                });
            }
            else {
                reader.readAsDataURL(photo);
                reader.onloadend = () => {
                    const r = reader.result;
                    if (options.resultType === 'dataUrl') {
                        resolve({
                            dataUrl: r,
                            format,
                            saved: false,
                        });
                    }
                    else {
                        resolve({
                            base64String: r.split(',')[1],
                            format,
                            saved: false,
                        });
                    }
                };
                reader.onerror = (e) => {
                    reject(e);
                };
            }
        });
    }
    async takePhotoCameraExperience(options, resolve, reject) {
        await this._setupPWACameraModal(options.cameraDirection, (photo) => { var _a; return this._buildPhotoMediaResult(photo, (_a = options.includeMetadata) !== null && _a !== void 0 ? _a : false); }, () => this.takePhotoCameraInputExperience(options, resolve, reject), resolve, reject);
    }
    takePhotoCameraInputExperience(options, resolve, reject) {
        const input = this._createFileInput('_capacitor-camera-input-takephoto');
        const cleanup = () => {
            var _a;
            (_a = input.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(input);
        };
        input.onchange = async (_e) => {
            var _a;
            if (!this._validateFileInput(input, reject, cleanup)) {
                return;
            }
            const file = input.files[0];
            resolve(await this._buildPhotoMediaResult(file, (_a = options.includeMetadata) !== null && _a !== void 0 ? _a : false));
            cleanup();
        };
        input.oncancel = () => {
            reject(new core.CapacitorException('User cancelled photos app'));
            cleanup();
        };
        input.accept = 'image/*';
        if (options.cameraDirection === exports.CameraDirection.Front) {
            input.capture = 'user';
        }
        else {
            // CameraDirection.Rear
            input.capture = 'environment';
        }
        input.click();
    }
    galleryInputExperience(options, resolve, reject) {
        var _a, _b;
        const input = this._createFileInput('_capacitor-camera-input-gallery');
        input.multiple = (_a = options.allowMultipleSelection) !== null && _a !== void 0 ? _a : false;
        const cleanup = () => {
            var _a;
            (_a = input.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(input);
        };
        input.onchange = async (_e) => {
            var _a;
            if (!this._validateFileInput(input, reject, cleanup)) {
                return;
            }
            const results = [];
            // eslint-disable-next-line @typescript-eslint/prefer-for-of
            for (let i = 0; i < input.files.length; i++) {
                const file = input.files[i];
                if (file.type.startsWith('image/')) {
                    results.push(await this._buildPhotoMediaResult(file, (_a = options.includeMetadata) !== null && _a !== void 0 ? _a : false));
                }
                else if (file.type.startsWith('video/')) {
                    const format = this._getFileFormat(file);
                    let thumbnail;
                    let resolution;
                    let duration;
                    try {
                        const videoInfo = await this._getVideoMetadata(file);
                        thumbnail = videoInfo.thumbnail;
                        if (options.includeMetadata) {
                            resolution = videoInfo.resolution;
                            duration = videoInfo.duration;
                        }
                    }
                    catch (e) {
                        console.warn('Failed to get video metadata:', e);
                    }
                    const result = {
                        type: exports.MediaType.Video,
                        thumbnail,
                        webPath: URL.createObjectURL(file),
                        saved: false,
                    };
                    if (options.includeMetadata) {
                        result.metadata = {
                            format,
                            resolution,
                            size: file.size,
                            creationDate: new Date(file.lastModified).toISOString(),
                            duration,
                        };
                    }
                    results.push(result);
                }
            }
            resolve({ results });
            cleanup();
        };
        input.oncancel = () => {
            reject(new core.CapacitorException('User cancelled photos app'));
            cleanup();
        };
        // Set accept attribute based on mediaType
        const mediaType = (_b = options.mediaType) !== null && _b !== void 0 ? _b : exports.MediaTypeSelection.Photo;
        if (mediaType === exports.MediaTypeSelection.Photo) {
            input.accept = 'image/*';
        }
        else if (mediaType === exports.MediaTypeSelection.Video) {
            input.accept = 'video/*';
        }
        else {
            // MediaTypeSelection.All
            input.accept = 'image/*,video/*';
        }
        input.click();
    }
    _getFileFormat(file) {
        if (file.type === 'image/png') {
            return 'png';
        }
        else if (file.type === 'image/gif') {
            return 'gif';
        }
        else if (file.type.startsWith('video/')) {
            return file.type.split('/')[1];
        }
        else if (file.type.startsWith('image/')) {
            return 'jpeg';
        }
        return file.type.split('/')[1] || 'jpeg';
    }
    async _buildPhotoMediaResult(file, includeMetadata) {
        const format = this._getFileFormat(file);
        const thumbnail = await this._getBase64FromFile(file);
        const result = {
            type: exports.MediaType.Photo,
            thumbnail,
            webPath: URL.createObjectURL(file),
            saved: false,
        };
        if (includeMetadata) {
            const resolution = await this._getImageResolution(file);
            result.metadata = {
                format,
                resolution,
                size: file.size,
                creationDate: 'lastModified' in file ? new Date(file.lastModified).toISOString() : new Date().toISOString(),
            };
        }
        return result;
    }
    _validateFileInput(input, reject, cleanup) {
        if (!input.files || input.files.length === 0) {
            const message = input.multiple ? 'No files selected' : 'No file selected';
            reject(new core.CapacitorException(message));
            cleanup();
            return false;
        }
        return true;
    }
    async _setupPWACameraModal(cameraDirection, onPhotoCallback, fallbackCallback, resolve, reject) {
        if (customElements.get('pwa-camera-modal')) {
            const cameraModal = document.createElement('pwa-camera-modal');
            cameraModal.facingMode = cameraDirection === exports.CameraDirection.Front ? 'user' : 'environment';
            document.body.appendChild(cameraModal);
            try {
                await cameraModal.componentOnReady();
                cameraModal.addEventListener('onPhoto', async (e) => {
                    const photo = e.detail;
                    if (photo === null) {
                        reject(new core.CapacitorException('User cancelled photos app'));
                    }
                    else if (photo instanceof Error) {
                        reject(photo);
                    }
                    else {
                        resolve(await onPhotoCallback(photo));
                    }
                    cameraModal.dismiss();
                    document.body.removeChild(cameraModal);
                });
                cameraModal.present();
            }
            catch (e) {
                fallbackCallback();
            }
        }
        else {
            console.error(`Unable to load PWA Element 'pwa-camera-modal'. See the docs: https://capacitorjs.com/docs/web/pwa-elements.`);
            fallbackCallback();
        }
    }
    _createFileInput(id) {
        let input = document.querySelector(`#${id}`);
        if (!input) {
            input = document.createElement('input');
            input.id = id;
            input.type = 'file';
            input.hidden = true;
            document.body.appendChild(input);
        }
        return input;
    }
    async _getImageResolution(image) {
        try {
            const bitmap = await createImageBitmap(image);
            const resolution = `${bitmap.width}x${bitmap.height}`;
            bitmap.close();
            return resolution;
        }
        catch (e) {
            console.warn('Failed to get image resolution:', e);
            return undefined;
        }
    }
    _getBase64FromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result;
                const base64 = dataUrl.split(',')[1];
                resolve(base64);
            };
            reader.onerror = (e) => {
                reject(e);
            };
            reader.readAsDataURL(file);
        });
    }
    _getVideoMetadata(videoFile) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.onloadedmetadata = () => {
                // Seek to 1 second or 10% of duration to capture thumbnail
                const seekTime = Math.min(1, video.duration * 0.1);
                video.currentTime = seekTime;
            };
            video.onseeked = () => {
                const result = {
                    resolution: `${video.videoWidth}x${video.videoHeight}`,
                    duration: video.duration,
                };
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        result.thumbnail = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                    }
                }
                catch (e) {
                    console.warn('Failed to generate video thumbnail:', e);
                }
                URL.revokeObjectURL(video.src);
                resolve(result);
            };
            video.onerror = () => {
                // Clean up and return defaults
                URL.revokeObjectURL(video.src);
                resolve({});
            };
            video.src = URL.createObjectURL(videoFile);
        });
    }
    async checkPermissions() {
        if (typeof navigator === 'undefined' || !navigator.permissions) {
            throw this.unavailable('Permissions API not available in this browser');
        }
        try {
            // https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query
            // the specific permissions that are supported varies among browsers that implement the
            // permissions API, so we need a try/catch in case 'camera' is invalid
            const permission = await window.navigator.permissions.query({
                name: 'camera',
            });
            return {
                camera: permission.state,
                photos: 'granted',
            };
        }
        catch (_a) {
            throw this.unavailable('Camera permissions are not available in this browser');
        }
    }
    async requestPermissions() {
        throw this.unimplemented('Not implemented on web.');
    }
    async pickLimitedLibraryPhotos() {
        throw this.unavailable('Not implemented on web.');
    }
    async getLimitedLibraryPhotos() {
        throw this.unavailable('Not implemented on web.');
    }
}
new CameraWeb();

const Camera = core.registerPlugin('Camera', {
    web: () => new CameraWeb(),
});

exports.Camera = Camera;
//# sourceMappingURL=plugin.cjs.js.map
