// src/app/shared/toast.service.ts
import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export type ToastItem = {
  id: number; kind: ToastKind; title?: string; message: string; timeout?: number;
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _items = signal<ToastItem[]>([]);
  readonly items = this._items.asReadonly();

  private nextId = 1;

  show(kind: ToastKind, message: string, title?: string, timeout = 3500) {
    const id = this.nextId++;
    const item: ToastItem = { id, kind, title, message, timeout };
    this._items.update(arr => [item, ...arr]);
    if (timeout > 0) {
      setTimeout(() => this.dismiss(id), timeout);
    }
  }

  success(msg: string, title = 'Success') { this.show('success', msg, title); }
  error(msg: string, title = 'Error') { this.show('error', msg, title, 5000); }
  info(msg: string, title = 'Info') { this.show('info', msg, title); }
  warning(msg: string, title = 'Warning') { this.show('warning', msg, title, 5000); }

  dismiss(id: number) {
    this._items.update(arr => arr.filter(x => x.id !== id));
  }

  clear() { this._items.set([]); }
}
