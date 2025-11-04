import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TablesApiService, UiField, UiRow, UiTable } from '../../core/tables-api.service';
import { FieldDialog } from './ui/field-dialog';

@Component({
  selector: 'app-table-view',
  standalone: true,
  imports: [CommonModule, RouterLink, FieldDialog],
  templateUrl: './table-view.html',
  styleUrls: ['./table-view.css'],
})
export class TableView implements OnInit {
  private readonly api = inject(TablesApiService);
  private readonly route = inject(ActivatedRoute);

  readonly tableId = signal<number>(0);
  readonly projectId = signal<number>(1); // TODO(REMOVE-HARDCODE): ดึงจาก route หรือ state จริง

  readonly table = signal<UiTable | null>(null);
  readonly fields = signal<UiField[]>([]);
  readonly rows = signal<UiRow[]>([]);
  readonly loading = signal(true);

  // Modal
  readonly showFieldDialog = signal(false);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.tableId.set(id || 0);
    this.loadAll();
  }

  async loadAll() {
    try {
      this.loading.set(true);
      const [tables, fields, rows] = await Promise.all([
        this.api.listTablesByProject(this.projectId()),
        this.api.listColumnsByTableId(this.tableId()),
        this.api.listRowsByTableId(this.tableId()),
      ]);
      this.table.set(tables.find(t => t.tableId === this.tableId()) ?? null);
      this.fields.set(fields);
      this.rows.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  // UI helpers
  readonly isEmpty = computed(() => this.rows().length === 0);

  openAddField() {
    this.showFieldDialog.set(true);
  }
  closeAddField(refresh = false) {
    this.showFieldDialog.set(false);
    if (refresh) this.loadAll();
  }
}
