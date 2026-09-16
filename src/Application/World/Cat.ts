import * as THREE from 'three';
import Application from '../Application';
import { CameraKey } from '../Camera/Camera';

export default class Cat {
    application = new Application();
    model = new THREE.Group();
    head = new THREE.Group();
    tail = new THREE.Group();
    body: THREE.Mesh;
    petUntil = 0;
    button = document.createElement('button');
    bounds = new THREE.Box3();
    point = new THREE.Vector3();
    corners = Array.from({ length: 8 }, () => new THREE.Vector3());

    constructor() {
        const fur = new THREE.MeshStandardMaterial({ color: '#777e87', roughness: 1 });
        const white = new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: 1 });
        const dark = new THREE.MeshStandardMaterial({ color: '#242b30', roughness: 1 });
        const pink = new THREE.MeshStandardMaterial({ color: '#c88d90', roughness: 1 });
        const sphere = new THREE.SphereGeometry(1, 24, 16);
        const ellipsoid = (parent: THREE.Object3D, material: THREE.Material, pos: number[], scale: number[]) => {
            const mesh = new THREE.Mesh(sphere, material);
            mesh.position.set(pos[0], pos[1], pos[2]);
            mesh.scale.set(scale[0], scale[1], scale[2]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            parent.add(mesh);
            return mesh;
        };
        this.model.name = 'pettable-cat';
        this.model.position.set(-1500, -445, 700);
        this.body = ellipsoid(this.model, fur, [0, 230, -70], [460, 260, 290]);
        ellipsoid(this.model, white, [120, 150, 160], [300, 155, 170]);
        ellipsoid(this.model, white, [-155, 65, 220], [150, 65, 140]);
        ellipsoid(this.model, white, [165, 65, 230], [140, 65, 155]);
        this.head.position.set(200, 400, 150);
        this.head.rotation.z = -0.1;
        this.model.add(this.head);
        ellipsoid(this.head, fur, [0, 0, 0], [245, 220, 200]);
        ellipsoid(this.head, white, [0, -85, 150], [165, 105, 65]);
        for (const side of [-1, 1]) {
            const ear = new THREE.Mesh(new THREE.ConeGeometry(105, 220, 3), fur);
            ear.position.set(side * 157, 180, -15);
            ear.rotation.z = side * -0.25;
            ear.rotation.y = Math.PI;
            ear.castShadow = true;
            this.head.add(ear);
            const inner = new THREE.Mesh(new THREE.ConeGeometry(61, 142, 3), pink);
            inner.position.copy(ear.position).add(new THREE.Vector3(0, 2, 46));
            inner.rotation.copy(ear.rotation);
            this.head.add(inner);
            const eyelid = new THREE.CatmullRomCurve3([
                new THREE.Vector3(side * 65, 10, 186),
                new THREE.Vector3(side * 110, -4, 185),
                new THREE.Vector3(side * 151, 12, 163),
            ]);
            this.head.add(new THREE.Mesh(new THREE.TubeGeometry(eyelid, 12, 8, 5, false), dark));
            for (let i = 0; i < 3; i++) {
                const whisker = new THREE.CatmullRomCurve3([
                    new THREE.Vector3(side * 85, -70 - i * 17, 199),
                    new THREE.Vector3(side * 220, -52 - i * 30, 200),
                    new THREE.Vector3(side * 315, -32 - i * 46, 170),
                ]);
                this.head.add(new THREE.Mesh(new THREE.TubeGeometry(whisker, 8, 2, 3, false), white));
            }
        }
        ellipsoid(this.head, pink, [0, -60, 209], [28, 19, 15]);
        ellipsoid(this.head, dark, [0, -100, 211], [3, 20, 3]);
        this.tail.position.set(-350, 170, -180);
        this.model.add(this.tail);
        const curl = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(-230, -50, 70),
            new THREE.Vector3(-220, -70, 380), new THREE.Vector3(60, -80, 480),
            new THREE.Vector3(190, -55, 420),
        ]);
        const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(curl, 32, 66, 10, false), fur);
        tailMesh.castShadow = true;
        this.tail.add(tailMesh);
        ellipsoid(this.tail, white, [190, -55, 420], [68, 67, 68]);
        this.application.scene.add(this.model);

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
        this.head.rotation.z = -0.1 + Math.sin(t * 5) * affection * 0.18;
        this.head.rotation.x = -affection * 0.15;
        this.head.position.y = 400 + Math.sin(t * 4) * affection * 20;
        this.tail.rotation.y = Math.sin(t * (affection ? 4 : 0.6)) * (0.04 + affection * 0.25);
        this.body.scale.y = 260 + Math.sin(t * 1.7) * 4;
        if (!affection) this.button.dataset.petting = 'false';
        const camera = this.application.camera;
        const visible = camera.currentKeyframe === CameraKey.DESK && !camera.freeCam;
        this.button.hidden = !visible;
        if (!visible) return;
        this.model.updateMatrixWorld(true);
        this.bounds.setFromObject(this.model);
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
