/**
 * useFolderCache — SWR Cache + Optimistic Mutations for Folder Tree
 * 
 * Implements the Stale-While-Revalidate pattern:
 * 1. On expand: return cached data instantly, revalidate in background
 * 2. On create: inject temporary node, swap with real ID after API confirms
 * 3. On rename: update cache instantly, rollback on error
 * 4. On delete: remove from cache instantly, rollback on error
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import { apiFetch } from '../utils/apiFetch';
import toast from 'react-hot-toast';

const STALE_TIME = 30_000; // 30 seconds before silent revalidation

export function useFolderCache(apiBase, projectPrefix) {
  // Map<nodeId, { folders: [], timestamp: number }>
  const cacheRef = useRef(new Map());
  // Force re-renders when cache changes
  const [cacheVersion, setCacheVersion] = useState(0);
  const bumpCache = useCallback(() => setCacheVersion(v => v + 1), []);
  
  // Track in-flight fetches to deduplicate
  const inflightRef = useRef(new Map());

  // ── READ: Get cached children for a node ──
  const getChildren = useCallback((nodeId) => {
    const key = nodeId || '__root__';
    const entry = cacheRef.current.get(key);
    if (!entry) return { folders: null, files: null, stale: true, loading: false };
    
    const age = Date.now() - entry.timestamp;
    return {
      folders: entry.folders,
      files: entry.files,
      stale: age > STALE_TIME,
      loading: !!inflightRef.current.get(key)
    };
  }, []); // Stable — reads from refs, not state

  // ── FETCH: Load children from API (internal) ──
  const fetchNode = useCallback(async (nodeId, folderFullName) => {
    const key = nodeId || '__root__';
    
    // Deduplicate: if already fetching this node, skip
    if (inflightRef.current.get(key)) return;
    inflightRef.current.set(key, true);
    bumpCache();

    try {
      const pathParam = encodeURIComponent(folderFullName || projectPrefix);
      const urnParam = encodeURIComponent(projectPrefix);
      const url = `${apiBase}/api/docs/list?path=${pathParam}&model_urn=${urnParam}${nodeId ? `&id=${nodeId}` : ''}`;
      
      const res = await apiFetch(url);
      if (res.ok) {
        const response = await res.json();
        const data = response.data || {};
        const sortedFolders = (data.folders || []).sort((a, b) => 
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
        const sortedFiles = (data.files || []).map(f => ({...f, type: 'file'})).sort((a, b) => 
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
        
        cacheRef.current.set(key, {
          folders: sortedFolders,
          files: sortedFiles,
          timestamp: Date.now()
        });
      }
    } catch (e) {
      console.error('[FolderCache] Fetch error:', e);
    } finally {
      inflightRef.current.delete(key);
      bumpCache();
    }
  }, [apiBase, projectPrefix, bumpCache]);

  // ── EXPAND: SWR pattern — cache-first, revalidate in background ──
  const expandNode = useCallback(async (nodeId, folderFullName) => {
    const key = nodeId || '__root__';
    const entry = cacheRef.current.get(key);

    if (entry) {
      const age = Date.now() - entry.timestamp;
      if (age > STALE_TIME) {
        // Stale → revalidate silently in background (don't await)
        fetchNode(nodeId, folderFullName);
      }
      // Whether stale or fresh, we already have data to render
      return;
    }

    // Cache miss → fetch (caller should show skeleton/spinner per-node)
    await fetchNode(nodeId, folderFullName);
  }, [fetchNode]);

  // ── INVALIDATE: Force refetch on next expand ──
  const invalidateNode = useCallback((nodeId) => {
    const key = nodeId || '__root__';
    cacheRef.current.delete(key);
    bumpCache();
  }, [bumpCache]);

  // ── INVALIDATE ALL: Clear entire cache (for major operations) ──
  const invalidateAll = useCallback(() => {
    cacheRef.current.clear();
    bumpCache();
  }, [bumpCache]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // OPTIMISTIC MUTATIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── CREATE: Inject temp node → POST → swap or rollback ──
  const optimisticCreate = useCallback((parentId, tempFolder) => {
    const key = parentId || '__root__';
    const entry = cacheRef.current.get(key);
    if (entry) {
      entry.folders = [...entry.folders, tempFolder];
      entry.timestamp = Date.now();
    } else {
      cacheRef.current.set(key, {
        folders: [tempFolder],
        files: [],
        timestamp: Date.now()
      });
    }
    bumpCache();
  }, [bumpCache]);

  const commitCreate = useCallback((parentId, tempId, realId) => {
    const key = parentId || '__root__';
    const entry = cacheRef.current.get(key);
    if (entry) {
      entry.folders = entry.folders.map(f => 
        f.id === tempId ? { ...f, id: realId, _syncing: false } : f
      );
      entry.timestamp = Date.now();
    }
    bumpCache();
  }, [bumpCache]);

  const rollbackCreate = useCallback((parentId, tempId) => {
    const key = parentId || '__root__';
    const entry = cacheRef.current.get(key);
    if (entry) {
      entry.folders = entry.folders.filter(f => f.id !== tempId);
      entry.timestamp = Date.now();
    }
    bumpCache();
  }, [bumpCache]);

  // ── RENAME: Update name in cache → PUT → confirm or rollback ──
  const optimisticRename = useCallback((parentId, nodeId, newName) => {
    const key = parentId || '__root__';
    const entry = cacheRef.current.get(key);
    if (entry) {
      entry.folders = entry.folders.map(f =>
        f.id === nodeId ? { ...f, name: newName, _syncing: true } : f
      );
    }
    bumpCache();
  }, [bumpCache]);

  const commitRename = useCallback((parentId, nodeId) => {
    const key = parentId || '__root__';
    const entry = cacheRef.current.get(key);
    if (entry) {
      entry.folders = entry.folders.map(f =>
        f.id === nodeId ? { ...f, _syncing: false } : f
      );
    }
    bumpCache();
  }, [bumpCache]);

  const rollbackRename = useCallback((parentId, nodeId, oldName) => {
    const key = parentId || '__root__';
    const entry = cacheRef.current.get(key);
    if (entry) {
      entry.folders = entry.folders.map(f =>
        f.id === nodeId ? { ...f, name: oldName, _syncing: false } : f
      );
    }
    bumpCache();
  }, [bumpCache]);

  // ── DELETE: Remove from cache → DELETE → confirm or rollback ──
  const optimisticDelete = useCallback((parentId, nodeId) => {
    const key = parentId || '__root__';
    const entry = cacheRef.current.get(key);
    let removed = null;
    if (entry) {
      removed = entry.folders.find(f => f.id === nodeId);
      entry.folders = entry.folders.filter(f => f.id !== nodeId);
    }
    bumpCache();
    return removed; // Caller keeps this for rollback
  }, [bumpCache]);

  const rollbackDelete = useCallback((parentId, folderData) => {
    const key = parentId || '__root__';
    const entry = cacheRef.current.get(key);
    if (entry && folderData) {
      entry.folders = [...entry.folders, folderData].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );
    }
    bumpCache();
  }, [bumpCache]);

  const methods = useMemo(() => ({
    getChildren,
    expandNode,
    fetchNode,
    invalidateNode,
    invalidateAll,
    optimisticCreate,
    commitCreate,
    rollbackCreate,
    optimisticRename,
    commitRename,
    rollbackRename,
    optimisticDelete,
    rollbackDelete,
  }), [
    getChildren, expandNode, fetchNode, invalidateNode, invalidateAll,
    optimisticCreate, commitCreate, rollbackCreate,
    optimisticRename, commitRename, rollbackRename,
    optimisticDelete, rollbackDelete
  ]);

  // Return methods + cacheVersion separately so consumers can choose
  // whether to subscribe to version changes (table sync) or not (tree nodes).
  return { methods, cacheVersion };
}

