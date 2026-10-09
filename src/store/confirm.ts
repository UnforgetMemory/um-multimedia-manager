import { defineStore } from 'pinia';
import { reactive } from 'vue';
import type { Component } from 'vue';
import { AlertCircle } from '@/libraries/ui/icons';

/**
 * 结构化预览表格（ADR-027）——通用形状，**不耦合任何业务类型**：
 * 调用方（如 WebDAV 同步页签）把业务数据映射成已本地化的表头与单元格。
 */
export interface ConfirmTableRow {
  cells: string[];
  /** 语义色调：`danger` = 会覆盖/丢失数据，`warn` = 需留意（本地较新会被回退）。 */
  tone?: 'default' | 'warn' | 'danger';
}

export interface ConfirmTable {
  headers: string[];
  rows: ConfirmTableRow[];
}

interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  warning?: string;
  details?: string;
  table?: ConfirmTable;
  icon: Component;
  confirmText?: string;
  loading: boolean;
  action: () => Promise<void>;
}

const defaultState: ConfirmDialogState = {
  open: false,
  title: '',
  description: '',
  // Present-and-undefined on purpose: Object.assign only copies keys the source
  // has, so omitting these would leave a previous dialog's warning/details on the
  // state forever.
  warning: undefined,
  details: undefined,
  table: undefined,
  icon: AlertCircle,
  confirmText: '确认',
  loading: false,
  action: async () => {},
};

export const useConfirmStore = defineStore('confirm', () => {
  const state = reactive<ConfirmDialogState>({ ...defaultState });

  // Dialog generation: every show() starts a new request. An in-flight confirm()
  // must resolve only against the request it captured — otherwise a second
  // caller's dialog gets closed (or its answer consumed) by the first one
  // finishing.
  let generation = 0;

  function show(config: Omit<ConfirmDialogState, 'open' | 'loading'>) {
    generation++;
    // Reset before merging: a bare Object.assign lets an earlier dialog's
    // optional fields (its warning line, details, button label) survive into an
    // unrelated confirmation.
    Object.assign(state, defaultState);
    Object.assign(state, { ...config, open: true, loading: false });
  }

  async function confirm() {
    if (state.loading) return; // re-entry guard: one action run per open dialog
    state.loading = true;
    const action = state.action;
    const ownGeneration = generation;
    try {
      await action();
      if (generation === ownGeneration) state.open = false;
    } catch {
      /* handled by caller */
    } finally {
      if (generation === ownGeneration) state.loading = false;
    }
  }

  return { state, show, confirm };
});
