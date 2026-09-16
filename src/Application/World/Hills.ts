import * as THREE from 'three';
import GUI from 'lil-gui';
import getPanel from '../Utils/Panel';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import Application from '../Application';
import Camera from '../Camera/Camera';
import Time from '../Utils/Time';
import UIEventBus from '../UI/EventBus';
import FluffyGrass from './FluffyGrass';

// Scene units are ~cm; the desk sits at the origin with its floor near y = -2984.
const FLOOR_Y = -2984;
const TERRAIN_SIZE = 720000;
const TERRAIN_SEGMENTS = 360;
const DESK_PAD_RADIUS = 7000;
const SKY_RADIUS = 420000;
const SUN_DISTANCE = 170000;

// Bearing is degrees right of the idle camera's forward; elevation is degrees above the horizon.
const SUN = { bearing: -21, elevation: 15, intensity: 2.4, color: '#ffba24', glow: '#eee720' };
// The sun circles the scene: bearing advances this many degrees per second and wraps.
const SUN_ORBIT_SPEED = 0.75;
const CAM_FORWARD = new THREE.Vector3(1, 0, -1).normalize();
const CAM_RIGHT = new THREE.Vector3(1, 0, 1).normalize();

function bearingToDirection(bearingDeg: number, elevDeg: number) {
    const b = THREE.MathUtils.degToRad(bearingDeg);
    const e = THREE.MathUtils.degToRad(elevDeg);
    const dir = CAM_FORWARD.clone().multiplyScalar(Math.cos(b)).add(CAM_RIGHT.clone().multiplyScalar(Math.sin(b)));
    dir.multiplyScalar(Math.cos(e));
    dir.y = Math.sin(e);
    return dir.normalize();
}

