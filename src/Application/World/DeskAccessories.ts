import * as THREE from 'three';
import Application from '../Application';
import { CameraKey } from '../Camera/Camera';

const PHOTO_KEY = 'tom-desk-photo';

export default class DeskAccessories {
    application = new Application();
    frame = new THREE.Group();
    photoMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    photoTexture: THREE.Texture | undefined;
    button = document.createElement('button');
    input = document.createElement('input');
    corners = [new THREE.Vector3(-425, 0, 65), new THREE.Vector3(425, 0, 65),
        new THREE.Vector3(-425, 525, 65), new THREE.Vector3(425, 525, 65)];
    point = new THREE.Vector3();

    constructor() {
        const metal = new THREE.MeshStandardMaterial({ color: '#373c3e', metalness: 0.5, roughness: 0.4 });
        const mat = new THREE.MeshStandardMaterial({ color: '#f4f4ee', roughness: 1 });
        const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
            mesh.position.set(x, y, z);
            mesh.castShadow = mesh.receiveShadow = true;
            this.frame.add(mesh);
            return mesh;
        };
        addBox(850, 1050, 70, 0, 0, 0, metal);
        addBox(770, 970, 12, 0, 0, 42, mat);
        const photo = new THREE.Mesh(new THREE.PlaneGeometry(650, 830), this.photoMaterial);
        photo.position.z = 65;
        this.frame.add(photo);
        const stand = addBox(400, 650, 35, 0, -210, -190, metal);
        stand.rotation.x = -0.5;
        this.frame.position.set(-1850, 75, -750);
        this.frame.rotation.y = 0.15;
        this.frame.name = 'personal-photo-frame';
        this.application.scene.add(this.frame);

        // A local photo is downscaled before storage to avoid retaining a large original upload.
        this.input.type = 'file';
        this.input.accept = 'image/*';
        this.input.hidden = true;
        this.input.addEventListener('change', async () => {
            const file = this.input.files?.[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            try {
                const image = await this.loadImage(url);
                const canvas = document.createElement('canvas');
                canvas.width = 650; canvas.height = 830;
                const ctx = canvas.getContext('2d')!;
                const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
                ctx.drawImage(image, (canvas.width - image.width * scale) / 2,
                    (canvas.height - image.height * scale) / 2, image.width * scale, image.height * scale);
                const data = canvas.toDataURL('image/jpeg', 0.88);
                this.setPhoto(canvas);
                try { localStorage.setItem(PHOTO_KEY, data); }
                catch { window.alert('Photo added for this visit. Browser storage is unavailable.'); }
            } catch { window.alert('That image could not be opened. Try a JPEG, PNG, or WebP photo.'); }
            finally { URL.revokeObjectURL(url); this.input.value = ''; }
        });
        this.button.type = 'button';
        this.button.className = 'photo-hit-target';
        this.button.title = 'Choose frame photo (saved in this browser)';
        this.button.setAttribute('aria-label', 'Choose frame photo');
        this.button.dataset.sceneControl = '';
        this.button.addEventListener('click', () => this.input.click());
        document.body.append(this.button, this.input);
        let saved: string | null = null;
        try { saved = localStorage.getItem(PHOTO_KEY); } catch { /* Storage can be disabled. */ }
        this.loadImage(saved || 'images/preview-new.jpg').then(image => this.setPhoto(image)).catch(() => {});
        this.createVolleyball();
    }

    loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = url;
        });
    }

    setPhoto(image: HTMLImageElement | HTMLCanvasElement) {
        const texture = new THREE.Texture(image);
        texture.encoding = THREE.sRGBEncoding;
        const ratio = image.width / image.height;
        const target = 650 / 830;
        if (ratio > target) { texture.repeat.x = target / ratio; texture.offset.x = (1 - texture.repeat.x) / 2; }
        else { texture.repeat.y = ratio / target; texture.offset.y = (1 - texture.repeat.y) / 2; }
        texture.needsUpdate = true;
        this.photoMaterial.map = texture;
        this.photoMaterial.needsUpdate = true;
        this.photoTexture?.dispose();
        this.photoTexture = texture;
    }

    createVolleyball() {
        // Eighteen stitched panels, projected from a subdivided cube onto a sphere.
        const geometry = new THREE.BoxGeometry(2, 2, 2, 24, 24, 24);
        const positions = geometry.attributes.position;
        const normal = new THREE.Vector3();
        for (let i = 0; i < positions.count; i++) {
            normal.fromBufferAttribute(positions, i).normalize().multiplyScalar(420);
            positions.setXYZ(i, normal.x, normal.y, normal.z);
        }
        geometry.computeVertexNormals();
        const colors = ['#eeeae0', '#e8bf34', '#3259a3'];
        const materials = Array.from({ length: 6 }, (_, face) => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
            const ctx = canvas.getContext('2d')!;
            for (let panel = 0; panel < 3; panel++) {
                ctx.fillStyle = colors[(panel + face) % 3];
                ctx.fillRect(panel * 512 / 3, 0, 512 / 3 + 1, 512);
            }
            ctx.strokeStyle = '#64605a'; ctx.lineWidth = 3;
            ctx.strokeRect(1, 1, 510, 510);
            for (let panel = 1; panel < 3; panel++) {
                ctx.beginPath(); ctx.moveTo(panel * 512 / 3, 0); ctx.lineTo(panel * 512 / 3, 512); ctx.stroke();
            }
            const texture = new THREE.CanvasTexture(canvas); texture.encoding = THREE.sRGBEncoding;
            return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 });
        });
        const ball = new THREE.Mesh(geometry, materials);
        ball.position.set(1850, -32, -650);
        ball.rotation.set(0.3, 0.4, 0.35);
        ball.castShadow = ball.receiveShadow = true;
        ball.name = 'desk-volleyball';
        this.application.scene.add(ball);
    }

    update() {
        const camera = this.application.camera;
        this.button.hidden = camera.freeCam || !!camera.targetKeyframe ||
            (camera.currentKeyframe !== CameraKey.DESK && camera.currentKeyframe !== CameraKey.IDLE);
        if (this.button.hidden) return;
        this.frame.updateMatrixWorld();
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (const corner of this.corners) {
            this.point.copy(corner).applyMatrix4(this.frame.matrixWorld).project(camera.instance);
            if (Math.abs(this.point.z) > 1) { this.button.hidden = true; return; }
            const x = (this.point.x + 1) * innerWidth / 2, y = (1 - this.point.y) * innerHeight / 2;
            left = Math.min(left, x); right = Math.max(right, x);
            top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        Object.assign(this.button.style, { left: `${left}px`, top: `${top}px`, width: `${right-left}px`, height: `${bottom-top}px` });
    }
}
