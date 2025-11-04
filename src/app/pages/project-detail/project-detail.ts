// src/app/pages/project-detail/project-detail.ts
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { ProjectDetailService, TableDto } from '../../core/project-detail.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.css',
})
export class ProjectDetail implements OnInit {
  // Services
  private readonly api   = inject(ProjectDetailService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);

  // Project id (อ่านจาก route ถ้ามี, ไม่มีก็ fallback = 1)
  projectId = 1;

  // UI state
  readonly tables      = signal<TableDto[]>([]);
  readonly q           = signal('');
  readonly loading     = signal(false);
  readonly creating    = signal(false);
  readonly renamingId  = signal<number | null>(null);
  readonly deletingId  = signal<number | null>(null);

  // ค้นหา/กรอง
  readonly filtered = computed(() => {
    const keyword = this.q().toLowerCase().trim();
    return !keyword
      ? this.tables()
      : this.tables().filter(t => t.name.toLowerCase().includes(keyword));
  });

  async ngOnInit() {
    // ดึง projectId จาก params (เช่น /project/123)
    const fromRoute = Number(this.route.snapshot.paramMap.get('id') ?? '0');
    if (!Number.isNaN(fromRoute) && fromRoute > 0) this.projectId = fromRoute;

    await this.refresh();
  }

  // โหลดรายการตารางของโปรเจกต์
  async refresh() {
    this.loading.set(true);
    try {
      const res$ = this.api.listTables(this.projectId);         // Observable<TableDto[]>
      this.tables.set(await firstValueFrom(res$));               // -> Promise<TableDto[]>
    } finally {
      this.loading.set(false);
    }
  }

  // สร้างตารางใหม่
  async createTable() {
    const name = prompt('Table name?');
    if (!name) return;

    this.creating.set(true);
    try {
      await firstValueFrom(this.api.createTable(this.projectId, name));
      await this.refresh();
    } finally {
      this.creating.set(false);
    }
  }

  // เปลี่ยนชื่อ
  async renameTable(t: TableDto) {
    const name = prompt('Rename table:', t.name);
    if (!name || name === t.name) return;

    this.renamingId.set(t.tableId);
    try {
      await firstValueFrom(this.api.renameTable(t.tableId, name));
      await this.refresh();
    } finally {
      this.renamingId.set(null);
    }
  }

  // ลบ
  async deleteTable(t: TableDto) {
    if (!confirm(`Delete table "${t.name}"?`)) return;

    this.deletingId.set(t.tableId);
    try {
      await firstValueFrom(this.api.deleteTable(t.tableId));
      await this.refresh();
    } finally {
      this.deletingId.set(null);
    }
  }

  // เปิดไปหน้า table-view
  open(t: TableDto) {
    this.router.navigate(['/table', t.tableId]); // route: /table/:id
  }
}
