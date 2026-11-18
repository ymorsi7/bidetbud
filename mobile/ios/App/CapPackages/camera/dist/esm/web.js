import { WebPlugin, CapacitorException } from '@capacitor/core';
import { CameraSource, CameraDirection, MediaType, MediaTypeSelection } from './definitions';
export class CameraWeb extends WebPlugin {
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
            if (options.webUseInput || options.source === CameraSource.Photos) {
                this.fileInputExperience(options, resolve, reject);
            }
            else if (options.source === CameraSource.Prompt) {
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
                reject(new CapacitorException('User cancelled photos app'));
                cleanup();
            });
        }
        input.accept = 'image/*';
        input.capture = true;
        if (options.source === CameraSource.Photos || options.source === CameraSource.Prompt) {
            input.removeAttribute('capture');
        }
        else if (options.direction === CameraDirection.Front) {
            input.capture = 'user';
        }
        else if (options.direction === CameraDirection.Rear) {
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
                reject(new CapacitorException('User cancelled photos app'));
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
            reject(new CapacitorException('User cancelled photos app'));
            cleanup();
        };
        input.accept = 'image/*';
        if (options.cameraDirection === CameraDirection.Front) {
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
                        type: MediaType.Video,
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
            reject(new CapacitorException('User cancelled photos app'));
            cleanup();
        };
        // Set accept attribute based on mediaType
        const mediaType = (_b = options.mediaType) !== null && _b !== void 0 ? _b : MediaTypeSelection.Photo;
        if (mediaType === MediaTypeSelection.Photo) {
            input.accept = 'image/*';
        }
        else if (mediaType === MediaTypeSelection.Video) {
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
            type: MediaType.Photo,
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
            reject(new CapacitorException(message));
            cleanup();
            return false;
        }
        return true;
    }
    async _setupPWACameraModal(cameraDirection, onPhotoCallback, fallbackCallback, resolve, reject) {
        if (customElements.get('pwa-camera-modal')) {
            const cameraModal = document.createElement('pwa-camera-modal');
            cameraModal.facingMode = cameraDirection === CameraDirection.Front ? 'user' : 'environment';
            document.body.appendChild(cameraModal);
            try {
                await cameraModal.componentOnReady();
                cameraModal.addEventListener('onPhoto', async (e) => {
                    const photo = e.detail;
                    if (photo === null) {
                        reject(new CapacitorException('User cancelled photos app'));
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
const Camera = new CameraWeb();
export { Camera };
//# sourceMappingURL=web.js.map