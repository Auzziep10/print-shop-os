import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Calendar, Check, Sparkles, X } from 'lucide-react';
import {
  TIMELINE_STEPS,
  type TimelineStepName,
  type TimelineMilestonesMap,
  computeOrderVisualTimelineIndex,
  resolveStepMilestone,
  formatTimelineDate,
  toDateInputValue
} from '../../lib/timelineUtils';

interface OrderTimelineTrackerProps {
  order: any;
  canEdit?: boolean;
  compact?: boolean;
}

export const OrderTimelineTracker: React.FC<OrderTimelineTrackerProps> = ({
  order,
  canEdit = false,
  compact = false
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [focusedStep, setFocusedStep] = useState<TimelineStepName | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draftMilestones, setDraftMilestones] = useState<TimelineMilestonesMap>({});

  const visualIndex = computeOrderVisualTimelineIndex(order);
  const fillWidth = `${(visualIndex / (TIMELINE_STEPS.length - 1)) * 100}%`;

  const openEditorForStep = (e: React.MouseEvent, step: TimelineStepName) => {
    if (!canEdit) return;
    e.stopPropagation();
    const initialDraft: TimelineMilestonesMap = {};
    TIMELINE_STEPS.forEach((s, idx) => {
      const resolved = resolveStepMilestone(order, s, idx, visualIndex);
      initialDraft[s] = {
        completedAt: toDateInputValue(resolved.completedAt),
        expectedDate: toDateInputValue(resolved.expectedDate),
        delayed: resolved.delayed,
        delayNote: resolved.delayNote || ''
      };
    });
    setDraftMilestones(initialDraft);
    setFocusedStep(step);
    setIsEditorOpen(true);
  };

  const handleAutoFillPredictableDates = () => {
    const startRaw =
      draftMilestones['Requested']?.completedAt ||
      toDateInputValue(order?.createdAt) ||
      new Date().toLocaleDateString('en-CA');
    const endRaw =
      draftMilestones['Received']?.expectedDate ||
      toDateInputValue(order?.date || order?.targetCompletionDate || order?.neededByDate);

    const [sy, sm, sd] = startRaw.split('-').map(Number);
    const startDate = !isNaN(sy) ? new Date(sy, sm - 1, sd) : new Date();

    let endDate: Date;
    if (endRaw) {
      const [ey, em, ed] = endRaw.split('-').map(Number);
      endDate = !isNaN(ey) ? new Date(ey, em - 1, ed) : new Date(startDate.getTime() + 14 * 86400000);
    } else {
      endDate = new Date(startDate.getTime() + 14 * 86400000);
    }

    if (endDate.getTime() <= startDate.getTime()) {
      endDate = new Date(startDate.getTime() + 12 * 86400000);
    }

    const totalMs = endDate.getTime() - startDate.getTime();
    const nextDraft: TimelineMilestonesMap = { ...draftMilestones };

    TIMELINE_STEPS.forEach((step, idx) => {
      const ratio = idx / (TIMELINE_STEPS.length - 1);
      const stepDate = new Date(startDate.getTime() + Math.round(totalMs * ratio));
      const y = stepDate.getFullYear();
      const m = String(stepDate.getMonth() + 1).padStart(2, '0');
      const d = String(stepDate.getDate()).padStart(2, '0');
      const formatted = `${y}-${m}-${d}`;

      nextDraft[step] = {
        ...(nextDraft[step] || {}),
        expectedDate: nextDraft[step]?.expectedDate || formatted
      };
    });

    setDraftMilestones(nextDraft);
  };

  const handleSaveTimeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order?.id) return;
    setIsSaving(true);
    try {
      const cleaned: TimelineMilestonesMap = {};
      TIMELINE_STEPS.forEach((step) => {
        const item = draftMilestones[step];
        if (!item) return;
        cleaned[step] = {
          completedAt: item.completedAt?.trim() || '',
          expectedDate: item.expectedDate?.trim() || '',
          delayed: Boolean(item.delayed),
          delayNote: item.delayNote?.trim() || ''
        };
      });

      const receivedExpected = cleaned['Received']?.expectedDate;
      const updatePayload: Record<string, any> = {
        timelineMilestones: cleaned
      };
      if (receivedExpected && /^\d{4}-\d{2}-\d{2}$/.test(receivedExpected)) {
        const [y, m, d] = receivedExpected.split('-');
        updatePayload.date = `${m}/${d}/${y.substring(2)}`;
      }

      await setDoc(doc(db, 'orders', order.id), updatePayload, { merge: true });
      setIsEditorOpen(false);
    } catch (err) {
      console.error('Failed to save timeline milestones:', err);
      alert('Failed to save timeline dates.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Desktop Horizontal Tracker */}
      <div className="hidden xl:block w-full overflow-visible relative z-10">
        <div className={`relative w-full ${compact ? 'my-6' : 'mt-8 mb-6 lg:mt-0 lg:mb-0'}`}>
          {/* The Track Base */}
          <div className="absolute top-0 left-0 w-full h-[12px] bg-neutral-200 rounded-full"></div>
          {/* The Fill */}
          <div
            className="absolute top-0 left-0 h-[12px] bg-neutral-400 rounded-full transition-all duration-700 ease-in-out"
            style={{ width: fillWidth }}
          ></div>

          {/* Steps */}
          <div className="relative flex justify-between items-center z-10 px-0">
            {TIMELINE_STEPS.map((step, idx) => {
              const milestone = resolveStepMilestone(order, step, idx, visualIndex);
              const isCompleted = milestone.isCompleted;
              const isDelayed = milestone.delayed;
              const isLastStep = idx === TIMELINE_STEPS.length - 1;

              const completedFormatted = formatTimelineDate(milestone.completedAt);
              const expectedFormatted = formatTimelineDate(milestone.expectedDate);
              const topDisplayDate = isLastStep
                ? expectedFormatted || completedFormatted || formatTimelineDate(order.date)
                : '';

              return (
                <div
                  key={step}
                  onClick={(e) => openEditorForStep(e, step)}
                  className={`flex flex-col items-center relative group/step ${
                    canEdit ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  {/* Hover Tooltip */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none group-hover/step:opacity-100 transition-all duration-200 translate-y-1 group-hover/step:translate-y-0 z-50 whitespace-nowrap">
                    <div className="bg-neutral-900 text-white text-[11px] rounded-xl px-3 py-2 shadow-xl border border-neutral-700/80 flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1.5 font-extrabold tracking-wide">
                        <span>{step}</span>
                        {isDelayed && (
                          <span className="bg-red-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                            ! Delayed
                          </span>
                        )}
                      </div>
                      {isDelayed && milestone.delayNote && (
                        <span className="text-[10px] text-red-300 font-semibold max-w-[200px] truncate">
                          {milestone.delayNote}
                        </span>
                      )}
                      {completedFormatted ? (
                        <span className="text-[10px] text-emerald-300 font-semibold">
                          Completed: {completedFormatted}
                        </span>
                      ) : expectedFormatted ? (
                        <span className="text-[10px] text-amber-300 font-semibold">
                          Est. By: {expectedFormatted}
                        </span>
                      ) : (
                        <span className="text-[10px] text-neutral-400 font-medium">
                          {isCompleted ? 'Completed' : 'No date set'}
                        </span>
                      )}
                      {completedFormatted && expectedFormatted && completedFormatted !== expectedFormatted && (
                        <span className="text-[9px] text-neutral-400">
                          Target: {expectedFormatted}
                        </span>
                      )}
                      {canEdit && (
                        <span className="text-[9px] text-neutral-400 border-t border-neutral-700/80 pt-0.5 mt-0.5">
                          Click to set date or mark delay
                        </span>
                      )}
                    </div>
                    <div className="w-2 h-2 bg-neutral-900 rotate-45 mx-auto -mt-1 border-r border-b border-neutral-700/80"></div>
                  </div>

                  {/* The Step Dot / Red Exclamation Bubble */}
                  {isDelayed ? (
                    <div className="w-[20px] h-[20px] -my-[4px] rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center shadow-md ring-2 ring-white transition-transform group-hover/step:scale-110 z-20">
                      !
                    </div>
                  ) : (
                    <div
                      className={`w-[12px] h-[12px] rounded-full flex items-center justify-center transition-all duration-300 group-hover/step:scale-125 ${
                        isCompleted
                          ? 'bg-black'
                          : milestone.expectedDate
                          ? 'bg-white border-[2.5px] border-neutral-600'
                          : 'bg-[#f0f0f0] border-[2px] border-neutral-300'
                      }`}
                    />
                  )}

                  {/* Step Label below */}
                  <span
                    className={`absolute top-6 text-[11px] font-bold w-24 text-center tracking-wide transition-colors ${
                      isDelayed
                        ? 'text-red-600 font-extrabold'
                        : isCompleted
                        ? 'text-neutral-700'
                        : 'text-neutral-500'
                    }`}
                  >
                    {step}
                  </span>

                  {/* Completion Date on Last Step */}
                  {isLastStep && topDisplayDate && (
                    <span className="absolute -top-7 text-[12px] font-bold text-neutral-900 w-24 text-center">
                      {topDisplayDate}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile Vertical Tracker */}
      <div className="block xl:hidden w-full relative z-10 bg-neutral-50/50 rounded-3xl p-5 border border-neutral-100 mt-2">
        <div className="relative flex flex-col gap-5 pl-6">
          {/* Vertical line connector */}
          <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-neutral-200"></div>
          {/* Vertical line fill progress */}
          <div
            className="absolute left-[7px] top-2 w-[2px] bg-black transition-all duration-700 ease-in-out animate-all"
            style={{
              height: `${Math.min(100, (visualIndex / (TIMELINE_STEPS.length - 1)) * 100)}%`
            }}
          ></div>

          {TIMELINE_STEPS.map((step, idx) => {
            const milestone = resolveStepMilestone(order, step, idx, visualIndex);
            const isCompleted = milestone.isCompleted;
            const isDelayed = milestone.delayed;
            const isLastStep = idx === TIMELINE_STEPS.length - 1;
            const completedFormatted = formatTimelineDate(milestone.completedAt);
            const expectedFormatted = formatTimelineDate(milestone.expectedDate);
            const badgeDate =
              completedFormatted ||
              expectedFormatted ||
              (isLastStep ? formatTimelineDate(order.date) : '');

            return (
              <div
                key={step}
                onClick={(e) => openEditorForStep(e, step)}
                className={`flex items-center gap-3 relative ${canEdit ? 'cursor-pointer' : ''}`}
              >
                {/* Dot */}
                {isDelayed ? (
                  <div className="absolute -left-[25px] w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center ring-4 ring-white z-10 shadow-sm">
                    !
                  </div>
                ) : (
                  <div
                    className={`absolute -left-[23px] w-[14px] h-[14px] rounded-full flex items-center justify-center transition-colors duration-300 z-10 ${
                      isCompleted
                        ? 'bg-black ring-4 ring-white'
                        : 'bg-white border-2 border-neutral-300 ring-4 ring-white'
                    }`}
                  />
                )}
                {/* Content */}
                <div className="flex justify-between items-center w-full gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[12px] font-bold tracking-wide transition-colors ${
                        isDelayed
                          ? 'text-red-600 font-extrabold'
                          : isCompleted
                          ? 'text-black font-extrabold'
                          : 'text-neutral-400'
                      }`}
                    >
                      {step}
                    </span>
                    {isDelayed && milestone.delayNote && (
                      <span className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded font-semibold">
                        {milestone.delayNote}
                      </span>
                    )}
                  </div>
                  {badgeDate && (
                    <span className="text-[11px] font-bold text-neutral-500 bg-white border border-neutral-200 rounded px-2 py-0.5 shadow-2xs">
                      {completedFormatted ? `Done ${completedFormatted}` : expectedFormatted ? `Est. ${expectedFormatted}` : badgeDate}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline Dates & Delay Editor Modal */}
      {isEditorOpen && canEdit && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setIsEditorOpen(false);
          }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white max-w-2xl w-full rounded-2xl border border-brand-border shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-neutral-50/70">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center">
                  <Calendar size={18} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-brand-primary">
                    Order Timeline & Delay Controls
                  </h3>
                  <p className="text-xs text-brand-secondary">
                    Set actual completion dates, target dates for predictable timelines, or flag delayed steps with a red <strong className="text-red-600">!</strong>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoFillPredictableDates}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                  title="Automatically space target dates across all steps up to the order due date"
                >
                  <Sparkles size={13} />
                  <span>Auto-Fill Target Dates</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveTimeline}>
              <div className="p-6 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {TIMELINE_STEPS.map((step, idx) => {
                  const isStepCompleted = idx <= Math.floor(visualIndex);
                  const stepData = draftMilestones[step] || {};
                  const isFocused = focusedStep === step;

                  return (
                    <div
                      key={step}
                      className={`p-3.5 rounded-xl border transition-all ${
                        stepData.delayed
                          ? 'bg-red-50/50 border-red-300'
                          : isFocused
                          ? 'bg-neutral-50 border-brand-primary ring-1 ring-brand-primary/20'
                          : 'bg-white border-brand-border/80'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-[140px]">
                          {stepData.delayed ? (
                            <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-black flex items-center justify-center shrink-0 shadow-xs">
                              !
                            </span>
                          ) : (
                            <span
                              className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                                isStepCompleted
                                  ? 'bg-black text-white'
                                  : 'bg-neutral-100 text-neutral-600 border border-neutral-300'
                              }`}
                            >
                              {isStepCompleted ? <Check size={12} strokeWidth={3} /> : idx + 1}
                            </span>
                          )}
                          <div>
                            <span className="text-sm font-bold text-brand-primary block leading-tight">
                              {step}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-secondary">
                              {stepData.delayed ? (
                                <span className="text-red-600 font-bold">Delayed</span>
                              ) : isStepCompleted ? (
                                <span className="text-emerald-600">Reached</span>
                              ) : (
                                'Upcoming'
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">
                              Action Completed Date
                            </label>
                            <input
                              type="date"
                              value={stepData.completedAt || ''}
                              onChange={(e) =>
                                setDraftMilestones((prev) => ({
                                  ...prev,
                                  [step]: { ...(prev[step] || {}), completedAt: e.target.value }
                                }))
                              }
                              className="w-full bg-white border border-brand-border rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-primary focus:border-brand-primary focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1">
                              Target / Expected By Date
                            </label>
                            <input
                              type="date"
                              value={stepData.expectedDate || ''}
                              onChange={(e) =>
                                setDraftMilestones((prev) => ({
                                  ...prev,
                                  [step]: { ...(prev[step] || {}), expectedDate: e.target.value }
                                }))
                              }
                              className="w-full bg-white border border-brand-border rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-primary focus:border-brand-primary focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setDraftMilestones((prev) => ({
                                ...prev,
                                [step]: {
                                  ...(prev[step] || {}),
                                  delayed: !prev[step]?.delayed
                                }
                              }))
                            }
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                              stepData.delayed
                                ? 'bg-red-600 text-white border-red-600 shadow-xs'
                                : 'bg-white text-neutral-600 border-brand-border hover:border-red-400 hover:text-red-600'
                            }`}
                            title="Toggle Red Exclamation Mark (!) Delay Indicator on Timeline"
                          >
                            <span className="font-black text-sm leading-none">!</span>
                            <span>{stepData.delayed ? 'Delayed' : 'Mark Delay'}</span>
                          </button>
                        </div>
                      </div>

                      {stepData.delayed && (
                        <div className="mt-2.5 pt-2.5 border-t border-red-200/70">
                          <input
                            type="text"
                            value={stepData.delayNote || ''}
                            onChange={(e) =>
                              setDraftMilestones((prev) => ({
                                ...prev,
                                [step]: { ...(prev[step] || {}), delayNote: e.target.value }
                              }))
                            }
                            placeholder="Optional delay reason (shown on hover, e.g. Blank garments backordered until Friday)..."
                            className="w-full bg-white border border-red-200 rounded-lg px-3 py-1.5 text-xs text-red-900 placeholder:text-red-300 focus:border-red-500 focus:outline-none font-medium"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="px-6 py-4 border-t border-brand-border bg-neutral-50/70 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl border border-brand-border bg-white hover:bg-neutral-50 text-xs font-bold text-brand-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-black hover:bg-neutral-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Timeline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
