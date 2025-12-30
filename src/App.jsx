import { useEffect, useState, useRef } from "react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { Camera, Plus, Download, Activity, Wind, Server, AlertTriangle, MapPin, X, CheckCircle2, Box, BarChart2, LayoutDashboard, PieChart, Map } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import DustSimulation from "./components/dust-sim";

function cn(...inputs) { return twMerge(clsx(inputs)); }

const STATUS_CONFIG = {
  good: { color: "#10B981", label: "Good", bg: "bg-emerald-500/20", border: "border-emerald-500/50", text: "text-emerald-400" },
  moderate: { color: "#F59E0B", label: "Moderate", bg: "bg-amber-500/20", border: "border-amber-500/50", text: "text-amber-400" },
  unhealthy: { color: "#EF4444", label: "Unhealthy", bg: "bg-red-500/20", border: "border-red-500/50", text: "text-red-400" },
  hazardous: { color: "#7F1D1D", label: "Hazardous", bg: "bg-rose-900/40", border: "border-rose-500", text: "text-rose-500" },
};

const INITIAL_DATA = {
  system_status: "OPTIMAL",
  timestamp: new Date().toISOString(),
  nodes: [
    { id: "DV-NODE-01", location: "North Gate Sector", pm25: 45.2, pm10: 180.5, predicted_pm10: 265.2, camera_detection: { detected: true, severity: 0.8 }, status: "unhealthy", x: -7, z: -7 },
    { id: "DV-NODE-02", location: "East Construction Zone", pm25: 12.0, pm10: 35.5, predicted_pm10: 38.0, camera_detection: { detected: false, severity: 0 }, status: "good", x: 7, z: 7 },
  ],
  recent_logs: [
    { id: 1, time: new Date().toLocaleTimeString(), type: "SUCCESS", message: "System Online. Connected to Digital Twin." }
  ],
};

function getStatus(pm10) {
  if (pm10 < 50) return "good";
  if (pm10 < 150) return "moderate";
  if (pm10 < 250) return "unhealthy";
  return "hazardous";
}

