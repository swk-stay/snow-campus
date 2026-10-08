import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// ?view=god で展示用の神視点（自動周回）カメラ
const isGodView = new URLSearchParams(location.search).get('view') === 'god'

const app = document.querySelector<HTMLDivElement>('#app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xcfd8e3)
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2))
const sun = new THREE.DirectionalLight(0xffffff, 1.5)
sun.position.set(10, 20, 8)
scene.add(sun)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0xf4f7fb }),
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500)
camera.position.set(0, isGodView ? 45 : 14, isGodView ? 45 : 18)
const controls = new OrbitControls(camera, renderer.domElement)
controls.autoRotate = isGodView

function resize() {
  const { clientWidth: w, clientHeight: h } = app
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
})
