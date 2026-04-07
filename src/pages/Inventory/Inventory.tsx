import { useState, Suspense } from 'react';
import { tokens } from '../../lib/tokens';
import { PackageOpen, Printer, Boxes, Map, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Environment } from '@react-three/drei';

function Rack({ position, rotation = [0,0,0], bays = 2, levels = 5, color = '#2b4478', label = "Rack", onClick, isActive }: any) {
  const width = 2.6; // Width per bay
  const depth = 1.0;
  const height = 4.0;
  const totalWidth = width * bays;
  
  const upColor = isActive ? '#10b981' : color;

  const uprights = [];
  const beams = [];
  // Build components geometrically
  for (let i = 0; i <= bays; i++) {
    const xPos = (i * width) - (totalWidth / 2);
    // front-left upright
    uprights.push(<mesh key={`ul_${i}`} position={[xPos, height/2, depth/2 - 0.05]}><boxGeometry args={[0.1, height, 0.1]} /><meshStandardMaterial color={upColor} /></mesh>);
    // back-left upright
    uprights.push(<mesh key={`ub_${i}`} position={[xPos, height/2, -depth/2 + 0.05]}><boxGeometry args={[0.1, height, 0.1]} /><meshStandardMaterial color={upColor} /></mesh>);
    // cross braces
    for (let h = 0.5; h < height; h += 0.8) {
       uprights.push(<mesh key={`uc_${i}_${h}`} position={[xPos, h, 0]} rotation={[0.45, 0, 0]}><boxGeometry args={[0.04, depth, 0.04]} /><meshStandardMaterial color={upColor} /></mesh>);
    }
  }

  for (let bay = 0; bay < bays; bay++) {
    const xCenter = (bay * width) + (width / 2) - (totalWidth / 2);
    for (let l = 1; l <= levels; l++) {
      const yPos = l * (height / (levels + 1));
      // front and back orange beams
      beams.push(<mesh key={`bf_${bay}_${l}`} position={[xCenter, yPos, depth/2]}><boxGeometry args={[width, 0.12, 0.05]} /><meshStandardMaterial color="#eb7023" /></mesh>);
      // wood/wire deck
      beams.push(<mesh key={`sh_${bay}_${l}`} position={[xCenter, yPos + 0.05, 0]}><boxGeometry args={[width - 0.1, 0.02, depth - 0.1]} /><meshStandardMaterial color="#cdb492" transparent opacity={0.8} /></mesh>);
    }
  }

  return (
    <group position={position} rotation={rotation} 
      onClick={(e) => { e.stopPropagation(); onClick?.(label); }} 
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor='pointer'; }} 
      onPointerOut={() => document.body.style.cursor='auto'}
    >
      {uprights}
      {beams}
      {/* Invisible bounding box for click target / raycasting absorption */}
      <mesh position={[0, height/2, 0]} visible={false}>
         <boxGeometry args={[totalWidth, height, depth + 1]} />
         <meshBasicMaterial transparent opacity={0} />
      </mesh>
      
      <Text position={[0, height + 0.4, 0]} fontSize={0.6} color="black" outlineWidth={0.03} outlineColor="white" fontWeight="bold">
         {label}
      </Text>
    </group>
  );
}

