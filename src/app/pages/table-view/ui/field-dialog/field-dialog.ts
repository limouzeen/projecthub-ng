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

  // ===== base form =====
  name = '';
  preset: Preset = 'Text';

  isNullable = true;
  isPrimary = false;
  dataType: 'TEXT' | 'INTEGER' | 'REAL' | 'BOOLEAN' | 'STRING' | 'IMAGE' | 'LOOKUP' | 'FORMULA' = 'TEXT';

  // lookup
  targetTableId: number | null = null;
  targetColumnId: number | null = null;

  // formula (จะเก็บ JSON string ตาม format ใหม่)
  formulaDefinition = '';

  // ===== formula builder state =====
  /** รายการคอลัมน์ตัวเลขของ table ปัจจุบัน (ใช้ทั้ง left/right) */
  readonly numericCols = signal<ColumnListItem[]>([]);

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

      // mock: โหลดคอลัมน์ numeric ของ table ปัจจุบัน (ไว้ให้ Formula เลือก)
      await this.loadNumericColumns();

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
      // MOCK: ใช้ listColumns จาก service เดิม
      const cols: ColumnDto[] = await firstValueFrom(this.api.listColumns(this.tableId));
      const numeric = (cols || [])
        .filter((c) => {
          const t = (c.dataType || '').toUpperCase();
          return t === 'INTEGER' || t === 'REAL' || t === 'NUMBER';
        })
        .map((c) => ({ columnId: c.columnId, name: c.name }));
      this.numericCols.set(numeric);
    } catch {
      this.numericCols.set([]);
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
        this.dataType = 'STRING';
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
        this.isPrimary = false; // formula ไม่เป็น PK
        // ถ้ายังไม่มี numericCols ให้ลองโหลด (เผื่อกรณีเปิด dialog ครั้งแรก)
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
    const cols = (await firstValueFrom(this.api.listColumnsLite(this.targetTableId))) ?? [];
    this.targetCols.set(cols);
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
      if (this.formulaRightLiteral === '' || this.formulaRightLiteral === null as any) return null;
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

    if (this.preset === 'Formula') {
      return this.buildFormulaDefinition() !== null;
    }

    // preset อื่น ๆ ใช้ validation ปกติ (อยากเพิ่มเงื่อนไขก็เติมได้)
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
      // TODO (API จริง):
      // ส่ง model นี้ไปยัง endpoint เช่น POST /tables/{tableId}/columns
      // โดย BE จะอ่าน field formulaDefinition เพื่อสร้างสูตร
    }

    this.save.emit(model);
    this.resetForm();
  }

  close() {
    this.resetForm();
    this.cancel.emit();
  }
}
