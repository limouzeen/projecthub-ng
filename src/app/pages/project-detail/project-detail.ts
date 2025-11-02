import { Component, signal, computed, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule, DatePipe, NgClass } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { FooterStateService } from '../../core/footer-state.service';


import {
  ProjectDetailService,
  ProjectDto,
  TableDto,
  ColumnDto,
  RowDto,
} from '../../core/project-detail.service';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, NgClass, DatePipe, FormsModule],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.css',
})
export class ProjectDetail implements OnInit, OnDestroy {
  private id!: number; // projectId

  // data state
  project  = signal<ProjectDto | null>(null);
  tables   = signal<TableDto[]>([]);
  selected = signal<TableDto | null>(null);
  columns  = signal<ColumnDto[]>([]);
  rows     = signal<RowDto[]>([]);

  // ui state
  loading  = signal(false);
  creating = signal(false);
  renaming = signal(false);
  deleting = signal(false);
  profileOpen = signal(false);

  status    = signal<'idle' | 'success' | 'error'>('idle');
  statusMsg = signal('');
  keyword   = signal('');



  // “Add field” modal state
  ui = {
    newFieldOpen: signal(false),
    newFieldName: signal(''),
    newFieldType: signal<'text'|'number'|'boolean'|'date'|'link'>('text'),
    linkTargetTableId: signal<number|null>(null),
  };

  // link field registry (MOCK ONLY)
  private linkIndex = new Map<number, { fieldName: string; fkColumnId: number; targetTableId: number }[]>();

  filteredTables = computed(() => {
    const q = this.keyword().trim().toLowerCase();
    return q ? this.tables().filter(t => t.name.toLowerCase().includes(q)) : this.tables();
  });

