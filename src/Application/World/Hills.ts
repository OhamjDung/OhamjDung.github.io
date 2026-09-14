import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import Application from '../Application';
import Camera from '../Camera/Camera';
import Time from '../Utils/Time';

// Scene units are ~cm; the desk sits at the origin with its floor near y = -2984.
const FLOOR_Y = -2984;
const TERRAIN_SIZE = 260000;
const TERRAIN_SEGMENTS = 220;
const DESK_PAD_RADIUS = 7000;
const SKY_RADIUS = 420000;

const RIDGE_COLOR = new THREE.Color('#b9d84f').convertSRGBToLinear();
const GRASS_COLOR = new THREE.Color('#2f7d17').convertSRGBToLinear();
const SHADOW_GRASS_COLOR = new THREE.Color('#215c10').convertSRGBToLinear();
const FAR_HILL_COLOR = new THREE.Color('#a9c9a2').convertSRGBToLinear();
const SKY_TOP = new THREE.Color('#1f63d8').convertSRGBToLinear();
const SKY_HORIZON = new THREE.Color('#d6e9ff').convertSRGBToLinear();
const FOG_COLOR = new THREE.Color('#d0e4fb').convertSRGBToLinear();

const noise = new ImprovedNoise();

function fbm(x: number, y: number, octaves: number) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * noise.noise(x * frequency, y * frequency, 0.37);
        amplitude *= 0.5;
        frequency *= 2;
    }
    return value;
}

// One sweeping ridge rising from the near-left toward a soft peak far to the right.
function rawHeight(x: number, z: number) {
    const ridgeX = 52000 + z * 0.35;
    // Screen-right is the (+x, +z) diagonal; the ridge climbs toward it.
    const ridgeAmp = 9000 + 8000 * THREE.MathUtils.smoothstep((x + z) / 2, -40000, 60000);
    const ridge = ridgeAmp * Math.exp(-(((x - ridgeX) / 42000) ** 2));
    const lift = 3500 * THREE.MathUtils.smoothstep(x, -90000, 30000);
    // Keep the foreground gentle so the low camera never dips below the grass.
    const rollAmp = 900 + 1900 * THREE.MathUtils.smoothstep(x, -30000, 40000);
    const roll = rollAmp * fbm(x / 45000 + 3.1, z / 45000 - 1.7, 3);
    const detail = 350 * fbm(x / 9000, z / 9000, 2);
    return ridge + lift + roll + detail;
}

const ORIGIN_HEIGHT = rawHeight(0, 0);

// Height relative to the desk pad so the pad blends flat into the slope.
function terrainHeight(x: number, z: number) {
    return rawHeight(x, z) - ORIGIN_HEIGHT;
}

export default class Hills {
    application: Application;
    scene: THREE.Scene;
    camera: Camera;
    time: Time;
    clouds: THREE.InstancedMesh;
    cloudOffsets: number[];
    cloudBase: THREE.Matrix4[];

    constructor() {
        this.application = new Application();
        this.scene = this.application.scene;
        this.camera = this.application.camera;
        this.time = this.application.time;

        this.setSky();
        this.setTerrain();
        this.setFarHills();
        this.setClouds();
        this.setLights();
        this.enableShadowCasters();
    }

