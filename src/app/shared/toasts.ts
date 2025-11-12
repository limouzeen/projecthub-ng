// src/app/shared/toasts.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toasts',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="fixed top-4 right-4 z-[999] space-y-2 pointer-events-none">
    @for (t of svc.items(); track t.id) {
      <div
        class="pointer-events-auto max-w-[22rem] rounded-2xl border shadow-lg px-4 py-3
               bg-white/90 backdrop-blur-lg border-white/40 animate-fade-in"
        [ngClass]="{
          'ring-1 ring-emerald-200': t.kind==='success',
          'ring-1 ring-rose-200'   : t.kind==='error',
          'ring-1 ring-amber-200'  : t.kind==='warning',
          'ring-1 ring-slate-200'  : t.kind==='info'
        }"
        role="status" aria-live="polite">

        <div class="flex items-start gap-3">
          <div class="mt-0.5">
            @if (t.kind === 'success') {
              <svg class="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            }
            @if (t.kind === 'error') {
              <svg class="w-5 h-5 text-rose-500" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            }
            @if (t.kind === 'warning') {
              <svg class="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <path d="M12 9v4m0 4h.01M12 3l9 16H3z" />
              </svg>
            }
            @if (t.kind === 'info') {
              <svg class="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <path d="M12 8h.01M11 12h2v6h-2z" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            }
          </div>

          <div class="min-w-0">
            @if (t.title) {
              <div class="text-sm font-semibold text-slate-900">{{ t.title }}</div>
            }
            <div class="text-sm text-slate-700 break-words">{{ t.message }}</div>
          </div>

          <button
            class="ml-auto -mr-1 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60"
            (click)="svc.dismiss(t.id)"
            aria-label="Dismiss">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>
      </div>
    }
  </div>
  `,
  styles: [`
    .animate-fade-in { animation: fade .18s ease-out; }
    @keyframes fade { from { opacity:0; transform: translateY(-4px)} to { opacity:1; transform:none } }
  `]
})
export class ToastsComponent {
  svc = inject(ToastService);
}
