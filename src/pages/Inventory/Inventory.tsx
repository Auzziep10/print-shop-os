import { useState, Suspense, useMemo } from 'react';
import { tokens } from '../../lib/tokens';
import { PackageOpen, Printer, Boxes, Map, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Environment } from '@react-three/drei';

function Rack({ position, rotation = [0,0,0], bays = 2, levels = 2, color = '#2b4478', label = "Rack", onClick, isActive, onPalletClick, activePallet, inventory = [] }: any) {
  const width = 2.6; // Width per bay
  const depth = 1.0;
  const height = 2.4; // Shorter vertical uprights for 2-level pallets
  const totalWidth = width * bays;
  
  const upColor = isActive ? '#10b981' : color;

  const uprights: any[] = [];
  const beams: any[] = [];
  const pallets: any[] = [];

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
      // Space beams properly: bottom floor is level 0, then middle, then exactly at the top.
      const yPos = (l * (height / levels)) - 0.06; // minus 0.06 so the top beam is flush with the top of the blue upright
      beams.push(<mesh key={`bf_${bay}_${l}`} position={[xCenter, yPos, depth/2]}><boxGeometry args={[width, 0.12, 0.05]} /><meshStandardMaterial color="#eb7023" /></mesh>);
      beams.push(<mesh key={`bb_${bay}_${l}`} position={[xCenter, yPos, -depth/2]}><boxGeometry args={[width, 0.12, 0.05]} /><meshStandardMaterial color="#eb7023" /></mesh>);
    }
  }

  // Render pallets dynamically from the provided inventory subset for this rack
  inventory.forEach((pallet: any) => {
    if (!pallet.rackSpecs) return;
    const { bay, level, slot } = pallet.rackSpecs;
    if (bay >= bays || level >= levels) return; // Prevent out of bounds rendering if data expands

    const xCenter = (bay * width) + (width / 2) - (totalWidth / 2);
    const isFloor = (level === 0);
    const beamY = isFloor ? 0 : (level * (height / levels)) - 0.06; 
    const restY = isFloor ? 0 : beamY + 0.06;
    
    const pY = restY + pallet.height / 2;
    const pX = xCenter + (slot * width / 4);
    
    const isThisPalletActive = activePallet?.id === pallet.id;

    pallets.push(
      <group 
        key={pallet.id} 
        position={[pX, pY, 0]}
        onClick={(e) => { e.stopPropagation(); onPalletClick?.(pallet); }}
      >
        <mesh position={[0, -pallet.height/2 + 0.07, 0]}>
          <boxGeometry args={[1.0, 0.14, 1.0]} />
          <meshStandardMaterial color="#8b5a2b" emissive={isThisPalletActive ? "#fff" : "#000"} emissiveIntensity={isThisPalletActive ? 0.3 : 0} />
        </mesh>
        <mesh position={[0, 0.07, 0]}>
          <boxGeometry args={[0.95, pallet.height - 0.14, 0.95]} />
          <meshStandardMaterial color={pallet.color} emissive={isThisPalletActive ? "#fff" : "#000"} emissiveIntensity={isThisPalletActive ? 0.2 : 0} />
        </mesh>
      </group>
    );
  });

  return (
    <group position={position} rotation={rotation} 
      onClick={(e) => { e.stopPropagation(); onClick?.(label); onPalletClick?.(null); }} 
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor='pointer'; }} 
      onPointerOut={() => document.body.style.cursor='auto'}
    >
      {uprights}
      {beams}
      {pallets}

      <Text position={[0, height + 0.4, 0]} fontSize={0.6} color="black" outlineWidth={0.03} outlineColor="white" fontWeight="bold">
         {label}
      </Text>
    </group>
  );
}