function WarehouseMap({ activeRack, setActiveRack }: any) {
  return (
    <div className="w-full h-full bg-brand-bg rounded-2xl overflow-hidden relative border border-brand-border/50 shadow-inner">
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm p-4 rounded-xl border border-brand-border/50 shadow-sm pointer-events-none">
         <h3 className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Live Map 3D</h3>
         <p className="text-sm font-semibold text-brand-primary font-serif">South Camera View</p>
      </div>

      <Canvas camera={{ position: [0, 16, 26], fov: 40 }} shadows>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />
        <Environment preset="city" />
        <OrbitControls 
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true}
          maxPolarAngle={Math.PI / 2 - 0.05} // lock angle to prevent dipping below the concrete floor
        />

        {/* Concrete Warehouse Floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <meshStandardMaterial color="#f0f2f5" />
        </mesh>
        
        {/* Back Wall (South) */}
        <mesh position={[0, 4, -12]} receiveShadow>
           <boxGeometry args={[30, 8, 0.4]} />
           <meshStandardMaterial color="#d1d5db" />
        </mesh>

        {/* Left Wall (West) */}
        <mesh position={[-15, 4, 0]} rotation={[0, Math.PI/2, 0]} receiveShadow>
           <boxGeometry args={[24, 8, 0.4]} />
           <meshStandardMaterial color="#d1d5db" />
        </mesh>

        {/* Right Wall (East) - Rendered transparently so we can see through it from outside */}
        <mesh position={[15, 4, 0]} rotation={[0, Math.PI/2, 0]} receiveShadow>
           <boxGeometry args={[24, 8, 0.4]} />
           <meshStandardMaterial color="#e5e7eb" transparent opacity={0.3} />
        </mesh>

        {/* Dock Door on south wall */}
        <mesh position={[0, 1.5, -11.6]}>
           <boxGeometry args={[3, 3, 0.5]} />
           <meshStandardMaterial color="#9ca3af" />
        </mesh>
        <Text position={[0, 3.5, -11.7]} fontSize={0.8} color="#000" rotation={[0, Math.PI, 0]}>EXIT</Text>

        {/* ====== 3D RACKS (Mapped from SketchUp Layout) ====== */}
        
        {/* South Wall Racks */}
        <Rack position={[-5, 0, -10.5]} bays={2} label="Aisle S-Left" onClick={setActiveRack} isActive={activeRack === 'Aisle S-Left'} />
        <Rack position={[5, 0, -10.5]} bays={2} label="Aisle S-Right" onClick={setActiveRack} isActive={activeRack === 'Aisle S-Right'} />

        {/* East Wall Continuous Racks */}
        <Rack position={[13.5, 0, 0]} rotation={[0, -Math.PI/2, 0]} bays={5} label="Aisle East" onClick={setActiveRack} isActive={activeRack === 'Aisle East'} />

        {/* Center / West Side Parallel Rows */}
        <Rack position={[-3, 0, 2]} rotation={[0, -Math.PI/2, 0]} bays={3} label="Aisle B" onClick={setActiveRack} isActive={activeRack === 'Aisle B'} />
        <Rack position={[-7, 0, 2]} rotation={[0, -Math.PI/2, 0]} bays={3} label="Aisle A" onClick={setActiveRack} isActive={activeRack === 'Aisle A'} />

        {/* Far West Small Rack */}
        <Rack position={[-13.5, 0, -4]} rotation={[0, -Math.PI/2, 0]} bays={2} label="Aisle W-Deep" onClick={setActiveRack} isActive={activeRack === 'Aisle W-Deep'} />

      </Canvas>
    </div>
  );
}

