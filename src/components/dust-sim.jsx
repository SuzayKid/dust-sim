import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { useRef, useState, useMemo } from "react";
import * as THREE from "three";

const STATES = {
  NORMAL: "NORMAL",
  MONITOR: "MONITOR",
  WARNING: "WARNING",
  PREDICTIVE: "PREDICTIVE_ACTUATION",
  MITIGATION: "MITIGATION",
  ERROR: "ERROR",
};

const SITE_CENTER = new THREE.Vector3(0, 0, 0);

function Dust({ intensity, windAngle, paused }) {
  const ref = useRef();
  const COUNT = 1550; 
  const windVec = useMemo(() => {
    const r = (windAngle * Math.PI) / 180;
    return { x: Math.cos(r) * 0.005, z: Math.sin(r) * 0.005 };
  }, [windAngle]);
  const positions = useMemo(() => {
    const a = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const r = (Math.random() + Math.random() + Math.random() - 1.5) * 9; 
      const angle = Math.random() * Math.PI * 2;
      a[i * 3] = Math.cos(angle) * r; a[i * 3 + 1] = Math.random() * 4.5; a[i * 3 + 2] = Math.sin(angle) * r; 
    }
    return a;
  }, []);
  useFrame(() => {
    if (paused) return;
    const pos = ref.current.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] += windVec.x; pos.array[i * 3 + 1] += (Math.random() - 0.5) * 0.01; pos.array[i * 3 + 2] += windVec.z;
      const dist = Math.sqrt(pos.array[i * 3]**2 + pos.array[i * 3 + 2]**2);
      if (dist > 25) { pos.array[i * 3] *= 0.98; pos.array[i * 3 + 2] *= 0.98; }
      if (pos.array[i * 3 + 1] > 5) pos.array[i * 3 + 1] = 0;
      if (pos.array[i * 3 + 1] < 0) pos.array[i * 3 + 1] = 4;
    }
    pos.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" array={positions} count={COUNT} itemSize={3} /></bufferGeometry>
      <pointsMaterial size={0.18 + intensity * 0.15} color="#5c4d3c" transparent opacity={0.05 + intensity * 0.5} depthWrite={false} />
    </points>
  );
}

const dotTexture = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width=32; c.height=32; const ctx=c.getContext('2d'); const g=ctx.createRadialGradient(16,16,0,16,16,16); g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(1,'rgba(255,255,255,0)'); ctx.fillStyle=g; ctx.fillRect(0,0,32,32); return c; })());
function SprayDroplets({ origin, direction, intensity, paused }) {
  const COUNT = 600; const ref = useRef();
  const dir = useMemo(() => new THREE.Vector3(direction.x, 0, direction.z).normalize(), [direction]);
  const particles = useMemo(() => Array.from({ length: COUNT }, () => {
    const t = Math.random() * 60; const sx = (Math.random()-0.5)*0.3; const sz = (Math.random()-0.5)*0.3; const rs = 0.08 + Math.random()*0.02; 
    const vel = dir.clone().add(new THREE.Vector3(sx, 0, sz)).normalize().multiplyScalar(rs); vel.y += 0.18; 
    return { pos: new THREE.Vector3(vel.x*t, Math.max((vel.y*t)-(0.5*0.006*t*t), -0.5), vel.z*t), vel: new THREE.Vector3(vel.x, vel.y-(0.006*t), vel.z), life: 60-t };
  }), [dir]);
  useFrame(() => {
    if (!ref.current || paused) return;
    const attr = ref.current.geometry.attributes.position;
    for (let i = 0; i < COUNT; i++) {
      const p = particles[i];
      if (intensity > 0) {
        p.pos.add(p.vel); p.vel.y -= 0.006; p.life -= 1;
        if (p.life <= 0 || p.pos.y < -0.2) {
          p.pos.set(0,0,0); const sx=(Math.random()-0.5)*0.3; const sz=(Math.random()-0.5)*0.3; const rs=0.08+Math.random()*0.02;
          p.vel.copy(dir).add(new THREE.Vector3(sx,0,sz)).normalize().multiplyScalar(rs); p.vel.y+=0.18; p.life=40+Math.random()*20;
        }
        attr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      } else { attr.setXYZ(i, 0, -1000, 0); }
    }
    attr.needsUpdate = true;
  });
  return (<points position={origin} ref={ref}><bufferGeometry><bufferAttribute attach="attributes-position" array={new Float32Array(COUNT * 3)} count={COUNT} itemSize={3} /></bufferGeometry><pointsMaterial map={dotTexture} size={0.12} color="#38bdf8" transparent opacity={0.7} depthWrite={false} blending={THREE.NormalBlending} /></points>);
}

