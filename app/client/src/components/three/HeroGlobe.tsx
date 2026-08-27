import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const RADIUS = 2;

function latLngToVec3(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

function Globe({ markers }: { markers: { lat: number; lng: number }[] }) {
  const group = useRef<THREE.Group>(null);

  const dots = useMemo(() => {
    // fibonacci-sphere point cloud gives the globe its wireframe-planet look
    const count = 900;
    const arr = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      arr[i * 3] = Math.cos(theta) * r * RADIUS;
      arr[i * 3 + 1] = y * RADIUS;
      arr[i * 3 + 2] = Math.sin(theta) * r * RADIUS;
    }
    return arr;
  }, []);

  useFrame((state) => {
    if (group.current) group.current.rotation.y = state.clock.elapsedTime * 0.08;
  });

  return (
    <group ref={group}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dots, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.028} color="#22d3ee" transparent opacity={0.55} sizeAttenuation depthWrite={false} />
      </points>
      <mesh>
        <sphereGeometry args={[RADIUS * 0.985, 32, 32]} />
        <meshBasicMaterial color="#0b1020" transparent opacity={0.85} />
      </mesh>
      {markers.slice(0, 60).map((m, i) => {
        const pos = latLngToVec3(m.lat, m.lng, RADIUS * 1.02);
        return (
          <mesh key={i} position={pos}>
            <sphereGeometry args={[0.045, 8, 8]} />
            <meshBasicMaterial color="#a78bfa" />
          </mesh>
        );
      })}
    </group>
  );
}

/** Rotating point-cloud globe with violet markers at mined hiring locations. Lazy-loaded. */
export default function HeroGlobe({ markers }: { markers: { lat: number; lng: number }[] }) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    return (
      <div className="glow-hero flex h-full items-center justify-center text-6xl" aria-hidden>
        🌐
      </div>
    );
  }
  return (
    <Canvas camera={{ position: [0, 0, 5.2], fov: 50 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.5]}>
      <Globe markers={markers} />
    </Canvas>
  );
}
