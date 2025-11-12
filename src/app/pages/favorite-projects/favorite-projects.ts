import {
  Component, inject, signal, computed, OnInit, HostListener, OnDestroy
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import {
  FavoriteProjectsService,
  FavoriteProject,
} from '../../core/favorite-projects.service';
import { FooterStateService } from '../../core/footer-state.service';
import { UsersService, MeDto } from '../../core/users.service';

@Component({
  selector: 'app-favorite-projects',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './favorite-projects.html',
  styleUrl: './favorite-projects.css',
})
export class FavoriteProjects implements OnInit, OnDestroy {
  private readonly svc = inject(FavoriteProjectsService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  private readonly users = inject(UsersService);              
  me = signal<MeDto | null>(null);

  // UI state
  asideOpen = signal(false);
  profileOpen = signal(false);

  // data state
  keyword = signal('');
  favorites = signal<FavoriteProject[]>([]);
  loading = signal(true);

  // paging: 5 projects / page
  pageIndex = signal(0);
  pageSize = signal(5);

  constructor(private footer: FooterStateService) {}

  // ===== Derived data =====
  filtered = computed(() => {
    const q = this.keyword().trim().toLowerCase();
    const items = this.favorites();
    const base = !q ? items : items.filter(p => (p.name ?? '').toLowerCase().includes(q));
    // เรียงให้ pinned ขึ้นก่อน (จริง ๆ ทุกตัวในหน้านี้คือ pinned อยู่แล้ว แต่คง logic เดิม)
    return [...base].sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
  });

  pageCount = computed(() => {
    const total = this.filtered().length;
    const size = this.pageSize();
    if (!total || !size) return 1;
    return Math.max(1, Math.ceil(total / size));
  });

  pages = computed(() => Array.from({ length: this.pageCount() }, (_, i) => i));

  paged = computed(() => {
    const all = this.filtered();
    const size = this.pageSize();
    if (!size) return all;
    const maxIndex = this.pageCount() - 1;
    const safeIndex = Math.min(this.pageIndex(), maxIndex);
    const start = safeIndex * size;
    return all.slice(start, start + size);
  });

  pageStart = computed(() => (this.filtered().length ? this.pageIndex() * this.pageSize() + 1 : 0));
  pageEnd   = computed(() => {
    const total = this.filtered().length;
    if (!total) return 0;
    const end = (this.pageIndex() + 1) * this.pageSize();
    return end > total ? total : end;
    });

  // ===== Lifecycle =====
  ngOnInit() {
    this.footer.setThreshold(690);
    this.footer.setForceCompact(null);

    //โหลดโปรไฟล์ก่อน (เอาไว้ใช้รูป/ชื่อ/อีเมล ที่มุมขวาบน)
    this.users.getMe()
      .then(info => this.me.set(info))
      .catch(() => this.router.navigateByUrl('/login'));

    // โหลดจาก API จริง
    this.svc.getFavorites().subscribe({
      next: (list) => {
        this.favorites.set(list);
        this.loading.set(false);
        this.pageIndex.set(0);
      },
      error: () => {
        this.loading.set(false);
        // คง UX เดิม: เงียบไว้ก่อน (จะใส่ toast ทีหลังได้)
      },
    });
  }

  ngOnDestroy(): void {
    this.footer.resetAll();
  }

  // ===== Topbar / Aside =====
  toggleAside() { this.asideOpen.update(v => !v); }

  onBack() {
    if (window.history.length > 1) this.location.back();
    else this.router.navigateByUrl('/dashboard');
  }

  toggleProfileMenu() { this.profileOpen.update(v => !v); }
  onEditProfile() { this.profileOpen.set(false); this.router.navigateByUrl('/profile/edit'); }
  onLogout() { this.profileOpen.set(false); this.router.navigateByUrl('/login'); }

  @HostListener('document:click') onDocClick() {
    if (this.profileOpen()) this.profileOpen.set(false);
  }
  @HostListener('document:keydown.escape') onEsc() {
    if (this.profileOpen()) this.profileOpen.set(false);
    if (this.asideOpen()) this.asideOpen.set(false);
  }

  // ===== Pagination actions =====
  prevPage() { const i = this.pageIndex(); if (i > 0) this.pageIndex.set(i - 1); }
  nextPage() { const i = this.pageIndex(); if (i < this.pageCount() - 1) this.pageIndex.set(i + 1); }
  gotoPage(i: number) { if (i >= 0 && i < this.pageCount()) this.pageIndex.set(i); }

  // ===== Card actions =====
  onOpenProject(p: FavoriteProject) { this.router.navigate(['/projects', p.projectId]); }

  /** Toggle star แล้ว sync กับลิสต์ให้ตรง UX เดิม */
  async onTogglePin(p: FavoriteProject, ev: MouseEvent) {
    ev.stopPropagation();
    try {
      const updated = await this.svc.togglePin(p.projectId);

      if (updated.isPinned) {
        // ยังเป็น favorite → อัปเดตการ์ด
        this.favorites.update(list =>
          list.map(x => (x.projectId === updated.projectId ? updated : x))
        );
      } else {
        // ถูกปลดดาว → เอาออกจากหน้านี้
        this.favorites.update(list => list.filter(x => x.projectId !== p.projectId));
        // ปรับหน้าไม่ให้ index เกินหลังเอาออก
        const pc = this.pageCount();
        if (this.pageIndex() >= pc) this.pageIndex.set(Math.max(0, pc - 1));
      }
    } catch {
      // คง UX เดิม: ไม่เด้ง alert (จะใส่ toast ได้ภายหลัง)
    }
  }
}
