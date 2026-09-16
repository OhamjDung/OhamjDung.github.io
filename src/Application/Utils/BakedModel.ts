import * as THREE from 'three';

export default class BakedModel {
    model: LoadedModel;
    texture: LoadedTexture;
    material: THREE.MeshLambertMaterial;

    constructor(model: LoadedModel, texture: LoadedTexture, scale?: number) {
        this.model = model;
        this.texture = texture;

        this.texture.flipY = false;
        this.texture.encoding = THREE.sRGBEncoding;

        // Lambert so the sun's colour and shadows land on the baked texture (which already carries
        // soft ambient occlusion). The emissive lift keeps shaded sides from going black.
        this.material = new THREE.MeshLambertMaterial({
            map: this.texture,
            emissive: new THREE.Color(0x555555),
            emissiveMap: this.texture,
        });

        this.model.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                if (scale) child.scale.set(scale, scale, scale);
                child.material.map = this.texture;
                child.material = this.material;
                // The baked exports ship without normals; Lambert needs them.
                if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        return this;
    }

    getModel(): THREE.Group {
        return this.model.scene;
    }
}
