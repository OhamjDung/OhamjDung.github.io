import * as THREE from 'three';
import Application from '../Application';
import { CameraKey } from '../Camera/Camera';

// "Toon Cat FREE" by Omabuarts Studio, CC-BY-4.0 — see CREDITS.md.
// The Sketchfab rig carries a baked x100 scale; the raw cat is ~370 units tall.
const CAT_SCALE = 1.7;
// Local hit box (before CAT_SCALE): ~1000 long, 630 tall.
const HIT_BOX = new THREE.Box3(new THREE.Vector3(-520, 0, -520), new THREE.Vector3(520, 640, 520));
const DESK_TOP_Y = -445;
// Patrol loop on the free left half of the desk (desk spans x -3587..2481, z -1146..1639; computer starts near x -770).
const WAYPOINTS = [
    new THREE.Vector3(-1500, DESK_TOP_Y, 700),
    new THREE.Vector3(-2900, DESK_TOP_Y, 900),
    new THREE.Vector3(-3100, DESK_TOP_Y, -500),
    new THREE.Vector3(-1900, DESK_TOP_Y, -750),
    new THREE.Vector3(-1400, DESK_TOP_Y, 100),
];
const WALK_SPEED = 320; // units per second
// Yaw added so the model's nose points along the travel direction.
const FORWARD_OFFSET = 0;
const PAUSE_MS = [1800, 4500];
const FUR_COLOR = new THREE.Color('#e8862a').convertSRGBToLinear();

export default class Cat {
    application = new Application();
    model = new THREE.Group();
    mixer: THREE.AnimationMixer;
    action: THREE.AnimationAction | undefined;
    petUntil = 0;
    waypoint = 1;
    pauseUntil = 0;
    heading = new THREE.Vector3();
    yaw = 0;
    button = document.createElement('button');
    bounds = new THREE.Box3();
    corners = Array.from({ length: 8 }, () => new THREE.Vector3());

    constructor() {
        const gltf = this.application.resources.items.gltfModel.catModel;
        const scene = gltf.scene;
        scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Skinned bounds stay at the rig origin, so let the renderer skip culling.
                child.frustumCulled = false;
                const material = child.material as THREE.MeshStandardMaterial;
                material.color.copy(FUR_COLOR);
                if (material.map) material.map.encoding = THREE.sRGBEncoding;
                material.roughness = 0.9;
                material.metalness = 0;
                material.needsUpdate = true;
            }
        });
        scene.scale.setScalar(CAT_SCALE);
        this.model.name = 'pettable-cat';
        this.model.position.copy(WAYPOINTS[0]);
        this.heading.subVectors(WAYPOINTS[1], WAYPOINTS[0]);
        this.yaw = Math.atan2(this.heading.x, this.heading.z) + FORWARD_OFFSET;
        this.model.rotation.y = this.yaw;
        this.model.add(scene);
        this.application.scene.add(this.model);

        this.mixer = new THREE.AnimationMixer(scene);
        if (gltf.animations.length) {
            this.action = this.mixer.clipAction(gltf.animations[0]);
            this.action.play();
        }

        // A projected hit area supports mouse strokes, touch, and keyboard activation.
        this.button.type = 'button';
        this.button.className = 'cat-hit-target';
        this.button.setAttribute('aria-label', 'Pet cat');
        this.button.title = 'Pet cat';
        this.button.dataset.sceneControl = '';
        this.button.addEventListener('click', () => this.pet());
        this.button.addEventListener('pointerdown', () => this.pet());
        this.button.addEventListener('pointermove', (event) => { if (event.buttons) this.pet(); });
        document.body.appendChild(this.button);
    }

    pet() {
        this.petUntil = this.application.time.elapsed + 2200;
        this.button.dataset.petting = 'true';
    }

    update() {
        const time = this.application.time.elapsed;
        const affection = THREE.MathUtils.clamp((this.petUntil - time) / 650, 0, 1);
        const dt = Math.min(this.application.time.delta, 100) * 0.001;
        const walking = !affection && time > this.pauseUntil;
        if (walking) {
            const target = WAYPOINTS[this.waypoint];
            this.heading.subVectors(target, this.model.position);
            const distance = this.heading.length();
            if (distance < 40) {
                this.waypoint = (this.waypoint + 1) % WAYPOINTS.length;
                this.pauseUntil = time + THREE.MathUtils.randFloat(PAUSE_MS[0], PAUSE_MS[1]);
            } else {
                this.heading.divideScalar(distance);
                this.model.position.addScaledVector(this.heading, Math.min(distance, WALK_SPEED * dt));
                const targetYaw = Math.atan2(this.heading.x, this.heading.z) + FORWARD_OFFSET;
                let delta = targetYaw - this.yaw;
                delta = Math.atan2(Math.sin(delta), Math.cos(delta));
                this.yaw += delta * Math.min(1, dt * 6);
                this.model.rotation.y = this.yaw;
            }
        }
        // The bundled clip is a stride cycle: run it while walking, crawl while resting, wiggle while petted.
        this.mixer.timeScale = walking ? 1.1 : 0.25 + affection * 1.5;
        this.mixer.update(dt);
        this.model.rotation.z = Math.sin(time * 0.006) * affection * 0.06;
        if (!affection) this.button.dataset.petting = 'false';
        const camera = this.application.camera;
        const visible = camera.currentKeyframe === CameraKey.DESK && !camera.freeCam;
        this.button.hidden = !visible;
        if (!visible) return;
        this.model.updateMatrixWorld(true);
        this.bounds.copy(HIT_BOX).applyMatrix4(this.model.matrixWorld);
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        this.corners.forEach((point, i) => {
            point.set(i & 1 ? this.bounds.max.x : this.bounds.min.x,
                i & 2 ? this.bounds.max.y : this.bounds.min.y,
                i & 4 ? this.bounds.max.z : this.bounds.min.z).project(camera.instance);
            const x = (point.x + 1) * innerWidth / 2;
            const y = (1 - point.y) * innerHeight / 2;
            left = Math.min(left, x); right = Math.max(right, x);
            top = Math.min(top, y); bottom = Math.max(bottom, y);
        });
        Object.assign(this.button.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
    }
}
