import { WebPlugin } from '@capacitor/core';
import type { CallbackID, GeolocationPlugin, PermissionStatus, Position, PositionOptions, WatchPositionCallback } from './definitions';
export declare class GeolocationWeb extends WebPlugin implements GeolocationPlugin {
    private latestOrientation;
    constructor();
    private updateOrientation;
    private augmentPosition;
    getCurrentPosition(options?: PositionOptions): Promise<Position>;
    watchPosition(options: PositionOptions, callback: WatchPositionCallback): Promise<CallbackID>;
    clearWatch(options: {
        id: string;
    }): Promise<void>;
    checkPermissions(): Promise<PermissionStatus>;
    requestPermissions(): Promise<PermissionStatus>;
}
declare const Geolocation: GeolocationWeb;
export { Geolocation };
