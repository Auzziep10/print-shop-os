import { useState, useEffect, Suspense } from 'react';
import { tokens } from '../../lib/tokens';
import { PackageOpen, Printer, Boxes, Map, QrCode, Settings, Upload, Search } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Environment, DragControls } from '@react-three/drei';
import { db, storage } from '../../lib/firebase';
import { collection, query, onSnapshot, setDoc, deleteDoc, doc, writeBatch, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ProductsTab } from './ProductsTab';
import { PalletsTab } from './PalletsTab';

const PayloadMesh = ({ pallet, isThisPalletActive }: any) => {
    if (pallet.type === 'Pallet') {
        const boxes = [];
        const boxSize = 0.28;
        const spacing = 0.02;
        const cols = 3;
        const rows = 3;
        const stackLevels = Math.max(1, Math.floor((pallet.height - 0.14) / (boxSize + spacing)));
        const startY = -pallet.height/2 + 0.14 + (boxSize/2);
        
        const gridW = cols * boxSize + (cols - 1) * spacing;
        const gridD = rows * boxSize + (rows - 1) * spacing;
        
        for (let l = 0; l < stackLevels; l++) {
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    // Add slight random offset to simulate messy stacking
                    const rx = (Math.random() - 0.5) * 0.01;
                    const rz = (Math.random() - 0.5) * 0.01;
                    const x = (c * boxSize) + (c * spacing) - (gridW/2) + (boxSize/2) + rx;
                    const z = (r * boxSize) + (r * spacing) - (gridD/2) + (boxSize/2) + rz;
                    const y = startY + (l * boxSize) + (l * spacing);
                    
                    boxes.push(
                        <mesh key={`${pallet.id}-${l}-${r}-${c}`} position={[x, y, z]}>
                            <boxGeometry args={[boxSize, boxSize, boxSize]} />
                            <meshStandardMaterial color={pallet.color} emissive={isThisPalletActive ? "#fff" : "#000"} emissiveIntensity={isThisPalletActive ? 0.2 : 0} />
                        </mesh>
                    );
                }
            }
        }
        return <group>{boxes}</group>;
    }
    
    return (
       <mesh position={[0, 0.07, 0]}>
         <boxGeometry args={[0.95, pallet.height - 0.14, 0.95]} />
         <meshStandardMaterial color={pallet.color} emissive={isThisPalletActive ? "#fff" : "#000"} emissiveIntensity={isThisPalletActive ? 0.2 : 0} />
       </mesh>
    );
};


