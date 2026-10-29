import { useState, useEffect } from 'react';
import {
  useFulfillmentPipelines,
  type FulfillmentPipelineConfig
} from '../../lib/timelineUtils';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Check,
  Loader2,
  GitBranch,
  Lock
} from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';

export function FulfillmentPipelinesTab() {
  const { pipelines, savePipelines } = useFulfillmentPipelines();
  const [draftPipelines, setDraftPipelines] = useState<FulfillmentPipelineConfig[]>(pipelines);
  const [newStepInputs, setNewStepInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setDraftPipelines(pipelines);
  }, [pipelines]);

  const handleAddFulfillmentType = () => {
    const newId = `Custom_${Date.now()}`;
    const nextType: FulfillmentPipelineConfig = {
      id: newId,
      name: 'New Fulfillment Type',
      steps: ['Requested', 'Approved', 'Sourced', 'In Production', 'Shipped', 'Received'],
      isSystem: false,
      useCustomStatusList: true
    };
    setDraftPipelines((prev) => [...prev, nextType]);
  };

  const handleRemoveFulfillmentType = (id: string) => {
    if (!window.confirm('Remove this fulfillment type? Existing orders using it will fall back to Delivered.')) {
      return;
    }
    setDraftPipelines((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUpdateName = (id: string, name: string) => {
    setDraftPipelines((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
  };

  const handleUpdateStepLabel = (pipelineId: string, stepIdx: number, value: string) => {
    setDraftPipelines((prev) =>
      prev.map((p) => {
        if (p.id !== pipelineId) return p;
        const nextSteps = [...p.steps];
        nextSteps[stepIdx] = value;
        return { ...p, steps: nextSteps };
      })
    );
  };

  const handleMoveStep = (pipelineId: string, stepIdx: number, direction: -1 | 1) => {
    setDraftPipelines((prev) =>
      prev.map((p) => {
        if (p.id !== pipelineId) return p;
        const targetIdx = stepIdx + direction;
        if (targetIdx < 0 || targetIdx >= p.steps.length) return p;
        const nextSteps = [...p.steps];
        const [moved] = nextSteps.splice(stepIdx, 1);
        nextSteps.splice(targetIdx, 0, moved);
        return { ...p, steps: nextSteps };
      })
    );
  };

  const handleRemoveStep = (pipelineId: string, stepIdx: number) => {
    setDraftPipelines((prev) =>
      prev.map((p) => {
        if (p.id !== pipelineId) return p;
        if (p.steps.length <= 2) {
          alert('A fulfillment timeline must have at least 2 statuses.');
          return p;
        }
        return {
          ...p,
          steps: p.steps.filter((_, i) => i !== stepIdx)
        };
      })
    );
  };

  const handleAddStep = (pipelineId: string) => {
    const raw = (newStepInputs[pipelineId] || '').trim();
    if (!raw) return;
    setDraftPipelines((prev) =>
      prev.map((p) =>
        p.id === pipelineId ? { ...p, steps: [...p.steps, raw] } : p
      )
    );
    setNewStepInputs((prev) => ({ ...prev, [pipelineId]: '' }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const cleaned = draftPipelines.map((p) => ({
        ...p,
        name: p.name.trim() || 'Untitled Fulfillment',
        steps: p.steps.map((s) => s.trim()).filter(Boolean)
      }));
      await savePipelines(cleaned);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving fulfillment pipelines:', err);
      alert('Failed to save fulfillment pipelines.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={tokens.typography.h2 + ' mb-1 flex items-center gap-2'}>
            <GitBranch className="text-brand-primary" size={20} />
            Fulfillment Types &amp; Timeline Statuses
          </h2>
          <p className={tokens.typography.bodyMuted}>
            Create custom fulfillment types and configure the exact statuses that appear in order dropdowns and on the visual timeline tracker.
          </p>
        </div>

        <PillButton
          variant="filled"
          onClick={handleAddFulfillmentType}
          className="gap-2 shrink-0 self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>Add Fulfillment Type</span>
        </PillButton>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {draftPipelines.map((pipeline) => {
          const isSystem = Boolean(pipeline.isSystem || pipeline.id === 'Standard' || pipeline.id === 'Kitting');

          return (
            <div
              key={pipeline.id}
              className="bg-white border border-brand-border rounded-2xl p-5 shadow-sm flex flex-col justify-between gap-5"
            >
              <div className="space-y-4">
                {/* Header: Fulfillment Type Name & Badge */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-brand-border/60">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-brand-secondary mb-1">
                      Fulfillment Type Name
                    </label>
                    <input
                      type="text"
                      value={pipeline.name}
                      onChange={(e) => handleUpdateName(pipeline.id, e.target.value)}
                      className="w-full bg-brand-bg/60 border border-brand-border rounded-xl px-3.5 py-2 text-sm font-bold text-brand-primary focus:border-brand-primary focus:bg-white focus:outline-none transition-colors"
                      placeholder="e.g. Direct to Artist, Tour Merch, Kitting..."
                    />
                  </div>

                  <div className="shrink-0 pt-5">
                    {isSystem ? (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-600 border border-neutral-200"
                        title="Built-in fulfillment type (timeline steps can still be customized)"
                      >
                        <Lock size={10} />
                        Default Type
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemoveFulfillmentType(pipeline.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
                        title="Delete Fulfillment Type"
                      >
                        <Trash2 size={14} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Mini Timeline Preview */}
                <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl px-4 pt-3 pb-7">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 mb-3">
                    Timeline Preview ({pipeline.steps.length} Statuses)
                  </div>
                  <div className="relative w-full">
                    <div className="absolute top-[5px] left-0 w-full h-[6px] bg-neutral-200 rounded-full" />
                    <div className="absolute top-[5px] left-0 w-1/2 h-[6px] bg-neutral-400 rounded-full" />
                    <div className="relative flex justify-between items-center z-10">
                      {pipeline.steps.map((step, idx) => {
                        const completed = idx <= Math.floor((pipeline.steps.length - 1) / 2);
                        return (
                          <div key={idx} className="flex flex-col items-center relative">
                            <div
                              className={`w-3.5 h-3.5 rounded-full ${
                                completed
                                  ? 'bg-black'
                                  : 'bg-white border-2 border-neutral-300'
                              }`}
                            />
                            <span className="absolute top-4 text-[9px] font-bold text-neutral-700 whitespace-nowrap max-w-[72px] truncate text-center">
                              {step || `Step ${idx + 1}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Editable Steps List */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-brand-secondary">
                    Timeline Status Steps (In Order)
                  </label>

                  <div className="space-y-1.5">
                    {pipeline.steps.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-brand-bg/30 border border-brand-border/70 rounded-xl px-2.5 py-1.5"
                      >
                        <span className="w-5 h-5 rounded-full bg-neutral-900 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={step}
                          onChange={(e) =>
                            handleUpdateStepLabel(pipeline.id, idx, e.target.value)
                          }
                          className="flex-1 bg-transparent text-xs font-bold text-brand-primary focus:outline-none px-1"
                          placeholder={`Status ${idx + 1}`}
                        />
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveStep(pipeline.id, idx, -1)}
                            className="p-1 text-neutral-400 hover:text-neutral-800 disabled:opacity-25 cursor-pointer"
                            title="Move Step Up"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === pipeline.steps.length - 1}
                            onClick={() => handleMoveStep(pipeline.id, idx, 1)}
                            className="p-1 text-neutral-400 hover:text-neutral-800 disabled:opacity-25 cursor-pointer"
                            title="Move Step Down"
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(pipeline.id, idx)}
                            className="p-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                            title="Remove Step"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add New Step Row */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newStepInputs[pipeline.id] || ''}
                      onChange={(e) =>
                        setNewStepInputs((prev) => ({
                          ...prev,
                          [pipeline.id]: e.target.value
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddStep(pipeline.id);
                        }
                      }}
                      placeholder="Add new timeline status (e.g. Mockup Approved, Boxed)..."
                      className="flex-1 bg-white border border-brand-border rounded-xl px-3 py-2 text-xs font-medium text-brand-primary focus:border-brand-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddStep(pipeline.id)}
                      className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                    >
                      <Plus size={14} />
                      <span>Add Status</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Save Bar */}
      <div className="pt-6 border-t border-brand-border flex items-center gap-4">
        <PillButton
          variant="filled"
          onClick={handleSave}
          disabled={saving}
          className="min-w-[200px] justify-center"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={18} />
          ) : saveSuccess ? (
            <span className="flex items-center gap-1.5">
              <Check size={16} /> Saved!
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Save size={18} /> Save Fulfillment Types
            </span>
          )}
        </PillButton>
        {saveSuccess && (
          <span className="text-xs text-emerald-600 font-semibold animate-in fade-in duration-300">
            Fulfillment types and timeline statuses saved and applied across all orders!
          </span>
        )}
      </div>
    </div>
  );
}