export function Inventory() {
  const [activeTab, setActiveTab] = useState('Map');
  const [activeRack, setActiveRack] = useState<string | null>(null);

  const dummyPallets = [
    { id: 'PAL-9812', client: 'McEvoy Ranch', type: 'Pallet', location: 'Aisle B - Level 1' },
    { id: 'BOX-2321', client: 'AION', type: 'Loose Box', location: 'Aisle East - Level 3' },
    { id: 'PAL-8811', client: 'MGM Resorts', type: 'Pallet', location: 'Aisle S-Right - Level 1' },
    { id: 'BOX-1029', client: 'Verizon', type: 'Loose Box', location: 'Aisle A - Level 2' },
  ];

  const handlePrintLabel = () => {
    window.print();
  };

  return (
    <div className={tokens.layout.container + " h-[100dvh] flex flex-col pt-8"}>
      <div className={tokens.layout.pageHeader + " border-b border-brand-border pb-6 shrink-0"}>
        <div className="flex justify-between items-end w-full">
           <div>
             <h1 className={tokens.typography.h1}>Warehouse Inventory</h1>
             <p className={tokens.typography.bodyMuted + " mt-2 max-w-lg"}>
               Explore the 3D Digital Twin floor map to instantly locate pallets, or print QR thermal load labels.
             </p>
           </div>
           
           <div className="flex bg-brand-bg p-1.5 rounded-xl border border-brand-border shrink-0">
             <button 
               onClick={() => setActiveTab('Map')}
               className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'Map' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
             >
                <Map size={16} /> 3D Overview
             </button>
             <button 
               onClick={() => setActiveTab('Labels')}
               className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'Labels' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
             >
                <QrCode size={16} /> Print Labels
             </button>
           </div>
        </div>
      </div>
      
      <div className="mt-8 flex-1 min-h-[600px] relative pb-8">
        {activeTab === 'Map' && (
           <div className="w-full h-full flex gap-6">
              <div className="flex-1 h-full shadow-[0_4px_24px_-8px_rgba(0,0,0,0.1)] rounded-2xl bg-brand-bg relative cursor-move">
                 <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center font-serif text-brand-secondary text-2xl animate-pulse">Initializing WebGL Engine...</div>}>
                    <WarehouseMap activeRack={activeRack} setActiveRack={setActiveRack} />
                 </Suspense>
              </div>
              
              <div className="w-80 h-full bg-white rounded-card border border-brand-border p-6 shadow-sm flex flex-col shrink-0">
                 <h2 className={tokens.typography.h2}>Zone Inspector</h2>
                 <p className="text-[10px] uppercase font-bold text-brand-secondary mt-1 tracking-widest mb-6">Select a rack payload</p>
                 
                 {activeRack ? (
                   <div className="flex-1 animate-in fade-in slide-in-from-right-4">
                      <div className="bg-brand-primary text-white p-5 rounded-2xl mb-6 shadow-lg">
                         <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Current Location</span>
                         <h3 className="font-serif text-2xl border-b border-white/20 pb-3 mb-3 mt-1 tracking-tight">{activeRack}</h3>
                         <div className="flex items-center gap-2 text-sm font-medium"><Boxes size={16} className="opacity-80"/> 12 Active Pallets</div>
                         <div className="flex items-center gap-2 text-sm font-medium mt-2"><PackageOpen size={16} className="opacity-80"/> 48 Loose Boxes</div>
                      </div>
                      
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-3">Manifest Log</h4>
                      <div className="space-y-3">
                         {dummyPallets.map(p => (
                            <div key={p.id} className="border border-brand-border rounded-xl p-4 hover:bg-brand-bg/50 transition-all cursor-pointer group">
                               <div className="flex justify-between items-center mb-2">
                                  <span className="text-xs font-bold text-brand-primary group-hover:underline uppercase tracking-wider">{p.id}</span>
                                  <span className="text-[9px] font-bold uppercase tracking-widest bg-brand-bg border border-brand-border px-2 py-0.5 rounded text-brand-secondary">{p.type}</span>
                               </div>
                               <p className="font-serif text-[15px] leading-tight text-brand-primary">{p.client}</p>
                            </div>
                         ))}
                      </div>
                   </div>
                 ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 px-4">
                      <Map size={48} className="mb-4 text-brand-secondary stroke-1" />
                      <p className="font-serif text-xl tracking-tight text-brand-primary">No Zone Selected</p>
                      <p className="text-sm text-brand-secondary mt-2">Click an aisle rack on the interactive floor map to instantly inspect its real-time payload contents.</p>
                   </div>
                 )}
              </div>
           </div>
        )}
        
        {activeTab === 'Labels' && (
           <div className="w-full h-full bg-white rounded-card border border-brand-border p-8 shadow-sm overflow-y-auto">
              <div className="max-w-4xl mx-auto">
                 <div className="flex justify-between items-center mb-8">
                    <h2 className={tokens.typography.h2}>QR Label Output Engine</h2>
                    <button onClick={handlePrintLabel} className="bg-brand-primary text-white px-6 py-3 rounded-pill font-bold uppercase tracking-widest text-xs flex items-center gap-2 shadow-md hover:bg-black transition-all hover:scale-[1.02]">
                       <Printer size={16} /> Print Thermal Sheet
                    </button>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-8 print-grid">
                    {dummyPallets.map(p => (
                       <div key={p.id} className="border-[3px] border-black rounded-2xl p-6 bg-white flex print-label shadow-sm transition-shadow h-56">
                          <div className="flex-1 pr-6 flex flex-col justify-between">
                            <div>
                               <img src="/logo.png" alt="WOVN" className="h-6 w-auto mb-5" />
                               <h3 className="font-serif text-[32px] font-bold tracking-tight leading-none mb-2">{p.client}</h3>
                               <p className="text-[10px] uppercase tracking-widest font-bold text-brand-secondary">3PL Kitting Cargo</p>
                            </div>
                            <div>
                               <div className="text-4xl font-black font-sans tracking-tighter mt-4 inline-block border-b-4 border-black pb-1 mb-2">{p.id}</div>
                               <p className="text-sm font-bold uppercase tracking-widest mt-1">LOC: {p.location}</p>
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center justify-center border-l-4 border-dotted border-brand-border/60 pl-8">
                            <div className="bg-white p-2 border-4 border-black inline-block rounded-xl">
                               <QRCode value={`https://app.printshopos.com/inventory/scan?id=${p.id}&loc=${encodeURIComponent(p.location)}`} size={140} />
                            </div>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        )}
      </div>

      <style>{`
         @media print {
            body * { visibility: hidden; }
            .print-grid, .print-grid * { visibility: visible; }
            .print-grid { position: absolute; left: 0; top: 0; width: 100%; gap: 20px; }
            .print-label { page-break-inside: avoid; border: 4px solid black !important; margin-bottom: 20px; border-radius: 12px !important; }
         }
      `}</style>
    </div>
  );
}
