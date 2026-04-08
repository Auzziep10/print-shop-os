import { useState, useEffect, Suspense } from 'react';
import { tokens } from '../../lib/tokens';
import { PackageOpen, Printer, Boxes, Map, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Environment, DragControls } from '@react-three/drei';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, setDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';

function Rack({ position, rotation = [0,0,0], bays = 2, levels = 2, color = '#2b4478', label = "Rack", onClick, isActive, onPalletClick, activePallet, inventory = [], isAddingPallet, addForm }: any) {
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

  if (isAddingPallet && addForm?.zoneType === 'Rack' && addForm?.rackLabel === label) {
      const bay = parseInt(addForm.bay) || 0;
      const level = parseInt(addForm.level) || 0;
      const slot = parseInt(addForm.slot) || -1;
      
      const xCenter = (bay * width) + (width / 2) - (totalWidth / 2);
      const isFloor = (level === 0);
      const beamY = isFloor ? 0 : (level * (height / levels)) - 0.06; 
      const restY = isFloor ? 0 : beamY + 0.06;
      
      const pY = restY + 0.4; // Assuming standard new pallet is height 0.8
      const pX = xCenter + (slot * width / 4);
      
      pallets.push(
        <mesh key="ghost-staging" position={[pX, pY, 0]}>
            <boxGeometry args={[1, 0.8, 1]} />
            <meshStandardMaterial color={addForm.color || "#10b981"} transparent opacity={0.6} emissive={addForm.color || "#10b981"} emissiveIntensity={0.6} depthWrite={false} />
        </mesh>
      );
  }

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

function WarehouseMap({ activeRack, setActiveRack, activePallet, setActivePallet, inventory, warehouse, isAddingPallet, addForm, setAddForm }: any) {
  const rackProps = {
     onClick: setActiveRack,
     activeRack,
     onPalletClick: setActivePallet,
     activePallet,
     isAddingPallet,
     addForm
  };
  
  const [isOrbitEnabled, setIsOrbitEnabled] = useState(true);
  
  const getRackInventory = (zone: string) => inventory.filter((p: any) => p.zone === zone);
  const floorInventory = inventory.filter((p: any) => p.zone === 'Floor');
  
  const isRackHighlighted = (label: string) => {
     if (activeRack === label) return true;
     if (isAddingPallet && addForm?.zoneType === 'Rack' && addForm?.rackLabel === label) return true;
     return false;
  };

  const handleFloorClick = (e: any) => {
     e.stopPropagation();
     if (isAddingPallet) {
         // Snap to nearest 0.5 coordinate for grid alignment
         const snapX = Math.round(e.point.x * 2) / 2;
         const snapZ = Math.round(e.point.z * 2) / 2;
         setAddForm((prev: any) => ({ ...prev, x: snapX, z: snapZ }));
     } else {
         setActiveRack(null); 
         setActivePallet(null); 
     }
  };

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
          enabled={isOrbitEnabled}
          maxPolarAngle={Math.PI / 2 - 0.05} // lock angle to prevent dipping below the concrete floor
        />

        {/* Complete True-Scale Concrete Floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={handleFloorClick} 
              onPointerOver={(e) => { if (isAddingPallet) { e.stopPropagation(); document.body.style.cursor = 'crosshair'; } }}
              onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
          <planeGeometry args={[warehouse?.dimensions?.width || 100, warehouse?.dimensions?.depth || 100]} />
          <meshStandardMaterial color={isAddingPallet ? "#e2e8f0" : "#f0f2f5"} />
        </mesh>
        
        {/* Dynamic Interactive Snapping Grid shown when placing */}
        {isAddingPallet && (
            <group>
               <gridHelper args={[Math.max(warehouse?.dimensions?.width || 40, warehouse?.dimensions?.depth || 40), Math.max(warehouse?.dimensions?.width || 40, warehouse?.dimensions?.depth || 40), '#a1a1aa', '#d4d4d8']} position={[0, 0.02, 0]} />
               {addForm?.zoneType === 'Floor' && (
                  <mesh position={[addForm.x || 0, 0.4, addForm.z || 0]}>
                      <boxGeometry args={[1, 0.8, 1]} />
                      <meshStandardMaterial color={addForm.color || "#10b981"} transparent opacity={0.6} emissive={addForm.color || "#10b981"} emissiveIntensity={0.5} depthWrite={false} />
                  </mesh>
               )}
            </group>
        )}
        
        {/* ======== PERIMETER COMPRESSED WALLS ======== */}
        {warehouse?.dimensions && (
            <group>
                <mesh position={[0, 4, warehouse.dimensions.depth / 2]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[warehouse.dimensions.width, 8, 0.4]} /><meshStandardMaterial color="#d1d5db" transparent opacity={0.3} /></mesh>
                <mesh position={[0, 4, -warehouse.dimensions.depth / 2]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[warehouse.dimensions.width, 8, 0.4]} /><meshStandardMaterial color="#d1d5db" transparent opacity={0.3} /></mesh>
                <mesh position={[-warehouse.dimensions.width / 2, 4, 0]} rotation={[0, Math.PI/2, 0]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[warehouse.dimensions.depth + 0.4, 8, 0.4]} /><meshStandardMaterial color="#d1d5db" transparent opacity={0.3} /></mesh>
                <mesh position={[warehouse.dimensions.width / 2, 4, 0]} rotation={[0, Math.PI/2, 0]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[warehouse.dimensions.depth + 0.4, 8, 0.4]} /><meshStandardMaterial color="#e5e7eb" transparent opacity={0.3} /></mesh>
            </group>
        )}

        {/* ======== DOCK DOORS ======== */}
        {warehouse?.doors?.map((door: any, idx: number) => (
            <group key={`door-${idx}`}>
                <mesh position={door.position} rotation={door.rotation}><boxGeometry args={[3, 3, 0.5]} /><meshStandardMaterial color="#9ca3af" /></mesh>
                <Text position={[door.position[0], door.position[1] + 2, door.position[2] > 0 ? door.position[2] - 0.2 : door.position[2] + 0.2]} fontSize={0.8} color="#000" rotation={door.rotation}>{door.label}</Text>
            </group>
        ))}

        {/* ======== DYNAMIC RACKS ======== */}
        {warehouse?.racks?.map((rack: any) => (
            <Rack key={rack.id} position={rack.position} rotation={rack.rotation || [0,0,0]} bays={rack.bays} levels={rack.levels} label={rack.label} inventory={getRackInventory(rack.label)} isActive={isRackHighlighted(rack.label)} {...rackProps} />
        ))}

        {/* ======== LOOSE FLOOR PALLETS ======== */}
        {floorInventory.map((p: any) => (
            <DragControls 
               key={p.id} 
               axisLock="y" 
               onDragStart={() => setIsOrbitEnabled(false)} 
               onDragEnd={() => setIsOrbitEnabled(true)}
            >
               <FloorPallet pallet={p} activePallet={activePallet} onPalletClick={setActivePallet} onClick={setActiveRack} />
            </DragControls>
        ))}
      </Canvas>
    </div>
  );
}