function Sprinkler({ pos, intensity, paused }) {
  const H = 0.9; const baseDir = useMemo(() => SITE_CENTER.clone().sub(new THREE.Vector3(...pos)).normalize(), [pos]);
  const leftDir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 10);
  const rightDir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 10);
  return (
    <group position={pos}>
      <mesh position={[0, H * 0.5, 0]}><cylinderGeometry args={[0.05, 0.05, H, 16]} /><meshStandardMaterial color="#475569" /></mesh>
      <mesh position={[0, H, 0]}><sphereGeometry args={[0.08, 16, 16]} /><meshStandardMaterial color="#38bdf8" /></mesh>
      {intensity > 0 && (<><SprayDroplets origin={[0, H, 0]} direction={leftDir} intensity={intensity} paused={paused} /><SprayDroplets origin={[0, H, 0]} direction={rightDir} intensity={intensity} paused={paused} /></>)}
    </group>
  );
}

function SensorNode({ position, active, label }) {
  return (
    <group position={position}>
      <Html position={[0, 1.8, 0]} center distanceFactor={12}><div style={{ background: "rgba(15, 23, 42, 0.8)", color: active ? "#fca5a5" : "white", padding: "6px 10px", borderRadius: "4px", fontFamily: "monospace", fontSize: "12px", fontWeight: "bold", border: active ? "1px solid #ef4444" : "1px solid #475569", whiteSpace: "nowrap" }}>{label} {active ? "⚠️" : ""}</div></Html>
      <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.08, 0.08, 1.2, 16]} /><meshStandardMaterial color="#1e293b" /></mesh>
      <mesh position={[0, 1.3, 0]}><sphereGeometry args={[0.15, 32, 32]} /><meshStandardMaterial color={active ? "#ff0000" : "#475569"} roughness={0.5} /></mesh>
    </group>
  );
}

function Building({ position, stage }) {
  const columns = [[-1,-1],[1,-1],[-1,1],[1,1]];
  return (<group position={position}>{columns.map((p,i)=>( <mesh key={i} position={[p[0],1.2,p[1]]}><boxGeometry args={[0.3,2.4,0.3]} /><meshStandardMaterial color="#94a3b8" /></mesh> ))}{stage > 1 && (<mesh position={[0,2.6,0]}><boxGeometry args={[2.6,0.25,2.6]} /><meshStandardMaterial color="#e5e7eb" /></mesh>)}</group>);
}

function Crane() { return (<group position={[-3,0,-3]}><mesh position={[0,2,0]}><boxGeometry args={[0.4 ,4.5,0.6]} /><meshStandardMaterial color="#facc15" /></mesh><mesh position={[1,3.25,0]}><boxGeometry args={[3,0.25,0.3]} /><meshStandardMaterial color="#facc15" /></mesh></group>); }

/* --- SCENE LOGIC (The Brain) --- */
function Scene({ paused, setMetrics, nodes = [], onDataUpdate }) { // NEW PROP: onDataUpdate
  const [dust, setDust] = useState(0.15); 
  const [state, setState] = useState(STATES.NORMAL);
  const [wind, setWind] = useState({ name: "N", angle: 0 }); 
  const [sprayIntensity, setSprayIntensity] = useState(0);

  const lastUpdate = useRef(0);
  const lastSync = useRef(0); // For dashboard sync
  const windTimer = useRef(0);
  const mitigationTimer = useRef(0); 
  const recoveryTimer = useRef(0);

  useFrame(({ clock }) => {
    if (paused) return;
    const t = clock.getElapsedTime();
    if (t - lastUpdate.current < 0.1) return; 
    lastUpdate.current = t;

    windTimer.current += 1;
    if (windTimer.current > 40) { 
      windTimer.current = 0;
      setWind(prev => ({ ...prev, angle: (prev.angle + 45) % 360, name: "VAR" }));
    }

    const noise = (Math.random() - 0.5) * 6; 
    const currentPM25 = 20 + dust * 120 + noise; 
    const pm10 = currentPM25 * (1.5 + Math.random() * 0.2);
    const predictedPM25 = currentPM25 * 1.1 + (Math.random() * 10);
    const isPredictiveSpike = predictedPM25 > 75; 

    let emission = 0.4; 
    if (state === STATES.MITIGATION) emission = -4.0; 
    if (state === STATES.PREDICTIVE) emission = -1.5; 

    setDust(d => Math.min(Math.max(d + 0.005 * emission, 0.0), 1.0));

    if (state === STATES.MITIGATION || state === STATES.PREDICTIVE) {
      mitigationTimer.current += 1;
    }

    setState(prev => {
      if (prev === STATES.MITIGATION || prev === STATES.PREDICTIVE) {
        if (mitigationTimer.current < 80) return prev; 
        if (currentPM25 > 45) return prev;
        recoveryTimer.current = 30; 
        return STATES.MONITOR;
      }
      if (prev === STATES.MONITOR && recoveryTimer.current > 0) {
        recoveryTimer.current -= 1;
        return STATES.MONITOR;
      }
      if (currentPM25 > 90) { 
        mitigationTimer.current = 0;
        return STATES.MITIGATION; 
      }
      if (isPredictiveSpike && prev !== STATES.MITIGATION && prev !== STATES.PREDICTIVE && recoveryTimer.current === 0) {
        mitigationTimer.current = 0;
        return STATES.PREDICTIVE; 
      }
      if (currentPM25 > 40) return STATES.MONITOR;
      return STATES.NORMAL;
    });

    setSprayIntensity(state === STATES.MITIGATION ? 1.0 : state === STATES.PREDICTIVE ? 0.6 : 0);
    setMetrics({ pm25: currentPM25, pm10, predictedPM: predictedPM25, state, wind, sprayIntensity });

    // --- SEND DATA TO DASHBOARD (Once per second) ---
    if (t - lastSync.current > 1.0 && onDataUpdate) {
        lastSync.current = t;
        onDataUpdate({
            pm10: pm10,
            predicted: predictedPM25,
            state: state,
            wind: wind
        });
    }
  });

  return (
    <>
      <ambientLight intensity={1.0} />
      <directionalLight position={[10,20,5]} intensity={1.5} />
      <OrbitControls enableDamping />
      <gridHelper args={[30,30,"#555", "#888"]} />
      
      <mesh position={[0,-0.45,0]}><boxGeometry args={[30, 0.9, 30]} /><meshStandardMaterial color="#8c7b64" /></mesh>
      <Building position={[-2,0,-3]} stage={1} />
      <Building position={[4,0,3]} stage={2} />
      <Crane />
      <Dust intensity={dust} windAngle={wind.angle} paused={paused} />
      {[[-6,0,0],[6,0,0],[0,0,-6],[0,0,6]].map((p,i)=>( <Sprinkler key={i} pos={p} intensity={sprayIntensity} paused={paused} /> ))}
      
      {nodes.map(node => (
        <SensorNode key={node.id} position={[node.x || 0, 0, node.z || 0]} active={node.status === 'hazardous' || node.status === 'unhealthy'} label={node.id} />
      ))}
    </>
  );
}

