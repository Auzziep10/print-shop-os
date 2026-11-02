export * from 'firebase/firestore';

import {
  updateDoc as realUpdateDoc,
  setDoc as realSetDoc,
  addDoc as realAddDoc,
  deleteDoc as realDeleteDoc,
  writeBatch as realWriteBatch,
  type Firestore
} from 'firebase/firestore';
import {
  prepareTrackedWritePayload,
  finalizeTrackedWriteEvent,
  type ActivityPopupEvent
} from './roleActivityTracker';

export const updateDoc: typeof realUpdateDoc = (async (reference: any, data: any, ...rest: any[]) => {
  if (rest.length === 0 && data && typeof data === 'object' && reference?.path) {
    const { enrichedData, pendingEvent } = prepareTrackedWritePayload(
      reference.firestore,
      reference.path,
      'update',
      data
    );
    const result = await (realUpdateDoc as any)(reference, enrichedData ?? data);
    if (pendingEvent) {
      finalizeTrackedWriteEvent(reference.firestore, pendingEvent);
    }
    return result;
  }
  return (realUpdateDoc as any)(reference, data, ...rest);
}) as typeof realUpdateDoc;

export const setDoc: typeof realSetDoc = (async (reference: any, data: any, options?: any) => {
  if (data && typeof data === 'object' && reference?.path) {
    const isMerge = Boolean(options && (options.merge || options.mergeFields));
    const { enrichedData, pendingEvent } = prepareTrackedWritePayload(
      reference.firestore,
      reference.path,
      isMerge ? 'update' : 'create',
      data
    );
    const result =
      options !== undefined
        ? await (realSetDoc as any)(reference, enrichedData ?? data, options)
        : await (realSetDoc as any)(reference, enrichedData ?? data);
    if (pendingEvent) {
      finalizeTrackedWriteEvent(reference.firestore, pendingEvent);
    }
    return result;
  }
  return options !== undefined
    ? (realSetDoc as any)(reference, data, options)
    : (realSetDoc as any)(reference, data);
}) as typeof realSetDoc;

export const addDoc: typeof realAddDoc = (async (reference: any, data: any) => {
  const docRef = await (realAddDoc as any)(reference, data);
  if (data && typeof data === 'object' && docRef?.path) {
    const { pendingEvent } = prepareTrackedWritePayload(
      reference?.firestore || docRef.firestore,
      docRef.path,
      'create',
      data
    );
    if (pendingEvent) {
      finalizeTrackedWriteEvent(reference?.firestore || docRef.firestore, pendingEvent);
    }
  }
  return docRef;
}) as typeof realAddDoc;

export const deleteDoc: typeof realDeleteDoc = (async (reference: any) => {
  const pending =
    reference?.path
      ? prepareTrackedWritePayload(reference.firestore, reference.path, 'delete')
      : undefined;
  const result = await realDeleteDoc(reference);
  if (pending?.pendingEvent) {
    finalizeTrackedWriteEvent(reference.firestore, pending.pendingEvent);
  }
  return result;
}) as typeof realDeleteDoc;

export const writeBatch: typeof realWriteBatch = ((firestore: Firestore) => {
  const rawBatch = realWriteBatch(firestore);
  const pendingEvents: ActivityPopupEvent[] = [];

  return {
    set(documentRef: any, data: any, options?: any) {
      let nextData = data;
      if (data && typeof data === 'object' && documentRef?.path) {
        const isMerge = Boolean(options && (options.merge || options.mergeFields));
        const { enrichedData, pendingEvent } = prepareTrackedWritePayload(
          firestore,
          documentRef.path,
          isMerge ? 'update' : 'create',
          data
        );
        if (enrichedData) nextData = enrichedData;
        if (pendingEvent) pendingEvents.push(pendingEvent);
      }
      if (options !== undefined) {
        (rawBatch.set as any)(documentRef, nextData, options);
      } else {
        (rawBatch.set as any)(documentRef, nextData);
      }
      return this;
    },
    update(documentRef: any, dataOrField: any, ...moreFieldsAndValues: any[]) {
      let nextData = dataOrField;
      if (
        moreFieldsAndValues.length === 0 &&
        dataOrField &&
        typeof dataOrField === 'object' &&
        documentRef?.path
      ) {
        const { enrichedData, pendingEvent } = prepareTrackedWritePayload(
          firestore,
          documentRef.path,
          'update',
          dataOrField
        );
        if (enrichedData) nextData = enrichedData;
        if (pendingEvent) pendingEvents.push(pendingEvent);
      }
      (rawBatch.update as any)(documentRef, nextData, ...moreFieldsAndValues);
      return this;
    },
    delete(documentRef: any) {
      if (documentRef?.path) {
        const { pendingEvent } = prepareTrackedWritePayload(
          firestore,
          documentRef.path,
          'delete'
        );
        if (pendingEvent) pendingEvents.push(pendingEvent);
      }
      rawBatch.delete(documentRef);
      return this;
    },
    async commit() {
      await rawBatch.commit();
      pendingEvents.forEach((ev) => finalizeTrackedWriteEvent(firestore, ev));
    }
  };
}) as typeof realWriteBatch;
