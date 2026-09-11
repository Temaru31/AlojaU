import { useEffect, useRef, useState } from 'react'
import casaUrl from '../assets/models3D/casa3D.glb?url'

const ROTATION_SPEED = 0.35
const WHITE = 0xf8fafc

function webglDisponible() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export default function Casa3D() {
  const contenedorRef = useRef(null)
  const [estado, setEstado] = useState(() => (webglDisponible() ? 'cargando' : 'sin-webgl'))

  useEffect(() => {
    let cancelado = false
    let renderer = null
    let raf = 0
    let IO = null
    let RO = null
    let visible = true
    const reloj = { anterior: 0 }

    const contenedor = contenedorRef.current
    if (!webglDisponible() || !contenedor) return undefined

    const montar = async () => {
      if (cancelado) return
      try {
        const THREE = await import('three')
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        if (cancelado) return

        const { clientWidth: ancho, clientHeight: alto } = contenedor
        if (!ancho || !alto) return

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setSize(ancho, alto)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.domElement.style.display = 'block'
        renderer.domElement.setAttribute('aria-hidden', 'true')
        contenedor.appendChild(renderer.domElement)

        const escena = new THREE.Scene()
        const camara = new THREE.PerspectiveCamera(35, ancho / alto, 0.1, 100)
        const direccionVista = new THREE.Vector3(0.54, 0.38, 0.75).normalize()

        escena.add(new THREE.HemisphereLight(0xffffff, 0x1e2a4a, 0.9))
        const clave = new THREE.DirectionalLight(0xffffff, 2.2)
        clave.position.set(4, 6, 3)
        clave.castShadow = true
        clave.shadow.mapSize.set(1024, 1024)
        escena.add(clave)
        const dorado = new THREE.DirectionalLight(0xf5c445, 1.1)
        dorado.position.set(-5, 2.5, -4)
        escena.add(dorado)
        const relleno = new THREE.DirectionalLight(0xdbe7ff, 0.5)
        relleno.position.set(-2, 1.5, 5)
        escena.add(relleno)

        const piso = new THREE.Mesh(
          new THREE.PlaneGeometry(20, 20),
          new THREE.ShadowMaterial({ opacity: 0.28 })
        )
        piso.rotation.x = -Math.PI / 2
        piso.receiveShadow = true
        escena.add(piso)

        const gltf = await new GLTFLoader().loadAsync(casaUrl)
        if (cancelado) return
        const modelo = gltf.scene

        const blanco = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.55, metalness: 0.08 })
        modelo.traverse((nodo) => {
          if (nodo.isMesh) {
            nodo.material = blanco
            nodo.castShadow = true
            nodo.receiveShadow = true
          }
        })

        const caja = new THREE.Box3().setFromObject(modelo)
        const centro = caja.getCenter(new THREE.Vector3())
        const tamano = caja.getSize(new THREE.Vector3())
        const escala = 3.1 / Math.max(tamano.x, tamano.y, tamano.z)
        const grupo = new THREE.Group()
        modelo.position.sub(centro)
        grupo.add(modelo)
        grupo.scale.setScalar(escala)
        grupo.position.y = 0.15
        escena.add(grupo)

        // Encuadre: distancia según el tamaño real del modelo (esfera
        // envolvente + margen para la flotación y la sombra), considerando
        // el fov vertical y horizontal para que nada se recorte.
        const esfera = new THREE.Box3().setFromObject(grupo).getBoundingSphere(new THREE.Sphere())
        const radioEncuadre = esfera.radius + 0.45
        const encuadrar = () => {
          const mitadVFov = THREE.MathUtils.degToRad(camara.fov) / 2
          const mitadHFov = Math.atan(Math.tan(mitadVFov) * camara.aspect)
          const dist = Math.max(
            radioEncuadre / Math.sin(mitadVFov),
            radioEncuadre / Math.sin(mitadHFov)
          )
          camara.position.copy(esfera.center).addScaledVector(direccionVista, dist)
          camara.lookAt(esfera.center)
        }
        encuadrar()

        const movimientoReducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        setEstado('listo')

        IO = new IntersectionObserver(([entrada]) => { visible = entrada.isIntersecting }, { threshold: 0.05 })
        IO.observe(contenedor)

        const animar = (ahora) => {
          raf = requestAnimationFrame(animar)
          if (!visible || document.hidden) {
            reloj.anterior = ahora
            return
          }
          const dt = Math.min((ahora - reloj.anterior) / 1000 || 0, 0.05)
          reloj.anterior = ahora
          if (!movimientoReducido) {
            grupo.rotation.y += ROTATION_SPEED * dt
            grupo.position.y = 0.15 + Math.sin(ahora / 1400) * 0.06
          }
          renderer.render(escena, camara)
        }
        reloj.anterior = performance.now()
        raf = requestAnimationFrame(animar)

        const reajustar = () => {
          const { clientWidth: w, clientHeight: h } = contenedor
          if (!w || !h) return
          camara.aspect = w / h
          camara.updateProjectionMatrix()
          renderer.setSize(w, h)
          encuadrar()
        }
        RO = new ResizeObserver(reajustar)
        RO.observe(contenedor)
      } catch {
        if (!cancelado) setEstado('error')
      }
    }

    montar()

    return () => {
      cancelado = true
      cancelAnimationFrame(raf)
      IO?.disconnect()
      RO?.disconnect()
      renderer?.dispose()
      if (renderer?.domElement?.parentNode === contenedor) {
        contenedor.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div className="relative h-64 sm:h-80 lg:h-[26rem]" role="img" aria-label="Modelo 3D de una casa girando">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 62% 52% at 50% 58%, rgba(245,196,69,0.16), transparent 70%)' }}
      />
      <div ref={contenedorRef} className="absolute inset-0 [&>canvas]:w-full [&>canvas]:h-full" />
      {estado !== 'listo' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <svg className={`w-14 h-14 text-white/40 ${estado === 'cargando' ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
          </svg>
          <p className="text-xs text-navy-300">
            {estado === 'cargando' ? 'Cargando modelo 3D…' : 'Vista 3D no disponible en este navegador'}
          </p>
        </div>
      )}
    </div>
  )
}