function FloorPallet({ pallet, onClick, onPalletClick, activePallet }: any) {
  const isThisPalletActive = activePallet?.id === pallet.id;
  const pY = pallet.height / 2;

  return (
    <group position={[pallet.position[0], pallet.position[1] + pY, pallet.position[2]]} rotation={pallet.rotation || [0,0,0]} 
      onClick={(e) => { e.stopPropagation(); onClick?.(null); onPalletClick?.(pallet); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor='pointer'; }}
      onPointerOut={() => document.body.style.cursor='auto'}
    >
      <mesh position={[0, -pallet.height/2 + 0.07, 0]}>
        <boxGeometry args={[1.0, 0.14, 1.0]} />
        <meshStandardMaterial color="#8b5a2b" emissive={isThisPalletActive ? "#fff" : "#000"} emissiveIntensity={isThisPalletActive ? 0.3 : 0} />
      </mesh>
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[0.95, pallet.height - 0.14, 0.95]} />
        <meshStandardMaterial color={pallet.color} emissive={isThisPalletActive ? "#fff" : "#000"} emissiveIntensity={isThisPalletActive ? 0.2 : 0} />
      </mesh>
    </group>
  );
}

function WarehouseMap({ activeRack, setActiveRack, activePallet, setActivePallet, inventory }: any) {
  const rackProps = {
     onClick: setActiveRack,
     activeRack,
     onPalletClick: setActivePallet,
     activePallet
  };
  
  const getRackInventory = (zone: string) => inventory.filter((p: any) => p.zone === zone);
  const floorInventory = inventory.filter((p: any) => p.zone === 'Floor');

  return (
    <div className="w-full h-full bg-brand-bg rounded-2xl overflow-hidden relative border border-brand-border/50 shadow-inner">
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm p-4 rounded-xl border border-brand-border/50 shadow-sm pointer-events-none">
         <h3 className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Live Map 3D</h3>
         <p className="text-sm font-semibold text-brand-primary font-serif">South Camera View</p>
      </div>

      <Canvas camera={{ position: [0, 20, 26], fov: 42 }} shadows>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />
        <Environment preset="city" />
        <OrbitControls 
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true}
          maxPolarAngle={Math.PI / 2 - 0.05} // lock angle to prevent dipping below the concrete floor
        />

        {/* Complete True-Scale Concrete Floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#f0f2f5" />
        </mesh>
        
        {/* ======== PERIMETER COMPRESSED WALLS ======== */}
        <mesh position={[0, 4, 14]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[25, 8, 0.4]} /><meshStandardMaterial color="#d1d5db" transparent opacity={0.3} /></mesh>
        <mesh position={[0, 4, -14]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[25, 8, 0.4]} /><meshStandardMaterial color="#d1d5db" transparent opacity={0.3} /></mesh>
        <mesh position={[-12.5, 4, 0]} rotation={[0, Math.PI/2, 0]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[28, 8, 0.4]} /><meshStandardMaterial color="#d1d5db" transparent opacity={0.3} /></mesh>
        <mesh position={[12.5, 4, 0]} rotation={[0, Math.PI/2, 0]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[28, 8, 0.4]} /><meshStandardMaterial color="#e5e7eb" transparent opacity={0.3} /></mesh>

        {/* ======== DOCK DOORS ======== */}
        <mesh position={[0, 1.5, 13.6]}><boxGeometry args={[3, 3, 0.5]} /><meshStandardMaterial color="#9ca3af" /></mesh>
        <Text position={[0, 3.5, 13.4]} fontSize={0.8} color="#000" rotation={[0, 0, 0]}>SOUTH DOCK</Text>
        <mesh position={[0, 1.5, -13.6]}><boxGeometry args={[3, 3, 0.5]} /><meshStandardMaterial color="#9ca3af" /></mesh>
        <Text position={[0, 3.5, -13.4]} fontSize={0.8} color="#000" rotation={[0, Math.PI, 0]}>NORTH DOOR</Text>

        {/* ======== COMPRESSED 3D RACKS ======== */}
        <Rack position={[-6.5, 0, 12.5]} bays={3} label="Aisle S-Left" inventory={getRackInventory('Aisle S-Left')} isActive={activeRack === 'Aisle S-Left'} {...rackProps} />
        <Rack position={[6.5, 0, 12.5]} bays={3} label="Aisle S-Right" inventory={getRackInventory('Aisle S-Right')} isActive={activeRack === 'Aisle S-Right'} {...rackProps} />
        <Rack position={[-11.5, 0, -4.5]} rotation={[0, Math.PI/2, 0]} bays={5} label="Aisle West-Main" inventory={getRackInventory('Aisle West-Main')} isActive={activeRack === 'Aisle West-Main'} {...rackProps} />

        <Rack position={[11.5, 0, -8.5]} rotation={[0, -Math.PI/2, 0]} bays={4} label="Aisle East-Wall" inventory={getRackInventory('Aisle East-Wall')} isActive={activeRack === 'Aisle East-Wall'} {...rackProps} />
        <Rack position={[7.5, 0, -8.5]} rotation={[0, -Math.PI/2, 0]} bays={4} label="Aisle East-Inner" inventory={getRackInventory('Aisle East-Inner')} isActive={activeRack === 'Aisle East-Inner'} {...rackProps} />
        <Rack position={[11.5, 0, 6]} rotation={[0, -Math.PI/2, 0]} bays={2} label="Aisle East-Lower" inventory={getRackInventory('Aisle East-Lower')} isActive={activeRack === 'Aisle East-Lower'} {...rackProps} />

        {/* ======== LOOSE FLOOR PALLETS ======== */}
        {floorInventory.map((p: any) => <FloorPallet key={p.id} pallet={p} activePallet={activePallet} onPalletClick={setActivePallet} onClick={setActiveRack} />)}
      </Canvas>
    </div>
  );
}

