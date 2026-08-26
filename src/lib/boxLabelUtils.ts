import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_BOX_LABEL_PRESETS } from '../types/boxLabel';
import type { BoxLabelPreset } from '../types/boxLabel';

export async function fetchBoxLabelPresets(): Promise<BoxLabelPreset[]> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'boxLabelPresets'));
    if (snap.exists()) {
      const data = snap.data();
      const customPresets: BoxLabelPreset[] = data.presets || [];
      // Combine defaults with custom presets
      const allPresets = [...DEFAULT_BOX_LABEL_PRESETS];
      customPresets.forEach(cp => {
        const existingIdx = allPresets.findIndex(p => p.id === cp.id);
        if (existingIdx >= 0) {
          allPresets[existingIdx] = cp;
        } else {
          allPresets.push(cp);
        }
      });
      if (data.defaultPresetId) {
        allPresets.forEach(p => {
          p.isDefault = p.id === data.defaultPresetId;
        });
      }
      return allPresets;
    }
  } catch (err) {
    console.error('Failed to fetch box label presets:', err);
  }
  return DEFAULT_BOX_LABEL_PRESETS;
}

export async function saveBoxLabelPreset(preset: BoxLabelPreset): Promise<void> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'boxLabelPresets'));
    let existingCustom: BoxLabelPreset[] = snap.exists() ? (snap.data().presets || []) : [];
    
    const idx = existingCustom.findIndex(p => p.id === preset.id);
    if (idx >= 0) {
      existingCustom[idx] = preset;
    } else {
      existingCustom.push(preset);
    }

    const payload: any = {
      presets: existingCustom,
      updatedAt: new Date().toISOString()
    };

    if (preset.isDefault) {
      payload.defaultPresetId = preset.id;
    }

    await setDoc(doc(db, 'settings', 'boxLabelPresets'), payload, { merge: true });
  } catch (err) {
    console.error('Failed to save box label preset:', err);
    throw err;
  }
}

export async function setDefaultBoxLabelPreset(presetId: string): Promise<void> {
  try {
    await setDoc(doc(db, 'settings', 'boxLabelPresets'), {
      defaultPresetId: presetId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('Failed to set default box label preset:', err);
    throw err;
  }
}