function Rack({ position, rotation = [0,0,0], bays = 2, levels = 2, color = '#2b4478', label = "Rack", type = "Pallet", onClick, isActive, onPalletClick, activePallet, inventory = [], isAddingPallet, addForm }: any) {
  const isBoxRack = type === 'Box';
  const width = isBoxRack ? 1.5 : 2.6; // Width per bay
  const depth = isBoxRack ? 0.6 : 1.0;
  const height = isBoxRack ? 1.8 : 2.4; 
  const totalWidth = width * bays;
  
  const baseColor = isBoxRack ? '#9ca3af' : color;
  const upColor = isActive ? '#10b981' : baseColor;
  const beamColor = isBoxRack ? '#d1d5db' : '#eb7023';

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
    for (let h = 0.5; h < height; h += isBoxRack ? 0.5 : 0.8) {
       uprights.push(<mesh key={`uc_${i}_${h}`} position={[xPos, h, 0]} rotation={[0.45, 0, 0]}><boxGeometry args={[0.04, depth, 0.04]} /><meshStandardMaterial color={upColor} /></mesh>);
    }
  }

  for (let bay = 0; bay < bays; bay++) {
    const xCenter = (bay * width) + (width / 2) - (totalWidth / 2);
    
    for (let l = 1; l <= levels; l++) {
      const yPos = (l * (height / levels)) - 0.06;
      beams.push(<mesh key={`bf_${bay}_${l}`} position={[xCenter, yPos, depth/2]}><boxGeometry args={[width, 0.12, 0.05]} /><meshStandardMaterial color={beamColor} /></mesh>);
      beams.push(<mesh key={`bb_${bay}_${l}`} position={[xCenter, yPos, -depth/2]}><boxGeometry args={[width, 0.12, 0.05]} /><meshStandardMaterial color={beamColor} /></mesh>);
      // For box racks, add wire shelf plane
      if (isBoxRack) {
          beams.push(<mesh key={`bw_${bay}_${l}`} position={[xCenter, yPos + 0.05, 0]} rotation={[-Math.PI/2, 0, 0]}><planeGeometry args={[width, depth]} /><meshStandardMaterial color="#e5e7eb" transparent opacity={0.6} side={2} /></mesh>);
      }
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
    
    // Scale payload down slightly if on a box rack
    const scaleFactor = isBoxRack ? 0.6 : 1;
    const pY = restY + (pallet.height * scaleFactor) / 2;
    const pX = xCenter + (slot * width / 4);
    
    const isThisPalletActive = activePallet?.id === pallet.id;

    pallets.push(
      <group 
        key={pallet.id} 
        position={[pX, pY, 0]}
        scale={scaleFactor}
        onClick={(e) => { e.stopPropagation(); onPalletClick?.(pallet); }}
      >
        {!isBoxRack && (
          <mesh position={[0, -pallet.height/2 + 0.07, 0]}>
            <boxGeometry args={[1.0, 0.14, 1.0]} />
            <meshStandardMaterial color="#8b5a2b" emissive={isThisPalletActive ? "#fff" : "#000"} emissiveIntensity={isThisPalletActive ? 0.3 : 0} />
          </mesh>
        )}
        <PayloadMesh pallet={pallet} isThisPalletActive={isThisPalletActive} />
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
      
      const scaleFactor = isBoxRack ? 0.6 : 1;
      const stdHeight = 0.8 * scaleFactor;
      const pY = restY + stdHeight / 2; 
      const pX = xCenter + (slot * width / 4);
      
      pallets.push(
        <mesh key="ghost-staging" position={[pX, pY, 0]}>
            <boxGeometry args={[1 * scaleFactor, stdHeight, 1 * scaleFactor]} />
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
      <PayloadMesh pallet={pallet} isThisPalletActive={isThisPalletActive} />
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
        {warehouse?.dimensions && (() => {
            const wallH = warehouse.dimensions.height || 8;
            return (
              <group>
                  <mesh position={[0, wallH/2, warehouse.dimensions.depth / 2]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[warehouse.dimensions.width, wallH, 0.4]} /><meshStandardMaterial color="#d1d5db" transparent opacity={0.3} /></mesh>
                  <mesh position={[0, wallH/2, -warehouse.dimensions.depth / 2]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[warehouse.dimensions.width, wallH, 0.4]} /><meshStandardMaterial color="#d1d5db" transparent opacity={0.3} /></mesh>
                  <mesh position={[-warehouse.dimensions.width / 2, wallH/2, 0]} rotation={[0, Math.PI/2, 0]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[warehouse.dimensions.depth + 0.4, wallH, 0.4]} /><meshStandardMaterial color="#d1d5db" transparent opacity={0.3} /></mesh>
                  <mesh position={[warehouse.dimensions.width / 2, wallH/2, 0]} rotation={[0, Math.PI/2, 0]} receiveShadow onClick={() => { setActiveRack(null); setActivePallet(null); }}><boxGeometry args={[warehouse.dimensions.depth + 0.4, wallH, 0.4]} /><meshStandardMaterial color="#e5e7eb" transparent opacity={0.3} /></mesh>
              </group>
            );
        })()}

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
  const [mainTab, setMainTab] = useState<'Warehouse' | 'Pallets' | 'Products'>('Products');
  const [activeTab, setActiveTab] = useState('Map');
  const [activeRack, setActiveRack] = useState<string | null>(null);
  const [activePallet, setActivePallet] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [inventoryDB, setInventoryDB] = useState<any[]>([]);
  const [currentWarehouse, setCurrentWarehouse] = useState<any>(null);
  const [allWarehouses, setAllWarehouses] = useState<any[]>([]);

  useEffect(() => {
     // Fetch schemas
     const qSchemas = query(collection(db, 'warehouses'));
     const unsubSchemas = onSnapshot(qSchemas, (snapshot) => {
         if (snapshot.empty) {
             setDoc(doc(db, 'warehouses', defaultWarehouseBlueprint.id), defaultWarehouseBlueprint);
             setCurrentWarehouse(defaultWarehouseBlueprint);
             setAllWarehouses([defaultWarehouseBlueprint]);
         } else {
             const data = snapshot.docs.map(d => d.data());
             setAllWarehouses(data);
             setCurrentWarehouse((prev: any) => {
                 if (prev) {
                     const updated = data.find((w: any) => w.id === prev.id);
                     if (updated) return updated;
                 }
                 return data.find((w: any) => w.id === "wh_default_01") || data[0];
             });
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

  const [palletStats, setPalletStats] = useState({ pallets: 0, boxes: 0, items: 0, skus: [] as string[], names: [] as string[] });

  useEffect(() => {
     const q = query(collection(db, 'pallets'));
     const unsubscribe = onSnapshot(q, (snapshot) => {
         let pCount = 0; let bCount = 0; let iCount = 0;
         const skuSet = new Set<string>();
         const nameSet = new Set<string>();
         
         snapshot.docs.forEach(d => {
             const p = d.data();
             pCount++;
             if (p.boxes) {
                 bCount += p.boxes.length;
                 p.boxes.forEach((b: any) => {
                     if (b.items) {
                         iCount += b.items.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0);
                         b.items.forEach((item: any) => {
                             if (item.sku) skuSet.add(item.sku);
                             if (item.name) nameSet.add(item.name);
                         });
                     }
                 });
             }
         });
         setPalletStats({ 
             pallets: pCount, 
             boxes: bCount, 
             items: iCount,
             skus: Array.from(skuSet).sort(),
             names: Array.from(nameSet).sort()
         });
     });
     return () => unsubscribe();
  }, []);

  const [isAddingPallet, setIsAddingPallet] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  
  const [showFindReplaceModal, setShowFindReplaceModal] = useState(false);
  const [frTargetField, setFrTargetField] = useState<'name' | 'sku' | 'size'>('name');
  const [frSearchTerm, setFrSearchTerm] = useState('');
  const [frReplaceTerm, setFrReplaceTerm] = useState('');
  const [isFrUpdating, setIsFrUpdating] = useState(false);

  const handleFindReplace = async () => {
      if (!frSearchTerm.trim() || !frReplaceTerm.trim()) return;
      setIsFrUpdating(true);
      
      try {
          const snapshot = await getDocs(collection(db, 'pallets'));
          const batchPromises: any[] = [];
          
          snapshot.docs.forEach(d => {
              const pallet = d.data();
              let changed = false;
              
              if (!pallet.boxes) return;
              
              const newBoxes = pallet.boxes.map((box: any) => {
                  let boxChanged = false;
                  if (!box.items) return box;
                  
                  const newItems = box.items.map((item: any) => {
                      const currentValue = (item[frTargetField] || '').toLowerCase();
                      if (currentValue === frSearchTerm.toLowerCase() && item[frTargetField] !== frReplaceTerm) {
                          changed = true;
                          boxChanged = true;
                          return { ...item, [frTargetField]: frReplaceTerm };
                      }
                      return item;
                  });
                  
                  return boxChanged ? { ...box, items: newItems } : box;
              });
              
              if (changed) {
                  batchPromises.push(setDoc(doc(db, 'pallets', pallet.id), { ...pallet, boxes: newBoxes }));
              }
          });
          
          if (batchPromises.length > 0) {
              await Promise.all(batchPromises);
              alert(`Find & Replace complete! Updated ${batchPromises.length} pallets.`);
          } else {
              alert('No items matched the given search term.');
          }
          
          setShowFindReplaceModal(false);
          setFrSearchTerm('');
          setFrReplaceTerm('');
      } catch (err) {
          console.error(err);
          alert('Failed to execute find and replace.');
      }
      
      setIsFrUpdating(false);
  };
  
  const [showBatchImageModal, setShowBatchImageModal] = useState(false);
  const [batchMatchTerm, setBatchMatchTerm] = useState('');
  const [batchMatchType, setBatchMatchType] = useState<'name' | 'sku'>('name');
  const [batchImageUrl, setBatchImageUrl] = useState('');
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [isBatchUploadingImage, setIsBatchUploadingImage] = useState(false);

  const handleBatchUpdateImages = async () => {
      if (!batchMatchTerm.trim() || !batchImageUrl.trim()) return;
      setIsBatchUpdating(true);
      
      try {
          const snapshot = await getDocs(collection(db, 'pallets'));
          const batchPromises: any[] = [];
          
          snapshot.docs.forEach(d => {
              const pallet = d.data();
              let changed = false;
              
              if (!pallet.boxes) return;
              
              const newBoxes = pallet.boxes.map((box: any) => {
                  let boxChanged = false;
                  if (!box.items) return box;
                  
                  const newItems = box.items.map((item: any) => {
                      const matches = batchMatchType === 'sku' 
                          ? (item.sku || '').toLowerCase() === batchMatchTerm.toLowerCase()
                          : (item.name || '').toLowerCase() === batchMatchTerm.toLowerCase();
                          
                      if (matches && item.photoUrl !== batchImageUrl) {
                          changed = true;
                          boxChanged = true;
                          return { ...item, photoUrl: batchImageUrl };
                      }
                      return item;
                  });
                  
                  return boxChanged ? { ...box, items: newItems } : box;
              });
              
              if (changed) {
                  batchPromises.push(setDoc(doc(db, 'pallets', pallet.id), { ...pallet, boxes: newBoxes }));
              }
          });
          
          if (batchPromises.length > 0) {
              await Promise.all(batchPromises);
              alert(`Batch image update complete! Updated ${batchPromises.length} pallets.`);
          } else {
              alert('No items matched the given term, or they already had this image.');
          }
          
          setShowBatchImageModal(false);
          setBatchMatchTerm('');
          setBatchImageUrl('');
      } catch (err) {
          console.error(err);
          alert('Failed to batch update images.');
      }
      
      setIsBatchUpdating(false);
  };
  
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



  const [addForm, setAddForm] = useState({ client: 'New Client', color: '#10b981', zoneType: 'Floor', x: 0, z: 0, rackLabel: 'Aisle S-Left', bay: 0, level: 0, slot: -1 });

  const handleAddPallet = async (e: any) => {
    e.preventDefault();
    const isFloor = addForm.zoneType === 'Floor';
    const activeRackObj = currentWarehouse?.racks?.find((r: any) => r.label === addForm.rackLabel);
    
    // Bounds checking for slotting
    const maxBays = activeRackObj?.bays ?? 1;
    const maxLevels = activeRackObj?.levels ?? 1;
    
    const bayIndex = Math.min(parseInt(addForm.bay as any), maxBays - 1);
    const levelIndex = Math.min(parseInt(addForm.level as any), maxLevels - 1);
    
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
            rackSpecs: { bay: bayIndex, level: levelIndex, slot: parseInt(addForm.slot as any) },
            location: `${addForm.rackLabel} | Bay ${bayIndex+1} | Level ${levelIndex}`
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

  const updateWarehouse = async (updates: any) => {
     if (!currentWarehouse) return;
     const fresh = { ...currentWarehouse, ...updates };
     setCurrentWarehouse(fresh); // optimistic
     try {
         await setDoc(doc(db, 'warehouses', fresh.id), fresh);
     } catch (err) {
         console.error("Failed to commit warehouse layout", err);
     }
  };

  const handleAddRack = () => {
      const newRack = {
          id: `rack_${Math.floor(Math.random() * 10000)}`,
          label: `New Rack ${currentWarehouse.racks.length + 1}`,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          bays: 1,
          levels: 1
      };
      updateWarehouse({ racks: [...currentWarehouse.racks, newRack] });
      setActiveRack(newRack.label);
  };

  const updateActiveRack = (updates: any) => {
      if (!currentWarehouse || activeRack === null) return;
      const newRacks = currentWarehouse.racks.map((r: any) => r.label === activeRack ? { ...r, ...updates } : r);
      if (updates.label) {
          setActiveRack(updates.label); // Sync active context if label strictly changes
      }
      updateWarehouse({ racks: newRacks });
  };

  const handleDeleteRack = () => {
      if (!currentWarehouse || activeRack === null) return;
      if (window.confirm("Are you sure you want to permanently delete this rack? All inventory staged on it will lose its physical coordinate mapping!")) {
          updateWarehouse({ racks: currentWarehouse.racks.filter((r: any) => r.label !== activeRack) });
          setActiveRack(null);
      }
  };

  const handlePrintLabel = () => {
    window.print();
  };

  return (
    <div className={`${tokens.layout.container} h-[100dvh] flex flex-col pt-4 md:pt-5`}>
      <div className="shrink-0 mb-4">
        <div className="flex justify-between items-center w-full">
           <div className="flex items-center gap-4">
               <h1 className={`${tokens.typography.h1} text-2xl md:text-3xl`}>
                 {mainTab === 'Warehouse' ? 'Warehouse Inventory' : 'Product Catalog'}
               </h1>
               
               {mainTab === 'Pallets' && (
                  <div className="hidden md:flex items-center gap-3 ml-2 bg-brand-bg/50 px-3 py-1.5 rounded-lg border border-brand-border/60 shadow-inner">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary"><b className="text-brand-primary text-[11px]">{palletStats.pallets}</b> Pallets</span>
                      <span className="text-brand-border">•</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary"><b className="text-brand-primary text-[11px]">{palletStats.boxes}</b> Boxes</span>
                      <span className="text-brand-border">•</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary"><b className="text-brand-primary text-[11px]">{palletStats.items}</b> Total Items</span>
                  </div>
               )}
               {mainTab === 'Pallets' && (
                  <>
                      <button 
                          onClick={() => setShowBatchImageModal(true)}
                          className="ml-2 hidden md:flex items-center gap-2 px-3 py-1.5 bg-brand-bg border border-brand-border rounded-lg text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:bg-black hover:text-white transition-colors shadow-sm"
                      >
                          Batch Set Thumbnails
                      </button>
                      <button 
                          onClick={() => setShowFindReplaceModal(true)}
                          className="ml-2 hidden md:flex items-center gap-2 px-3 py-1.5 bg-brand-bg border border-brand-border rounded-lg text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:bg-black hover:text-white transition-colors shadow-sm"
                      >
                          <Search size={12} /> Find & Replace
                      </button>
                  </>
               )}
           </div>
           
           <div className="flex bg-brand-bg p-1 rounded-lg border border-brand-border shrink-0 shadow-sm w-[400px]">
             <button 
                onClick={() => setMainTab('Warehouse')}
                className={`flex-1 px-3 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all ${mainTab === 'Warehouse' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
             >
                Warehouse
             </button>
             <button 
                onClick={() => setMainTab('Pallets')}
                className={`flex-1 px-3 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all ${mainTab === 'Pallets' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
             >
                Pallet Inventory
             </button>
             <button 
                onClick={() => setMainTab('Products')}
                className={`flex-1 px-3 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all ${mainTab === 'Products' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
             >
                Products
             </button>
           </div>
        </div>

        {mainTab === 'Warehouse' && (
           <div className="flex justify-between items-center w-full py-4 border-y border-brand-border/50 bg-brand-bg/30 animate-in fade-in mb-2">
              <div className="flex items-center gap-3">
                 <span className="text-[10px] uppercase tracking-widest font-bold text-brand-secondary pl-2">Current Room:</span>
                 <div className="flex items-center bg-white border border-brand-border rounded-lg overflow-hidden h-9 shadow-sm">
                   <select 
                     value={currentWarehouse?.id || ''} 
                     onChange={(e) => {
                         const wh = allWarehouses.find(w => w.id === e.target.value);
                         if (wh) {
                             setCurrentWarehouse(wh);
                             setActiveRack(null);
                             setActivePallet(null);
                             setAddForm(prev => ({ ...prev, rackLabel: wh.racks?.[0]?.label || '' }));
                         }
                     }}
                     className="bg-transparent border-none px-3 py-1 text-sm font-bold text-brand-primary outline-none cursor-pointer pr-8"
                   >
                     {allWarehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                     ))}
                   </select>
                 </div>
                 <button 
                   onClick={() => {
                       const newWh = {
                           id: `wh_${Math.floor(Math.random() * 100000)}`,
                           name: "New Room",
                           dimensions: { width: 20, depth: 20 },
                           doors: [],
                           racks: []
                       };
                       setDoc(doc(db, 'warehouses', newWh.id), newWh);
                       setCurrentWarehouse(newWh);
                   }}
                   className="bg-white text-brand-primary border border-brand-border px-3 h-9 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors shadow-sm"
                 >
                   + Add Room
                 </button>
              </div>

              <div className="flex bg-white p-1 rounded-xl border border-brand-border shrink-0 shadow-sm mr-2">
                 <button 
                   onClick={() => setActiveTab('Map')}
                   className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'Map' ? 'bg-brand-bg text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                 >
                    <Map size={14} /> 3D Map
                 </button>
                 <button 
                   onClick={() => setActiveTab('Labels')}
                   className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'Labels' ? 'bg-brand-bg text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                 >
                    <QrCode size={14} /> Print Labels
                 </button>
                 <button 
                   onClick={() => setActiveTab('Builder')}
                   className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'Builder' ? 'bg-brand-bg text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
                 >
                    <Settings size={14} /> Admin Builder
                 </button>
              </div>
           </div>
        )}
      </div>
      
      <div className="mt-8 flex-1 min-h-[600px] relative pb-8">
        {mainTab === 'Warehouse' && (activeTab === 'Map' || activeTab === 'Builder') && (
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
                 {activeTab === 'Builder' ? (
                     <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4">
                         <div className="p-6 pb-4 border-b border-brand-border/50 shrink-0 bg-brand-bg relative">
                            <h2 className={tokens.typography.h2}>Layout Builder</h2>
                            <p className="text-[10px] uppercase font-bold text-brand-secondary mt-1 tracking-widest">{currentWarehouse?.name || "Loading..."}</p>
                         </div>
                         
                         <div className="flex-1 overflow-y-auto w-full p-6 custom-scrollbar">
                             {activeRack !== null && currentWarehouse?.racks?.find((r:any) => r.label === activeRack) ? (() => {
                                 const r = currentWarehouse.racks.find((r:any) => r.label === activeRack);
                                 return (
                                    <div className="space-y-6">
                                       <div className="flex justify-between items-center mb-2">
                                          <h3 className="font-serif font-bold text-brand-primary text-xl">Rack Editor</h3>
                                          <button onClick={() => setActiveRack(null)} className="text-[10px] uppercase font-bold text-brand-secondary hover:text-black">Back to Map</button>
                                       </div>
                                       
                                       <div className="space-y-4 border-l-2 border-brand-primary pl-4">
                                            <div className="pb-2">
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Rack Variation</label>
                                                <select value={r.type || 'Pallet'} onChange={(e) => updateActiveRack({ type: e.target.value })} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-brand-primary">
                                                   <option value="Pallet">Industrial Pallet Rack</option>
                                                   <option value="Box">Rolling Box Rack</option>
                                                </select>
                                             </div>
                                             
                                            <div>
                                               <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Aisle / Label</label>
                                               <input type="text" value={r.label} onChange={(e) => updateActiveRack({ label: e.target.value })} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-brand-primary" />
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                   <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Num Bays</label>
                                                   <input type="number" min="1" max="20" value={r.bays} onChange={(e) => updateActiveRack({ bays: parseInt(e.target.value) || 1 })} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-brand-primary" />
                                                </div>
                                                <div>
                                                   <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Vertical Levels</label>
                                                   <input type="number" min="1" max="10" value={r.levels} onChange={(e) => updateActiveRack({ levels: parseInt(e.target.value) || 1 })} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-brand-primary" />
                                                </div>
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-3 pt-2">
                                                <div>
                                                   <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Pos X (Lateral)</label>
                                                   <input type="number" step="0.5" value={r.position[0]} onChange={(e) => updateActiveRack({ position: [parseFloat(e.target.value)||0, r.position[1], r.position[2]] })} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-brand-primary" />
                                                </div>
                                                <div>
                                                   <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Pos Z (Depth)</label>
                                                   <input type="number" step="0.5" value={r.position[2]} onChange={(e) => updateActiveRack({ position: [r.position[0], r.position[1], parseFloat(e.target.value)||0] })} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-brand-primary" />
                                                </div>
                                            </div>
                                            
                                            <div>
                                               <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Rotation Y (Degrees)</label>
                                               <input type="number" step="15" value={Math.round(r.rotation[1] * (180/Math.PI))} onChange={(e) => updateActiveRack({ rotation: [0, (parseFloat(e.target.value)||0) * (Math.PI/180), 0] })} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-brand-primary" />
                                            </div>
                                            
                                            <button onClick={handleDeleteRack} className="w-full mt-4 bg-red-50 text-red-600 py-3 rounded-lg border border-red-200 font-bold uppercase tracking-widest text-[10px] shadow-sm hover:bg-red-600 hover:text-white transition-colors">
                                                Delete Rack Forever
                                            </button>
                                       </div>
                                    </div>
                                 );
                             })() : (
                             <div className="space-y-6">
                                <div>
                                    <h3 className="font-serif font-bold text-brand-primary text-xl mb-4">Floor Plan</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                           <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Warehouse Name</label>
                                           <input type="text" value={currentWarehouse?.name || ''} onChange={(e) => updateWarehouse({ name: e.target.value })} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-brand-primary" />
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                               <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Width (X)</label>
                                               <input type="number" value={currentWarehouse?.dimensions?.width || 0} onChange={(e) => updateWarehouse({ dimensions: { ...currentWarehouse.dimensions, width: parseInt(e.target.value) || 1 } })} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-brand-primary" />
                                            </div>
                                            <div>
                                               <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Height (Y)</label>
                                               <input type="number" value={currentWarehouse?.dimensions?.height || 8} onChange={(e) => updateWarehouse({ dimensions: { ...currentWarehouse.dimensions, height: parseInt(e.target.value) || 1 } })} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-brand-primary" />
                                            </div>
                                            <div>
                                               <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1 block">Depth (Z)</label>
                                               <input type="number" value={currentWarehouse?.dimensions?.depth || 0} onChange={(e) => updateWarehouse({ dimensions: { ...currentWarehouse.dimensions, depth: parseInt(e.target.value) || 1 } })} className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-brand-primary" />
                                            </div>
                                        </div>
                                        
                                        {allWarehouses.length > 1 && (
                                           <button 
                                              onClick={async () => {
                                                  if (window.confirm(`Are you sure you want to permanently delete the room "${currentWarehouse.name}"?`)) {
                                                      const toDeleteId = currentWarehouse.id;
                                                      const nextWh = allWarehouses.find(w => w.id !== toDeleteId);
                                                      setCurrentWarehouse(nextWh);
                                                      await deleteDoc(doc(db, 'warehouses', toDeleteId));
                                                  }
                                              }}
                                              className="w-full mt-4 bg-red-50 text-red-600 py-2.5 rounded-lg border border-red-200 font-bold uppercase tracking-widest text-[10px] shadow-sm hover:bg-red-600 hover:text-white transition-colors"
                                           >
                                               Delete Room Entirely
                                           </button>
                                        )}

                                        <button 
                                            onClick={() => {
                                                const newWh = {
                                                    id: `wh_${Math.floor(Math.random() * 100000)}`,
                                                    name: "New Warehouse",
                                                    dimensions: { width: 20, depth: 20, height: 8 },
                                                    doors: [],
                                                    racks: []
                                                };
                                                setDoc(doc(db, 'warehouses', newWh.id), newWh);
                                                setCurrentWarehouse(newWh);
                                            }}
                                            className="w-full mt-3 bg-white text-brand-primary py-2.5 rounded-lg border border-brand-border font-bold uppercase tracking-widest text-[10px] shadow-sm hover:bg-brand-primary hover:text-white transition-colors"
                                        >
                                            + Create New Warehouse
                                        </button>
                                    </div>
                                </div>
                                
                                <hr className="border-brand-border" />
                                
                                <button onClick={handleAddRack} className="w-full bg-brand-primary text-white py-3 rounded-lg font-bold uppercase tracking-widest text-xs shadow hover:bg-brand-primary/90 transition-colors">
                                    + Add Storage Rack
                                </button>
                                
                                <p className="text-xs text-brand-secondary italic text-center">Select a physical rack on the map to modify its properties.</p>
                             </div>
                             )}
                         </div>
                     </div>
                 ) : (
                     <>
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
                                         {currentWarehouse?.racks?.length ? currentWarehouse.racks.map((r: any) => <option key={r.label} value={r.label}>{r.label}</option>) : <option value="">No Racks</option>}
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
                 </>)}
              </div>
           </div>
        )}
        
        {mainTab === 'Warehouse' && activeTab === 'Labels' && (
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
                               <QRCode value={`${window.location.hostname === 'localhost' ? 'https://print-shop-os.vercel.app' : window.location.origin}/inventory/scan?id=${p.id}&loc=${encodeURIComponent(p.location)}`} size={140} />
                            </div>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        )}
        
        {mainTab === 'Products' && (
           <div className="w-full h-full pb-8 animate-in fade-in">
              <ProductsTab />
           </div>
        )}
        
        {mainTab === 'Pallets' && (
           <div className="w-full h-full pb-8 animate-in fade-in">
              <PalletsTab />
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

      {/* Batch Image Modal */}
      {showBatchImageModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col relative border border-brand-border">
                  <h2 className="text-xl font-serif font-bold text-brand-primary mb-1">Batch Update Thumbnails</h2>
                  <p className="text-[11px] text-brand-secondary mb-6 leading-relaxed">
                      Enter an Item Name or SKU, and provide a Photo URL. This tool will scan the entire warehouse (all pallets and boxes) and inject the thumbnail into every matching line item.
                  </p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Match By</label>
                          <div className="flex bg-brand-bg p-1 rounded-lg border border-brand-border">
                              <button onClick={() => setBatchMatchType('name')} className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-colors ${batchMatchType === 'name' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary'}`}>Garment Name</button>
                              <button onClick={() => setBatchMatchType('sku')} className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-colors ${batchMatchType === 'sku' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary'}`}>SKU</button>
                          </div>
                      </div>
                      
                      <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Target {batchMatchType === 'name' ? 'Name' : 'SKU'}</label>
                          <select value={batchMatchTerm} onChange={e => setBatchMatchTerm(e.target.value)} className="w-full text-sm font-semibold p-3 bg-brand-bg border border-brand-border rounded-lg outline-none focus:border-brand-primary cursor-pointer hover:bg-white transition-colors">
                              <option value="">Select {batchMatchType === 'name' ? 'Garment Name' : 'SKU'}...</option>
                              {(batchMatchType === 'name' ? palletStats.names : palletStats.skus).map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                              ))}
                          </select>
                      </div>
                      
                      <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">New Photo URL</label>
                          <div className="flex gap-2">
                              <input type="text" value={batchImageUrl} onChange={e => setBatchImageUrl(e.target.value)} className="w-full text-sm font-semibold p-3 bg-brand-bg border border-brand-border rounded-lg outline-none focus:border-brand-primary" placeholder="https://..." />
                              <button disabled={isBatchUploadingImage} onClick={() => document.getElementById('batch-photo-upload')?.click()} className="shrink-0 px-4 flex items-center justify-center bg-brand-bg border border-brand-border rounded-lg hover:border-brand-primary text-brand-secondary hover:text-brand-primary transition-colors disabled:opacity-50">
                                  {isBatchUploadingImage ? <span className="animate-pulse text-xs font-bold uppercase">...</span> : <Upload size={16} />}
                              </button>
                              <input id="batch-photo-upload" type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setIsBatchUploadingImage(true);
                                  try {
                                      const storageRef = ref(storage, `inventory/batch/${Date.now()}_${file.name}`);
                                      await uploadBytes(storageRef, file);
                                      const url = await getDownloadURL(storageRef);
                                      setBatchImageUrl(url);
                                  } catch (err) {
                                      console.error("Upload failed", err);
                                      alert("Failed to upload image");
                                  } finally {
                                      setIsBatchUploadingImage(false);
                                      e.target.value = '';
                                  }
                              }} />
                          </div>
                      </div>
                  </div>
                  
                  <div className="flex gap-3 justify-end mt-8">
                      <button onClick={() => setShowBatchImageModal(false)} className="px-5 py-2.5 text-xs font-bold uppercase text-brand-secondary hover:text-black transition-colors rounded-lg">Cancel</button>
                      <button onClick={handleBatchUpdateImages} disabled={isBatchUpdating} className={`px-6 py-2.5 bg-brand-primary text-white font-bold uppercase tracking-widest text-xs rounded-lg shadow-md transition-all ${isBatchUpdating ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black hover:-translate-y-0.5'}`}>
                          {isBatchUpdating ? 'Updating...' : 'Update Inventory'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Find & Replace Modal */}
      {showFindReplaceModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col relative border border-brand-border">
                  <h2 className="text-xl font-serif font-bold text-brand-primary mb-1">Find & Replace</h2>
                  <p className="text-[11px] text-brand-secondary mb-6 leading-relaxed">
                      This tool will scan the entire warehouse (all pallets and boxes) and perfectly replace any exact matches of the search term.
                  </p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Target Field</label>
                          <div className="flex bg-brand-bg p-1 rounded-lg border border-brand-border">
                              <button onClick={() => setFrTargetField('name')} className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-colors ${frTargetField === 'name' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary'}`}>Garment Name</button>
                              <button onClick={() => setFrTargetField('sku')} className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-colors ${frTargetField === 'sku' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary'}`}>SKU</button>
                              <button onClick={() => setFrTargetField('size')} className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-colors ${frTargetField === 'size' ? 'bg-white shadow-sm text-brand-primary' : 'text-brand-secondary'}`}>Size</button>
                          </div>
                      </div>
                      
                      <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Search For ({frTargetField})</label>
                          <input type="text" value={frSearchTerm} onChange={e => setFrSearchTerm(e.target.value)} className="w-full text-sm font-semibold p-3 bg-brand-bg border border-brand-border rounded-lg outline-none focus:border-brand-primary" placeholder="e.g. Old Value" />
                      </div>
                      
                      <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Replace With</label>
                          <input type="text" value={frReplaceTerm} onChange={e => setFrReplaceTerm(e.target.value)} className="w-full text-sm font-semibold p-3 bg-brand-bg border border-brand-border rounded-lg outline-none focus:border-brand-primary" placeholder="e.g. New Value" />
                      </div>
                  </div>
                  
                  <div className="flex gap-3 justify-end mt-8">
                      <button onClick={() => setShowFindReplaceModal(false)} className="px-5 py-2.5 text-xs font-bold uppercase text-brand-secondary hover:text-black transition-colors rounded-lg">Cancel</button>
                      <button onClick={handleFindReplace} disabled={isFrUpdating} className={`px-6 py-2.5 bg-brand-primary text-white font-bold uppercase tracking-widest text-xs rounded-lg shadow-md transition-all ${isFrUpdating ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black hover:-translate-y-0.5'}`}>
                          {isFrUpdating ? 'Updating...' : 'Replace All'}
                      </button>
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
