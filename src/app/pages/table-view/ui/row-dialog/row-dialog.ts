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


  /** เก็บ error message ของแต่ละ field: key = column.name */
  validationErrors: Record<string, string | null> = {};
  /** ใช้เช็คว่ามี error อยู่ไหม */
  private hasAnyError = false;

  // ====== META สำหรับ PK แบบ manual ======
  /** column ที่เป็น PK (ถ้ามี) */
  private pkColumn: RowDialogColumn | null = null;
  /** ค่า PK ทั้งหมดที่มีอยู่ในตารางนี้แล้ว */
  private pkExistingValues = new Set<string | number>();
  /** ค่าเดิมของ PK (ตอนแก้ไขแถวเดิม ใช้กัน false positive เรื่องซ้ำ) */
  private pkOriginalValue: any = null;


  // ================== TYPE HELPERS ==================
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

 private isEmpty(v: any): boolean {
    return v === null || v === undefined || v === '';
  }

    /** โหลดค่า PK ทั้งหมดของ table นี้ (เฉพาะเคส PK manual) */
  private async initPkMeta() {
    // หา column ที่เป็น PK ก่อน
    const pk = this.columns.find(c => c.isPrimary) ?? null;
    this.pkColumn = pk;
    this.pkExistingValues = new Set();
    this.pkOriginalValue = null;

    // ไม่มี PK หรือเป็น auto-table → ไม่ต้องเช็คซ้ำ
    if (!pk || this.isAutoTable) return;

    // ค่า PK เดิม (กรณีแก้ไขแถว)
    this.pkOriginalValue = this.initData ? this.initData[pk.name] : null;

    try {
      const rows = await firstValueFrom(this.api.listRows(this.tableId));

      for (const r of rows) {
        let obj: any = {};
        try {
          obj = JSON.parse(r.data ?? '{}');
        } catch {}

        const v = obj[pk.name];
        if (v !== null && v !== undefined && v !== '') {
          this.pkExistingValues.add(v);
        }
      }
    } catch (err) {
      console.warn('initPkMeta failed', err);
    }
  }



  // ================== VALIDATION ==================

  /** ตรวจ field เดียว ตามชนิดข้อมูล */
  private validateField(col: RowDialogColumn, value: any): string | null {
  const t = this.normalizeTypeStr(col.dataType);
  const name = col.name;

  // FORMULA ไม่ต้อง validate
  if (t === 'FORMULA') return null;

  // auto PK ใหม่ (ไม่ให้กรอก) → ไม่ต้องเช็ค
  if (col.isPrimary && this.isAutoTable && !this.initData) {
    return null;
  }

  // ค่ากลวง
  if (this.isEmpty(value)) {
    if (!col.isNullable) {
      return 'จำเป็นต้องกรอกข้อมูล';
    }
    return null;
  }

  // จากนี้คือ "มีค่า" แล้ว → validate ตาม type
  const raw = value;

  switch (t) {
    case 'INTEGER': {
      // ---- เช็คว่าเป็นจำนวนเต็มถูกต้องก่อน ----
      let numVal: number;

      if (typeof raw === 'number') {
        numVal = raw;
        if (!Number.isInteger(numVal)) {
          return 'ต้องเป็นจำนวนเต็มเท่านั้น';
        }
      } else if (typeof raw === 'string') {
        const s = raw.trim();
        if (!/^[-+]?\d+$/.test(s)) {
          return 'ต้องเป็นจำนวนเต็ม ห้ามมีตัวอักษรหรือช่องว่าง';
        }
        const n = Number(s);
        if (!Number.isFinite(n) || !Number.isInteger(n)) {
          return 'ค่าจำนวนเต็มไม่ถูกต้อง';
        }
        numVal = n;
      } else {
        return 'รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็นจำนวนเต็ม)';
      }

      // ---- ถ้าเป็น PK แบบ manual → เช็ค "ห้ามซ้ำ" ----
      if (col.isPrimary && !this.isAutoTable && this.pkColumn?.name === name) {
        const oldVal = this.pkOriginalValue;
        const isSameAsOriginal =
          oldVal !== null &&
          oldVal !== undefined &&
          String(oldVal) === String(numVal);

        // ถ้าเป็นการแก้ไข แล้วค่าที่กรอก = ค่าเดิม → ไม่ถือว่าซ้ำ
        if (!isSameAsOriginal && this.pkExistingValues.has(numVal)) {
          return 'ค่าของฟิลด์นี้มีอยู่ในตารางแล้ว กรุณาใช้ค่าใหม่ที่ไม่ซ้ำกัน';
        }
      }

      return null;
    }

    case 'REAL':
    case 'NUMBER':
    case 'FLOAT': {
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) {
          return 'ต้องเป็นตัวเลขเท่านั้น';
        }
        return null;
      }

      if (typeof raw === 'string') {
        const s = raw.trim();
        // ตัวเลขทศนิยม / จำนวนเต็ม (+/- ได้)
        if (!/^[-+]?\d+(\.\d+)?$/.test(s)) {
          return 'ต้องเป็นตัวเลข ห้ามมีตัวอักษรหรืออักขระอื่น';
        }
        const n = Number(s);
        if (!Number.isFinite(n)) {
          return 'ค่าตัวเลขไม่ถูกต้อง';
        }
        return null;
      }

      return 'รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็นตัวเลข)';
    }

    case 'BOOLEAN': {
      // รองรับ true/false, "true"/"false", "1"/"0", 1/0
      const ok =
        raw === true ||
        raw === false ||
        raw === 1 ||
        raw === 0 ||
        raw === '1' ||
        raw === '0' ||
        raw === 'true' ||
        raw === 'false';

      return ok ? null : 'ต้องเลือก Yes หรือ No เท่านั้น';
    }

    case 'DATE': {
      // ในฟอร์มใช้ input type="date" → ปกติจะเป็น yyyy-MM-dd
      if (typeof raw !== 'string') {
        return 'รูปแบบวันที่ไม่ถูกต้อง';
      }
      const s = raw.trim();
      if (!s) return col.isNullable ? null : 'จำเป็นต้องระบุวันที่';

      // เช็ค pattern คร่าว ๆ
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return 'รูปแบบวันที่ไม่ถูกต้อง (ควรเป็น yyyy-MM-dd)';
      }

      const d = new Date(s);
      if (Number.isNaN(d.getTime())) {
        return 'วันที่ไม่ถูกต้อง';
      }
      return null;
    }

    case 'LOOKUP': {
      // ต้องเป็นตัวเลข (pk) และควรเป็นค่าที่อยู่ใน dropdown
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(num)) {
        return 'ต้องเลือกจากรายการเท่านั้น';
      }

      const opts = this.lookupOptions[name] || [];
      const exists = opts.some((o) => o.value === num);
      if (!exists) {
        return 'ต้องเลือกจากรายการที่มีอยู่เท่านั้น';
      }
      return null;
    }

    // IMAGE / TEXT / อื่น ๆ → ไม่บังคับรูปแบบพิเศษ
    default:
      return null;
  }
}


