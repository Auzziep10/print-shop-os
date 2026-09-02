import { useState } from 'react';
import {
  Plus,
  Trash2,
  Printer,
  Users,
  Timer,
  Wrench,
  BarChart3,
  Calculator,
  Palette,
  Sparkles,
  Layers,
  Scissors,
} from 'lucide-react';

interface CrewMember {
  id: string;
  name: string;
  hrs: number;
}

export function CapacityCalculator() {
  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<'dtf' | 'screen' | 'embroidery'>('dtf');

  /* ================================================================== */
  /* TAB 1: DTF PRINTING STATE                                         */
  /* ================================================================== */
  const [dtfCrew, setDtfCrew] = useState<CrewMember[]>([
    { id: '1', name: 'Austin', hrs: 8 },
    { id: '2', name: 'Press operator', hrs: 8 },
  ]);
  const [dtfPrinters, setDtfPrinters] = useState<number>(1);
  const [dtfFullcnt, setDtfFullcnt] = useState<number>(10);
  const [dtfFullmin, setDtfFullmin] = useState<number>(7.75);
  const [dtfHalfcnt, setDtfHalfcnt] = useState<number>(10);
  const [dtfHalfmin, setDtfHalfmin] = useState<number>(1);
  const [dtfSmallcnt, setDtfSmallcnt] = useState<number>(10);
  const [dtfSmallmin, setDtfSmallmin] = useState<number>(0.5);
  const [dtfSpeedmult, setDtfSpeedmult] = useState<number>(1.0);
  const [dtfRunhrs, setDtfRunhrs] = useState<number>(8);
  const [dtfCutmin, setDtfCutmin] = useState<number>(10);

  const [dtfFullpershirt, setDtfFullpershirt] = useState<number>(1);
  const [dtfHalfpershirt, setDtfHalfpershirt] = useState<number>(0.5);
  const [dtfSmallpershirt, setDtfSmallpershirt] = useState<number>(0);

  const [dtfPresssec, setDtfPresssec] = useState<number>(120);
  const [dtfAvgplace, setDtfAvgplace] = useState<number>(1.5);
  const [dtfExtraplace, setDtfExtraplace] = useState<number>(0.75);

  const [dtfJobs, setDtfJobs] = useState<number>(4);
  const [dtfSetupmin, setDtfSetupmin] = useState<number>(15);
  const [dtfRecvjob, setDtfRecvjob] = useState<number>(10);
  const [dtfRecvgar, setDtfRecvgar] = useState<number>(10);

  const [dtfOrderqty, setDtfOrderqty] = useState<number>(100);

  /* ================================================================== */
  /* TAB 2: SCREEN PRINTING STATE                                       */
  /* ================================================================== */
  const [spCrew, setSpCrew] = useState<CrewMember[]>([
    { id: '1', name: 'Press Operator', hrs: 8 },
    { id: '2', name: 'Catcher / Stacker', hrs: 8 },
    { id: '3', name: 'Ink & Screen Tech', hrs: 6 },
  ]);
  const [spAutoPresses, setSpAutoPresses] = useState<number>(1);
  const [spAutoSpeed, setSpAutoSpeed] = useState<number>(500); // garments/hr
  const [spManualPresses, setSpManualPresses] = useState<number>(1);
  const [spManualSpeed, setSpManualSpeed] = useState<number>(80); // garments/hr
  const [spRunHrs, setSpRunHrs] = useState<number>(7.5);

  const [spJobs, setSpJobs] = useState<number>(3);
  const [spColorsPerJob, setSpColorsPerJob] = useState<number>(3);
  const [spSetupPerScreenMin, setSpSetupPerScreenMin] = useState<number>(8); // min per screen setup & reg
  const [spBreakdownMin, setSpBreakdownMin] = useState<number>(10);
  const [spInkMixMin, setSpInkMixMin] = useState<number>(10);

  const [spLoadSec, setSpLoadSec] = useState<number>(10);
  const [spOffloadSec, setSpOffloadSec] = useState<number>(12);
  const [spRecvSec, setSpRecvSec] = useState<number>(8);
  const [spUseFlash, setSpUseFlash] = useState<boolean>(true);
  const [spFlashSec, setSpFlashSec] = useState<number>(10);

  const [spOrderQty, setSpOrderQty] = useState<number>(144);
  const [spOrderColors, setSpOrderColors] = useState<number>(3);

  /* ================================================================== */
  /* TAB 3: EMBROIDERY STATE                                            */
  /* ================================================================== */
  const [embCrew, setEmbCrew] = useState<CrewMember[]>([
    { id: '1', name: 'Embroidery Lead', hrs: 8 },
    { id: '2', name: 'Hooping Tech', hrs: 8 },
    { id: '3', name: 'Trimmer & Finisher', hrs: 6 },
  ]);
  const [embHeads, setEmbHeads] = useState<number>(12); // Total heads (e.g. two 6-heads)
  const [embSpm, setEmbSpm] = useState<number>(850); // Stitches per minute
  const [embEfficiency, setEmbEfficiency] = useState<number>(75); // % accounting for thread breaks & framing
  const [embRunHrs, setEmbRunHrs] = useState<number>(8);

  const [embJobs, setEmbJobs] = useState<number>(4);
  const [embStitchCount, setEmbStitchCount] = useState<number>(8000); // Left chest average
  const [embSetupPerJobMin, setEmbSetupPerJobMin] = useState<number>(12); // Frame load & trace
  const [embThreadChangeMin, setEmbThreadChangeMin] = useState<number>(8); // Needle color changes

  const [embHoopSec, setEmbHoopSec] = useState<number>(45); // Hooping time per garment
  const [embTrimSec, setEmbTrimSec] = useState<number>(60); // Trimming, backing removal & steam
  const [embInspectSec, setEmbInspectSec] = useState<number>(20); // Final check & fold

  const [embOrderQty, setEmbOrderQty] = useState<number>(72);
  const [embOrderStitches, setEmbOrderStitches] = useState<number>(8500);

  /* ================================================================== */
  /* HELPER FUNCTIONS                                                   */
  /* ================================================================== */
  const addCrew = (type: 'dtf' | 'screen' | 'embroidery') => {
    const newItem = { id: String(Date.now()), name: 'Team member', hrs: 8 };
    if (type === 'dtf') setDtfCrew(prev => [...prev, newItem]);
    if (type === 'screen') setSpCrew(prev => [...prev, newItem]);
    if (type === 'embroidery') setEmbCrew(prev => [...prev, newItem]);
  };

  const updateCrew = (
    type: 'dtf' | 'screen' | 'embroidery',
    id: string,
    field: 'name' | 'hrs',
    value: string | number
  ) => {
    const updater = (prev: CrewMember[]) =>
      prev.map(m =>
        m.id === id ? { ...m, [field]: field === 'hrs' ? Math.max(0, Number(value) || 0) : value } : m
      );
    if (type === 'dtf') setDtfCrew(updater);
    if (type === 'screen') setSpCrew(updater);
    if (type === 'embroidery') setEmbCrew(updater);
  };

  const removeCrew = (type: 'dtf' | 'screen' | 'embroidery', id: string) => {
    if (type === 'dtf') setDtfCrew(prev => prev.filter(m => m.id !== id));
    if (type === 'screen') setSpCrew(prev => prev.filter(m => m.id !== id));
    if (type === 'embroidery') setEmbCrew(prev => prev.filter(m => m.id !== id));
  };

  const fmt = (n: number, d: number = 1) =>
    n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });

  const currentDateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  /* ================================================================== */
  /* CALCULATIONS: DTF PRINTING                                         */
  /* ================================================================== */
  const dtfCrewHrs = dtfCrew.reduce((acc, m) => acc + (m.hrs || 0), 0);
  const dtfOverheadMin = dtfJobs * (dtfSetupmin + dtfCutmin + dtfRecvjob);
  const dtfPerGar = dtfPresssec / 60 + Math.max(0, dtfAvgplace - 1) * dtfExtraplace + dtfRecvgar / 60;
  const dtfPressMinAvail = Math.max(0, dtfCrewHrs * 60 - dtfOverheadMin);
  const dtfCrewCap = dtfPerGar > 0 ? dtfPressMinAvail / dtfPerGar : 0;

  const dtfSpeed = dtfSpeedmult || 1;
  const dtfMinPerFull = dtfFullcnt > 0 ? dtfFullmin / dtfFullcnt / dtfSpeed : 0;
  const dtfMinPerHalf = dtfHalfcnt > 0 ? dtfHalfmin / dtfHalfcnt / dtfSpeed : 0;
  const dtfMinPerSmall = dtfSmallcnt > 0 ? dtfSmallmin / dtfSmallcnt / dtfSpeed : 0;

  const dtfShirtPrintMin =
    dtfFullpershirt * dtfMinPerFull + dtfHalfpershirt * dtfMinPerHalf + dtfSmallpershirt * dtfMinPerSmall;
  const dtfMachMinAvail = dtfPrinters * dtfRunhrs * 60;
  const dtfMachCap = dtfShirtPrintMin > 0 ? dtfMachMinAvail / dtfShirtPrintMin : 0;
  const dtfTransfersPerShirt = dtfFullpershirt + dtfHalfpershirt + dtfSmallpershirt;

  const dtfCap = Math.floor(Math.min(dtfCrewCap, dtfMachCap));
  const dtfCrewIsBn = dtfCrewCap <= dtfMachCap;

  const dtfMaxRef = Math.max(dtfCrewCap, dtfMachCap, 1);
  const dtfCrewBarPct = Math.min(100, Math.max(0, (dtfCrewCap / dtfMaxRef) * 100));
  const dtfMachBarPct = Math.min(100, Math.max(0, (dtfMachCap / dtfMaxRef) * 100));
  const dtfLimitPct = Math.min(100, Math.max(0, (Math.min(dtfCrewCap, dtfMachCap) / dtfMaxRef) * 100));

  const dtfOrderLaborHrs = (dtfOrderqty * dtfPerGar + dtfSetupmin + dtfCutmin + dtfRecvjob) / 60;
  const dtfOrderPrintHrs = dtfPrinters > 0 ? (dtfOrderqty * dtfShirtPrintMin) / 60 / dtfPrinters : Infinity;
  const dtfOrderDays = dtfCap > 0 ? dtfOrderqty / dtfCap : Infinity;

  /* ================================================================== */
  /* CALCULATIONS: SCREEN PRINTING                                      */
  /* ================================================================== */
  const spCrewHrs = spCrew.reduce((acc, m) => acc + (m.hrs || 0), 0);
  const spSetupOverheadPerJob = spColorsPerJob * spSetupPerScreenMin + spBreakdownMin + spInkMixMin;
  const spTotalOverheadMin = spJobs * spSetupOverheadPerJob;

  const spFlashExtraMin = spUseFlash ? spFlashSec / 60 : 0;
  const spPerGarmentLaborMin = spLoadSec / 60 + spOffloadSec / 60 + spRecvSec / 60 + spFlashExtraMin;

  const spAvailLaborMin = Math.max(0, spCrewHrs * 60 - spTotalOverheadMin);
  const spCrewCap = spPerGarmentLaborMin > 0 ? spAvailLaborMin / spPerGarmentLaborMin : 0;

  const spAutoDailyGarments = spAutoPresses * spAutoSpeed * spRunHrs;
  const spManualDailyGarments = spManualPresses * spManualSpeed * spRunHrs;
  const spMachCap = spAutoDailyGarments + spManualDailyGarments;

  const spCap = Math.floor(Math.min(spCrewCap, spMachCap));
  const spCrewIsBn = spCrewCap <= spMachCap;
  const spImpressionsPerDay = spCap * spColorsPerJob;

  const spMaxRef = Math.max(spCrewCap, spMachCap, 1);
  const spCrewBarPct = Math.min(100, Math.max(0, (spCrewCap / spMaxRef) * 100));
  const spMachBarPct = Math.min(100, Math.max(0, (spMachCap / spMaxRef) * 100));
  const spLimitPct = Math.min(100, Math.max(0, (Math.min(spCrewCap, spMachCap) / spMaxRef) * 100));

  const spTotalScreensToSetup = spJobs * spColorsPerJob;
  const spOrderScreens = spOrderColors;
  const spOrderSetupMin = spOrderScreens * spSetupPerScreenMin + spBreakdownMin + spInkMixMin;
  const spCombinedSpeed = spAutoPresses * spAutoSpeed + spManualPresses * spManualSpeed;
  const spOrderPressHrs = spCombinedSpeed > 0 ? spOrderQty / spCombinedSpeed : Infinity;
  const spOrderLaborHrs = (spOrderQty * spPerGarmentLaborMin + spOrderSetupMin) / 60;
  const spOrderDays = spCap > 0 ? spOrderQty / spCap : Infinity;

  /* ================================================================== */
  /* CALCULATIONS: EMBROIDERY                                           */
  /* ================================================================== */
  const embCrewHrs = embCrew.reduce((acc, m) => acc + (m.hrs || 0), 0);
  const embTotalOverheadMin = embJobs * (embSetupPerJobMin + embThreadChangeMin);

  const embPerGarmentLaborMin = embHoopSec / 60 + embTrimSec / 60 + embInspectSec / 60;
  const embAvailLaborMin = Math.max(0, embCrewHrs * 60 - embTotalOverheadMin);
  const embCrewCap = embPerGarmentLaborMin > 0 ? embAvailLaborMin / embPerGarmentLaborMin : 0;

  const embEffectiveSPM = embSpm * (embEfficiency / 100);
  const embTotalStitchesPerDay = embHeads * embEffectiveSPM * (embRunHrs * 60);
  const embMachCap = embStitchCount > 0 ? embTotalStitchesPerDay / embStitchCount : 0;

  const embCap = Math.floor(Math.min(embCrewCap, embMachCap));
  const embCrewIsBn = embCrewCap <= embMachCap;
  const embMinPerRun = embEffectiveSPM > 0 ? embStitchCount / embEffectiveSPM : 0;

  const embMaxRef = Math.max(embCrewCap, embMachCap, 1);
  const embCrewBarPct = Math.min(100, Math.max(0, (embCrewCap / embMaxRef) * 100));
  const embMachBarPct = Math.min(100, Math.max(0, (embMachCap / embMaxRef) * 100));
  const embLimitPct = Math.min(100, Math.max(0, (Math.min(embCrewCap, embMachCap) / embMaxRef) * 100));

  const embOrderTotalStitches = embOrderQty * embOrderStitches;
  const embOrderMachineHrs = embHeads * embEffectiveSPM > 0 ? embOrderTotalStitches / (embHeads * embEffectiveSPM * 60) : Infinity;
  const embOrderLaborHrs = (embOrderQty * embPerGarmentLaborMin + embSetupPerJobMin + embThreadChangeMin) / 60;
  const embOrderDays = embCap > 0 ? embOrderQty / embCap : Infinity;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header & Department Navigation Tabs */}
      <div className="space-y-4 pb-4 border-b border-brand-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="w-7 h-7 text-brand-primary" />
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-neutral-900 uppercase">
                Shop Production <span className="text-orange-600">Capacity</span>
              </h1>
            </div>
            <p className="text-xs font-mono text-neutral-500 mt-1">{currentDateStr}</p>
          </div>
        </div>

        {/* Tab Selection Navigation Bar */}
        <div className="flex items-center gap-1.5 p-1.5 bg-neutral-100/90 rounded-2xl border border-neutral-200/80 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('dtf')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'dtf'
                ? 'bg-white text-neutral-900 shadow-sm border border-neutral-250 font-black'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50 font-medium'
            }`}
          >
            <Printer className={`w-4 h-4 ${activeTab === 'dtf' ? 'text-orange-600' : 'text-neutral-400'}`} />
            <span>DTF Printing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('screen')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'screen'
                ? 'bg-white text-neutral-900 shadow-sm border border-neutral-250 font-black'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50 font-medium'
            }`}
          >
            <Palette className={`w-4 h-4 ${activeTab === 'screen' ? 'text-purple-600' : 'text-neutral-400'}`} />
            <span>Screen Printing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('embroidery')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'embroidery'
                ? 'bg-white text-neutral-900 shadow-sm border border-neutral-250 font-black'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50 font-medium'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${activeTab === 'embroidery' ? 'text-emerald-600' : 'text-neutral-400'}`} />
            <span>Embroidery</span>
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* TAB 1: DTF PRINTING CALCULATOR                                     */}
      {/* ================================================================== */}
      {activeTab === 'dtf' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CREW SCHEDULE */}
            <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-orange-600" />
                  <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">DTF Crew Schedule</h2>
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
                      {dtfCrew.map(m => (
                        <tr key={m.id} className="group">
                          <td className="py-2.5 pr-2">
                            <input
                              type="text"
                              value={m.name}
                              onChange={e => updateCrew('dtf', m.id, 'name', e.target.value)}
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
                                onChange={e => updateCrew('dtf', m.id, 'hrs', e.target.value)}
                                className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md text-sm font-mono focus:ring-2 focus:ring-brand-primary focus:outline-none bg-neutral-50"
                              />
                              <span className="font-mono text-neutral-400 text-xs">hrs</span>
                            </div>
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            <button
                              onClick={() => removeCrew('dtf', m.id)}
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
                    onClick={() => addCrew('dtf')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-xs rounded-lg transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Team Member
                  </button>

                  <div className="font-mono text-xs text-neutral-600">
                    Total crew time: <b className="text-sm font-bold text-neutral-900">{fmt(dtfCrewHrs)}</b> hrs
                  </div>
                </div>
              </div>
            </div>

            {/* PRINTERS */}
            <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-blue-600" />
                  <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">DTF Printers</h2>
                </div>
                <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  Machine
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <label className="font-semibold text-neutral-800">Number of printers</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={dtfPrinters}
                    onChange={e => setDtfPrinters(Math.max(0, Number(e.target.value) || 0))}
                    className="w-24 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none bg-neutral-50"
                  />
                </div>

                <div className="pt-2 border-t border-neutral-100">
                  <div className="font-mono font-semibold text-[11px] text-neutral-500 uppercase tracking-wider">
                    Transfer rate by size
                  </div>
                  <span className="text-[11px] text-neutral-400 block mb-2">Count printed / minutes it takes</span>

                  <div className="flex items-center justify-between gap-2 py-1">
                    <span className="font-medium text-neutral-700 min-w-[70px]">Full size</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        value={dtfFullcnt}
                        onChange={e => setDtfFullcnt(Number(e.target.value) || 1)}
                        className="w-16 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                      />
                      <span className="font-mono text-neutral-400">per</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.05"
                        value={dtfFullmin}
                        onChange={e => setDtfFullmin(Number(e.target.value) || 0.1)}
                        className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                      />
                      <span className="font-mono text-neutral-400 w-8">min</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 py-1">
                    <span className="font-medium text-neutral-700 min-w-[70px]">Half size</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        value={dtfHalfcnt}
                        onChange={e => setDtfHalfcnt(Number(e.target.value) || 1)}
                        className="w-16 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                      />
                      <span className="font-mono text-neutral-400">per</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.05"
                        value={dtfHalfmin}
                        onChange={e => setDtfHalfmin(Number(e.target.value) || 0.1)}
                        className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                      />
                      <span className="font-mono text-neutral-400 w-8">min</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 py-1">
                    <span className="font-medium text-neutral-700 min-w-[70px]">Small</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        value={dtfSmallcnt}
                        onChange={e => setDtfSmallcnt(Number(e.target.value) || 1)}
                        className="w-16 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                      />
                      <span className="font-mono text-neutral-400">per</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.05"
                        value={dtfSmallmin}
                        onChange={e => setDtfSmallmin(Number(e.target.value) || 0.1)}
                        className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                      />
                      <span className="font-mono text-neutral-400 w-8">min</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-100 space-y-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <label className="font-semibold text-neutral-800 block">Print speed multiplier</label>
                      <span className="text-[11px] text-neutral-400">1.0 = normal; 1.25 for high-speed mode</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0.1"
                        step="0.05"
                        value={dtfSpeedmult}
                        onChange={e => setDtfSpeedmult(Number(e.target.value) || 1.0)}
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
                        value={dtfRunhrs}
                        onChange={e => setDtfRunhrs(Number(e.target.value) || 0)}
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
                        value={dtfCutmin}
                        onChange={e => setDtfCutmin(Number(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                      />
                      <span className="font-mono text-neutral-400">min</span>
                    </div>
                  </div>
                </div>

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
                        value={dtfFullpershirt}
                        onChange={e => setDtfFullpershirt(Number(e.target.value) || 0)}
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
                        value={dtfHalfpershirt}
                        onChange={e => setDtfHalfpershirt(Number(e.target.value) || 0)}
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
                        value={dtfSmallpershirt}
                        onChange={e => setDtfSmallpershirt(Number(e.target.value) || 0)}
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
                      value={dtfPresssec}
                      onChange={e => setDtfPresssec(Number(e.target.value) || 0)}
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
                      value={dtfAvgplace}
                      onChange={e => setDtfAvgplace(Number(e.target.value) || 1)}
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
                      value={dtfExtraplace}
                      onChange={e => setDtfExtraplace(Number(e.target.value) || 0)}
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
                    <span className="text-[11px] text-neutral-400">Each job gets setup + check-in</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={dtfJobs}
                      onChange={e => setDtfJobs(Number(e.target.value) || 0)}
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
                      value={dtfSetupmin}
                      onChange={e => setDtfSetupmin(Number(e.target.value) || 0)}
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
                      value={dtfRecvjob}
                      onChange={e => setDtfRecvjob(Number(e.target.value) || 0)}
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
                      value={dtfRecvgar}
                      onChange={e => setDtfRecvgar(Number(e.target.value) || 0)}
                      className="w-20 px-2 py-1 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">sec</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DTF RESULTS DISPLAY */}
          <div className="bg-neutral-900 rounded-xl text-white p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <h2 className="text-xl font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-orange-500" />
                DTF Today&apos;s Capacity
              </h2>
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono font-extrabold text-5xl sm:text-6xl text-white tracking-tight">
                {dtfCap.toLocaleString()}
              </span>
              <span className="text-neutral-400 text-sm font-medium">garments / day</span>

              <span
                className={`font-mono text-xs font-bold tracking-wider px-3 py-1 rounded-full uppercase ml-auto ${
                  dtfCrewIsBn ? 'bg-orange-600 text-white' : 'bg-blue-600 text-white'
                }`}
              >
                BOTTLENECK: {dtfCrewIsBn ? 'CREW LABOR' : 'PRINTERS'}
              </span>
            </div>

            {/* Gauges */}
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-neutral-300">
                  <span>CREW can press</span>
                  <span className="font-semibold text-orange-400">{fmt(dtfCrewCap, 0)} garments</span>
                </div>
                <div className="h-4 bg-neutral-800 rounded-md overflow-hidden relative">
                  <div
                    className="h-full bg-orange-500 transition-all duration-300 rounded-l-md"
                    style={{ width: `${dtfCrewBarPct}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white opacity-80"
                    style={{ left: `${dtfLimitPct}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-neutral-300">
                  <span>PRINTERS can supply</span>
                  <span className="font-semibold text-blue-400">{fmt(dtfMachCap, 0)} garments</span>
                </div>
                <div className="h-4 bg-neutral-800 rounded-md overflow-hidden relative">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 rounded-l-md"
                    style={{ width: `${dtfMachBarPct}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white opacity-80"
                    style={{ left: `${dtfLimitPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-4 border-t border-neutral-800">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Crew Hours</div>
                <div className="text-lg font-mono font-semibold text-white">{fmt(dtfCrewHrs)} hrs</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Setup + Receiving</div>
                <div className="text-lg font-mono font-semibold text-orange-400">{fmt(dtfOverheadMin / 60, 1)} hrs</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Pressing Hours</div>
                <div className="text-lg font-mono font-semibold text-white">{fmt(dtfPressMinAvail / 60, 1)} hrs</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Min / Garment</div>
                <div className="text-lg font-mono font-semibold text-white">{fmt(dtfPerGar, 2)} min</div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Transfers Needed</div>
                <div className="text-lg font-mono font-semibold text-blue-400">{fmt(dtfMachCap * dtfTransfersPerShirt, 0)}</div>
              </div>
            </div>

            <p className="text-xs text-neutral-400 pt-2 border-t border-neutral-800/60 leading-relaxed">
              {dtfCrewIsBn
                ? `Crew time runs out before the printers do — adding a team member or trimming setup/receiving raises capacity. Printer headroom: ${fmt(
                    dtfMachCap - dtfCrewCap,
                    0
                  )} garments.`
                : `The printers cap you today — a faster print mode, a second printer, or longer run time raises capacity. Crew headroom: ${fmt(
                    dtfCrewCap - dtfMachCap,
                    0
                  )} garments.`}
            </p>
          </div>

          {/* DTF ORDER ESTIMATOR */}
          <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden p-5 sm:p-6 space-y-4">
            <h2 className="text-lg font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-100 pb-3">
              DTF Order Estimator
            </h2>

            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Order Quantity</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    value={dtfOrderqty}
                    onChange={e => setDtfOrderqty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-28 px-3 py-2 border border-neutral-200 rounded-md font-mono text-sm font-medium focus:ring-2 focus:ring-brand-primary focus:outline-none bg-neutral-50"
                  />
                  <span className="text-xs font-mono text-neutral-400">garments</span>
                </div>
              </div>

              <div className="font-mono text-sm text-neutral-700 pb-1">
                Crew time: <b className="text-neutral-900">{fmt(dtfOrderLaborHrs)}</b> hrs &nbsp;&middot;&nbsp; Print time:{' '}
                <b className="text-neutral-900">{isFinite(dtfOrderPrintHrs) ? fmt(dtfOrderPrintHrs) : '—'}</b> hrs
                &nbsp;&middot;&nbsp;{' '}
                {isFinite(dtfOrderDays) ? (
                  <span>
                    At today&apos;s schedule: <b className="text-neutral-900">{fmt(dtfOrderDays)}</b> production day
                    {dtfOrderDays >= 1.95 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-red-600 font-semibold">No capacity with current inputs</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 2: SCREEN PRINTING CALCULATOR                                  */}
      {/* ================================================================== */}
      {activeTab === 'screen' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SCREEN PRINTING CREW */}
            <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Screen Crew Schedule</h2>
                </div>
                <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  Labor
                </span>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 text-neutral-500 font-mono uppercase tracking-wider">
                        <th className="pb-2 font-medium">Name / Role</th>
                        <th className="pb-2 font-medium">Hours Today</th>
                        <th className="pb-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {spCrew.map(m => (
                        <tr key={m.id} className="group">
                          <td className="py-2.5 pr-2">
                            <input
                              type="text"
                              value={m.name}
                              onChange={e => updateCrew('screen', m.id, 'name', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-md text-sm font-medium focus:ring-2 focus:ring-purple-600 focus:outline-none bg-neutral-50"
                            />
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={m.hrs}
                                onChange={e => updateCrew('screen', m.id, 'hrs', e.target.value)}
                                className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md text-sm font-mono focus:ring-2 focus:ring-purple-600 focus:outline-none bg-neutral-50"
                              />
                              <span className="font-mono text-neutral-400 text-xs">hrs</span>
                            </div>
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            <button
                              onClick={() => removeCrew('screen', m.id)}
                              className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Remove member"
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
                    onClick={() => addCrew('screen')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-xs rounded-lg transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Team Member
                  </button>

                  <div className="font-mono text-xs text-neutral-600">
                    Total crew time: <b className="text-sm font-bold text-neutral-900">{fmt(spCrewHrs)}</b> hrs
                  </div>
                </div>
              </div>
            </div>

            {/* PRESSES & EQUIPMENT */}
            <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-purple-600" />
                  <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Presses &amp; Speeds</h2>
                </div>
                <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  Press Capacity
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs">
                {/* Auto Presses */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Automatic Presses</label>
                    <span className="text-[11px] text-neutral-400">High-volume automatic press count</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={spAutoPresses}
                      onChange={e => setSpAutoPresses(Math.max(0, Number(e.target.value) || 0))}
                      className="w-16 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">@</span>
                    <input
                      type="number"
                      min="10"
                      step="25"
                      value={spAutoSpeed}
                      onChange={e => setSpAutoSpeed(Math.max(10, Number(e.target.value) || 10))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">/hr</span>
                  </div>
                </div>

                {/* Manual Presses */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Manual Presses</label>
                    <span className="text-[11px] text-neutral-400">Manual press count &amp; speed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={spManualPresses}
                      onChange={e => setSpManualPresses(Math.max(0, Number(e.target.value) || 0))}
                      className="w-16 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">@</span>
                    <input
                      type="number"
                      min="10"
                      step="10"
                      value={spManualSpeed}
                      onChange={e => setSpManualSpeed(Math.max(10, Number(e.target.value) || 10))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">/hr</span>
                  </div>
                </div>

                {/* Press Run Time */}
                <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Press run time today</label>
                    <span className="text-[11px] text-neutral-400">Actual active press running hours</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={spRunHrs}
                      onChange={e => setSpRunHrs(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">hrs</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SCREEN & ART OVERHEAD */}
            <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-purple-600" />
                  <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Screen Setup Overhead</h2>
                </div>
                <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  Prep &amp; Registration
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Jobs run today</label>
                    <span className="text-[11px] text-neutral-400">Number of screen print orders today</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={spJobs}
                      onChange={e => setSpJobs(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">jobs</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Avg colors / screens per job</label>
                    <span className="text-[11px] text-neutral-400">Avg number of screens required per job</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={spColorsPerJob}
                      onChange={e => setSpColorsPerJob(Math.max(1, Number(e.target.value) || 1))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">colors</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Setup &amp; reg time per screen</label>
                    <span className="text-[11px] text-neutral-400">Mount, align, register &amp; test print</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={spSetupPerScreenMin}
                      onChange={e => setSpSetupPerScreenMin(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">min</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Screen breakdown per job</label>
                    <span className="text-[11px] text-neutral-400">Carding ink, screen removal &amp; washout</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={spBreakdownMin}
                      onChange={e => setSpBreakdownMin(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">min</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Ink mixing &amp; matching per job</label>
                    <span className="text-[11px] text-neutral-400">PMS color mixing &amp; ink loading</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={spInkMixMin}
                      onChange={e => setSpInkMixMin(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* GARMENT HANDLING */}
            <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Timer className="w-5 h-5 text-purple-600" />
                  <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Garment Labor</h2>
                </div>
                <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  Handling Time
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Load shirt time</label>
                    <span className="text-[11px] text-neutral-400">Platen alignment &amp; smoothing</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={spLoadSec}
                      onChange={e => setSpLoadSec(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">sec</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Off-load &amp; dryer placement</label>
                    <span className="text-[11px] text-neutral-400">Pull shirt &amp; layout on conveyor dryer</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={spOffloadSec}
                      onChange={e => setSpOffloadSec(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">sec</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Receiving &amp; staging per shirt</label>
                    <span className="text-[11px] text-neutral-400">Unpack, count &amp; stack on cart</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={spRecvSec}
                      onChange={e => setSpRecvSec(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">sec</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="spFlash"
                      checked={spUseFlash}
                      onChange={e => setSpUseFlash(e.target.checked)}
                      className="rounded border-neutral-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
                    />
                    <div>
                      <label htmlFor="spFlash" className="font-semibold text-neutral-800 block cursor-pointer">
                        Multi-color Flash Cure Required
                      </label>
                      <span className="text-[11px] text-neutral-400">Extra flash drying time per shirt</span>
                    </div>
                  </div>
                  {spUseFlash && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={spFlashSec}
                        onChange={e => setSpFlashSec(Math.max(0, Number(e.target.value) || 0))}
                        className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                      />
                      <span className="font-mono text-neutral-400">sec</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SCREEN PRINTING RESULTS DISPLAY */}
          <div className="bg-neutral-900 rounded-xl text-white p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <h2 className="text-xl font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-500" />
                Screen Printing Today&apos;s Capacity
              </h2>
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono font-extrabold text-5xl sm:text-6xl text-white tracking-tight">
                {spCap.toLocaleString()}
              </span>
              <span className="text-neutral-400 text-sm font-medium">garments / day</span>

              <span
                className={`font-mono text-xs font-bold tracking-wider px-3 py-1 rounded-full uppercase ml-auto ${
                  spCrewIsBn ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
                }`}
              >
                BOTTLENECK: {spCrewIsBn ? 'CREW & SETUP' : 'PRESS SPEED'}
              </span>
            </div>

            {/* Gauges */}
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-neutral-300">
                  <span>CREW &amp; SETUP can process</span>
                  <span className="font-semibold text-purple-400">{fmt(spCrewCap, 0)} garments</span>
                </div>
                <div className="h-4 bg-neutral-800 rounded-md overflow-hidden relative">
                  <div
                    className="h-full bg-purple-500 transition-all duration-300 rounded-l-md"
                    style={{ width: `${spCrewBarPct}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white opacity-80"
                    style={{ left: `${spLimitPct}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-neutral-300">
                  <span>PRESSES can print</span>
                  <span className="font-semibold text-blue-400">{fmt(spMachCap, 0)} garments</span>
                </div>
                <div className="h-4 bg-neutral-800 rounded-md overflow-hidden relative">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 rounded-l-md"
                    style={{ width: `${spMachBarPct}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white opacity-80"
                    style={{ left: `${spLimitPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-4 border-t border-neutral-800">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Crew Hours</div>
                <div className="text-lg font-mono font-semibold text-white">{fmt(spCrewHrs)} hrs</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Total Screens Today</div>
                <div className="text-lg font-mono font-semibold text-purple-400">{fmt(spTotalScreensToSetup, 0)} screens</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Screen Setup Overhead</div>
                <div className="text-lg font-mono font-semibold text-purple-400">{fmt(spTotalOverheadMin / 60, 1)} hrs</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Handling / Garment</div>
                <div className="text-lg font-mono font-semibold text-white">{fmt(spPerGarmentLaborMin, 2)} min</div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Total Impressions</div>
                <div className="text-lg font-mono font-semibold text-blue-400">{fmt(spImpressionsPerDay, 0)}</div>
              </div>
            </div>

            <p className="text-xs text-neutral-400 pt-2 border-t border-neutral-800/60 leading-relaxed">
              {spCrewIsBn
                ? `Screen registration and setup overhead limits output today. Streamlining screen registration or pre-mixing ink adds headroom. Press headroom: ${fmt(
                    spMachCap - spCrewCap,
                    0
                  )} garments.`
                : `Your presses cap capacity today. Running additional automatic press hours or increasing press speed will raise capacity. Crew headroom: ${fmt(
                    spCrewCap - spMachCap,
                    0
                  )} garments.`}
            </p>
          </div>

          {/* SCREEN PRINT ORDER ESTIMATOR */}
          <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden p-5 sm:p-6 space-y-4">
            <h2 className="text-lg font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-100 pb-3">
              Screen Print Order Estimator
            </h2>

            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Order Quantity</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    value={spOrderQty}
                    onChange={e => setSpOrderQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-28 px-3 py-2 border border-neutral-200 rounded-md font-mono text-sm font-medium focus:ring-2 focus:ring-purple-600 focus:outline-none bg-neutral-50"
                  />
                  <span className="text-xs font-mono text-neutral-400">garments</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Colors / Screens for Order</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={spOrderColors}
                    onChange={e => setSpOrderColors(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 px-3 py-2 border border-neutral-200 rounded-md font-mono text-sm font-medium focus:ring-2 focus:ring-purple-600 focus:outline-none bg-neutral-50"
                  />
                  <span className="text-xs font-mono text-neutral-400">colors</span>
                </div>
              </div>

              <div className="font-mono text-sm text-neutral-700 pb-1">
                Screens: <b className="text-purple-600">{spOrderScreens}</b> &nbsp;&middot;&nbsp; Press run time:{' '}
                <b className="text-neutral-900">{isFinite(spOrderPressHrs) ? fmt(spOrderPressHrs) : '—'}</b> hrs &nbsp;&middot;&nbsp; Total labor:{' '}
                <b className="text-neutral-900">{fmt(spOrderLaborHrs)}</b> hrs &nbsp;&middot;&nbsp;{' '}
                {isFinite(spOrderDays) ? (
                  <span>
                    At today&apos;s schedule: <b className="text-neutral-900">{fmt(spOrderDays)}</b> production day
                    {spOrderDays >= 1.95 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-red-600 font-semibold">No capacity with current inputs</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 3: EMBROIDERY CALCULATOR                                       */}
      {/* ================================================================== */}
      {activeTab === 'embroidery' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* EMBROIDERY CREW */}
            <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Embroidery Crew Schedule</h2>
                </div>
                <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  Labor
                </span>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 text-neutral-500 font-mono uppercase tracking-wider">
                        <th className="pb-2 font-medium">Name / Role</th>
                        <th className="pb-2 font-medium">Hours Today</th>
                        <th className="pb-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {embCrew.map(m => (
                        <tr key={m.id} className="group">
                          <td className="py-2.5 pr-2">
                            <input
                              type="text"
                              value={m.name}
                              onChange={e => updateCrew('embroidery', m.id, 'name', e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-md text-sm font-medium focus:ring-2 focus:ring-emerald-600 focus:outline-none bg-neutral-50"
                            />
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={m.hrs}
                                onChange={e => updateCrew('embroidery', m.id, 'hrs', e.target.value)}
                                className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md text-sm font-mono focus:ring-2 focus:ring-emerald-600 focus:outline-none bg-neutral-50"
                              />
                              <span className="font-mono text-neutral-400 text-xs">hrs</span>
                            </div>
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            <button
                              onClick={() => removeCrew('embroidery', m.id)}
                              className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Remove member"
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
                    onClick={() => addCrew('embroidery')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-xs rounded-lg transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Team Member
                  </button>

                  <div className="font-mono text-xs text-neutral-600">
                    Total crew time: <b className="text-sm font-bold text-neutral-900">{fmt(embCrewHrs)}</b> hrs
                  </div>
                </div>
              </div>
            </div>

            {/* EMBROIDERY MACHINES */}
            <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Embroidery Machines</h2>
                </div>
                <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  Heads &amp; Speed
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Total Embroidery Heads</label>
                    <span className="text-[11px] text-neutral-400">Total needle heads active across shop</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={embHeads}
                      onChange={e => setEmbHeads(Math.max(1, Number(e.target.value) || 1))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">heads</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Machine Speed (SPM)</label>
                    <span className="text-[11px] text-neutral-400">Stitches Per Minute (e.g. 750 – 950 SPM)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="100"
                      step="50"
                      value={embSpm}
                      onChange={e => setEmbSpm(Math.max(100, Number(e.target.value) || 100))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">SPM</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Machine Efficiency %</label>
                    <span className="text-[11px] text-neutral-400">Run factor allowing for thread breaks &amp; bobbin swaps</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="10"
                      max="100"
                      step="5"
                      value={embEfficiency}
                      onChange={e => setEmbEfficiency(Math.min(100, Math.max(10, Number(e.target.value) || 10)))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 pt-2 border-t border-neutral-100">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Machine run time today</label>
                    <span className="text-[11px] text-neutral-400">Actual running hours machine operates</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={embRunHrs}
                      onChange={e => setEmbRunHrs(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">hrs</span>
                  </div>
                </div>
              </div>
            </div>

            {/* DESIGN STITCH OVERHEAD */}
            <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Design &amp; Job Setup</h2>
                </div>
                <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  Overhead
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Jobs run today</label>
                    <span className="text-[11px] text-neutral-400">Number of embroidery orders today</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={embJobs}
                      onChange={e => setEmbJobs(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">jobs</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Avg stitches per design</label>
                    <span className="text-[11px] text-neutral-400">e.g. 8,000 left chest; 25,000 jacket back</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="500"
                      step="500"
                      value={embStitchCount}
                      onChange={e => setEmbStitchCount(Math.max(500, Number(e.target.value) || 500))}
                      className="w-24 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">stitches</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Frame load &amp; setup per job</label>
                    <span className="text-[11px] text-neutral-400">DST load, trace design, origin set</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={embSetupPerJobMin}
                      onChange={e => setEmbSetupPerJobMin(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">min</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Thread color change per job</label>
                    <span className="text-[11px] text-neutral-400">Needle threading &amp; bobbin check</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={embThreadChangeMin}
                      onChange={e => setEmbThreadChangeMin(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* HOOPING & FINISHING LABOR */}
            <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-brand-border bg-neutral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scissors className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-bold uppercase tracking-wider text-sm text-neutral-900">Hooping &amp; Finishing</h2>
                </div>
                <span className="text-[10px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  Handling Time
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Hooping time per garment</label>
                    <span className="text-[11px] text-neutral-400">Backing placement &amp; hoop framing</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={embHoopSec}
                      onChange={e => setEmbHoopSec(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">sec</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Trimming, backing &amp; steam</label>
                    <span className="text-[11px] text-neutral-400">Cut jump threads, tear backing, steam hoop rings</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={embTrimSec}
                      onChange={e => setEmbTrimSec(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">sec</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block">Inspection &amp; folding</label>
                    <span className="text-[11px] text-neutral-400">Quality check &amp; pack into poly bag</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={embInspectSec}
                      onChange={e => setEmbInspectSec(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2.5 py-1.5 border border-neutral-200 rounded-md font-mono text-xs bg-neutral-50"
                    />
                    <span className="font-mono text-neutral-400">sec</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* EMBROIDERY RESULTS DISPLAY */}
          <div className="bg-neutral-900 rounded-xl text-white p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <h2 className="text-xl font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-500" />
                Embroidery Today&apos;s Capacity
              </h2>
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono font-extrabold text-5xl sm:text-6xl text-white tracking-tight">
                {embCap.toLocaleString()}
              </span>
              <span className="text-neutral-400 text-sm font-medium">garments / day</span>

              <span
                className={`font-mono text-xs font-bold tracking-wider px-3 py-1 rounded-full uppercase ml-auto ${
                  embCrewIsBn ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
                }`}
              >
                BOTTLENECK: {embCrewIsBn ? 'HOOPING & FINISHING' : 'MACHINE STITCH SPEED'}
              </span>
            </div>

            {/* Gauges */}
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-neutral-300">
                  <span>CREW can hoop &amp; finish</span>
                  <span className="font-semibold text-emerald-400">{fmt(embCrewCap, 0)} garments</span>
                </div>
                <div className="h-4 bg-neutral-800 rounded-md overflow-hidden relative">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300 rounded-l-md"
                    style={{ width: `${embCrewBarPct}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white opacity-80"
                    style={{ left: `${embLimitPct}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-neutral-300">
                  <span>MACHINES can stitch</span>
                  <span className="font-semibold text-blue-400">{fmt(embMachCap, 0)} garments</span>
                </div>
                <div className="h-4 bg-neutral-800 rounded-md overflow-hidden relative">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 rounded-l-md"
                    style={{ width: `${embMachBarPct}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white opacity-80"
                    style={{ left: `${embLimitPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-4 border-t border-neutral-800">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Crew Hours</div>
                <div className="text-lg font-mono font-semibold text-white">{fmt(embCrewHrs)} hrs</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Daily Stitches Capacity</div>
                <div className="text-lg font-mono font-semibold text-emerald-400">{fmt(embTotalStitchesPerDay, 0)}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Setup &amp; Color Changes</div>
                <div className="text-lg font-mono font-semibold text-emerald-400">{fmt(embTotalOverheadMin / 60, 1)} hrs</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Stitch Time / Garment</div>
                <div className="text-lg font-mono font-semibold text-white">{fmt(embMinPerRun, 1)} min</div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">Effective Machine Speed</div>
                <div className="text-lg font-mono font-semibold text-blue-400">{fmt(embEffectiveSPM, 0)} SPM</div>
              </div>
            </div>

            <p className="text-xs text-neutral-400 pt-2 border-t border-neutral-800/60 leading-relaxed">
              {embCrewIsBn
                ? `Hooping and trimming labor is your constraint today — pre-hooping garments or adding a finisher increases throughput. Machine headroom: ${fmt(
                    embMachCap - embCrewCap,
                    0
                  )} garments.`
                : `Machine stitch capacity limits output today. Increasing machine SPM, adding heads, or extending run hours increases capacity. Crew headroom: ${fmt(
                    embCrewCap - embMachCap,
                    0
                  )} garments.`}
            </p>
          </div>

          {/* EMBROIDERY ORDER ESTIMATOR */}
          <div className="bg-white border border-brand-border rounded-xl shadow-sm overflow-hidden p-5 sm:p-6 space-y-4">
            <h2 className="text-lg font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-100 pb-3">
              Embroidery Order Estimator
            </h2>

            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Order Quantity</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    value={embOrderQty}
                    onChange={e => setEmbOrderQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-28 px-3 py-2 border border-neutral-200 rounded-md font-mono text-sm font-medium focus:ring-2 focus:ring-emerald-600 focus:outline-none bg-neutral-50"
                  />
                  <span className="text-xs font-mono text-neutral-400">garments</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Stitches per Garment</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="500"
                    step="500"
                    value={embOrderStitches}
                    onChange={e => setEmbOrderStitches(Math.max(500, Number(e.target.value) || 500))}
                    className="w-28 px-3 py-2 border border-neutral-200 rounded-md font-mono text-sm font-medium focus:ring-2 focus:ring-emerald-600 focus:outline-none bg-neutral-50"
                  />
                  <span className="text-xs font-mono text-neutral-400">stitches</span>
                </div>
              </div>

              <div className="font-mono text-sm text-neutral-700 pb-1">
                Total stitches: <b className="text-emerald-600">{fmt(embOrderTotalStitches, 0)}</b> &nbsp;&middot;&nbsp; Machine run time:{' '}
                <b className="text-neutral-900">{isFinite(embOrderMachineHrs) ? fmt(embOrderMachineHrs) : '—'}</b> hrs &nbsp;&middot;&nbsp; Total labor:{' '}
                <b className="text-neutral-900">{fmt(embOrderLaborHrs)}</b> hrs &nbsp;&middot;&nbsp;{' '}
                {isFinite(embOrderDays) ? (
                  <span>
                    At today&apos;s schedule: <b className="text-neutral-900">{fmt(embOrderDays)}</b> production day
                    {embOrderDays >= 1.95 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-red-600 font-semibold">No capacity with current inputs</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
