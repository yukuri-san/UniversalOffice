import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

/**
 * WebX 専用ゲームエンジン：コア
 * Three.js を描画バックエンドとして、その上に WebX のゲーム共通基盤
 * （レンダラ・シーン・ループ・リサイズ・夜間ライティング・環境反射）を提供する。
 * 今後の WebX ゲームはこの層の上に作る。
 */
export class Engine {
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  private mount: HTMLElement
  private ro: ResizeObserver | null = null
  private raf = 0
  private clock = new THREE.Clock()
  private tickFn: ((dt: number) => void) | null = null
  elapsed = 0

  constructor(mount: HTMLElement) {
    this.mount = mount
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2200)
    const el = this.renderer.domElement
    el.style.width = '100%'
    el.style.height = '100%'
    el.style.display = 'block'
    mount.appendChild(el)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.32
    pmrem.dispose()
    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(mount)
  }

  /** 夜の基本ライティング（環境光＋月光） */
  setupNight(skyColor = 0x05070f, fogDensity = 0.0085) {
    this.scene.background = new THREE.Color(skyColor)
    this.scene.fog = new THREE.FogExp2(skyColor, fogDensity)
    this.scene.add(new THREE.AmbientLight(0x445588, 0.8))
    const moon = new THREE.DirectionalLight(0x8fa8dd, 0.5)
    moon.position.set(-140, 240, -90)
    this.scene.add(moon)
    return moon
  }

  addStarsAndMoon() {
    const n = 900
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const e = Math.random() * Math.PI * 0.45 + 0.06
      const r = 1500
      arr[i * 3] = Math.cos(a) * Math.cos(e) * r
      arr[i * 3 + 1] = Math.sin(e) * r
      arr[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcdd8ff, size: 2.4, sizeAttenuation: false, fog: false })))
    const moonMesh = new THREE.Mesh(new THREE.CircleGeometry(52, 24), new THREE.MeshBasicMaterial({ color: 0xe8efff, fog: false }))
    moonMesh.position.set(-600, 500, -900)
    moonMesh.lookAt(0, 40, 0)
    this.scene.add(moonMesh)
  }

  private resize() {
    const w = this.mount.clientWidth || 640
    const h = this.mount.clientHeight || 420
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** 毎フレーム dt（最大 0.05s クランプ）で fn を呼ぶループを開始 */
  start(fn: (dt: number) => void) {
    this.tickFn = fn
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const dt = Math.min(this.clock.getDelta(), 0.05)
      this.elapsed += dt
      this.tickFn?.(dt)
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro?.disconnect()
    this.renderer.dispose()
    const el = this.renderer.domElement
    if (el.parentNode === this.mount) this.mount.removeChild(el)
  }
}

/** 車両の下に敷く疑似シャドウ（放射グラデーションの円） */
export function makeBlobShadow(radius = 2.6): THREE.Mesh {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const g = cv.getContext('2d')
  if (g) {
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62)
    grad.addColorStop(0, 'rgba(0,0,0,0.55)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  }
  const tex = new THREE.CanvasTexture(cv)
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2.6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.renderOrder = 1
  return mesh
}