/** ตรวจทุก field ก่อน Save */
  private validateAll(): boolean {
    const errors: Record<string, string | null> = {};
    let anyError = false;

    for (const col of this.columns) {
      const key = col.name;
      const t = this.normalizeTypeStr(col.dataType);

      if (t === 'FORMULA') {
        errors[key] = null;
        continue;
      }

      const v = this.model[key];
      const err = this.validateField(col, v);
      errors[key] = err;
      if (err) anyError = true;
    }

    this.validationErrors = errors;
    this.hasAnyError = anyError;
    return !anyError;
  }



  // ---------- normalize ----------
  private normalizeBeforeSave(src: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};

    for (const c of this.columns) {
      const key = c.name;
      const t = this.normalizeTypeStr(c.dataType);
      const v = src[key];

      // ไม่ส่ง FORMULA กลับไป
      if (t === 'FORMULA') {
      continue;
    }


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

   // ================== LIFE CYCLE ==================

    ngOnChanges(changes: SimpleChanges): void {
    const openedNow   = !!changes['open'] && this.open;
    const dataChanged = !!changes['initData'];
    const colsChanged = !!changes['columns'];

    if (openedNow || dataChanged || colsChanged) {
      this.model = { ...(this.initData ?? {}) };
      this.uploadSource = {};
      this.validationErrors = {};
      this.hasAnyError = false;

      // init default
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

      // โหลด options lookup
      for (const col of this.columns) {
        const t = this.normalizeTypeStr(col.dataType);
        if (t === 'LOOKUP' && col.lookupTargetTableId) {
          this.loadLookupOptionsForColumn(col);
        }
      }

      //เตรียมข้อมูลสำหรับเช็ค PK ไม่ซ้ำ
      this.initPkMeta();
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
    }) .filter(o => !Number.isNaN(o.value))
  //เรียงตาม PK จากน้อยไปมาก
  .sort((a, b) => a.value - b.value);

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

    // ================== SUBMIT ==================

  onSubmit(): void {
    // ถ้ามี error → ไม่ให้ save + highlight ช่องผิด
    const ok = this.validateAll();
    if (!ok) {
      // เลื่อนขึ้นไปหา field แรกที่ error (ถ้าอยากทำ)
      try {
        const firstErrKey = Object.keys(this.validationErrors).find(
          (k) => !!this.validationErrors[k]
        );
        if (firstErrKey) {
          const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
            `[name="${firstErrKey}"]`
          );
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el?.focus();
        }
      } catch {}
      return;
    }

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
