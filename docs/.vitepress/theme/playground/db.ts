import type { WorkspaceState } from './workspace'

const DB_NAME = 'gscvm-playground'
const DB_VERSION = 1
const STORE_NAME = 'workspaces'
const WORKSPACE_KEY = 'default'
const FALLBACK_KEY = 'gscvm-playground-workspace'

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

async function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available')
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME)
    }
  }

  return requestToPromise(request)
}

function loadFallback(): WorkspaceState | null {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY)
    return raw ? (JSON.parse(raw) as WorkspaceState) : null
  } catch {
    return null
  }
}

function saveFallback(state: WorkspaceState): void {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable in private mode or when the quota is full.
  }
}

export async function loadWorkspace(): Promise<WorkspaceState | null> {
  try {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const state = await requestToPromise(store.get(WORKSPACE_KEY))
      await transactionDone(transaction)
      return (state as WorkspaceState | undefined) ?? loadFallback()
    } finally {
      database.close()
    }
  } catch {
    return loadFallback()
  }
}

export async function saveWorkspace(state: WorkspaceState): Promise<void> {
  try {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(state, WORKSPACE_KEY)
      await transactionDone(transaction)
    } finally {
      database.close()
    }
  } catch {
    saveFallback(state)
  }
}
