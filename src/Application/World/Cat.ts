import * as THREE from 'three';
import Application from '../Application';
import { CameraKey } from '../Camera/Camera';
import GUI from 'lil-gui';
import getPanel from '../Utils/Panel';

// "Sleeping Cat On The Bed 1 - 3D scan" by Alben Tan, CC-BY-4.0 — see CREDITS.md.
const FLOOR_Y = -2984;
// Tunable with ?cat (or ?tune) in the URL; bake the numbers back here.
const CAT = { x: -2110, z: 370, y: -470, length: 1850, yawDeg: 25, pitchDeg: 2, rollDeg: 0 };

export default class Cat {
    application = new Application();
    model = new THREE.Group();
    inner: THREE.Object3D;
    petUntil = 0;
    affection = 0;
    button = document.createElement('button');
    bounds = new THREE.Box3();
    localBounds = new THREE.Box3();
    corners = Array.from({ length: 8 }, () => new THREE.Vector3());
    baseLength = 1;
    gui: GUI | undefined;

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

        // Normalise the export: a sleeping cat is flat, so its thinnest axis must point up. Then scale
        // to CAT_LENGTH and drop it so its underside sits exactly on the desk top.
        const holder = new THREE.Group();
        holder.add(scene);
        holder.updateMatrixWorld(true);
        const raw = new THREE.Box3().setFromObject(holder);
        const size = raw.getSize(new THREE.Vector3());
        if (size.x < size.y && size.x < size.z) holder.rotation.z = Math.PI / 2;
        else if (size.z < size.y && size.z < size.x) holder.rotation.x = -Math.PI / 2;
        holder.updateMatrixWorld(true);
        const upright = new THREE.Box3().setFromObject(holder);
        const uprightSize = upright.getSize(new THREE.Vector3());
        // Unit-length fit; CAT.length scales the whole model from here.
        this.baseLength = Math.max(uprightSize.x, uprightSize.z);
        const fitted = new THREE.Group();
        fitted.add(holder);
        fitted.scale.setScalar(1 / this.baseLength);
        fitted.updateMatrixWorld(true);
        const unit = new THREE.Box3().setFromObject(fitted);
        const center = unit.getCenter(new THREE.Vector3());
        fitted.position.set(-center.x, -unit.min.y, -center.z);
        this.inner = new THREE.Group();
        this.inner.add(fitted);

        this.model.name = 'pettable-cat';
        this.model.add(this.inner);
        this.application.scene.add(this.model);
        this.applyLayout();
        this.setGui();

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

    applyLayout() {
        this.model.position.set(CAT.x, CAT.y, CAT.z);
        this.model.rotation.set(
            THREE.MathUtils.degToRad(CAT.pitchDeg),
            THREE.MathUtils.degToRad(CAT.yawDeg),
            THREE.MathUtils.degToRad(CAT.rollDeg),
            'YXZ'
        );
        this.inner.scale.setScalar(CAT.length);
        this.model.updateMatrixWorld(true);
        this.localBounds.setFromObject(this.inner).applyMatrix4(this.model.matrixWorld.clone().invert());
    }

    setGui() {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('cat') && !params.has('tune')) return;
        this.gui = getPanel().addFolder('Cat');
        this.gui.add(CAT, 'x', -9000, 6000, 10).onChange(() => this.applyLayout());
        this.gui.add(CAT, 'z', -4000, 9000, 10).onChange(() => this.applyLayout());
        this.gui.add(CAT, 'y', FLOOR_Y - 200, 0, 5).name('y (floor -2984)').onChange(() => this.applyLayout());
        this.gui.add(CAT, 'length', 500, 5000, 10).name('size').onChange(() => this.applyLayout());
        this.gui.add(CAT, 'yawDeg', -180, 180, 1).name('rotate Y / yaw (deg)').onChange(() => this.applyLayout());
        this.gui.add(CAT, 'pitchDeg', -180, 180, 1).name('rotate X / pitch (deg)').onChange(() => this.applyLayout());
        this.gui.add(CAT, 'rollDeg', -180, 180, 1).name('rotate Z / roll (deg)').onChange(() => this.applyLayout());
    }

    pet() {
        this.petUntil = this.application.time.elapsed + 2200;
        this.button.dataset.petting = 'true';
    }

    update() {
        const time = this.application.time.elapsed;
        const t = time * 0.001;
        const target = THREE.MathUtils.clamp((this.petUntil - time) / 650, 0, 1);
        this.affection = THREE.MathUtils.damp(this.affection, target, 6, Math.min(this.application.time.delta * 0.001, 0.1));
        const affection = this.affection;
        // Petting gently changes breathing; the scanned cat and carpet stay oriented together.
        const breath = 1 + Math.sin(t * 1.2) * 0.018 + affection * Math.sin(t * 5) * 0.015;
        this.inner.scale.y = CAT.length * breath;
        this.model.rotation.y = THREE.MathUtils.degToRad(CAT.yawDeg);
        this.model.rotation.x = THREE.MathUtils.degToRad(CAT.pitchDeg);
        this.model.rotation.z = THREE.MathUtils.degToRad(CAT.rollDeg);
        if (!target) this.button.dataset.petting = 'false';
        const camera = this.application.camera;
        const visible = (camera.currentKeyframe === CameraKey.DESK || camera.currentKeyframe === CameraKey.IDLE) && !camera.freeCam && !camera.targetKeyframe;
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
