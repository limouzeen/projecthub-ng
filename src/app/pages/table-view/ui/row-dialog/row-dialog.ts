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
import { firstValueFrom } from 'rxjs';
import { TableViewService,  ColumnDto} from '../../../../core/table-view.service';

export type RowDialogSave = Record<string, any>;

export type RowDialogColumn = ColumnDto;

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

  /** table ปัจจุบัน (ใช้ระบุชื่อ PK และเรียก next id) */
  @Input({ required: true }) tableId!: number;

  /** ตารางนี้เป็น auto-increment (PK=ID, lock field) หรือไม่ */
  @Input() isAutoTable = false;

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
  uploading: Record<string, boolean> = {};
  uploadSource: Record<string, 'file' | 'url' | undefined> = {};

  lookupOptions: Record<string, { value: number; label: string }[]> = {};
  lookupLoading: Record<string, boolean> = {};



  private readonly api = inject(TableViewService);

  private normalizeTypeStr(t?: string): string {
  const up = (t ?? '').trim().toUpperCase();

  switch (up) {
    case 'INT':
      return 'INTEGER';
    case 'FLOAT':
      return 'REAL';
    case 'NUMBER':
      return 'NUMBER';
    case 'BOOL':
      return 'BOOLEAN';
    case 'DATE':
      return 'DATE';
    default:
      return up || 'TEXT';
  }
}

  /** ใช้เรียกจาก template */
  typeOf(c: RowDialogColumn): string {
    return this.normalizeTypeStr(c.dataType);
  }

  // ---------- normalize ----------
  private normalizeBeforeSave(src: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};

    for (const c of this.columns) {
      const key = c.name;
      const t = this.normalizeTypeStr(c.dataType);
      const v = src[key];

      if (c.isPrimary) {
        if (this.isAutoTable) {
         if (!this.initData) {
          // new row + auto-increment: ไม่ส่ง PK ให้ backend
          continue;
        } else {
          // edit row: ล็อก ID เป็นค่าตาม initData
          out[key] = this.initData[key];
          continue;
        }
        }
      }

      if (v === '' || v === undefined) {
        out[key] = null;
        continue;
      }

      switch (t) {
        case 'INTEGER':
        case 'INT':
          out[key] = Number.parseInt(v as any, 10);
          break;

        case 'REAL':
        case 'NUMBER':
        case 'FLOAT':
          out[key] = Number.parseFloat(v as any);
          break;

        case 'BOOLEAN':
          out[key] =
            v === true ||
            v === 'true' ||
            v === '1' ||
            v === 1;
          break;

        default:
          // ถ้าเป็น DATE อย่าไปเดาว่าเป็น number
        if (t !== 'DATE' && typeof v === 'string' && /^[+-]?\d+(\.\d+)?$/.test(v)) {
          out[key] = Number.parseFloat(v);
        } else {
          out[key] = v;
        }
      }
    }

    return out;
  }

  ngOnChanges(changes: SimpleChanges): void {
  const openedNow   = !!changes['open'] && this.open;
  const dataChanged = !!changes['initData'];
  const colsChanged = !!changes['columns'];

  if (openedNow || dataChanged || colsChanged) {
    this.model = { ...(this.initData ?? {}) };
    this.uploadSource = {};

    // init ค่า default / image
    for (const c of this.columns) {
      c.isPrimary = !!c.isPrimary;

      if (!(c.name in this.model)) {
        const t = (c.dataType || '').toUpperCase();
        this.model[c.name] = t === 'BOOLEAN' ? false : '';
      }

      if ((c.dataType || '').toUpperCase() === 'IMAGE') {
        const v = this.model[c.name];
        if (v !== '' && v !== null && v !== undefined) {
          this.uploadSource[c.name] = 'url';
        }
      }
    }

    // 🔹 โหลด lookup options สำหรับทุกคอลัมน์ LOOKUP
    for (const col of this.columns) {
      const t = this.normalizeTypeStr(col.dataType);
      if (t === 'LOOKUP' && col.lookupTargetTableId) {
        this.loadLookupOptionsForColumn(col);
      }
    }
  }
}



  // ---------- lookup for Dropdown----------
 private async loadLookupOptionsForColumn(c: RowDialogColumn) {
  const tableId = c.lookupTargetTableId;
  if (!tableId) {
    this.lookupOptions[c.name] = [];
    return;
  }

  try {
    // ดึง rows จาก table ปลายทางด้วย service เดิม
    const rows = await firstValueFrom(this.api.listRows(tableId));

    // สมมติ PK column ชื่อ "ID" (แบบที่ backend สร้าง auto-increment)
    const pkName = 'ID';

    const opts = rows.map(r => {
      const data =
        typeof r.data === 'string'
          ? JSON.parse(r.data || '{}')
          : (r as any);

      const val = Number(data[pkName]);

      return {
        value: val,
        label: String(val),  // ถ้าอยากโชว์ชื่ออื่น เช่น Name ก็เปลี่ยนตรงนี้
      };
    }).filter(o => !Number.isNaN(o.value));

    this.lookupOptions[c.name] = opts;
  } catch (err) {
    console.error('load lookup options failed', err);
    this.lookupOptions[c.name] = [];
  }
}
 

  // ---------- upload ----------
  async onFileChange(ev: Event, fieldName: string) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      this.uploading[fieldName] = true;
      const url = await this.api.uploadImage(file);
      this.model[fieldName] = url;
      this.uploadSource[fieldName] = 'file';
    } finally {
      this.uploading[fieldName] = false;
    }
  }

  markUrlSource(fieldName: string) {
    this.uploadSource[fieldName] = 'url';
  }

  shouldShowUrlInput(c: RowDialogColumn): boolean {
    return this.uploadSource[c.name] !== 'file';
  }

  onClearImage(fieldName: string) {
    this.model[fieldName] = '';
    this.uploadSource[fieldName] = undefined;
  }

  onSubmit(): void {
    const normalized = this.normalizeBeforeSave(this.model);
    this.save.emit(normalized);
  }

  onCancel(): void {
    this.model = {};
    this.cancel.emit();
  }

  get isNewRow(): boolean {
  return !this.initData;
}


