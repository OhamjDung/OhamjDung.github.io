import * as THREE from 'three';
import { CameraKey } from './Camera';
import Time from '../Utils/Time';
import Application from '../Application';
import Mouse from '../Utils/Mouse';
import Sizes from '../Utils/Sizes';

export class CameraKeyframeInstance {
    position: THREE.Vector3;
    focalPoint: THREE.Vector3;

    constructor(keyframe: CameraKeyframe) {
        this.position = keyframe.position;
        this.focalPoint = keyframe.focalPoint;
    }

    update() {}
}

const keys: { [key in CameraKey]: CameraKeyframe } = {
    idle: {
        position: new THREE.Vector3(-24000, 3600, 24000),
        focalPoint: new THREE.Vector3(0, 400, 0),
    },
    monitor: {
        position: new THREE.Vector3(0, 950, 2000),
        focalPoint: new THREE.Vector3(0, 950, 0),
    },
    desk: {
        position: new THREE.Vector3(0, 1800, 5500),
        focalPoint: new THREE.Vector3(0, 500, 0),
    },
    loading: {
        position: new THREE.Vector3(-34000, 9000, 34000),
        focalPoint: new THREE.Vector3(0, 1500, 0),
    },
    orbitControlsStart: {
        position: new THREE.Vector3(-15000, 4000, 15000),
        focalPoint: new THREE.Vector3(-100, 350, 0),
    },
};

export class MonitorKeyframe extends CameraKeyframeInstance {
    application: Application;
    sizes: Sizes;
    targetPos: THREE.Vector3;
    origin: THREE.Vector3;

    constructor() {
        const keyframe = keys.monitor;
        super(keyframe);
        this.application = new Application();
        this.sizes = this.application.sizes;
        this.origin = new THREE.Vector3().copy(keyframe.position);
        this.targetPos = new THREE.Vector3().copy(keyframe.position);
    }

    update() {
        const aspect = this.sizes.height / this.sizes.width;
        const additionalZoom = this.sizes.width < 768 ? 0 : 600;
        this.targetPos.z = this.origin.z + aspect * 1200 - additionalZoom;
        this.position.copy(this.targetPos);
    }
}

export class LoadingKeyframe extends CameraKeyframeInstance {
    constructor() {
        const keyframe = keys.loading;
        super(keyframe);
    }

    update() {}
}

export class DeskKeyframe extends CameraKeyframeInstance {
    origin: THREE.Vector3;
    application: Application;
    mouse: Mouse;
    sizes: Sizes;
    targetFoc: THREE.Vector3;
    targetPos: THREE.Vector3;

    constructor() {
        const keyframe = keys.desk;
        super(keyframe);
        this.application = new Application();
        this.mouse = this.application.mouse;
        this.sizes = this.application.sizes;
        this.origin = new THREE.Vector3().copy(keyframe.position);
        this.targetFoc = new THREE.Vector3().copy(keyframe.focalPoint);
        this.targetPos = new THREE.Vector3().copy(keyframe.position);
    }

    update() {
        this.targetFoc.x +=
            (this.mouse.x - this.sizes.width / 2 - this.targetFoc.x) * 0.05;
        this.targetFoc.y +=
            (-(this.mouse.y - this.sizes.height) - this.targetFoc.y) * 0.05;

        this.targetPos.x +=
            (this.mouse.x - this.sizes.width / 2 - this.targetPos.x) * 0.025;
        this.targetPos.y +=
            (-(this.mouse.y - this.sizes.height * 2) - this.targetPos.y) *
            0.025;

        const aspect = this.sizes.height / this.sizes.width;
        this.targetPos.z = this.sizes.width < 768
            ? Math.max(this.origin.z, aspect * 7900)
            : this.origin.z + aspect * 3000 - 1800;
        if (this.sizes.width < 768) this.targetPos.y = 6500;

        this.focalPoint.copy(this.targetFoc);
        this.position.copy(this.targetPos);
    }
}

export class IdleKeyframe extends CameraKeyframeInstance {
    time: Time;
    origin: THREE.Vector3;
    focalOrigin: THREE.Vector3;

    constructor() {
        const keyframe = keys.idle;
        super(keyframe);
        this.origin = new THREE.Vector3().copy(keyframe.position);
        this.focalOrigin = new THREE.Vector3().copy(keyframe.focalPoint);
        this.time = new Time();
    }

    update() {
        // Slow orbit around the desk plus a little focal yaw so the idle shot visibly turns.
        const t = this.time.elapsed * 0.001;
        const radius = Math.hypot(this.origin.x, this.origin.z);
        const baseAngle = Math.atan2(this.origin.z, this.origin.x);
        const angle = baseAngle + Math.sin(t * 0.11) * 0.16;
        this.position.x = Math.cos(angle) * radius;
        this.position.z = Math.sin(angle) * radius;
        this.position.y = this.origin.y + Math.sin(t * 0.17 + 1) * 350;
        this.focalPoint.x = this.focalOrigin.x + Math.sin(t * 0.11 + 0.8) * 900;
        this.focalPoint.z = this.focalOrigin.z + Math.cos(t * 0.11 + 0.8) * 900;
        this.focalPoint.y = this.focalOrigin.y;
    }
}

export class OrbitControlsStart extends CameraKeyframeInstance {
    constructor() {
        const keyframe = keys.orbitControlsStart;
        super(keyframe);
    }

    update() {}
}
