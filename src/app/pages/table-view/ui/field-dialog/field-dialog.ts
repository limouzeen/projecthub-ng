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

  // เก็บ schema เต็ม และจำนวนคอลัมน์ที่ไม่ใช่ PK
  readonly allCols = signal<ColumnDto[]>([]);
  readonly nonPkCount = signal(0);

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

      // table list สำหรับ Lookup
      const tabs = (await firstValueFrom(this.api.listTables(this.projectId))) ?? [];
      this.tables.set(tabs);

      // โหลด numericCols + hasPrimary + nonPkCount
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
      const cols: ColumnDto[] = (await firstValueFrom(this.api.listColumns(this.tableId))) ?? [];

      this.allCols.set(cols);

      // มี PK หรือยัง
      const hasPk = cols.some((c) => c.isPrimary);
      this.hasPrimary.set(hasPk);

      // จำนวนคอลัมน์ที่ไม่ใช่ PK
      const nonPk = cols.filter((c) => !c.isPrimary).length;
      this.nonPkCount.set(nonPk);

      const numeric = cols
        .filter((c) => {
          const t = (c.dataType || '').toUpperCase();
          return t === 'INTEGER' || t === 'REAL' || t === 'NUMBER';
        })
        .map((c) => ({ columnId: c.columnId, name: c.name }));

      this.numericCols.set(numeric);
    } catch {
      this.allCols.set([]);
      this.numericCols.set([]);
      this.hasPrimary.set(false);
      this.nonPkCount.set(0);
    }
  }

  // ตรวจสอบชื่อ column ซ้ำ
  private isDuplicateName(name: string): boolean {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return false;

    return this.currentCols().some((c) => c.name.trim().toLowerCase() === trimmed);
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
        // มี PK แล้ว → ไม่อนุญาต
        if (this.hasPrimary()) {
          this.toast.warning(
            'This table already has a primary key. You cannot create another one.'
          );

          // รีเซ็ตกลับเป็น Text
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

    const cols: ColumnDto[] =
      (await firstValueFrom(this.api.listColumns(this.targetTableId))) ?? [];

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

    return JSON.stringify(formula);
  }

  get formulaPreview(): string {
    const def = this.buildFormulaDefinition();
    return def ?? '';
  }

  canSubmit(): boolean {
    const trimmedName = this.name.trim();
    if (!trimmedName) return false;

    // ห้ามชื่อซ้ำ
    if (this.isDuplicateName(trimmedName)) return false;

    // ห้ามมี PK ซ้ำ
    if (this.isPrimary && this.hasPrimary()) return false;

    // จำกัดจำนวน column (ไม่รวม PK) ไม่เกิน 10
    if (!this.isPrimary && this.nonPkCount() >= 10) return false;

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
  const trimmedName = this.name.trim();

  if (!trimmedName) {
    this.toast.warning('Please enter a field name.');
    return;
  }

  if (this.isDuplicateName(trimmedName)) {
    this.toast.warning(`A column named "${trimmedName}" already exists.`);
    return;
  }

  if (this.isPrimary && this.hasPrimary()) {
    this.toast.warning('This table already has a primary key. You cannot create another one.');
    return;
  }

  if (!this.isPrimary && this.nonPkCount() >= 10) {
    this.toast.warning('You cannot add more than 10 non-primary-key fields to this table.');
    return;
  }

  if (this.preset === 'Formula') {
    const def = this.buildFormulaDefinition();
    if (!def) {
      this.toast.warning('Please select Left / Operator / Right before creating a formula field.');
      return;
    }
    this.formulaDefinition = def;
  }

  if (this.preset === 'Lookup') {
    if (!this.targetTableId || !this.targetColumnId) {
      this.toast.warning(
        'Please select both a target table and a target column for the lookup field.'
      );
      return;
    }
  }

  const model: FieldDialogModel = {
    name: trimmedName,
    dataType: this.dataType,
    isNullable: this.isNullable,
    isPrimary: this.isPrimary,
    targetTableId: this.preset === 'Lookup' ? this.targetTableId : null,
    targetColumnId: this.preset === 'Lookup' ? this.targetColumnId : null,
    formulaDefinition: this.preset === 'Formula' ? this.formulaDefinition : null,
  };

  this.save.emit(model);
  this.resetForm();

  this.toast.info('Field created successfully.');
}


  close() {
    this.resetForm();
    this.cancel.emit();
  }

  onPrimaryCheckboxChange(event: Event) {
    if (this.hasPrimary()) {
      // ถ้ามี PK อยู่แล้ว → ยกเลิกการติ๊ก และแจ้งเตือน
      (event.target as HTMLInputElement).checked = false;
      this.isPrimary = false;
      this.toast.warning(
        'This table already has a primary key. You cannot create another one.'
      );
    }
  }
}