  constructor(
    private route: ActivatedRoute,
    private api: ProjectDetailService,
    private router: Router,
    private footer: FooterStateService
  ) {


    const raw = this.route.snapshot.paramMap.get('projectId');
    const id = Number(raw);
    if (!raw || Number.isNaN(id) || !Number.isFinite(id) || id <= 0) {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.id = id;
    this.bootstrap();
  }



  // เพิ่มในคลาส ProjectDetail

/** Compact footer when viewport width < 840px */
private applyFooterCompactByWidth() {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 1025;
  this.footer.setForceCompact(narrow ? true : null);
}

@HostListener('window:resize')
onWindowResize() {
  this.applyFooterCompactByWidth();
}


  //  ตั้ง threshold เฉพาะหน้า Login: ย่อเมื่อสูง < 806px
  ngOnInit(): void {
    this.footer.setThreshold(600);
    this.footer.setForceCompact(null); // ให้ทำงานแบบ auto ตาม threshold
    // ใหม่: คุมตามความกว้าง (< 840px → compact)
    this.applyFooterCompactByWidth();
  }

  // ออกจากหน้านี้ให้คืนค่ากลับปกติ
  ngOnDestroy(): void {
    this.footer.resetAll();
  }

  private async bootstrap() {
    try {
      this.loading.set(true);
      const [project, tables] = await Promise.all([
        firstValueFrom(this.api.getProject(this.id)),    // TODO(WIRE_BACKEND)
        firstValueFrom(this.api.listTables(this.id)),    // TODO(WIRE_BACKEND)
      ]);
      if (!project) { this.setStatus('error', 'Project not found.'); return; }
      this.project.set(project);
      this.tables.set(tables ?? []);
      if (this.tables().length) this.onSelect(this.tables()[0]);
    } catch {
      this.setStatus('error', 'Failed to load project.');
    } finally {
      this.loading.set(false);
    }
  }

  private setStatus(kind: 'success' | 'error' | 'idle', msg: string, ms = 2800) {
    this.status.set(kind); this.statusMsg.set(msg);
    if (kind !== 'idle') setTimeout(() => { this.status.set('idle'); this.statusMsg.set(''); }, ms);
  }

  async onSelect(t: TableDto) {
    this.selected.set(t);
    try {
      const [cols, rows] = await Promise.all([
        firstValueFrom(this.api.listColumns(t.tableId)).catch(() => []),  // TODO(WIRE_BACKEND)
        firstValueFrom(this.api.listRows(t.tableId, 5)).catch(() => []),  // TODO(WIRE_BACKEND)
      ]);
      this.columns.set(cols || []);
      this.rows.set(rows || []);
    } catch {
      this.setStatus('error', 'Failed to load table preview.');
    }
  }

  // toolbar actions
  gotoTableFull() {
    const t = this.selected(); if (!t) return;
    this.router.navigate(['/projects', this.id, 'tables', t.tableId]);
  }

  // fields UX helpers
  openNewField() { this.ui.newFieldOpen.set(true); this.ui.newFieldName.set(''); this.ui.newFieldType.set('text'); this.ui.linkTargetTableId.set(null); }
  closeNewField() { this.ui.newFieldOpen.set(false); }
  canCreateField() {
    const nameOk = !!this.ui.newFieldName().trim();
    return this.ui.newFieldType() === 'link' ? nameOk && Number.isFinite(this.ui.linkTargetTableId() ?? NaN) : nameOk;
  }

  humanType(t: string): string {
    const map: Record<string,string> = {
      int: 'Number', number: 'Number', float: 'Number',
      text: 'Text', string: 'Text', json: 'Data',
      boolean: 'Yes/No', bool: 'Yes/No',
      date: 'Date', datetime: 'Date & Time',
    };
    const k = (t || '').toLowerCase();
    return map[k] ?? (t || 'Text');
  }

  // CRUD (tables)
  async createTable() {
    const name = prompt('New table name:')?.trim();
    if (!name) return;
    this.creating.set(true);
    try {
      const dto = await firstValueFrom(this.api.createTable(this.id, name)); // TODO(WIRE_BACKEND)
      if (dto) {
        this.tables.update(arr => [dto, ...arr]);
        this.setStatus('success', 'Table created.');
        this.onSelect(dto);
      }
    } catch (e: any) {
      this.setStatus('error', e?.error?.error || 'Create table failed.');
    } finally {
      this.creating.set(false);
    }
  }

  async renameTable(t: TableDto) {
    const next = prompt('Rename table:', t.name)?.trim();
    if (!next || next === t.name) return;
    this.renaming.set(true);
    try {
      const dto = await firstValueFrom(this.api.renameTable(t.tableId, next)); // TODO(WIRE_BACKEND)
      if (dto) {
        this.tables.update(arr => arr.map(x => (x.tableId === t.tableId ? dto : x)));
        if (this.selected()?.tableId === t.tableId) this.selected.set(dto);
        this.setStatus('success', 'Table renamed.');
      }
    } catch {
      this.setStatus('error', 'Rename failed.');
    } finally {
      this.renaming.set(false);
    }
  }

  async deleteTable(t: TableDto) {
    if (!confirm(`Delete table "${t.name}"? This cannot be undone.`)) return;
    this.deleting.set(true);
    try {
      await firstValueFrom(this.api.deleteTable(t.tableId)); // TODO(WIRE_BACKEND)
      this.tables.update(arr => arr.filter(x => x.tableId !== t.tableId));
      if (this.selected()?.tableId === t.tableId) this.selected.set(this.tables()[0] ?? null);
      this.setStatus('success', 'Table deleted.');
    } catch {
      this.setStatus('error', 'Delete failed.');
    } finally {
      this.deleting.set(false);
    }
  }

  // create field (mock + clear backend TODOs)
  async createField() {
    const t = this.selected(); if (!t) return;
    const name = this.ui.newFieldName().trim();
    const type = this.ui.newFieldType();

    try {
      if (type !== 'link') {
        // TODO(WIRE_BACKEND): POST /api/columns { tableId, name, dataType, isNullable }
        const newCol: ColumnDto = {
          columnId: Math.floor(Math.random() * 1e9),
          tableId: t.tableId,
          name,
          dataType: type,
          isPrimary: false,
          isNullable: true,
        };
        this.columns.update(cols => [...cols, newCol]);
        this.setStatus('success', 'Field created.');
      } else {
        const targetId = this.ui.linkTargetTableId()!;
        // 1) TODO(WIRE_BACKEND): POST /api/columns to create hidden FK column
        const fkColumn: ColumnDto = {
          columnId: Math.floor(Math.random() * 1e9),
          tableId: t.tableId,
          name: `${name}_fk`,
          dataType: 'int',
          isPrimary: false,
          isNullable: true,
        };
        // 2) TODO(WIRE_BACKEND): POST /api/relationships { primaryTableId, primaryColumnId, foreignTableId, foreignColumnId, displayName: name }
        this.columns.update(cols => [...cols, fkColumn]);
        const arr = this.linkIndex.get(t.tableId) ?? [];
        arr.push({ fieldName: name, fkColumnId: fkColumn.columnId, targetTableId: targetId });
        this.linkIndex.set(t.tableId, arr);
        this.setStatus('success', 'Link field created.');
      }
    } finally {
      this.closeNewField();
    }
  }

  // friendly compact line for each row (keeps JSON above for debugging)
  renderEntry(r: RowDto): string {
    try {
      const obj = JSON.parse(r.data ?? '{}');
      const pairs = Object.entries(obj).map(([k, v]) => `${k}: ${v}`);
      return pairs.length ? pairs.join('  ·  ') : '(empty)';
    } catch {
      return r.data ?? '';
    }
  }


//Right Profile Function
  toggleProfileMenu() {
  this.profileOpen.update(v => !v);
}

onEditProfile() {
  // ไปหน้าแก้โปรไฟล์ตามที่คุณใช้ในแอป
  this.router.navigateByUrl('/profile/edit');
}

onLogout() {
  this.router.navigateByUrl('/login');
}

// ปิดเมนูเมื่อคลิกนอก/กด ESC
@HostListener('document:click')
onDocClick() {
  if (this.profileOpen()) this.profileOpen.set(false);
}

@HostListener('document:keydown.escape')
onEsc() {
  if (this.profileOpen()) this.profileOpen.set(false);
}

}
