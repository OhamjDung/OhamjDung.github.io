import * as THREE from 'three';
import Application from '../Application';
import Time from '../Utils/Time';

// Ported from thebenezer/FluffyGrass (MIT): instanced tuft cards with an alpha-cut blade texture,
// noise-driven tip colour and wind, lit as Lambert with directional shadows. See CREDITS.md.

export type HeightFn = (x: number, z: number) => number;

const COUNT = window.innerWidth < 768 ? 12000 : 42000;
const RADIUS = 62000;
const TUFT_SCALE = 2700; // LOD00 card is ~0.13 units tall -> ~350 scene units
const BASE_COLOR = new THREE.Color('#356d1c').convertSRGBToLinear();
const TIP_COLOR_1 = new THREE.Color('#a8d150').convertSRGBToLinear();
const TIP_COLOR_2 = new THREE.Color('#4f9a33').convertSRGBToLinear();

export default class FluffyGrass {
    application = new Application();
    time: Time;
    mesh: THREE.InstancedMesh;
    uniforms = {
        uTime: { value: 0 },
        uTerrainSize: { value: RADIUS * 2 },
        uWindAmp: { value: 55 },
        uHeightVariation: { value: 90 },
        uNoiseScale: { value: 6 },
        uShadowDarkness: { value: 0.45 },
        uGrassLightIntensity: { value: 0.95 },
        uBaseColor: { value: BASE_COLOR },
        uTipColor1: { value: TIP_COLOR_1 },
        uTipColor2: { value: TIP_COLOR_2 },
        uNoiseTexture: { value: null as THREE.Texture | null },
        uGrassAlphaTexture: { value: null as THREE.Texture | null },
    };

    constructor(heightAt: HeightFn, avoidRadius: number) {
        this.time = this.application.time;
        const items = this.application.resources.items;
        const noise = items.texture.grassNoiseTexture;
        noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
        const alpha = items.texture.grassAlphaTexture;
        this.uniforms.uNoiseTexture.value = noise;
        this.uniforms.uGrassAlphaTexture.value = alpha;

        let geometry: THREE.BufferGeometry | undefined;
        items.gltfModel.grassTuftModel.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.name.includes('LOD00')) geometry = child.geometry;
        });
        if (!geometry) throw new Error('grassLODs.glb has no LOD00 mesh');
        geometry = geometry.clone();
        geometry.scale(TUFT_SCALE, TUFT_SCALE, TUFT_SCALE);

        const material = new THREE.MeshLambertMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.1,
            shadowSide: THREE.FrontSide,
        });
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this.uniforms);
            shader.vertexShader = VERTEX;
            shader.fragmentShader = FRAGMENT;
        };

        this.mesh = new THREE.InstancedMesh(geometry, material, COUNT);
        this.mesh.receiveShadow = true;
        this.mesh.frustumCulled = false;

        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const matrix = new THREE.Matrix4();
        const euler = new THREE.Euler();
        let n = 0;
        while (n < COUNT) {
            const r = Math.sqrt(Math.random()) * RADIUS;
            const a = Math.random() * Math.PI * 2;
            const x = Math.cos(a) * r;
            const z = Math.sin(a) * r;
            if (Math.hypot(x, z) < avoidRadius) continue;
            position.set(x, heightAt(x, z), z);
            euler.set(0, Math.random() * Math.PI * 2, 0);
            quaternion.setFromEuler(euler);
            const s = 0.75 + Math.random() * 0.6;
            scale.set(s, s, s);
            matrix.compose(position, quaternion, scale);
            this.mesh.setMatrixAt(n, matrix);
            n++;
        }
        this.application.scene.add(this.mesh);
    }

    update() {
        this.uniforms.uTime.value = this.time.elapsed * 0.001;
    }
}

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
uniform sampler2D uNoiseTexture;
uniform float uNoiseScale;
uniform float uTime;
uniform float uTerrainSize;
uniform float uWindAmp;
uniform float uHeightVariation;
varying vec2 vGlobalUV;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
    #include <begin_vertex>
    #include <project_vertex>
    #include <fog_vertex>
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <worldpos_vertex>
    #include <shadowmap_vertex>

    vec4 modelPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vGlobalUV = (uTerrainSize - modelPosition.xz) / uTerrainSize;
    vec4 noise = texture2D(uNoiseTexture, vGlobalUV + uTime * 0.001);
    vec2 windDirection = normalize(vec2(1.0, 1.0));
    float sinWave = sin(50.0 * dot(windDirection, vGlobalUV) + noise.g * 5.5 + uTime) * uWindAmp * (1.0 - uv.y);
    modelPosition.x += sinWave;
    modelPosition.z += sinWave;
    modelPosition.y += exp(texture2D(uNoiseTexture, vGlobalUV * uNoiseScale).r) * uHeightVariation * (1.0 - uv.y);

    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;
    vUv = vec2(uv.x, 1.0 - uv.y);
    vNormal = normalize(normalMatrix * normal);
    vViewPosition = -viewPosition.xyz;
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform vec3 uBaseColor;
uniform vec3 uTipColor1;
uniform vec3 uTipColor2;
uniform sampler2D uGrassAlphaTexture;
uniform sampler2D uNoiseTexture;
uniform float uNoiseScale;
uniform float uGrassLightIntensity;
uniform float uShadowDarkness;
varying vec2 vUv;
varying vec2 vGlobalUV;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
    float grassAlpha = texture2D(uGrassAlphaTexture, vUv).r;
    if (grassAlpha < 0.1) discard;
    float variation = texture2D(uNoiseTexture, vGlobalUV * uNoiseScale).r;
    vec3 tipColor = mix(uTipColor1, uTipColor2, variation);
    vec3 color = mix(uBaseColor, tipColor, vUv.y) * uGrassLightIntensity;

    float shadow = 1.0;
    #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        DirectionalLightShadow directionalLightShadow;
        #pragma unroll_loop_start
        for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) {
            directionalLightShadow = directionalLightShadows[i];
            float currentShadow = getShadow(directionalShadowMap[i], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[i]);
            // Fade toward the shadow camera's edge so the frustum border never shows.
            float weight = clamp(pow(length(vDirectionalShadowCoord[i].xy * 2.0 - 1.0), 4.0), 0.0, 1.0);
            shadow = mix(currentShadow, 1.0, weight);
        }
        #pragma unroll_loop_end
    #endif
    color = mix(color * uShadowDarkness, color, shadow);
    gl_FragColor = vec4(color, 1.0);
    #include <encodings_fragment>
    #include <fog_fragment>
}
`;
