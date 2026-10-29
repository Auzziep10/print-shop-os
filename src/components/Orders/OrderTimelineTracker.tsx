import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Calendar, Check, Sparkles, X, Clock } from 'lucide-react';
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
        completedAt: resolved.completedAt || '',
        expectedDate: toDateInputValue(resolved.expectedDate),
        delayed: resolved.delayed,
        delayNote: resolved.delayNote || ''
      };
    });
    setDraftMilestones(initialDraft);
    setFocusedStep(step);
    setIsEditorOpen(true);
  };

  const formatYmd = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const handleQuickAddDays = (step: TimelineStepName, daysToAdd: number) => {
    const baseStr = draftMilestones[step]?.expectedDate;
    let baseDate = new Date();
    if (baseStr && /^\d{4}-\d{2}-\d{2}$/.test(baseStr)) {
      const [y, m, d] = baseStr.split('-').map(Number);
      baseDate = new Date(y, m - 1, d);
    }
    const nextDate = new Date(baseDate.getTime() + daysToAdd * 86400000);
    setDraftMilestones((prev) => ({
      ...prev,
      [step]: {
        ...(prev[step] || {}),
        expectedDate: formatYmd(nextDate)
      }
    }));
  };

  const handleAutoFillPredictableDates = () => {
    const today = new Date();
    const endRaw =
      draftMilestones['Received']?.expectedDate ||
      toDateInputValue(order?.date || order?.targetCompletionDate || order?.neededByDate);

    let endDate: Date;
    if (endRaw && /^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
      const [ey, em, ed] = endRaw.split('-').map(Number);
      endDate = new Date(ey, em - 1, ed);
    } else {
      endDate = new Date(today.getTime() + 12 * 86400000);
    }

    if (endDate.getTime() <= today.getTime()) {
      endDate = new Date(today.getTime() + 10 * 86400000);
    }

    const firstUpcomingIdx = Math.max(0, Math.floor(visualIndex) + 1);
    const remainingStepsCount = Math.max(1, TIMELINE_STEPS.length - 1 - firstUpcomingIdx);
    const totalMs = endDate.getTime() - today.getTime();
    const nextDraft: TimelineMilestonesMap = { ...draftMilestones };

    TIMELINE_STEPS.forEach((step, idx) => {
      if (idx < firstUpcomingIdx) return;
      const ratio =
        remainingStepsCount === 0
          ? 1
          : Math.min(1, Math.max(0, (idx - firstUpcomingIdx + 1) / (TIMELINE_STEPS.length - firstUpcomingIdx)));
      const stepDate = idx === TIMELINE_STEPS.length - 1 ? endDate : new Date(today.getTime() + Math.round(totalMs * ratio));
      nextDraft[step] = {
        ...(nextDraft[step] || {}),
        expectedDate: formatYmd(stepDate)
      };
    });

    setDraftMilestones(nextDraft);
  };

  const handleSaveTimeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order?.id) return;
    setIsSaving(true);
    try {
      const existingMilestones: TimelineMilestonesMap = order?.timelineMilestones || {};
      const cleaned: TimelineMilestonesMap = {};

      TIMELINE_STEPS.forEach((step) => {
        const item = draftMilestones[step];
        const prevItem = existingMilestones[step];
        if (!item && !prevItem) return;
        cleaned[step] = {
          // Keep automatic completedAt timestamp untouched
          completedAt: prevItem?.completedAt || item?.completedAt || '',
          expectedDate: item?.expectedDate?.trim() || '',
          delayed: Boolean(item?.delayed),
          delayNote: item?.delayed ? item?.delayNote?.trim() || '' : ''
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
                        <span className="text-[10px] text-red-300 font-semibold max-w-[220px] truncate">
                          {milestone.delayNote}
                        </span>
                      )}
                      {isCompleted && completedFormatted ? (
                        <span className="text-[10px] text-emerald-300 font-semibold">
                          Completed: {completedFormatted}
                        </span>
                      ) : expectedFormatted ? (
                        <span className="text-[10px] text-amber-300 font-semibold">
                          Target: {expectedFormatted}
                        </span>
                      ) : (
                        <span className="text-[10px] text-neutral-400 font-medium">
                          {isCompleted ? 'Completed' : 'No target date set'}
                        </span>
                      )}
                      {isCompleted && expectedFormatted && completedFormatted !== expectedFormatted && (
                        <span className="text-[9px] text-neutral-400">
                          Target was: {expectedFormatted}
                        </span>
                      )}
                      {canEdit && (
                        <span className="text-[9px] text-neutral-400 border-t border-neutral-700/80 pt-0.5 mt-0.5">
                          Click to set target date or flag delay
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

      {/* Compact, Intuitive Timeline & Delay Modal (No manual completed date, zero scrolling) */}
      {isEditorOpen && canEdit && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setIsEditorOpen(false);
          }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white max-w-2xl w-full rounded-2xl border border-brand-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-brand-border flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0">
                  <Calendar size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-brand-primary leading-tight">
                    Timeline Schedule &amp; Delay Alerts
                  </h3>
                  <p className="text-[11px] text-brand-secondary">
                    Completed steps log their date automatically. Set target dates for upcoming steps or flag a delay.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoFillPredictableDates}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  title="Automatically space target dates across upcoming steps up to the final delivery date"
                >
                  <Sparkles size={13} />
                  <span>Auto-Fill Schedule</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveTimeline}>
              {/* Clean Horizontal Table of Steps */}
              <div className="divide-y divide-brand-border/60">
                {TIMELINE_STEPS.map((step, idx) => {
                  const isStepCompleted = idx <= Math.floor(visualIndex);
                  const stepData = draftMilestones[step] || {};
                  const isFocused = focusedStep === step;
                  const autoCompletedLabel = formatTimelineDate(stepData.completedAt);

                  return (
                    <div
                      key={step}
                      className={`px-5 py-2.5 transition-colors ${
                        stepData.delayed
                          ? 'bg-red-50/60'
                          : isFocused
                          ? 'bg-amber-50/40'
                          : isStepCompleted
                          ? 'bg-neutral-50/40'
                          : 'bg-white hover:bg-neutral-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* Left: Step Badge + Name */}
                        <div className="flex items-center gap-2.5 w-[165px] shrink-0">
                          {stepData.delayed ? (
                            <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-black flex items-center justify-center shrink-0 shadow-xs">
                              !
                            </span>
                          ) : (
                            <span
                              className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                                isStepCompleted
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-neutral-100 text-neutral-600 border border-neutral-300'
                              }`}
                            >
                              {isStepCompleted ? <Check size={12} strokeWidth={3} /> : idx + 1}
                            </span>
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-brand-primary block truncate">
                              {step}
                            </span>
                            {stepData.delayed ? (
                              <span className="text-[10px] font-extrabold uppercase text-red-600">
                                Delayed
                              </span>
                            ) : isStepCompleted ? (
                              <span className="text-[10px] font-bold text-emerald-700">
                                Completed
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-neutral-400">
                                Upcoming
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Middle: Automatic Completed Timestamp OR Target Date Picker */}
                        <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                          {isStepCompleted && !stepData.delayed ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-semibold">
                              <Check size={12} strokeWidth={2.5} className="text-emerald-600 shrink-0" />
                              <span>
                                Completed automatically{autoCompletedLabel ? ` on ${autoCompletedLabel}` : ''}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <Clock size={12} className="text-neutral-400 shrink-0" />
                                <span className="text-[11px] font-bold text-brand-secondary whitespace-nowrap">
                                  Target:
                                </span>
                                <input
                                  type="date"
                                  value={stepData.expectedDate || ''}
                                  onChange={(e) =>
                                    setDraftMilestones((prev) => ({
                                      ...prev,
                                      [step]: { ...(prev[step] || {}), expectedDate: e.target.value }
                                    }))
                                  }
                                  className="bg-white border border-brand-border hover:border-neutral-400 focus:border-brand-primary rounded-lg px-2.5 py-1 text-xs font-bold text-brand-primary focus:outline-none"
                                />
                              </div>

                              {/* Quick Date Bump Pills */}
                              <div className="hidden sm:inline-flex items-center gap-1">
                                {[
                                  { label: '+2d', days: 2 },
                                  { label: '+5d', days: 5 },
                                  { label: '+1w', days: 7 }
                                ].map((preset) => (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => handleQuickAddDays(step, preset.days)}
                                    className="px-1.5 py-0.5 rounded border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-[10px] font-bold text-neutral-600 cursor-pointer transition-colors"
                                    title={`Add ${preset.days} days to target date`}
                                  >
                                    {preset.label}
                                  </button>
                                ))}
                                {stepData.expectedDate && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDraftMilestones((prev) => ({
                                        ...prev,
                                        [step]: { ...(prev[step] || {}), expectedDate: '' }
                                      }))
                                    }
                                    className="px-1 text-[10px] font-semibold text-neutral-400 hover:text-red-600 cursor-pointer"
                                    title="Clear target date"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: 1-Click Delay Toggle */}
                        <div className="shrink-0">
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
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                              stepData.delayed
                                ? 'bg-red-600 text-white border-red-600 shadow-2xs'
                                : 'bg-white text-neutral-500 border-brand-border hover:border-red-300 hover:text-red-600'
                            }`}
                            title="Flag or unflag this step as Delayed (!)"
                          >
                            <span className="font-black">!</span>
                            <span>{stepData.delayed ? 'Delayed' : 'Delay'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Inline Delay Reason Input (Only shown when step is flagged Delayed) */}
                      {stepData.delayed && (
                        <div className="mt-2 pl-8">
                          <input
                            type="text"
                            value={stepData.delayNote || ''}
                            onChange={(e) =>
                              setDraftMilestones((prev) => ({
                                ...prev,
                                [step]: { ...(prev[step] || {}), delayNote: e.target.value }
                              }))
                            }
                            placeholder="Reason for delay (shown when hovering over the red ! on the timeline)..."
                            className="w-full bg-white border border-red-200 rounded-lg px-2.5 py-1 text-xs text-red-900 placeholder:text-red-300 focus:border-red-500 focus:outline-none font-medium"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-brand-border bg-neutral-50 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-1.5 rounded-xl border border-brand-border bg-white hover:bg-neutral-50 text-xs font-bold text-brand-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-1.5 rounded-xl bg-black hover:bg-neutral-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
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
