import React, { useState } from 'react';
import { Plus, Trash2, Printer, Users, Timer, Wrench, BarChart3, Calculator } from 'lucide-react';

interface CrewMember {
  id: string;
  name: string;
  hrs: number;
}

export function CapacityCalculator() {
  // Crew schedule state
  const [crew, setCrew] = useState<CrewMember[]>([
    { id: '1', name: 'Austin', hrs: 8 },
    { id: '2', name: 'Press operator', hrs: 8 },
  ]);

  // Printer settings state
  const [printers, setPrinters] = useState<number>(1);
  const [fullcnt, setFullcnt] = useState<number>(10);
  const [fullmin, setFullmin] = useState<number>(7.75);
  const [halfcnt, setHalfcnt] = useState<number>(10);
  const [halfmin, setHalfmin] = useState<number>(1);
  const [smallcnt, setSmallcnt] = useState<number>(10);
  const [smallmin, setSmallmin] = useState<number>(0.5);
  const [speedmult, setSpeedmult] = useState<number>(1.0);
  const [runhrs, setRunhrs] = useState<number>(8);
  const [cutmin, setCutmin] = useState<number>(10);

  // Transfers per shirt
  const [fullpershirt, setFullpershirt] = useState<number>(1);
  const [halfpershirt, setHalfpershirt] = useState<number>(0.5);
  const [smallpershirt, setSmallpershirt] = useState<number>(0);

  // Per-garment labor state
  const [presssec, setPresssec] = useState<number>(120);
  const [avgplace, setAvgplace] = useState<number>(1.5);
  const [extraplace, setExtraplace] = useState<number>(0.75);

  // Setup & receiving state
  const [jobs, setJobs] = useState<number>(4);
  const [setupmin, setSetupmin] = useState<number>(15);
  const [recvjob, setRecvjob] = useState<number>(10);
  const [recvgar, setRecvgar] = useState<number>(10);

  // Order estimator state
  const [orderqty, setOrderqty] = useState<number>(100);

  // Helper functions for crew editing
  const addCrewMember = () => {
    setCrew(prev => [...prev, { id: String(Date.now()), name: 'New member', hrs: 8 }]);
  };

  const updateCrewMember = (id: string, field: 'name' | 'hrs', value: string | number) => {
    setCrew(prev =>
      prev.map(m => (m.id === id ? { ...m, [field]: field === 'hrs' ? Math.max(0, Number(value) || 0) : value } : m))
    );
  };

  const removeCrewMember = (id: string) => {
    setCrew(prev => prev.filter(m => m.id !== id));
  };

  // Calculations
  const crewHrs = crew.reduce((acc, m) => acc + (m.hrs || 0), 0);
  const overheadMin = jobs * (setupmin + cutmin + recvjob);
  const perGar = presssec / 60 + Math.max(0, avgplace - 1) * extraplace + recvgar / 60;
  const pressMinAvail = Math.max(0, crewHrs * 60 - overheadMin);
  const crewCap = perGar > 0 ? pressMinAvail / perGar : 0;

  const speed = speedmult || 1;
  const minPerFull = fullcnt > 0 ? (fullmin / fullcnt) / speed : 0;
  const minPerHalf = halfcnt > 0 ? (halfmin / halfcnt) / speed : 0;
  const minPerSmall = smallcnt > 0 ? (smallmin / smallcnt) / speed : 0;

  const shirtPrintMin = fullpershirt * minPerFull + halfpershirt * minPerHalf + smallpershirt * minPerSmall;
  const machMinAvail = printers * runhrs * 60;
  const machCap = shirtPrintMin > 0 ? machMinAvail / shirtPrintMin : 0;
  const transfersPerShirt = fullpershirt + halfpershirt + smallpershirt;

  const cap = Math.floor(Math.min(crewCap, machCap));
  const crewIsBn = crewCap <= machCap;

  const maxRef = Math.max(crewCap, machCap, 1);
  const crewBarPct = Math.min(100, Math.max(0, (crewCap / maxRef) * 100));
  const machBarPct = Math.min(100, Math.max(0, (machCap / maxRef) * 100));
  const limitPct = Math.min(100, Math.max(0, (Math.min(crewCap, machCap) / maxRef) * 100));

  // Order estimator calculations
  const orderLaborHrs = (orderqty * perGar + setupmin + cutmin + recvjob) / 60;
  const orderPrintHrs = printers > 0 ? (orderqty * shirtPrintMin) / 60 / printers : Infinity;
  const orderDays = cap > 0 ? orderqty / cap : Infinity;

  const fmt = (n: number, d: number = 1) =>
    n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });

  const currentDateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-brand-border">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="w-7 h-7 text-brand-primary" />
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-neutral-900 uppercase">
              DTF Daily <span className="text-orange-600">Capacity</span>
            </h1>
          </div>
          <p className="text-xs font-mono text-neutral-500 mt-1">{currentDateStr}</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CREW SCHEDULE */}
        <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-600" />
              <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Crew Schedule</h2>
            </div>
            <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
              Labor
            </span>
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 text-neutral-500 font-mono uppercase tracking-wider">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Hours Today</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {crew.map(m => (
                    <tr key={m.id} className="group">
                      <td className="py-2.5 pr-2">
                        <input
                          type="text"
                          value={m.name}
                          onChange={e => updateCrewMember(m.id, 'name', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-md text-sm font-medium focus:ring-2 focus:ring-brand-primary focus:outline-none bg-neutral-50"
                        />
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={m.hrs}
                            onChange={e => updateCrewMember(m.id, 'hrs', e.target.value)}
                            className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md text-sm font-mono focus:ring-2 focus:ring-brand-primary focus:outline-none bg-neutral-50"
                          />
                          <span className="font-mono text-neutral-400 text-xs">hrs</span>
                        </div>
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        <button
                          onClick={() => removeCrewMember(m.id)}
                          className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="Remove team member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={addCrewMember}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-xs rounded-lg transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Team Member
              </button>

              <div className="font-mono text-xs text-neutral-600">
                Total crew time: <b className="text-sm font-bold text-neutral-900">{fmt(crewHrs)}</b> hrs
              </div>
            </div>
          </div>
        </div>

        {/* PRINTERS */}
        <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Printers</h2>
            </div>
            <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              Machine
            </span>
          </div>

          <div className="p-5 space-y-4 text-xs">
            {/* Number of Printers */}
            <div className="flex items-center justify-between gap-4">
              <label className="font-semibold text-neutral-800">Number of printers</label>
              <input
                type="number"
                min="0"
                step="1"
                value={printers}
                onChange={e => setPrinters(Math.max(0, Number(e.target.value) || 0))}
                className="w-24 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none bg-neutral-50"
              />
            </div>

            {/* Rates Header */}
            <div className="pt-2 border-t border-neutral-100">
              <div className="font-mono font-semibold text-[11px] text-neutral-500 uppercase tracking-wider">
                Transfer rate by size
              </div>
              <span className="text-[11px] text-neutral-400 block mb-2">Count printed / minutes it takes, per printer</span>

              {/* Full Size */}
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="font-medium text-neutral-700 min-w-[70px]">Full size</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    value={fullcnt}
                    onChange={e => setFullcnt(Number(e.target.value) || 1)}
                    className="w-16 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400">per</span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.05"
                    value={fullmin}
                    onChange={e => setFullmin(Number(e.target.value) || 0.1)}
                    className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400 w-8">min</span>
                </div>
              </div>

              {/* Half Size */}
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="font-medium text-neutral-700 min-w-[70px]">Half size</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    value={halfcnt}
                    onChange={e => setHalfcnt(Number(e.target.value) || 1)}
                    className="w-16 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400">per</span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.05"
                    value={halfmin}
                    onChange={e => setHalfmin(Number(e.target.value) || 0.1)}
                    className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400 w-8">min</span>
                </div>
              </div>

              {/* Small */}
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="font-medium text-neutral-700 min-w-[70px]">Small</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    value={smallcnt}
                    onChange={e => setSmallcnt(Number(e.target.value) || 1)}
                    className="w-16 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400">per</span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.05"
                    value={smallmin}
                    onChange={e => setSmallmin(Number(e.target.value) || 0.1)}
                    className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400 w-8">min</span>
                </div>
              </div>
            </div>

            {/* Speed Multiplier, Run Time, Cutting */}
            <div className="pt-2 border-t border-neutral-100 space-y-2.5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="font-semibold text-neutral-800 block">Print speed multiplier</label>
                  <span className="text-[11px] text-neutral-400">1.0 = current speed; 1.25 for faster mode</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0.1"
                    step="0.05"
                    value={speedmult}
                    onChange={e => setSpeedmult(Number(e.target.value) || 1.0)}
                    className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400">×</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="font-semibold text-neutral-800 block">Printer run time</label>
                  <span className="text-[11px] text-neutral-400">Hours printer actually runs today</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={runhrs}
                    onChange={e => setRunhrs(Number(e.target.value) || 0)}
                    className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400">hrs</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="font-semibold text-neutral-800 block">Transfer cutting per order</label>
                  <span className="text-[11px] text-neutral-400">Trimming sheets/rolls before pressing</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={cutmin}
                    onChange={e => setCutmin(Number(e.target.value) || 0)}
                    className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400">min</span>
                </div>
              </div>
            </div>

            {/* Transfers needed per shirt */}
            <div className="pt-2 border-t border-neutral-100">
              <div className="font-mono font-semibold text-[11px] text-neutral-500 uppercase tracking-wider">
                Transfers needed per shirt
              </div>
              <span className="text-[11px] text-neutral-400 block mb-2">How many of each size a typical shirt uses</span>

              <div className="flex items-center justify-between gap-2 py-1">
                <span className="font-medium text-neutral-700">Full size</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={fullpershirt}
                    onChange={e => setFullpershirt(Number(e.target.value) || 0)}
                    className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400 text-[11px]">per shirt</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 py-1">
                <span className="font-medium text-neutral-700">Half size</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={halfpershirt}
                    onChange={e => setHalfpershirt(Number(e.target.value) || 0)}
                    className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400 text-[11px]">per shirt</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 py-1">
                <span className="font-medium text-neutral-700">Small</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={smallpershirt}
                    onChange={e => setSmallpershirt(Number(e.target.value) || 0)}
                    className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                  />
                  <span className="font-mono text-neutral-400 text-[11px]">per shirt</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PER-GARMENT TIME */}
        <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-orange-600" />
              <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Per-garment time</h2>
            </div>
            <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
              Labor
            </span>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="font-semibold text-neutral-800 block">Press &amp; finish per garment</label>
                <span className="text-[11px] text-neutral-400">Stage, press, peel, second press, stack</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={presssec}
                  onChange={e => setPresssec(Number(e.target.value) || 0)}
                  className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                />
                <span className="font-mono text-neutral-400">sec</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="font-semibold text-neutral-800 block">Average placements per garment</label>
                <span className="text-[11px] text-neutral-400">1 = front only; 2 = front + back</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={avgplace}
                  onChange={e => setAvgplace(Number(e.target.value) || 1)}
                  className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="font-semibold text-neutral-800 block">Extra time per added placement</label>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={extraplace}
                  onChange={e => setExtraplace(Number(e.target.value) || 0)}
                  className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                />
                <span className="font-mono text-neutral-400">min</span>
              </div>
            </div>
          </div>
        </div>

        {/* SETUP & RECEIVING */}
        <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-orange-600" />
              <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Setup &amp; Receiving</h2>
            </div>
            <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
              Labor
            </span>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="font-semibold text-neutral-800 block">Jobs run today</label>
                <span className="text-[11px] text-neutral-400">Each job gets its own setup + check-in</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={jobs}
                  onChange={e => setJobs(Number(e.target.value) || 0)}
                  className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                />
                <span className="font-mono text-neutral-400">jobs</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="font-semibold text-neutral-800 block">Setup per job</label>
                <span className="text-[11px] text-neutral-400">Art load, test print, press temp, station prep</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  value={setupmin}
                  onChange={e => setSetupmin(Number(e.target.value) || 0)}
                  className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                />
                <span className="font-mono text-neutral-400">min</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="font-semibold text-neutral-800 block">Receiving per job</label>
                <span className="text-[11px] text-neutral-400">Count blanks, verify sizes/colors, stage</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  value={recvjob}
                  onChange={e => setRecvjob(Number(e.target.value) || 0)}
                  className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                />
                <span className="font-mono text-neutral-400">min</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="font-semibold text-neutral-800 block">Receiving per garment</label>
                <span className="text-[11px] text-neutral-400">Handling time scaling with quantity</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  value={recvgar}
                  onChange={e => setRecvgar(Number(e.target.value) || 0)}
                  className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                />
                <span className="font-mono text-neutral-400">sec</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RESULTS / CAPACITY DISPLAY */}
      <div className="bg-neutral-900 rounded-xl text-white p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <h2 className="text-xl font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-orange-500" />
            Today&apos;s Capacity
          </h2>
        </div>

        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono font-extrabold text-5xl sm:text-6xl text-white tracking-tight">
            {cap.toLocaleString()}
          </span>
          <span className="text-neutral-400 text-sm font-medium">garments / day</span>

          <span
            className={`font-mono text-xs font-bold tracking-wider px-3 py-1 rounded-full uppercase ml-auto ${
              crewIsBn ? 'bg-orange-600 text-white' : 'bg-blue-600 text-white'
            }`}
          >
            BOTTLENECK: {crewIsBn ? 'CREW' : 'PRINTERS'}
          </span>
        </div>

        {/* Progress Gauges */}
        <div className="space-y-4 pt-2">
          {/* Crew Gauge */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-neutral-300">
              <span>CREW can press</span>
              <span className="font-semibold text-orange-400">{fmt(crewCap, 0)} garments</span>
            </div>
            <div className="h-4 bg-neutral-800 rounded-md overflow-hidden relative">
              <div
                className="h-full bg-orange-500 transition-all duration-300 rounded-l-md"
                style={{ width: `${crewBarPct}%` }}
              />
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white opacity-80"
                style={{ left: `${limitPct}%` }}
              />
            </div>
          </div>

          {/* Machine Gauge */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-neutral-300">
              <span>PRINTERS can supply</span>
              <span className="font-semibold text-blue-400">{fmt(machCap, 0)} garments</span>
            </div>
            <div className="h-4 bg-neutral-800 rounded-md overflow-hidden relative">
              <div
                className="h-full bg-blue-500 transition-all duration-300 rounded-l-md"
                style={{ width: `${machBarPct}%` }}
              />
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white opacity-80"
                style={{ left: `${limitPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-4 border-t border-neutral-800">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Crew Hours</div>
            <div className="text-lg font-mono font-semibold text-white">{fmt(crewHrs)} hrs</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Setup + Receiving</div>
            <div className="text-lg font-mono font-semibold text-orange-400">{fmt(overheadMin / 60, 1)} hrs</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Pressing Hours</div>
            <div className="text-lg font-mono font-semibold text-white">{fmt(pressMinAvail / 60, 1)} hrs</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Min / Garment</div>
            <div className="text-lg font-mono font-semibold text-white">{fmt(perGar, 2)} min</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Transfers Needed</div>
            <div className="text-lg font-mono font-semibold text-blue-400">{fmt(machCap * transfersPerShirt, 0)}</div>
          </div>
        </div>

        {/* Insight Note */}
        <p className="text-xs text-neutral-400 pt-2 border-t border-neutral-800/60 leading-relaxed">
          {crewIsBn
            ? `Crew time runs out before the printers do — adding a team member or trimming setup/receiving raises capacity. Printer headroom: ${fmt(
                machCap - crewCap,
                0
              )} garments.`
            : `The printers cap you today — a faster print mode, a second printer, or longer run time raises capacity. Crew headroom: ${fmt(
                crewCap - machCap,
                0
              )} garments.`}
        </p>
      </div>

      {/* ORDER ESTIMATOR */}
      <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-100 pb-3">
          Order Estimator
        </h2>

        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Order Quantity</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                value={orderqty}
                onChange={e => setOrderqty(Math.max(1, Number(e.target.value) || 1))}
                className="w-28 px-3 py-2 border border-neutral-200 rounded-md font-mono text-sm font-medium focus:ring-2 focus:ring-brand-primary focus:outline-none bg-neutral-50"
              />
              <span className="text-xs font-mono text-neutral-400">garments</span>
            </div>
          </div>

          <div className="font-mono text-sm text-neutral-700 pb-1">
            Crew time: <b className="text-neutral-900">{fmt(orderLaborHrs)}</b> hrs &nbsp;&middot;&nbsp; Print time:{' '}
            <b className="text-neutral-900">{isFinite(orderPrintHrs) ? fmt(orderPrintHrs) : '—'}</b> hrs
            &nbsp;&middot;&nbsp;{' '}
            {isFinite(orderDays) ? (
              <span>
                At today&apos;s schedule: <b className="text-neutral-900">{fmt(orderDays)}</b> production day
                {orderDays >= 1.95 ? 's' : ''}
              </span>
            ) : (
              <span className="text-red-600 font-semibold">No capacity with current inputs</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
