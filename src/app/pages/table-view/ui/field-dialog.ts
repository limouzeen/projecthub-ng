import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TablesApiService,
  UiTable,
  UiField,
  CreateFieldDto,
} from '../../../core/tables-api.service';

type FieldType = 'Text' | 'Number' | 'YesNo' | 'Date' | 'Lookup' | 'Formula';

@Component({
  selector: 'app-field-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './field-dialog.html',
  styleUrls: ['./field-dialog.css'],
})
export class FieldDialog implements OnInit {
  private readonly api = inject(TablesApiService);

  @Input({ required: true }) tableId!: number;
  @Input({ required: true }) projectId!: number;
  @Output() close = new EventEmitter<boolean>();

  // form state
  name = '';
  type: FieldType = 'Text';
  isNullable = true;
  isPrimary = false;

  // Lookup settings
  targetTableId: number | null = null;
  targetColumnId: number | null = null;
  fkColumnName = ''; // ชื่อ FK ฝั่งนี้ เช่น ProductId

  // Formula settings (เก็บเป็น raw JSON string ตามหลังบ้าน)
  formulaRaw = '';

  // lists
  readonly tables = signal<UiTable[]>([]);
  readonly targetTableFields = signal<UiField[]>([]);
  readonly saving = signal(false);
  readonly errorMsg = signal('');

  async ngOnInit() {
    // โหลดตารางในโปรเจกต์นี้ สำหรับให้เลือกเป็นปลายทางของ Lookup
    const tabs = await this.api.listTablesByProject(this.projectId);
    this.tables.set(tabs);
  }

  async onSelectTargetTable() {
    if (!this.targetTableId) { this.targetTableFields.set([]); return; }
    const cols = await this.api.listColumnsByTableId(this.targetTableId);
    this.targetTableFields.set(cols);
  }

  async submit() {
    this.errorMsg.set('');
    if (!this.name.trim()) { this.errorMsg.set('Field name is required.'); return; }

    const dto: CreateFieldDto = {
      tableId: this.tableId,
      name: this.name.trim(),
      dataType: this.type,
      isNullable: this.isNullable,
      isPrimary: this.isPrimary,
    };

    if (this.type === 'Lookup') {
      if (!this.targetTableId || !this.targetColumnId || !this.fkColumnName.trim()) {
        this.errorMsg.set('Please fill all lookup settings.'); return;
      }
      dto.primaryTableId  = this.targetTableId;         // ตารางปลายทาง (PK)
      dto.primaryColumnId = this.targetColumnId;        // คอลัมน์ปลายทาง
      dto.foreignTableId  = this.tableId;               // ตารางฝั่งนี้
      // หมายเหตุ: ฝั่งหลังบ้านของคุณเก็บ FK คอลัมน์เป็น Columns entity เช่นกัน
      // ใน mock นี้เราส่งชื่อไว้เฉย ๆ; ผูกจริงให้แก้ส่งเป็น ColumnId ของฝั่งนี้แทน
      // (หรือใช้ API สร้าง Column FK ก่อน แล้วสร้าง Relationship)
      dto.foreignColumnId = 0; // TODO: เมื่อผูกจริงให้ใส่ columnId ของ FK ฝั่งนี้
      dto.targetColumnId  = this.targetColumnId;        // คอลัมน์ที่อยากดึงมาแสดง
    }

    if (this.type === 'Formula') {
      dto.formulaDefinition = this.formulaRaw || null;  // เก็บ JSON string ตามหลังบ้าน
    }

    try {
      this.saving.set(true);
      await this.api.createField(dto);
      this.close.emit(true);
    } catch (e: any) {
      this.errorMsg.set(e?.message || 'Create field failed.');
    } finally {
      this.saving.set(false);
    }
  }

  cancel() { this.close.emit(false); }
}
