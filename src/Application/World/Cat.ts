import * as THREE from 'three';
import Application from '../Application';
import { CameraKey } from '../Camera/Camera';

// "Sleepy Comfy Cat" by Léonard Doye (Leoskateman), CC-BY-4.0 — see CREDITS.md.
const DESK_TOP_Y = -445;
const CAT_LENGTH = 1150; // longest side after scaling, in scene units
const CAT_POSITION = new THREE.Vector3(-1850, DESK_TOP_Y, 450);
const CAT_YAW = Math.PI * 0.15;

export default class Cat {
    application = new Application();
    model = new THREE.Group();
    inner: THREE.Object3D;
    petUntil = 0;
    button = document.createElement('button');
    bounds = new THREE.Box3();
    localBounds = new THREE.Box3();
    corners = Array.from({ length: 8 }, () => new THREE.Vector3());

    constructor() {
        const gltf = this.application.resources.items.gltfModel.catModel;
        const scene = gltf.scene;
        scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                const material = child.material as THREE.MeshStandardMaterial;
                if (material.map) material.map.encoding = THREE.sRGBEncoding;
                material.roughness = 0.95;
                material.metalness = 0;
                material.needsUpdate = true;
            }
        });

        // Normalise the Sketchfab export: drop its viewer orientation, then scale and rest on the desk.
        scene.matrix.identity();
        scene.matrixAutoUpdate = true;
        scene.position.set(0, 0, 0);
        scene.quaternion.identity();
        scene.scale.setScalar(1);
        scene.updateMatrixWorld(true);
        const raw = new THREE.Box3().setFromObject(scene);
        const size = raw.getSize(new THREE.Vector3());
        const scale = CAT_LENGTH / Math.max(size.x, size.y, size.z);
        scene.scale.setScalar(scale);
        scene.updateMatrixWorld(true);
        const scaled = new THREE.Box3().setFromObject(scene);
        const center = scaled.getCenter(new THREE.Vector3());
        scene.position.set(-center.x, -scaled.min.y, -center.z);
        this.inner = scene;

        this.model.name = 'pettable-cat';
        this.model.position.copy(CAT_POSITION);
        this.model.rotation.y = CAT_YAW;
        this.model.add(scene);
        this.application.scene.add(this.model);
        this.model.updateMatrixWorld(true);
        this.localBounds.setFromObject(scene).applyMatrix4(this.model.matrixWorld.clone().invert());

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
        const t = time * 0.001;
        const affection = THREE.MathUtils.clamp((this.petUntil - time) / 650, 0, 1);
        // Slow sleeping breath; petting adds a contented wriggle.
        const breath = 1 + Math.sin(t * 1.4) * 0.012 + affection * Math.sin(t * 9) * 0.02;
        this.inner.scale.y = this.inner.scale.x * breath;
        this.model.rotation.y = CAT_YAW + Math.sin(t * 6) * affection * 0.05;
        if (!affection) this.button.dataset.petting = 'false';
        const camera = this.application.camera;
        const visible = camera.currentKeyframe === CameraKey.DESK && !camera.freeCam;
        this.button.hidden = !visible;
        if (!visible) return;
        this.model.updateMatrixWorld(true);
        this.bounds.copy(this.localBounds).applyMatrix4(this.model.matrixWorld);
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