export const defaultWarehouseBlueprint = {
    id: "wh_default_01",
    name: "Main HQ Warehouse",
    dimensions: { width: 25, depth: 28 },
    doors: [
        { label: "SOUTH DOCK", position: [0, 1.5, 13.6], rotation: [0, 0, 0] },
        { label: "NORTH DOOR", position: [0, 1.5, -13.6], rotation: [0, Math.PI, 0] }
    ],
    racks: [
        { id: "rack_01", label: 'Aisle S-Left', position: [-6.5, 0, 12.5], rotation: [0,0,0], bays: 2, levels: 2 },
        { id: "rack_02", label: 'Aisle S-Right', position: [6.5, 0, 12.5], rotation: [0,0,0], bays: 2, levels: 2 },
        { id: "rack_03", label: 'Aisle West-Main', position: [-11.5, 0, -4.5], rotation: [0, Math.PI/2, 0], bays: 5, levels: 2 },
        { id: "rack_04", label: 'Aisle East-Wall', position: [11.5, 0, -8.5], rotation: [0, -Math.PI/2, 0], bays: 4, levels: 2 },
        { id: "rack_05", label: 'Aisle East-Inner', position: [7.5, 0, -8.5], rotation: [0, -Math.PI/2, 0], bays: 4, levels: 2 },
        { id: "rack_06", label: 'Aisle East-Lower', position: [11.5, 0, 6], rotation: [0, -Math.PI/2, 0], bays: 2, levels: 2 }
    ]
};

const generateInitialInventory = () => {
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
           location: 'Open Floor Zone',
           warehouseId: "wh_default_01"
        });
    });

    // 2. Populate rack pallets (bays/levels/slots) simulating database rows
    const racksToFill = defaultWarehouseBlueprint.racks;

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
                        location: `${rack.label} | Bay ${bay+1} | Level ${level}`,
                        warehouseId: "wh_default_01"
                     });
                  }
               }
            }
        }
    });

    return db;
}

