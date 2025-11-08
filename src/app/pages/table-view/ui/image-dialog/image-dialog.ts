import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'ph-image-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-dialog.html',
  styleUrls: ['./image-dialog.css'],
})
export class ImageDialog {
  /** เปิด/ปิด dialog */
  @Input() open = false;

  /** โหมด: 'url' = แก้/ใส่ URL, 'delete' = ยืนยันลบ */
  @Input() mode: 'url' | 'delete' = 'url';

  /** ค่า URL ปัจจุบัน (จาก parent) */
  @Input() url: string = '';

  /** ส่ง URL ที่แก้กลับไปให้ parent */
  @Output() saveUrl = new EventEmitter<string>();

  /** ยืนยันลบรูป */
  @Output() confirmDelete = new EventEmitter<void>();

  /** ปิด dialog เฉย ๆ */
  @Output() cancel = new EventEmitter<void>();

  // internal model (เอาไว้ bind กับ input)
  modelUrl = '';

  ngOnChanges() {
    // sync url เข้า input เวลาเปิด dialog
    if (this.open && this.mode === 'url') {
      this.modelUrl = this.url || '';
    }
  }

  onSubmitUrl() {
    const v = (this.modelUrl || '').trim();
    if (!v) {
      // บังคับให้ต้องมีค่าเล็กน้อยก่อน save
      return;
    }
    this.saveUrl.emit(v);
  }

  onConfirmDelete() {
    this.confirmDelete.emit();
  }

  onCancel() {
    this.cancel.emit();
  }
}
