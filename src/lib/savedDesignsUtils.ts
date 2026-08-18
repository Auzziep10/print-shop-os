import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface SavedDesignItem {
  id: string;
  designName: string;
  createdAt: string;
  updatedAt: string;
  customerId: string;
  garment: any;
}

/**
 * Fetch all saved designs for a given customer
 */
export async function getSavedDesigns(customerId: string): Promise<SavedDesignItem[]> {
  if (!customerId) return [];
  try {
    const docRef = doc(db, 'customers', customerId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.savedDesigns || [];
    }
  } catch (err) {
    console.error('Error fetching saved designs:', err);
  }
  return [];
}

/**
 * Save or update a design in a customer's savedDesigns library
 */
export async function saveDesignToLibrary(
  customerId: string,
  designName: string,
  configuredGarment: any,
  existingDesignId?: string
): Promise<SavedDesignItem> {
  const targetCustomerId = customerId || 'CUS-001';
  const now = new Date().toISOString();

  const newDesignItem: SavedDesignItem = {
    id: existingDesignId || `SD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    designName: designName.trim() || `${configuredGarment.brand || ''} ${configuredGarment.style || 'Custom'} (${configuredGarment.selectedColor || 'Design'})`,
    createdAt: now,
    updatedAt: now,
    customerId: targetCustomerId,
    garment: configuredGarment
  };

  try {
    const docRef = doc(db, 'customers', targetCustomerId);
    const docSnap = await getDoc(docRef);

    let currentSavedDesigns: SavedDesignItem[] = [];
    if (docSnap.exists()) {
      currentSavedDesigns = docSnap.data().savedDesigns || [];
    }

    // Replace if editing existing or prepend if new
    let updatedList: SavedDesignItem[];
    if (existingDesignId) {
      updatedList = currentSavedDesigns.map(d => (d.id === existingDesignId ? newDesignItem : d));
    } else {
      updatedList = [newDesignItem, ...currentSavedDesigns.filter(d => d.id !== newDesignItem.id)];
    }

    await setDoc(docRef, {
      savedDesigns: updatedList
    }, { merge: true });

    return newDesignItem;
  } catch (err) {
    console.error('Error saving design to library:', err);
    throw err;
  }
}

/**
 * Delete a saved design from customer library
 */
export async function deleteSavedDesign(customerId: string, designId: string): Promise<boolean> {
  const targetCustomerId = customerId || 'CUS-001';
  try {
    const docRef = doc(db, 'customers', targetCustomerId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const currentList: SavedDesignItem[] = docSnap.data().savedDesigns || [];
      const updatedList = currentList.filter(d => d.id !== designId);
      await updateDoc(docRef, {
        savedDesigns: updatedList
      });
      return true;
    }
  } catch (err) {
    console.error('Error deleting saved design:', err);
  }
  return false;
}