const useDynamicInventory = () => {
  return useMemo(() => {
    const db: any[] = [];
    const clients = ['McEvoy Ranch', 'AION', 'Verizon', 'MGM Resorts', 'WOVN Studio', 'Alo Yoga', 'Nike', 'Tesla'];
    let idCount = 1000;
    
    // 1. Populate specific floor pallets simulating a loaded Open Floor
    const floorConfigs = [
       { position: [0, 0, 0], pColor: "#3b82f6", client: "Nike" },
       { position: [1.5, 0, 0], pColor: "#e5e7eb", client: "Alo Yoga" },
       { position: [0, 0, 1.5], pColor: "#d4a373", client: "Tesla" },
       { position: [-1.5, 0, 0], pColor: "#e5e7eb", client: "AION" },
       { position: [0, 0, -1.5], pColor: "#3b82f6", client: "WOVN Studio" },
       { position: [-4, 0, -2], pColor: "#d4a373", client: "McEvoy Ranch", rotation: [0, Math.PI/6, 0] },
       { position: [-4.5, 0, -0.8], pColor: "#d4a373", client: "MGM Resorts", rotation: [0, Math.PI/4, 0] }
    ];

    floorConfigs.forEach(conf => {
        db.push({
           id: `PAL-${idCount++}`,
           type: 'Loose Box',
           zone: 'Floor',
           client: conf.client,
           color: conf.pColor,
           height: 0.6 + Math.random() * 0.4,
           position: conf.position,
           rotation: conf.rotation || [0,0,0],
           location: 'Open Floor Zone'
        });
    });

    // 2. Populate rack pallets (bays/levels/slots) simulating database rows
    const racksToFill = [
       { label: 'Aisle S-Left', bays: 3, levels: 2 },
       { label: 'Aisle S-Right', bays: 3, levels: 2 },
       { label: 'Aisle West-Main', bays: 5, levels: 2 },
       { label: 'Aisle East-Wall', bays: 4, levels: 2 },
       { label: 'Aisle East-Inner', bays: 4, levels: 2 },
       { label: 'Aisle East-Lower', bays: 2, levels: 2 }
    ];

    racksToFill.forEach(rack => {
        for (let bay=0; bay<rack.bays; bay++) {
            for (let level=0; level<rack.levels; level++) {
               for (let slot of [-1, 1]) {
                  if (Math.random() > 0.4) {
                     const cRand = Math.random();
                     db.push({
                        id: `PAL-${idCount++}`,
                        type: cRand < 0.5 ? 'Loose Box' : 'Pallet',
                        zone: rack.label,
                        client: clients[Math.floor(Math.random() * clients.length)],
                        color: cRand > 0.8 ? '#3b82f6' : (cRand > 0.5 ? '#e5e7eb' : '#d4a373'),
                        height: 0.6 + Math.random() * 0.4,
                        rackSpecs: { bay, level, slot },
                        location: `${rack.label} | Bay ${bay+1} | Level ${level}`
                     });
                  }
               }
            }
        }
    });

    return db;
  }, []);
}

