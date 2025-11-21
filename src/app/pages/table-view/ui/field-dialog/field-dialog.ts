import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  inject,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../../shared/toast.service';

import {
  TableViewService,
  FieldDialogModel,
  TableListItem,
  ColumnListItem,
  ColumnDto,
} from '../../../../core/table-view.service';

type Preset =
  | 'Identifier'
  | 'Text'
  | 'Number'
  | 'Price'
  | 'Date'
  | 'YesNo'
  | 'Image'
  | 'Lookup'
  | 'Formula';

type FormulaRightMode = 'column' | 'literal';

@Component({
  selector: 'ph-field-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './field-dialog.html',
  styleUrls: ['./field-dialog.css'],
})
export class FieldDialog implements OnChanges {
  @Input() open = false;
  @Input({ required: true }) tableId!: number;

  @Input({ required: true }) projectId!: number;

  @Output() save = new EventEmitter<FieldDialogModel>();
  @Output() cancel = new EventEmitter<void>();

  private readonly api = inject(TableViewService);
  private readonly toast = inject(ToastService);


  // ===== base form =====
  name = '';
  preset: Preset = 'Text';

  isNullable = true;
  isPrimary = false;
  dataType:
    | 'TEXT'
    | 'INTEGER'
    | 'REAL'
    | 'BOOLEAN'
    | 'STRING'
    | 'IMAGE'
    | 'LOOKUP'
    | 'FORMULA'
    | 'DATE' = 'TEXT';

  // lookup
  targetTableId: number | null = null;
  targetColumnId: number | null = null;

  // formula (จะเก็บ JSON string ตาม format ใหม่)
  formulaDefinition = '';

  // ===== formula builder state =====
  /** รายการคอลัมน์ตัวเลขของ table ปัจจุบัน (ใช้ทั้ง left/right) */
  readonly numericCols = signal<ColumnListItem[]>([]);
  // ใหม่: list คอลัมน์ของ table ปัจจุบัน สำหรับ dropdown Source column
  readonly currentCols = signal<ColumnListItem[]>([]);


   // มี PK อยู่แล้วใน table นี้ไหม
  readonly hasPrimary = signal(false);

  formulaOp: '+' | '-' | '*' | '/' = '+';
  formulaLeftColumnId: number | null = null;
  formulaRightMode: FormulaRightMode = 'column';
  formulaRightColumnId: number | null = null;
  formulaRightLiteral = '';

  // ===== lists =====
  readonly tables = signal<TableListItem[]>([]);
  readonly targetCols = signal<ColumnListItem[]>([]);
  readonly showAdvanced = signal(false);

  // ========== lifecycle ==========
  async ngOnChanges(changes: SimpleChanges) {
    if (changes['open'] && this.open) {
      this.resetForm();

      // mock: โหลด table list (ใช้สำหรับ Lookup)
      const tabs = (await firstValueFrom(this.api.listTables(this.projectId))) ?? [];
      this.tables.set(tabs);

      // โหลด numericCols สำหรับ Formula เดิม
      await this.loadNumericColumns();

      // โหลดคอลัมน์ทั้งหมดของ table ปัจจุบัน สำหรับใช้เป็น sourceColumn
      const current = (await firstValueFrom(this.api.listColumnsLite(this.tableId))) ?? [];
      this.currentCols.set(current);

      this.applyPreset();
    }
  }

  // ========== helpers ==========

  resetForm() {
    this.name = '';
    this.preset = 'Text';

    this.isNullable = true;
    this.isPrimary = false;
    this.dataType = 'TEXT';

    this.targetTableId = null;
    this.targetColumnId = null;
    this.targetCols.set([]);

    this.formulaDefinition = '';

    this.formulaOp = '+';
    this.formulaLeftColumnId = null;
    this.formulaRightMode = 'column';
    this.formulaRightColumnId = null;
    this.formulaRightLiteral = '';

    this.showAdvanced.set(false);
  }

  async loadNumericColumns() {
    try {
      // listColumns จาก service 
      const cols: ColumnDto[] = await firstValueFrom(this.api.listColumns(this.tableId));

      // เซ็ต flag ว่าตารางนี้มี PK อยู่แล้วไหม
    const hasPk = (cols || []).some((c) => c.isPrimary);
    this.hasPrimary.set(hasPk);

      const numeric = (cols || [])
        .filter((c) => {
          const t = (c.dataType || '').toUpperCase();
          return t === 'INTEGER' || t === 'REAL' || t === 'NUMBER';
        })
        .map((c) => ({ columnId: c.columnId, name: c.name }));
      this.numericCols.set(numeric);
    } catch {
      this.numericCols.set([]);
       this.hasPrimary.set(false);
    }
  }

  onPresetChange() {
    this.applyPreset();
  }

