import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ph-image-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-dialog.html',
  styleUrl: './image-dialog.css',
})
export class ImageDialog {
  @Input() open = false;
  @Input() mode: 'url' | 'delete' = 'url';
  @Input() url: string | null = '';

  @Output() saveUrl = new EventEmitter<string>();
  @Output() confirmDelete = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  safeUrl: string | null = null;

  ngOnChanges() {
    const v = (this.url || '').trim();
    // อนุญาตเฉพาะลิงก์ HTTPS ที่ส่งเข้ามา
    this.safeUrl = v && /^https:\/\//i.test(v) ? v : null;
  }

  onUrlChange(ev: Event) {
    const raw = (ev.target as HTMLInputElement).value.trim();
    if (!raw) {
      this.safeUrl = null;
      return;
    }
    // validate ให้เป็น https เท่านั้น
    this.safeUrl = /^https:\/\//i.test(raw) ? raw : null;
  }
}