export default function DustSimulation({ nodes = [], onDataUpdate }) { // Added prop
  const [paused, setPaused] = useState(false);
  const [metrics, setMetrics] = useState({});
  const [simKey, setSimKey] = useState(0); 

  const handleRestart = () => {
    setSimKey(p => p + 1); 
    setPaused(false); 
    setMetrics({}); 
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#3b4549", overflow: "hidden", borderRadius: "12px" }}>
      
      <div style={{
        position:"absolute", left:12, top:12, width:280,
        padding:16, background:"rgba(240, 245, 249, 0.95)",
        fontFamily:"monospace", borderRadius:8, zIndex:10,
        boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        color: "#1e293b"
      }}>
        <h3 style={{ margin:"0 0 10px 0", color:"#0f172a" }}>DustVision AI</h3>
        
        <div style={{ 
          marginBottom:10, padding:5, borderRadius:4, textAlign:"center", fontWeight:"bold",
          color: "white",
          background: metrics.state === STATES.NORMAL ? "#10b981" :
                      metrics.state === STATES.PREDICTIVE ? "#f59e0b" : 
                      metrics.state === STATES.MITIGATION ? "#ef4444" : "#64748b"
        }}>
          STATUS: {metrics.state}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, fontSize:12 }}>
          <div>Current PM2.5:</div><div style={{ fontWeight:"bold" }}>{metrics.pm25?.toFixed(1)}</div>
          <div>Current PM10:</div><div style={{ fontWeight:"bold" }}>{metrics.pm10?.toFixed(1)}</div>
          <div style={{ color:"#2563eb", fontWeight:"bold" }}>Forecast (30m):</div><div style={{ color:"#2563eb", fontWeight:"bold" }}>{metrics.predictedPM?.toFixed(0)}</div>
          <div>Wind Vector:</div><div>{metrics.wind?.name} ({metrics.wind?.angle}°)</div>
          <div>Water Output:</div><div>{(metrics.sprayIntensity * 100)?.toFixed(0)}%</div>
        </div>
        <hr style={{ borderColor:"#cbd5e1", margin:"12px 0" }} />
        <div style={{ fontSize:10, color:"#64748b", marginBottom:10 }}><i>System Autopilot: ENABLED<br/>Simulation Speed: 10x</i></div>
        <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setPaused(p=>!p)} style={{ flex: 1, padding:"8px", cursor:"pointer", background:"#0f172a", color:"white", border:"none", borderRadius:4 }}>{paused ? "RESUME" : "PAUSE"}</button>
            <button onClick={handleRestart} style={{ flex: 1, padding:"8px", cursor:"pointer", background:"#dc2626", color:"white", border:"none", borderRadius:4 }}>RESTART</button>
        </div>
      </div>

      {/* FIX: Camera set to 8, 5, 8 to be closer (zoomed in) */}
      <Canvas camera={{ position:[8, 5, 8], fov:45 }}>
        <color attach="background" args={["#87ceeb"]} />
        <Scene key={simKey} paused={paused} setMetrics={setMetrics} nodes={nodes} onDataUpdate={onDataUpdate} />
      </Canvas>
    </div>
  );
}