export function Inventory() {
  const [activeTab, setActiveTab] = useState('Map');
  const [activeRack, setActiveRack] = useState<string | null>(null);
  const [activePallet, setActivePallet] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [inventoryDB, setInventoryDB] = useState<any[]>([]);
  const [currentWarehouse, setCurrentWarehouse] = useState<any>(null);

  useEffect(() => {
     // Fetch schemas
     const qSchemas = query(collection(db, 'warehouses'));
     const unsubSchemas = onSnapshot(qSchemas, (snapshot) => {
         if (snapshot.empty) {
             setDoc(doc(db, 'warehouses', defaultWarehouseBlueprint.id), defaultWarehouseBlueprint);
             setCurrentWarehouse(defaultWarehouseBlueprint);
         } else {
             const data = snapshot.docs.map(d => d.data());
             setCurrentWarehouse(data.find((w: any) => w.id === "wh_default_01") || data[0]);
         }
     });

     return () => unsubSchemas();
  }, []);

  useEffect(() => {
     if (!currentWarehouse) return;
     const q = query(collection(db, 'inventory'));
     const unsubscribe = onSnapshot(q, (snapshot) => {
         if (snapshot.empty) {
             console.log("Empty DB detected, seeding initial mockup data...");
             const initial = generateInitialInventory();
             const batch = writeBatch(db);
             initial.forEach(p => {
                 batch.set(doc(db, 'inventory', p.id), p);
             });
             batch.commit();
         } else {
             const data = snapshot.docs.map(d => d.data())
                                       .filter((d: any) => d.warehouseId === currentWarehouse.id);
             setInventoryDB(data);
         }
     });
     
     return () => unsubscribe();
  }, [currentWarehouse]);

  const [isAddingPallet, setIsAddingPallet] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  
  const handleDeletePallet = async (id: string) => {
    setInventoryDB(prevList => prevList.filter(p => p.id !== id));
    setActivePallet(null);
    setDeleteConfirmId(null);
    try {
        await deleteDoc(doc(db, 'inventory', id));
    } catch (err) {
        console.error("Failed to delete from remote DB", err);
    }
  };

  const racksList = [
    { label: 'Aisle S-Left', bays: 2, levels: 2 },
    { label: 'Aisle S-Right', bays: 2, levels: 2 },
    { label: 'Aisle West-Main', bays: 5, levels: 2 },
    { label: 'Aisle East-Wall', bays: 4, levels: 2 },
    { label: 'Aisle East-Inner', bays: 4, levels: 2 },
    { label: 'Aisle East-Lower', bays: 2, levels: 2 }
  ];

  const [addForm, setAddForm] = useState({ client: 'New Client', color: '#10b981', zoneType: 'Floor', x: 0, z: 0, rackLabel: 'Aisle S-Left', bay: 0, level: 0, slot: -1 });

  const handleAddPallet = async (e: any) => {
    e.preventDefault();
    const isFloor = addForm.zoneType === 'Floor';
    const newPallet = {
        id: `PAL-${Math.floor(Math.random() * 9000) + 1000}`,
        type: 'Pallet',
        warehouseId: currentWarehouse?.id || "wh_default_01",
        zone: isFloor ? 'Floor' : addForm.rackLabel,
        client: addForm.client,
        color: addForm.color,
        height: 0.8,
        ...(isFloor ? {
            position: [parseFloat(addForm.x as any) || 0, 0, parseFloat(addForm.z as any) || 0],
            rotation: [0, 0, 0],
            location: `Open Floor Zone (${addForm.x}, ${addForm.z})`
        } : {
            rackSpecs: { bay: parseInt(addForm.bay as any), level: parseInt(addForm.level as any), slot: parseInt(addForm.slot as any) },
            location: `${addForm.rackLabel} | Bay ${parseInt(addForm.bay as any)+1} | Level ${addForm.level}`
        })
    };
    
    setInventoryDB(prevList => [...prevList, newPallet]);
    try {
        await setDoc(doc(db, 'inventory', newPallet.id), newPallet);
    } catch (err) {
        console.error("Failed to write to remote DB", err);
    }
    
    setIsAddingPallet(false);
  };


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
                    {currentWarehouse && (
                        <WarehouseMap 
                            activeRack={activeRack} 
                            setActiveRack={setActiveRack} 
                            activePallet={activePallet} 
                            setActivePallet={setActivePallet} 
                            inventory={inventoryDB} 
                            warehouse={currentWarehouse}
                            isAddingPallet={isAddingPallet} 
                            addForm={addForm} 
                            setAddForm={setAddForm} 
                        />
                    )}
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
                            
                            <button onClick={() => setActiveTab('Labels')} className="w-full mt-4 bg-black text-white px-4 py-3 rounded-lg font-bold uppercase tracking-widest text-xs flex justify-center items-center gap-2 shadow-sm hover:scale-[1.02] transition-transform">
                               <QrCode size={16} /> Print Route Info
                            </button>
                            <button onClick={() => setIsInventoryModalOpen(true)} className="w-full bg-white text-black border border-brand-border px-4 py-3 rounded-lg font-bold uppercase tracking-widest text-xs flex justify-center items-center gap-2 hover:bg-neutral-50 shadow-sm transition-colors mt-2">
                               <PackageOpen size={16} /> Open Inventory View
                            </button>

                            {deleteConfirmId === activePallet.id ? (
                               <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeletePallet(activePallet.id); }} className="w-full mt-2 bg-red-600 text-white px-4 py-3 rounded-lg font-bold uppercase tracking-widest text-xs flex justify-center items-center gap-2 shadow-sm hover:bg-red-700 transition-colors">
                                   Confirm Deletion
                               </button>
                            ) : (
                               <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteConfirmId(activePallet.id); }} className="w-full mt-2 border border-red-200 text-red-600 px-4 py-3 rounded-lg font-bold uppercase tracking-widest text-xs flex justify-center items-center gap-2 shadow-sm hover:bg-red-50 transition-colors">
                                   Delete Payload
                               </button>
                            )}
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
                    ) : isAddingPallet ? (
                      <div className="animate-in fade-in slide-in-from-right-4">
                         <h3 className="font-serif text-xl border-b border-brand-border/50 pb-3 mb-4 tracking-tight flex justify-between items-center">
                            <span>Drop New Payload</span>
                            <div className="flex bg-brand-bg rounded-lg border border-brand-border p-1">
                               <button onClick={(e) => { e.preventDefault(); setAddForm({...addForm, zoneType: 'Floor'}) }} className={`px-2 py-1 text-[9px] uppercase tracking-widest font-bold rounded ${addForm.zoneType === 'Floor' ? 'bg-white shadow-sm' : 'text-brand-secondary'}`}>Floor</button>
                               <button onClick={(e) => { e.preventDefault(); setAddForm({...addForm, zoneType: 'Rack'}) }} className={`px-2 py-1 text-[9px] uppercase tracking-widest font-bold rounded ${addForm.zoneType === 'Rack' ? 'bg-white shadow-sm' : 'text-brand-secondary'}`}>Rack</button>
                            </div>
                         </h3>
                         <form onSubmit={handleAddPallet} className="space-y-4">
                            <div>
                               <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest">Client Name</label>
                               <input type="text" value={addForm.client} onChange={e => setAddForm({...addForm, client: e.target.value})} className="w-full mt-1 p-3 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-brand-primary" />
                            </div>
                            
                            {addForm.zoneType === 'Floor' ? (
                                <div className="grid grid-cols-2 gap-4">
                                   <div>
                                      <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest">X Coordinate</label>
                                      <input type="number" step="0.5" value={addForm.x} onChange={e => setAddForm({...addForm, x: parseFloat(e.target.value)})} className="w-full mt-1 p-3 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-brand-primary" />
                                   </div>
                                   <div>
                                      <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest">Z Coordinate</label>
                                      <input type="number" step="0.5" value={addForm.z} onChange={e => setAddForm({...addForm, z: parseFloat(e.target.value)})} className="w-full mt-1 p-3 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-brand-primary" />
                                   </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                   <div>
                                      <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest">Target Rack</label>
                                      <select value={addForm.rackLabel} onChange={e => setAddForm({...addForm, rackLabel: e.target.value})} className="w-full mt-1 p-3 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-brand-primary">
                                         {racksList.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
                                      </select>
                                   </div>
                                   <div className="grid grid-cols-3 gap-2">
                                      <div>
                                         <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest">Bay</label>
                                         <input type="number" min="0" value={addForm.bay} onChange={e => setAddForm({...addForm, bay: parseInt(e.target.value)})} className="w-full mt-1 p-3 flex-1 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-brand-primary" />
                                      </div>
                                      <div>
                                         <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest">Level</label>
                                         <select value={addForm.level} onChange={e => setAddForm({...addForm, level: parseInt(e.target.value)})} className="w-full mt-1 p-3 flex-1 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-brand-primary">
                                            <option value={0}>0 (Ground)</option>
                                            <option value={1}>1 (Beam)</option>
                                         </select>
                                      </div>
                                      <div>
                                         <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest">Slot</label>
                                         <select value={addForm.slot} onChange={e => setAddForm({...addForm, slot: parseInt(e.target.value)})} className="w-full mt-1 p-3 flex-1 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-brand-primary">
                                            <option value={-1}>Left (-1)</option>
                                            <option value={1}>Right (1)</option>
                                         </select>
                                      </div>
                                   </div>
                                </div>
                            )}

                            <div>
                               <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest">Color Tag</label>
                               <input type="color" value={addForm.color} onChange={e => setAddForm({...addForm, color: e.target.value})} className="w-full h-12 mt-1 rounded-lg border border-brand-border cursor-pointer bg-brand-bg p-1" />
                            </div>
                            <div className="pt-4 flex gap-2">
                               <button type="button" onClick={() => setIsAddingPallet(false)} className="flex-1 bg-brand-bg border border-brand-border text-brand-secondary py-3 rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-white transition-colors">Cancel</button>
                               <button type="submit" className="flex-1 bg-brand-primary text-white py-3 rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-brand-primary/90 transition-colors shadow-sm">Drop in 3D</button>
                            </div>
                         </form>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-80 px-4 pt-12">
                         <Map size={48} className="mb-4 text-brand-secondary stroke-1 opacity-50" />
                         <p className="font-serif text-xl tracking-tight text-brand-primary">No Zone Selected</p>
                         <p className="text-sm text-brand-secondary mt-2 opacity-80">Click an aisle rack or a block to inspect real-time payload contents.</p>
                         
                         <button onClick={() => setIsAddingPallet(true)} className="mt-8 bg-brand-primary text-white px-6 py-2.5 rounded-pill font-bold uppercase tracking-widest text-[10px] shadow-sm mx-auto block hover:bg-black transition-all">
                            + Stage Payload to Floor
                         </button>
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
                    {(activePallet ? [activePallet] : inventoryDB.slice(0, 8)).map((p: any) => (
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

      {/* Full Sheet Modals */}
      {isInventoryModalOpen && activePallet && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 relative">
               <button onClick={() => setIsInventoryModalOpen(false)} className="absolute top-6 right-6 font-bold text-brand-secondary hover:text-black">✕</button>
               <h2 className="font-serif text-3xl font-bold tracking-tight border-b pb-4 mb-6">Manifest Array: {activePallet.id}</h2>
               <p className="text-sm uppercase tracking-widest text-brand-secondary font-bold mb-4 border-l-4 border-brand-primary pl-3 bg-brand-bg py-2 rounded-r">{activePallet.client}</p>
               
               <p className="text-xs font-semibold text-brand-secondary mb-2 uppercase tracking-widest">Contents (Scanned)</p>
               <div className="bg-[#1e1e1e] rounded-lg p-4 font-mono text-[11px] overflow-auto max-h-64 text-green-400 shadow-inner">
                   <p className="opacity-70 mb-2">Connecting to warehouse terminal...</p>
                   <p>[{new Date().toLocaleTimeString()}] - SCANNED: Item 1/42 (SKU: WL-BLK-L)</p>
                   <p>[{new Date().toLocaleTimeString()}] - SCANNED: Item 2/42 (SKU: WL-BLK-M)</p>
                   <p>[{new Date().toLocaleTimeString()}] - SCANNED: Item 3/42 (SKU: WL-WHT-S)</p>
                   <p className="mt-4 text-brand-secondary font-sans italic opacity-60">... 39 additional units properly kitted and shrink-wrapped.</p>
               </div>
               
               <div className="flex gap-4 mt-8">
                   <button onClick={() => setIsInventoryModalOpen(false)} className="flex-1 border border-brand-border text-brand-primary py-3 rounded-lg font-bold uppercase tracking-widest text-[10px] hover:bg-brand-bg transition-colors">Close Log</button>
                   <button className="flex-1 bg-black text-white py-3 rounded-lg font-bold uppercase tracking-widest text-[10px] hover:bg-neutral-800 transition-colors shadow-md">Export to CSV</button>
               </div>
            </div>
         </div>
      )}

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
