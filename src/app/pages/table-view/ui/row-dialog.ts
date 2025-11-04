// src/app/pages/table-view/ui/row-dialog.ts
import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// ✅ ใช้ service เดิม (แก้ path ตามโครงจริงของคุณ ถ้าไฟล์อยู่คนละระดับ)
import { TableViewService } from '../table-view.service';

export type RowDialogSave = Record<string, any>;

export type RowDialogColumn = {
  name: string;
  dataType?: string; // 'INTEGER' | 'REAL' | 'BOOLEAN' | 'TEXT' | 'STRING' | 'IMAGE' | 'LOOKUP' | 'FORMULA'
  isPrimary?: boolean;
  isNullable?: boolean;
};

@Component({
  selector: 'ph-row-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './row-dialog.html',
  styleUrls: ['./row-dialog.css'],
})
export class RowDialog implements OnChanges {
  /** เปิด/ปิดไดอะล็อก */
  @Input() open = false;

  /** สคีมาคอลัมน์ของตาราง */
  @Input() columns: RowDialogColumn[] = [];

  /** ค่าเริ่มต้นของแถวที่จะแก้ไข (null = เพิ่มแถวใหม่) */
  @Input() initData: Record<string, any> | null = null;

  /** กดบันทึก -> ส่งโมเดลกลับ */
  @Output() save = new EventEmitter<RowDialogSave>();

  /** ยกเลิก */
  @Output() cancel = new EventEmitter<void>();

  /** แบบฟอร์มทำงานกับ ngModel */
  model: Record<string, any> = {};

  /** อัปโหลดรูปแต่ละฟิลด์ */
  uploading: Record<string, boolean> = {};

  uploadSource: Record<string, 'file' | 'url' | undefined> = {};

  /** service */
  private readonly api = inject(TableViewService);

  // ==============================
  // Lifecycle
  // ==============================
  ngOnChanges(changes: SimpleChanges): void {
  // เปิดครั้งใหม่ หรือ initData/columns เปลี่ยน
  const openedNow   = !!changes['open'] && this.open;
  const dataChanged = !!changes['initData'];
  const colsChanged = !!changes['columns'];

  if (openedNow || dataChanged || colsChanged) {
    // seed model จาก initData
    this.model = { ...(this.initData ?? {}) };

    // รีเซ็ตโหมดแหล่งรูป
    this.uploadSource = {};

    // เติมคีย์ให้ครบ + normalize flags
    for (const c of this.columns) {
      c.isPrimary = !!c.isPrimary;

      // default value ถ้ายังไม่มีคีย์
      if (!(c.name in this.model)) {
        const t = (c.dataType || '').toUpperCase();
        this.model[c.name] = t === 'BOOLEAN' ? false : '';
      }

      // ถ้าเป็น IMAGE และมีค่ามาตั้งแต่ต้น (เช่นจาก initData)
      // ให้ถือว่าเป็นโหมด 'url' → แสดงช่อง URL ให้แก้ไขได้
      if ((c.dataType || '').toUpperCase() === 'IMAGE') {
        const v = this.model[c.name];
        if (v !== '' && v !== null && v !== undefined) {
          this.uploadSource[c.name] = 'url';
        }
      }
    }
  }
}


  // ==============================
  // Image upload handler (mock/real)
  // ==============================
  async onFileChange(ev: Event, fieldName: string) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    this.uploading[fieldName] = true;
    const url = await this.api.uploadImage(file); // mock: DataURL
    this.model[fieldName] = url;
    this.uploadSource[fieldName] = 'file';        //บอกว่าเป็นไฟล์
  } finally {
    this.uploading[fieldName] = false;
  }
}


  // เมื่อพิมพ์ URL → ถือว่าเป็นโหมด url
  markUrlSource(fieldName: string) {
    this.uploadSource[fieldName] = 'url';
  }

  // แสดงช่อง URL เฉพาะกรณี “ยังไม่ได้เลือกไฟล์”
  shouldShowUrlInput(c: RowDialogColumn): boolean {
    return this.uploadSource[c.name] !== 'file';
  }

  // กดถังขยะ
  onClearImage(fieldName: string) {
    this.model[fieldName] = '';
    this.uploadSource[fieldName] = undefined;
  }

  // ==============================
  // Normalize ก่อน Save
  // ==============================
  private normalizeBeforeSave(src: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};

    for (const c of this.columns) {
      const key = c.name;
      const t = (c.dataType || '').toUpperCase();
      const v = src[key];

      // PK: ล็อกค่าจาก initData (ห้ามแก้)
      if (c.isPrimary) {
        out[key] =
          this.initData && this.initData[key] !== undefined ? this.initData[key] : src[key] ?? null;
        continue;
      }

      // ค่าว่าง → null
      if (v === '' || v === undefined) {
        out[key] = null;
        continue;
      }

      // แปลงชนิด
      switch (t) {
        case 'INTEGER':
          out[key] = Number.parseInt(v as any, 10);
          break;
        case 'REAL':
          out[key] = Number.parseFloat(v as any);
          break;
        case 'BOOLEAN':
          // รับได้ทั้ง boolean และสตริง 'true'/'false'
          out[key] = v === true || v === 'true';
          break;
        default:
          out[key] = v;
      }
    }

    return out;
  }

  // ==============================
  // Actions
  // ==============================
  onSubmit(): void {
    const normalized = this.normalizeBeforeSave(this.model);
    this.save.emit(normalized);
  }

  onCancel(): void {
    this.model = {};
    this.cancel.emit();
  }
}