const GlassCard = ({ children, className, hover = false }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={hover ? { scale: 1.01, backgroundColor: "rgba(255,255,255,0.07)" } : {}} className={cn("backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl transition-colors", className)}>{children}</motion.div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/90 border border-slate-700 p-3 rounded-lg shadow-2xl backdrop-blur-md">
        <p className="text-slate-400 text-xs mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }} className="text-sm font-mono mb-1">
            {entry.name}: <span className="font-bold">{entry.value.toFixed(1)}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const StatCard = ({ title, value, icon: Icon, trend }) => (
  <GlassCard hover className="flex flex-col justify-between h-32 relative overflow-hidden group">
    <div className="absolute -right-4 -top-4 bg-gradient-to-br from-cyan-500/20 to-transparent w-24 h-24 rounded-full blur-2xl group-hover:bg-cyan-500/30 transition-all" />
    <div className="flex justify-between items-start z-10">
      <div><p className="text-slate-400 text-sm font-medium uppercase tracking-wider">{title}</p><h3 className="text-3xl font-bold text-white mt-2 tracking-tight">{value}</h3></div>
      <div className="p-2 bg-white/5 rounded-lg text-cyan-400"><Icon size={20} /></div>
    </div>
    {trend && <p className="text-xs text-slate-500 mt-2 font-mono">{trend}</p>}
  </GlassCard>
);

export default function App() {
  const [data, setData] = useState(INITIAL_DATA);
  const [chartData, setChartData] = useState([]);
  const [futureData, setFutureData] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newNode, setNewNode] = useState({ id: "", location: "" });
  const [activeTab, setActiveTab] = useState("dashboard"); 
  const logsEndRef = useRef(null);

  const [simStats, setSimStats] = useState({ pm10: 64, predicted: 65, wind: { angle: 0, name: 'N' } });
  const lastLogTime = useRef(0); 
  const isHazardous = useRef(false);

  const ALERT_THRESHOLD = 40; 
  const CHART_Y_DOMAIN = [0, 120];

  const handleSimUpdate = (stats) => {
    setSimStats(stats); 

    const now = Date.now();
    const currentPM = stats.pm10;
    
    // FIX: Reduced Multiplier to 1.05 (5% margin) as requested
    // Forecast = Actual * 1.05 + Small Random Noise
    let calculatedForecast = (currentPM * 1.05) + (Math.random() * 3 - 1.5);
    
    // Safety check to prevent it dropping below actual by accident
    if (calculatedForecast < currentPM) calculatedForecast = currentPM + 0.5;

    const currentForecast = calculatedForecast;
    
    // --- 1. STABLE FUTURE FORECAST ---
    const futurePoints = [];
    futurePoints.push({ time: "Now", predicted: currentForecast, name: "Forecast" }); 

    let projectedPM = currentForecast;
    const windImpact = Math.sin((stats.wind?.angle || 0) * (Math.PI / 180)); 
    
    for (let i = 1; i <= 15; i++) {
        projectedPM = projectedPM + (windImpact * 1.5) + (Math.random() * 1 - 0.5); 
        if(projectedPM < 0) projectedPM = 0;
        
        const futureTime = new Date(now + i * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        futurePoints.push({ time: futureTime, predicted: projectedPM, name: "Forecast" });
    }
    setFutureData(futurePoints);

    // --- 2. LOGGING LOGIC ---
    let logToAdd = null;

    if (currentForecast > ALERT_THRESHOLD) {
        isHazardous.current = true;
        if (now - lastLogTime.current > 4000) {
            logToAdd = { 
                id: now, 
                time: new Date().toLocaleTimeString(), 
                type: "ALERT", 
                message: `PREDICTION: High Dust Inbound (${currentForecast.toFixed(0)} µg/m³)` 
            };
            lastLogTime.current = now;
        }
    } 
    else {
        if (isHazardous.current === true) {
            logToAdd = { 
                id: now, 
                time: new Date().toLocaleTimeString(), 
                type: "SUCCESS", 
                message: `Mitigation Complete. Air Quality Stabilized.` 
            };
            isHazardous.current = false; 
            lastLogTime.current = now;
        }
    }

    // --- 3. UPDATE STATE ---
    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setChartData((prev) => [...prev, { time: timeLabel, pm10: currentPM, forecast: currentForecast }].slice(-40));

    setData((prev) => {
        let newLogs = [...prev.recent_logs];
        if (logToAdd) newLogs.push(logToAdd);
        if(newLogs.length > 50) newLogs.shift();

        const updatedNodes = prev.nodes.map((n) => ({
            ...n,
            pm10: currentPM + (Math.random() * 20 - 10),
            status: getStatus(currentPM),
        }));

        return { ...prev, timestamp: new Date().toISOString(), nodes: updatedNodes, recent_logs: newLogs };
    });
  };

  const handleAddSensor = () => {
    if(!newNode.id || !newNode.location) return;
    const randomX = (Math.random() - 0.5) * 18; const randomZ = (Math.random() - 0.5) * 18; 
    setData((d) => ({
      ...d, nodes: [...d.nodes, { id: newNode.id, location: newNode.location, pm25: 15, pm10: 30, predicted_pm10: 45, camera_detection: { detected: false }, status: "good", x: randomX, z: randomZ }],
    }));
    setIsModalOpen(false); setNewNode({ id: "", location: "" });
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-200 font-sans selection:bg-cyan-500/30">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex h-screen overflow-hidden">
        
        <aside className="w-64 bg-slate-900/50 backdrop-blur-xl border-r border-white/5 flex flex-col p-6 gap-8">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20"><Activity className="text-white" size={18} /></div>
            <h1 className="text-xl font-bold tracking-tight text-white">Dust<span className="text-cyan-400">Vision</span></h1>
          </div>
          
          <nav className="flex flex-col gap-2">
            <button onClick={() => setActiveTab('dashboard')} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'dashboard' ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "hover:bg-white/5 text-slate-400 hover:text-white")}>
                <LayoutDashboard size={18} /> Dashboard
            </button>
            <button onClick={() => setActiveTab('analytics')} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'analytics' ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "hover:bg-white/5 text-slate-400 hover:text-white")}>
                <PieChart size={18} /> Analytics
            </button>
            <button onClick={() => setActiveTab('map')} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all", activeTab === 'map' ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "hover:bg-white/5 text-slate-400 hover:text-white")}>
                <MapPin size={18} /> Map View
            </button>
          </nav>
          
          <div className="mt-auto">
             <button onClick={() => setIsModalOpen(true)} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-cyan-900/20 transition-all active:scale-95">
              <Plus size={18} /> Deploy Sensor
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-slate-900/30 backdrop-blur-sm">
            <div>
                <h2 className="text-xl font-semibold text-white">
                    {activeTab === 'dashboard' ? "Real-time Monitoring" : activeTab === 'analytics' ? "Deep Analytics" : "Map View"}
                </h2>
                <p className="text-xs text-slate-500 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/> System Operational • Last Sync: {new Date().toLocaleTimeString()}</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 text-sm transition-colors"><Download size={16} /> Export Data</button>
          </header>

          <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Avg PM10 Level" value={simStats.pm10.toFixed(0)} icon={Wind} trend="Real-time from Digital Twin" />
              <StatCard title="Active Nodes" value={data.nodes.length} icon={Server} trend="100% Uptime" />
              <StatCard title="Alerts (24h)" value={data.recent_logs.filter(l => l.type === 'ALERT').length} icon={AlertTriangle} trend="Requires attention" />
              <StatCard title="Mitigation Rate" value="94%" icon={CheckCircle2} trend="System Efficiency" />
            </div>

            {/* DASHBOARD TAB */}
            <div className={cn("grid grid-cols-12 gap-6 h-[500px]", activeTab === 'dashboard' ? "" : "hidden")}>
                <GlassCard className="col-span-8 flex flex-col p-0 overflow-hidden relative">
                    <div className="w-full h-full">
                        <DustSimulation nodes={data.nodes} onDataUpdate={handleSimUpdate} />
                    </div>
                </GlassCard>

                <GlassCard className="col-span-4 flex flex-col overflow-hidden">
                    <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold text-white">Live Node Feed</h3><span className="text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-400">{data.nodes.length} Online</span></div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                    <AnimatePresence>{data.nodes.map((node) => {
                        const status = STATUS_CONFIG[node.status];
                        return (
                            <motion.div key={node.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className={cn("p-4 rounded-xl border transition-all relative overflow-hidden group", status.bg, status.border)}>
                            <div className="flex justify-between items-start relative z-10"><div className="flex items-start gap-3"><div className={cn("p-2 rounded-lg bg-black/20", status.text)}><MapPin size={18} /></div><div><h4 className="font-bold text-white text-sm">{node.id}</h4><p className="text-xs text-slate-300 opacity-80">{node.location}</p></div></div></div>
                            <div className="mt-3 flex items-end justify-between relative z-10"><div><p className="text-[10px] uppercase text-slate-400 font-semibold">PM10 Level</p><p className="text-2xl font-bold text-white leading-none">{node.pm10.toFixed(1)}</p></div><div className={cn("text-xs font-bold px-2 py-1 rounded border", status.text, status.border)}>{status.label}</div></div>
                            </motion.div>
                        );
                    })}</AnimatePresence>
                    </div>
                </GlassCard>
            </div>

            {/* ANALYTICS TAB */}
            {activeTab === 'analytics' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[500px]">
                     {/* CHART 1: Real-time Variance */}
                     <GlassCard className="flex flex-col relative h-full">
                        <div className="flex justify-between items-center mb-6">
                            <div><h3 className="text-lg font-semibold text-white">Real-Time Variance</h3><p className="text-sm text-slate-400">Actual vs Predicted (Last 60s)</p></div>
                        </div>
                        <div className="flex-1 w-full min-h-0">
                             <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                  <defs><linearGradient id="colorPm" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient><linearGradient id="colorFc" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22D3EE" stopOpacity={0.3}/><stop offset="95%" stopColor="#22D3EE" stopOpacity={0}/></linearGradient></defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.3} />
                                  <XAxis dataKey="time" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} domain={CHART_Y_DOMAIN} />
                                  <Tooltip content={<CustomTooltip />} />
                                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                  <Area name="Forecast" type="monotone" dataKey="forecast" stroke="#22D3EE" strokeWidth={2} strokeDasharray="5 5" fill="url(#colorFc)" animationDuration={1000} />
                                  <Area name="Actual PM10" type="monotone" dataKey="pm10" stroke="#10B981" strokeWidth={2} fill="url(#colorPm)" animationDuration={1000} />
                                </AreaChart>
                              </ResponsiveContainer>
                        </div>
                    </GlassCard>

                    {/* CHART 2: Future Forecast (15 Mins) */}
                    <GlassCard className="flex flex-col relative h-full">
                        <div className="flex justify-between items-center mb-6">
                            <div><h3 className="text-lg font-semibold text-white">15-Minute Forecast</h3><p className="text-sm text-slate-400">Wind-Adjusted Trajectory</p></div>
                        </div>
                        <div className="flex-1 w-full min-h-0">
                             <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={futureData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.3} />
                                  <XAxis dataKey="time" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} domain={CHART_Y_DOMAIN} />
                                  <Tooltip content={<CustomTooltip />} />
                                  <Line name="Forecast" type="monotone" dataKey="predicted" stroke="#F59E0B" strokeWidth={3} dot={false} animationDuration={500} />
                                  <ReferenceLine y={40} stroke="#EF4444" strokeDasharray="3 3" label={{ value: 'THRESHOLD', fill: '#EF4444', fontSize: 10 }} />
                                </LineChart>
                              </ResponsiveContainer>
                        </div>
                    </GlassCard>
                </div>
            )}

            {/* MAP VIEW TAB */}
            {activeTab === 'map' && (
                <div className="h-[500px] flex flex-col items-center justify-center text-slate-500 gap-4">
                    <div className="p-4 bg-slate-800/50 rounded-full border border-white/5">
                        <Map size={48} className="text-slate-600" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-white mb-1">Under Development</h3>
                        <p className="text-sm text-slate-400">This module is part of the Phase 2 rollout.</p>
                    </div>
                </div>
            )}

            {/* SYSTEM LOGS */}
            <GlassCard className="h-64 flex flex-col">
                <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2"><div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" /> System Logs</h3>
                <div className="flex-1 overflow-y-auto font-mono text-xs space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                    <AnimatePresence>
                        {data.recent_logs.map((log) => (
                            <motion.div key={log.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex gap-3 border-b border-white/5 pb-2 last:border-0">
                                <span className="text-slate-500 min-w-[80px]">{log.time}</span>
                                <span className={cn("font-bold min-w-[60px]", 
                                    log.type === 'ALERT' ? 'text-red-400' : 
                                    log.type === 'SUCCESS' ? 'text-emerald-400' : 
                                    log.type === 'ACTION' ? 'text-cyan-400' : 'text-slate-400'
                                )}>{log.type}</span>
                                <span className="text-slate-300">{log.message}</span>
                            </motion.div>
                        ))}
                        <div ref={logsEndRef} />
                    </AnimatePresence>
                </div>
            </GlassCard>
          </div>
        </main>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-slate-900 border border-white/10 p-6 rounded-2xl w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-white">Deploy New Sensor</h3><button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button></div>
                <div className="space-y-4">
                    <div><label className="block text-xs uppercase text-slate-500 font-bold mb-2">Node Identifier</label><input value={newNode.id} onChange={(e) => setNewNode({...newNode, id: e.target.value})} placeholder="e.g. DV-NODE-03" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white outline-none" /></div>
                    <div><label className="block text-xs uppercase text-slate-500 font-bold mb-2">Physical Location</label><input value={newNode.location} onChange={(e) => setNewNode({...newNode, location: e.target.value})} placeholder="e.g. South Perimeter" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white outline-none" /></div>
                    <button onClick={handleAddSensor} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg mt-2 transition-colors">Activate Node</button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}