  private applyPreset() {
  // reset พื้นฐาน
  this.isPrimary = false;
  this.isNullable = true;

  switch (this.preset) {
    case 'Identifier':
      // 🔹 ถ้าตารางนี้มี PK อยู่แล้ว ห้ามสร้างซ้ำ
      if (this.hasPrimary()) {
        // แจ้งเตือนด้วย toast
        this.toast.error('ตารางนี้มี Primary key อยู่แล้ว ไม่สามารถสร้าง PK ซ้ำได้');

        // รีเซ็ต preset กลับเป็น Text
        this.preset = 'Text';
        this.dataType = 'TEXT';
        this.isPrimary = false;
        this.isNullable = true;
        return;
      }

      this.dataType = 'INTEGER';
      this.isPrimary = true;
      this.isNullable = false;
      break;

    case 'Text':
      this.dataType = 'TEXT';
      break;

    case 'Number':
      this.dataType = 'REAL';
      break;

    case 'Price':
      this.dataType = 'REAL';
      break;

    case 'Date':
      this.dataType = 'DATE';
      break;

    case 'YesNo':
      this.dataType = 'BOOLEAN';
      break;

    case 'Image':
      this.dataType = 'IMAGE';
      break;

    case 'Lookup':
      this.dataType = 'LOOKUP';
      break;

    case 'Formula':
      this.dataType = 'FORMULA';
      this.isPrimary = false;
      if (this.numericCols().length === 0) {
        this.loadNumericColumns();
      }
      break;
  }
}


  async onSelectTargetTable() {
    if (!this.targetTableId) {
      this.targetCols.set([]);
      return;
    }
    // ใช้ listColumns แบบเต็มเพื่อดู dataType ได้
    const cols: ColumnDto[] =
      (await firstValueFrom(this.api.listColumns(this.targetTableId))) ?? [];

    // กรอง column ที่เป็น FORMULA ออกไป
    const filtered = cols
      .filter((c) => (c.dataType || '').toUpperCase() !== 'FORMULA')
      .map(
        (c) =>
          ({
            columnId: c.columnId,
            name: c.name,
          } as ColumnListItem)
      );

    this.targetCols.set(filtered);

    // กันค่าค้าง ถ้า column ที่เคยเลือกถูกกรองทิ้ง ให้รีเซ็ตเป็น null
    if (!filtered.some((c) => c.columnId === this.targetColumnId)) {
      this.targetColumnId = null;
    }
  }

  setFormulaOp(op: '+' | '-' | '*' | '/') {
    this.formulaOp = op;
  }

  /** helper: หา column name จาก id ใน numericCols */
  private getNumericColNameById(columnId: number | null): string | null {
    if (!columnId) return null;
    const col = this.numericCols().find((c) => c.columnId === columnId);
    return col ? col.name : null;
  }

  /**
   * สร้าง formulaDefinition ตาม format:
   * {
   *   "type":"operator",
   *   "value":"+",
   *   "left":{"type":"column","name":"ColA"},
   *   "right":{"type":"column","name":"ColB"} | {"type":"literal","value":100}
   * }
   */
  private buildFormulaDefinition(): string | null {
    if (this.preset !== 'Formula') return null;

    // Left: ต้องเป็น column เสมอ
    const leftName = this.getNumericColNameById(this.formulaLeftColumnId);
    if (!leftName) return null;

    // Right:
    let rightNode: any = null;

    if (this.formulaRightMode === 'column') {
      const rightName = this.getNumericColNameById(this.formulaRightColumnId);
      if (!rightName) return null;
      rightNode = {
        type: 'column',
        name: rightName,
      };
    } else {
      if (this.formulaRightLiteral === '' || this.formulaRightLiteral === (null as any))
        return null;
      const lit = Number(this.formulaRightLiteral);
      if (Number.isNaN(lit)) return null;
      rightNode = {
        type: 'literal',
        value: lit,
      };
    }

    const formula = {
      type: 'operator',
      value: this.formulaOp,
      left: {
        type: 'column',
        name: leftName,
      },
      right: rightNode,
    };

    // NOTE: ตอนผูก API จริง BE จะอ่าน string นี้ไป parse ใช้งานต่อ
    return JSON.stringify(formula);
  }

  get formulaPreview(): string {
    const def = this.buildFormulaDefinition();
    return def ?? '';
  }

  canSubmit(): boolean {
  if (!this.name.trim()) return false;

  // ถ้ามี PK อยู่แล้ว แต่ฟอร์มดันคิดว่า field นี้เป็น PK → ไม่ให้ส่ง
  if (this.isPrimary && this.hasPrimary()) {
    return false;
  }

  if (this.preset === 'Formula') {
    return this.buildFormulaDefinition() !== null;
  }

  if (this.preset === 'Lookup') {
    return !!this.targetTableId && !!this.targetColumnId;
  }

  return true;
}


  // ========== actions ==========
  submit() {
    if (!this.canSubmit()) {
      alert('กรุณากรอกข้อมูลให้ครบก่อนสร้างฟิลด์');
      return;
    }

    const model: FieldDialogModel = {
      name: this.name.trim(),
      dataType: this.dataType,
      isNullable: this.isNullable,
      isPrimary: this.isPrimary,
      targetTableId: this.preset === 'Lookup' ? this.targetTableId : null,
      targetColumnId: this.preset === 'Lookup' ? this.targetColumnId : null,

      formulaDefinition: null,
    };

    if (this.preset === 'Formula') {
      const def = this.buildFormulaDefinition();
      if (!def) {
        alert('กรุณาเลือก Left / Operator / Right ให้ครบ');
        return;
      }
      model.formulaDefinition = def;
    }

    this.save.emit(model);
    this.resetForm();
  }

  close() {
    this.resetForm();
    this.cancel.emit();
  }


  onPrimaryCheckboxChange(event: Event) {
  // ถ้ามี PK อยู่แล้ว -> ไม่ยอมให้ติ๊ก PK เพิ่ม
  if (this.hasPrimary()) {
    (event.target as HTMLInputElement).checked = false;
    this.isPrimary = false;
    this.toast.error('ตารางนี้มี Primary key อยู่แล้ว ไม่สามารถตั้ง PK ซ้ำได้');
  }
}

}
