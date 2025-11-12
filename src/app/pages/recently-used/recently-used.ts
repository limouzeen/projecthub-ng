import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener, effect } from '@angular/core';

import { CommonModule, Location, DatePipe, NgClass } from '@angular/common';
import { Router } from '@angular/router';
import { RecentlyUsedProjectsService, RecentlyUsedProject } from '../../core/recently-used-projects.service';
import { FooterStateService } from '../../core/footer-state.service';
import { UsersService, MeDto } from '../../core/users.service';

@Component({
  selector: 'app-recently-used-projects',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './recently-used.html',
  styleUrl: './recently-used.css',
})
export class RecentlyUsedProjects implements OnInit, OnDestroy {
  private readonly svc    = inject(RecentlyUsedProjectsService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly footer = inject(FooterStateService);
  private readonly users  = inject(UsersService);

  // UI
  asideOpen = signal(false);
  profileOpen = signal(false);

  // profile
  me = signal<MeDto | null>(null);

  // data
  keyword = signal('');
  loading = signal(true);
  items = signal<RecentlyUsedProject[]>([]);

  // paging
  pageIndex = signal(0);
  readonly pageSize = signal(5);

  constructor() {
  // เมื่อรายการหรือคีย์เวิร์ดเปลี่ยน -> กลับไปหน้าแรก
  effect(() => {
    const _items = this.items();      // track
    const _q = this.keyword();        // track
    this.pageIndex.set(0);
  }, { allowSignalWrites: true });

  // ถ้าจำนวนหน้าลดลง -> หน้าปัจจุบันต้องไม่เกินหน้าสุดท้าย
  effect(() => {
    const pc = this.pageCount();      // track
    if (pc > 0 && this.pageIndex() >= pc) {
      this.pageIndex.set(pc - 1);
    }
  }, { allowSignalWrites: true });
}

  // ===== Derived =====
  filtered = computed(() => {
    const q = this.keyword().trim().toLowerCase();
    const sorted = [...this.items()].sort(
      (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
    );
    return q ? sorted.filter(p => (p.name ?? '').toLowerCase().includes(q)) : sorted;
  });

  pageCount = computed(() => {
    const total = this.filtered().length;
    const size = this.pageSize();
    return total ? Math.max(1, Math.ceil(total / size)) : 1;
  });

  pages = computed(() => Array.from({ length: this.pageCount() }, (_, i) => i));

  paged = computed(() => {
    const list = this.filtered();
    const size = this.pageSize();
    const maxIndex = this.pageCount() - 1;
    const safeIndex = Math.min(this.pageIndex(), maxIndex);
    const start = safeIndex * size;
    return list.slice(start, start + size);
  });

  pageStart = computed(() => this.filtered().length ? this.pageIndex() * this.pageSize() + 1 : 0);
  pageEnd   = computed(() => {
    const total = this.filtered().length;
    if (!total) return 0;
    const end = (this.pageIndex() + 1) * this.pageSize();
    return end > total ? total : end;
    });

  // ===== Lifecycle =====
  async ngOnInit(): Promise<void> {
    this.footer.setThreshold(690);
    this.footer.setForceCompact(null);

    // โหลดโปรไฟล์ (สำหรับภาพ/ชื่อ/อีเมลขวาบน)
    try {
      const info = await this.users.getMe();
      this.me.set(info);
    } catch {
      // ถ้า 401 ส่งไปหน้า login
      this.router.navigateByUrl('/login');
      return;
    }

    // โหลด Recently Used จาก API จริง
    this.svc.getRecentlyUsed().subscribe(list => {
      this.items.set(list);
      this.loading.set(false);
      this.pageIndex.set(0);
    });
  }

  ngOnDestroy(): void {
    this.footer.resetAll();
  }

  // ===== Topbar / navigation =====
  onBack() {
    if (window.history.length > 1) this.location.back();
    else this.router.navigateByUrl('/dashboard');
  }

  toggleProfileMenu() { this.profileOpen.update(v => !v); }
  onEditProfile() { this.profileOpen.set(false); this.router.navigateByUrl('/profile/edit'); }
  onLogout() { this.profileOpen.set(false); this.router.navigateByUrl('/login'); }

  toggleAside() { this.asideOpen.update(v => !v); }

  @HostListener('document:click') onDocClick() {
    if (this.profileOpen()) this.profileOpen.set(false);
  }
  @HostListener('document:keydown.escape') onEsc() {
    if (this.profileOpen()) this.profileOpen.set(false);
    if (this.asideOpen()) this.asideOpen.set(false);
  }

  // ===== Paging =====
  prevPage() { const i = this.pageIndex(); if (i > 0) this.pageIndex.set(i - 1); }
  nextPage() { const i = this.pageIndex(); if (i < this.pageCount() - 1) this.pageIndex.set(i + 1); }
  gotoPage(i: number) { if (i >= 0 && i < this.pageCount()) this.pageIndex.set(i); }

  // ===== Actions =====
  onOpenProject(p: RecentlyUsedProject) {
    // เก็บ openCount ฝั่งหน้า (รักษา UI เดิม)
    this.svc.markOpened(p.projectId, p.name, p.tables);
    // เข้าโปรเจกต์ — backend จะอัปเดต lastOpenedAt ให้เอง
    this.router.navigate(['/projects', p.projectId]);
  }
}