const RIDGE_COLOR = new THREE.Color('#e6f57e').convertSRGBToLinear();
const GRASS_COLOR = new THREE.Color('#5aa82a').convertSRGBToLinear();
const SHADOW_GRASS_COLOR = new THREE.Color('#25601a').convertSRGBToLinear();
const FAR_HILL_COLOR = new THREE.Color('#a9c9a2').convertSRGBToLinear();
const SKY_TOP = new THREE.Color('#1653c9').convertSRGBToLinear();
const SKY_HORIZON = new THREE.Color('#bfdcff').convertSRGBToLinear();
const FOG_COLOR = new THREE.Color('#e4eefb').convertSRGBToLinear();

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
    const ridgeAmp = 7500 + 7000 * THREE.MathUtils.smoothstep((x + z) / 2, -40000, 60000);
    const ridge = ridgeAmp * Math.exp(-(((x - ridgeX) / 42000) ** 2));
    // Extra hills rolling off into the distance on every side.
    const hillA = 16000 * Math.exp(-((x + 95000) ** 2 + (z + 50000) ** 2) / (2 * 52000 ** 2));
    const hillB = 15000 * Math.exp(-((x - 150000) ** 2 + (z + 120000) ** 2) / (2 * 60000 ** 2));
    const hillC = 9000 * Math.exp(-((x + 40000) ** 2 + (z + 150000) ** 2) / (2 * 42000 ** 2));
    const hillD = 11000 * Math.exp(-((x - 20000) ** 2 + (z - 120000) ** 2) / (2 * 52000 ** 2));
    const hillE = 18000 * Math.exp(-((x + 170000) ** 2 + (z - 40000) ** 2) / (2 * 75000 ** 2));
    const farRoll = 7000 * THREE.MathUtils.smoothstep(Math.hypot(x, z), 60000, 200000) * fbm(x / 120000 + 9, z / 120000 + 4, 3);
    const lift = 3500 * THREE.MathUtils.smoothstep(x, -90000, 30000);
    // Keep the foreground gentle so the low camera never dips below the grass.
    const rollAmp = 900 + 1900 * THREE.MathUtils.smoothstep(x, -30000, 40000);
    const roll = rollAmp * fbm(x / 45000 + 3.1, z / 45000 - 1.7, 3);
    const detail = 350 * fbm(x / 9000, z / 9000, 2);
    return ridge + hillA + hillB + hillC + hillD + hillE + farRoll + lift + roll + detail;
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
    grass: FluffyGrass;
    haze = { value: 0.45 };
    sun: THREE.DirectionalLight;
    fillColor = new THREE.Color('#9fb98c').convertSRGBToLinear();
    sunDisc: THREE.Sprite;
    sunGlow: THREE.Sprite;
    gui: GUI;
    cloudOffsets: number[];
    cloudBase: THREE.Matrix4[];

    constructor() {
        this.application = new Application();
        this.scene = this.application.scene;
        this.camera = this.application.camera;
        this.time = this.application.time;

        this.setSky();
        this.setTerrain();
        this.grass = new FluffyGrass((x, z) => this.groundHeight(x, z), 2400);
        this.setFarHills();
        this.setClouds();
        this.setLights();
        this.setSunDisc();
        this.setGui();
        this.enableShadowCasters();
        this.setHaze(29);
        UIEventBus.on('hazeChange', (value: number) => this.setHaze(value));
        this.setScenePanel();
    }

    setHaze(value: number) {
        this.haze.value = THREE.MathUtils.clamp(value / 100, 0, 1);
        const density = this.haze.value * 0.000028;
        (this.scene.fog as THREE.FogExp2).density = density;
        (this.clouds.material as THREE.MeshBasicMaterial).opacity = 1 - this.haze.value * 0.5;
        this.sunGlow.material.opacity = 1 - this.haze.value * 0.85;
        this.sunDisc.material.opacity = 1 - this.haze.value * 0.65;
        document.body.dataset.haze = String(value);
    }

    groundHeight(x: number, z: number) {
        const pad = THREE.MathUtils.smoothstep(Math.hypot(x, z), DESK_PAD_RADIUS, DESK_PAD_RADIUS * 2.6);
        return FLOOR_Y + terrainHeight(x, z) * pad;
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
                uHaze: this.haze,
                hazeColor: { value: FOG_COLOR },
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
                uniform vec3 hazeColor;
                uniform float uHaze;
                varying float vHeight;
                void main() {
                    float t = pow(smoothstep(-0.05, 0.5, vHeight), 0.7);
                    gl_FragColor = vec4(mix(mix(horizonColor, topColor, t), hazeColor, uHaze * 0.65), 1.0);
                }
            `,
        });
        const sky = new THREE.Mesh(geometry, material);
        sky.position.y = FLOOR_Y;
        this.scene.add(sky);
        this.scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.0000040);
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
            const sunlit = Math.pow(THREE.MathUtils.smoothstep(height / maxHeight, 0.05, 0.95), 1.4);
            color.copy(GRASS_COLOR).lerp(RIDGE_COLOR, sunlit);
            // Wind-swept bands running across the slope.
            const band = Math.sin(x / 2200 + z / 9000 + fbm(x / 20000, z / 20000, 2) * 4);
            const streak = THREE.MathUtils.smoothstep(band, 0.55, 1) * 0.10 * (1 - sunlit * 0.5);
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
        // Fine, antialiased grain carries the grass texture beyond the blade draw radius.
        material.onBeforeCompile = (shader) => {
            shader.vertexShader = 'varying vec3 vMeadow;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMeadow = position;');
            shader.fragmentShader = 'varying vec3 vMeadow;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
                vec2 cell = floor(vMeadow.xz / 45.0);
                float grain = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
                float detail = 1.0 - smoothstep(50.0, 400.0, length(fwidth(vMeadow.xz)));
                diffuseColor.rgb *= 1.0 + (grain - 0.5) * 0.3 * detail;
            `);
        };
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
        // Placed by bearing/elevation from the idle camera so they land in frame.
        const cam = new THREE.Vector3(-24000, 3600, 24000);
        const cloudAt = (bearingDeg: number, elevDeg: number, dist: number, count: number, spread: number) => {
            const center = cam.clone().add(bearingToDirection(bearingDeg, elevDeg).multiplyScalar(dist));
            return { center, count, spread };
        };
        const clusters = [
            cloudAt(20, 14, 170000, 26, 52000),
            cloudAt(-17, 12, 190000, 20, 40000),
            cloudAt(-4, 17, 210000, 16, 34000),
            cloudAt(8, 9, 260000, 12, 26000),
            cloudAt(-26, 7, 280000, 12, 28000),
            cloudAt(13, 20, 150000, 10, 24000),
            cloudAt(-11, 5, 320000, 10, 30000),
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
        // Billboards are re-posed every frame; the static bounding sphere would cull them mid-sky.
        this.clouds.frustumCulled = false;
        this.scene.add(this.clouds);
    }

    setLights() {
        const sun = new THREE.DirectionalLight(
            new THREE.Color(SUN.color).convertSRGBToLinear(),
            SUN.intensity
        );
        this.sun = sun;
        this.applySun();
        sun.target.position.set(0, FLOOR_Y, 0);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 100000;
        sun.shadow.camera.far = 240000;
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
            0.42
        );
        this.scene.add(fill);
    }

    applySun() {
        const dir = bearingToDirection(SUN.bearing, SUN.elevation);
        this.sun.position.copy(dir).multiplyScalar(SUN_DISTANCE);
        this.sun.intensity = SUN.intensity;
        this.sun.color.set(SUN.color).convertSRGBToLinear();
        if (this.grass) this.grass.setSun(dir, this.sun.color, SUN.intensity, this.fillColor);
        if (this.sunDisc) {
            const skyPos = dir.clone().multiplyScalar(SKY_RADIUS * 0.9);
            skyPos.y += FLOOR_Y;
            this.sunDisc.position.copy(skyPos);
            this.sunGlow.position.copy(skyPos);
            (this.sunGlow.material as THREE.SpriteMaterial).color.set(SUN.glow).convertSRGBToLinear();
            (this.sunDisc.material as THREE.SpriteMaterial).color.set(SUN.glow).convertSRGBToLinear();
        }
    }

    createGlowTexture(inner: string, stops: [number, string][]) {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, inner);
        stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        return texture;
    }

    setSunDisc() {
        const disc = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.createGlowTexture('rgba(255,255,255,1)', [[0.16, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            fog: false,
            transparent: true,
        }));
        disc.scale.set(SKY_RADIUS * 0.22, SKY_RADIUS * 0.22, 1);
        disc.renderOrder = -1;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.createGlowTexture('rgba(255,255,255,0.9)', [[0.25, 'rgba(255,255,255,0.45)'], [0.6, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            fog: false,
            transparent: true,
        }));
        glow.scale.set(SKY_RADIUS * 1.1, SKY_RADIUS * 1.1, 1);
        glow.renderOrder = -1;
        this.sunDisc = disc;
        this.sunGlow = glow;
        this.scene.add(disc, glow);
        this.applySun();
    }

    setScenePanel() {
        const panel = getPanel();
        const scene = { haze: 29 };
        panel.add(scene, 'haze', 0, 100, 1).name('Haze').onChange((value: number) => this.setHaze(value));
        panel.add(SUN, 'elevation', 2, 80, 1).name('Sun height').onChange(() => this.applySun());
    }

    setGui() {
        // Full sun tuning only with ?sun / ?tune in the URL.
        const params = new URLSearchParams(window.location.search);
        if (!params.has('sun') && !params.has('tune')) return;
        const folder = getPanel().addFolder('Sun');
        this.gui = folder;
        folder.add(SUN, 'bearing', -180, 180, 1).name('bearing (deg right)').listen().onChange(() => this.applySun());
        folder.add(SUN, 'intensity', 0, 5, 0.05).onChange(() => this.applySun());
        folder.addColor(SUN, 'color').name('light color').onChange(() => this.applySun());
        folder.addColor(SUN, 'glow').name('glow color').onChange(() => this.applySun());
    }

    enableShadowCasters() {
        this.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child !== this.clouds && !this.grass.meshes.includes(child as THREE.InstancedMesh) && !child.receiveShadow && !(child instanceof THREE.Sprite)) {
                child.castShadow = true;
            }
        });
    }

    update() {
        SUN.bearing += SUN_ORBIT_SPEED * Math.min(this.time.delta, 100) * 0.001;
        if (SUN.bearing > 180) SUN.bearing -= 360;
        this.applySun();
        this.grass.update();
        if (!this.clouds) return;
        const t = this.time.elapsed * 0.001;
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        this.cloudBase.forEach((base, i) => {
            base.decompose(position, quaternion, scale);
            // Slow back-and-forth drift; no wrap so clouds never jump.
            position.x += Math.sin(t * 0.03 + this.cloudOffsets[i] * 0.0001) * 12000;
            position.y += Math.sin(t * 0.021 + this.cloudOffsets[i] * 0.00013) * 1500;
            matrix.compose(position, this.camera.instance.quaternion, scale);
            this.clouds.setMatrixAt(i, matrix);
        });
        this.clouds.instanceMatrix.needsUpdate = true;
    }
}