export function Inventory() {
  const [activeTab, setActiveTab] = useState('Map');
  const [activeRack, setActiveRack] = useState<string | null>(null);
  const [activePallet, setActivePallet] = useState<any>(null);

  const inventoryDB = useDynamicInventory();


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
                    <WarehouseMap activeRack={activeRack} setActiveRack={setActiveRack} activePallet={activePallet} setActivePallet={setActivePallet} inventory={inventoryDB} />
                 </Suspense>
              </div>
              
              <div className="w-80 h-full bg-white rounded-card border border-brand-border shadow-sm flex flex-col shrink-0 overflow-hidden relative">
                 <div className="p-6 pb-4 border-b border-brand-border/50 shrink-0">
                    <h2 className={tokens.typography.h2}>Zone Inspector</h2>
                    <p className="text-[10px] uppercase font-bold text-brand-secondary mt-1 tracking-widest">Select a rack payload</p>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto w-full p-6 custom-scrollbar">
                    {activePallet ? (
                      <div className="animate-in fade-in slide-in-from-right-4">
                         <div className="bg-brand-primary text-white p-5 rounded-2xl mb-6 shadow-lg">
                            <div className="flex justify-between items-start mb-2">
                               <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5 rounded text-white/90">
                                  {activePallet.type}
                               </span>
                            </div>
                            <h3 className="font-serif text-3xl font-bold tracking-tight mb-1">{activePallet.id}</h3>
                            <p className="text-white/80 text-xs font-medium uppercase tracking-widest mb-1">{activePallet.client}</p>
                         </div>
                         
                         <div className="space-y-4">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Exact Location</p>
                              <div className="bg-brand-bg p-3 flex flex-col rounded-lg border border-brand-border/50 text-xs font-semibold text-brand-primary break-words">
                                 {activePallet.location}
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Status</p>
                              <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg border border-emerald-200 text-sm font-bold flex gap-2 items-center">
                                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Secure & Scanned
                              </div>
                            </div>
                            
                            <button className="w-full mt-4 bg-black text-white px-4 py-3 rounded-lg font-bold uppercase tracking-widest text-xs flex justify-center items-center gap-2 shadow-sm hover:scale-[1.02] transition-transform">
                               <QrCode size={16} /> Print Route Info
                            </button>
                            <button className="w-full bg-white text-black border border-brand-border px-4 py-3 rounded-lg font-bold uppercase tracking-widest text-xs flex justify-center items-center gap-2 hover:bg-neutral-50 shadow-sm transition-colors mt-2">
                               <PackageOpen size={16} /> Open Inventory View
                            </button>
                         </div>
                      </div>
                    ) : activeRack ? (
                      <div className="animate-in fade-in slide-in-from-right-4">
                         <div className="bg-brand-primary text-white p-5 rounded-2xl mb-6 shadow-lg">
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Current Location</span>
                            <h3 className="font-serif text-2xl border-b border-white/20 pb-3 mb-3 mt-1 tracking-tight">{activeRack}</h3>
                            <div className="flex items-center gap-2 text-sm font-medium"><Boxes size={16} className="opacity-80"/> 12 Active Pallets</div>
                            <div className="flex items-center gap-2 text-sm font-medium mt-2"><PackageOpen size={16} className="opacity-80"/> 48 Loose Boxes</div>
                         </div>
                         
                         <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-3">Manifest Log</h4>
                         <div className="space-y-3 pb-8">
                            {inventoryDB.filter((p: any) => p.zone === activeRack).map((p: any) => (
                               <div key={p.id} onClick={() => setActivePallet(p)} className="border border-brand-border rounded-xl p-4 hover:bg-brand-bg/50 transition-all cursor-pointer group">
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
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-50 px-4 pt-12">
                         <Map size={48} className="mb-4 text-brand-secondary stroke-1" />
                         <p className="font-serif text-xl tracking-tight text-brand-primary">No Zone Selected</p>
                         <p className="text-sm text-brand-secondary mt-2">Click an aisle rack or a block to inspect real-time payload contents.</p>
                      </div>
                    )}
                 </div>
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
                    {inventoryDB.slice(0, 8).map((p: any) => (
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
