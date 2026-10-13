import * as THREE from 'three'

// 並木やバスなどの景色（Three.js の標準マテリアル）を、被写体の手前にあるときだけディザで抜く。
// 建物は棟ごとに薄くする（buildings/material.ts の uFade）が、木は数が多く InstancedMesh なので、
// フラグメントごとに「カメラからこの点を通る視線が、この点より奥で被写体の箱に当たるか」で判定する。
// 被写体に被っている部分だけが抜けるので、画面の端の木はそのまま残る。
// キャラクター（プレイヤー。将来のマルチプレイでは他の人も）には使わない。完成演出に自分が映り込むのは良いことで、
// 他の人もなるべく見えているほうがよいため。抜くのは景色や除雪機など、キャラクター以外のものだけ。

/** 全マテリアルで共有する uniform。main が毎フレーム更新する */
export const subjectCut = {
  uSubjMin: { value: new THREE.Vector3() },
  uSubjMax: { value: new THREE.Vector3() },
  /** 抜く割合（0 で無効、1 で全部抜く） */
  uSubjCut: { value: 0 },
}

const patched = new WeakSet<THREE.Material>()

function patch(material: THREE.Material) {
  if (patched.has(material)) return
  patched.add(material)
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, subjectCut)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSubjWorld;')
      .replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
        vec4 subjWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          subjWorld = instanceMatrix * subjWorld;
        #endif
        vSubjWorld = (modelMatrix * subjWorld).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 uSubjMin;
        uniform vec3 uSubjMax;
        uniform float uSubjCut;
        varying vec3 vSubjWorld;`,
      )
      .replace(
        'void main() {',
        /* glsl */ `void main() {
        if (uSubjCut > 0.0) {
          vec3 dir = vSubjWorld - cameraPosition;
          float len = length(dir);
          dir /= len;
          // 軸に平行な視線で 0 除算にならないように
          dir = mix(dir, vec3(1e-5), step(abs(dir), vec3(1e-6)));
          vec3 t0 = (uSubjMin - cameraPosition) / dir;
          vec3 t1 = (uSubjMax - cameraPosition) / dir;
          vec3 tn3 = min(t0, t1);
          vec3 tf3 = max(t0, t1);
          float tn = max(max(tn3.x, tn3.y), tn3.z);
          float tf = min(min(tf3.x, tf3.y), tf3.z);
          // 視線が箱に当たり、その出口がこの点より奥 = この点が被写体に被っている
          if (tf >= max(tn, 0.0) && tf > len) {
            // 4x4 のベイヤー行列（建物の抜きと同じ模様）
            vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
            float b = (mod(q.x + q.y * 2.0, 4.0) * 4.0 + mod(q.x * 2.0 + q.y, 4.0) + 0.5) / 16.0;
            if (b < uSubjCut) discard;
          }
        }`,
      )
  }
}

/** object 以下のメッシュのマテリアルに、被写体の手前を抜く処理を足す。キャラクターには使わないこと */
export function applySubjectCut<T extends THREE.Object3D>(object: T): T {
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const list = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of list) patch(m)
  })
  return object
}