private async loadLookupOptions(col: RowDialogColumn) {
  const t = this.typeOf(col);
  if (t !== 'LOOKUP') return;

  const targetTableId = col.lookupTargetTableId;
  if (!targetTableId) {
    console.warn('No lookupTargetTableId on column', col);
    return;
  }

  this.lookupLoading[col.name] = true;

  try {
    // 1) ดึง schema ของตารางเป้าหมาย เพื่อหา PK และ column ที่ใช้แสดง
    const cols = await firstValueFrom(this.api.listColumns(targetTableId));
    const pkCol = cols.find(c => c.isPrimary);
    if (!pkCol) {
      console.warn('No primary key on lookup target table', targetTableId);
      this.lookupOptions[col.name] = [];
      return;
    }

    const pkName = pkCol.name;

    // จะเลือกใช้ column ไหนเป็น label ก็ได้ เช่น ถ้ามี TEXT column ชื่อ "Name"
    const textCol =
      cols.find(c => (c.dataType || '').toUpperCase() === 'TEXT' && c.name !== pkName) ?? pkCol;
    const textName = textCol.name;

    // 2) ดึง rows จากตารางเป้าหมาย
    const rows = await firstValueFrom(this.api.listRows(targetTableId));

    // 3) map เป็น options
    const opts: { value: number; label: string }[] = rows
      .map(r => {
        let data: any = {};
        try {
          data = JSON.parse(r.data ?? '{}');
        } catch {}

        const id = data[pkName];
        if (id === null || id === undefined) return null;

        const text = data[textName];
        const label = text != null ? `${text} (ID: ${id})` : `ID: ${id}`;

        return { value: Number(id), label };
      })
      .filter((x): x is { value: number; label: string } => !!x);

    this.lookupOptions[col.name] = opts;
  } catch (err) {
    console.error('loadLookupOptions failed', err);
    this.lookupOptions[col.name] = [];
  } finally {
    this.lookupLoading[col.name] = false;
  }
}


}