    setSky() {
        const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 24);
        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            uniforms: {
                topColor: { value: SKY_TOP },
                horizonColor: { value: SKY_HORIZON },
            },
            vertexShader: `
                varying float vHeight;
                void main() {
                    vHeight = normalize(position).y;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 horizonColor;
                varying float vHeight;
                void main() {
                    float t = pow(smoothstep(-0.05, 0.6, vHeight), 0.8);
                    gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
                }
            `,
        });
        const sky = new THREE.Mesh(geometry, material);
        sky.position.y = FLOOR_Y;
        this.scene.add(sky);
        this.scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.0000042);
    }

    setTerrain() {
        const geometry = new THREE.PlaneGeometry(
            TERRAIN_SIZE,
            TERRAIN_SIZE,
            TERRAIN_SEGMENTS,
            TERRAIN_SEGMENTS
        );
        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position as THREE.BufferAttribute;
        const colors = new Float32Array(positions.count * 3);
        const color = new THREE.Color();
        let maxHeight = 0;

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);
            let height = terrainHeight(x, z);
            // Keep a level pad under the desk and chair.
            const pad = THREE.MathUtils.smoothstep(
                Math.hypot(x, z),
                DESK_PAD_RADIUS,
                DESK_PAD_RADIUS * 2.6
            );
            height *= pad;
            positions.setY(i, FLOOR_Y + height);
            maxHeight = Math.max(maxHeight, height);
        }

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);
            const height = positions.getY(i) - FLOOR_Y;
            const sunlit = THREE.MathUtils.smoothstep(height / maxHeight, 0.1, 0.9);
            color.copy(GRASS_COLOR).lerp(RIDGE_COLOR, sunlit);
            // Wind-swept bands running across the slope.
            const band = Math.sin(x / 2200 + z / 9000 + fbm(x / 20000, z / 20000, 2) * 4);
            const streak = THREE.MathUtils.smoothstep(band, 0.55, 1) * 0.35 * (1 - sunlit * 0.5);
            color.lerp(SHADOW_GRASS_COLOR, streak);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 1,
            metalness: 0,
            side: THREE.DoubleSide,
        });
        const terrain = new THREE.Mesh(geometry, material);
        terrain.receiveShadow = true;
        this.scene.add(terrain);
    }

    setFarHills() {
        const material = new THREE.MeshBasicMaterial({ color: FAR_HILL_COLOR });
        const layers = [
            { x: 190000, z: -120000, w: 300000, h: 30000, seed: 11 },
            { x: 260000, z: -40000, w: 380000, h: 42000, seed: 29 },
        ];
        layers.forEach((layer) => {
            const geometry = new THREE.PlaneGeometry(layer.w, layer.w, 64, 64);
            geometry.rotateX(-Math.PI / 2);
            const positions = geometry.attributes.position as THREE.BufferAttribute;
            for (let i = 0; i < positions.count; i++) {
                const x = positions.getX(i);
                const z = positions.getZ(i);
                const bump = Math.max(0, fbm(x / 90000 + layer.seed, z / 90000, 3) + 0.25);
                const edge = 1 - THREE.MathUtils.smoothstep(Math.hypot(x, z), layer.w * 0.3, layer.w * 0.5);
                positions.setY(i, FLOOR_Y + bump * layer.h * edge);
            }
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(layer.x, 0, layer.z);
            this.scene.add(mesh);
        });
    }

    createCloudTexture() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const image = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const nx = (x / size - 0.5) * 2;
                const ny = (y / size - 0.5) * 2;
                const radial = 1 - Math.min(1, Math.hypot(nx, ny * 1.3));
                const puff = fbm(x / 60 + 8, y / 60 + 3, 4) * 0.5 + 0.5;
                const alpha = THREE.MathUtils.smoothstep(radial * puff * 1.6, 0.25, 0.9);
                const shade = 235 + 20 * THREE.MathUtils.smoothstep(radial, 0.2, 1);
                const i = (y * size + x) * 4;
                image.data[i] = shade;
                image.data[i + 1] = shade;
                image.data[i + 2] = 255;
                image.data[i + 3] = alpha * 255;
            }
        }
        ctx.putImageData(image, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        return texture;
    }

    setClouds() {
        const clusters = [
            { center: new THREE.Vector3(-60000, 36000, -130000), count: 14, spread: 30000 },
            { center: new THREE.Vector3(135000, 46000, -55000), count: 26, spread: 58000 },
        ];
        const total = clusters.reduce((sum, c) => sum + c.count, 0);
        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
            map: this.createCloudTexture(),
            transparent: true,
            depthWrite: false,
            fog: false,
        });
        this.clouds = new THREE.InstancedMesh(geometry, material, total);
        this.cloudOffsets = [];
        this.cloudBase = [];

        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        let index = 0;
        clusters.forEach((cluster) => {
            for (let i = 0; i < cluster.count; i++) {
                const t = i / cluster.count;
                position.set(
                    cluster.center.x + (fbm(i * 1.7, cluster.center.x, 2)) * cluster.spread * 2,
                    cluster.center.y + (fbm(i * 2.3, 5, 2)) * cluster.spread * 0.6 + t * 8000,
                    cluster.center.z + (fbm(i * 3.1, 9, 2)) * cluster.spread
                );
                const size = cluster.spread * (0.8 + Math.abs(fbm(i * 4.7, 2, 2)) * 1.4);
                scale.set(size, size * 0.62, 1);
                matrix.compose(position, quaternion, scale);
                this.clouds.setMatrixAt(index, matrix);
                this.cloudBase.push(matrix.clone());
                this.cloudOffsets.push(fbm(i * 0.9, 7, 1) * 40000);
                index++;
            }
        });
        this.clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.clouds);
    }

    setLights() {
        const sun = new THREE.DirectionalLight(
            new THREE.Color('#fff4d6').convertSRGBToLinear(),
            1.35
        );
        sun.position.set(-60000, 90000, 45000);
        sun.target.position.set(0, FLOOR_Y, 0);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 20000;
        sun.shadow.camera.far = 200000;
        sun.shadow.camera.left = -14000;
        sun.shadow.camera.right = 14000;
        sun.shadow.camera.top = 14000;
        sun.shadow.camera.bottom = -14000;
        sun.shadow.bias = -0.0004;
        sun.shadow.radius = 4;
        this.scene.add(sun, sun.target);

        const fill = new THREE.HemisphereLight(
            new THREE.Color('#bfdcff').convertSRGBToLinear(),
            new THREE.Color('#5f8a3a').convertSRGBToLinear(),
            0.55
        );
        this.scene.add(fill);
    }

    enableShadowCasters() {
        this.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child !== this.clouds && !child.receiveShadow) {
                child.castShadow = true;
            }
        });
    }

    update() {
        if (!this.clouds) return;
        const drift = this.time.elapsed * 0.9;
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        this.cloudBase.forEach((base, i) => {
            base.decompose(position, quaternion, scale);
            position.x += ((drift + this.cloudOffsets[i]) % 90000) - 45000;
            matrix.compose(position, this.camera.instance.quaternion, scale);
            this.clouds.setMatrixAt(i, matrix);
        });
        this.clouds.instanceMatrix.needsUpdate = true;
    }
}
