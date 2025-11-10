import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  HostListener,
  AfterViewInit, OnDestroy,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  FavoriteProjectsService,
  FavoriteProject,
} from '../../core/favorite-projects.service';
import { FooterStateService } from '../../core/footer-state.service';


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



 // ===== Constructor ========

  constructor(
    private footer: FooterStateService
  ) {}



  // ===== Derived data =====

  // filter & ให้ pinned ขึ้นก่อน
  filtered = computed(() => {
    const q = this.keyword().trim().toLowerCase();
    const items = this.favorites();

    const base = !q
      ? items
      : items.filter((p) =>
          (p.name ?? '').toLowerCase().includes(q)
        );

    return [...base].sort(
      (a, b) => Number(b.isPinned) - Number(a.isPinned)
    );
  });

  pageCount = computed(() => {
    const total = this.filtered().length;
    const size = this.pageSize();
    if (!total || !size) return 1;
    return Math.max(1, Math.ceil(total / size));
  });

  pages = computed(() =>
    Array.from({ length: this.pageCount() }, (_, i) => i)
  );

  paged = computed(() => {
    const all = this.filtered();
    const size = this.pageSize();
    if (!size) return all;

    const maxIndex = this.pageCount() - 1;
    const safeIndex = Math.min(this.pageIndex(), maxIndex);
    const start = safeIndex * size;

    return all.slice(start, start + size);
  });

  pageStart = computed(() => {
    const total = this.filtered().length;
    if (!total) return 0;
    return this.pageIndex() * this.pageSize() + 1;
  });

  pageEnd = computed(() => {
    const total = this.filtered().length;
    if (!total) return 0;
    const end = (this.pageIndex() + 1) * this.pageSize();
    return end > total ? total : end;
  });

  // ===== Lifecycle =====

  ngOnInit() {

    this.footer.setThreshold(690);
    this.footer.setForceCompact(null);
    // TODO: เปลี่ยนเป็น API จริงเมื่อพร้อม
    // this.api.getFavoriteProjects().subscribe(...)
    this.svc.getFavorites().subscribe((list) => {
      this.favorites.set(list);
      this.loading.set(false);
      this.pageIndex.set(0);
    });
  }

  ngOnDestroy(): void {
    this.footer.resetAll();
  }



  // ===== Topbar / Aside =====

  toggleAside() {
    this.asideOpen.update((v) => !v);
  }

  onBack() {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigateByUrl('/dashboard');
    }
  }

  toggleProfileMenu() {
    this.profileOpen.update((v) => !v);
  }

  onEditProfile() {
    this.profileOpen.set(false);
    this.router.navigateByUrl('/profile/edit');
  }

  onLogout() {
    this.profileOpen.set(false);
    this.router.navigateByUrl('/login');
  }

  @HostListener('document:click')
  onDocClick() {
    if (this.profileOpen()) this.profileOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.profileOpen()) this.profileOpen.set(false);
    if (this.asideOpen()) this.asideOpen.set(false);
  }

  // ===== Pagination actions =====

  prevPage() {
    const i = this.pageIndex();
    if (i > 0) this.pageIndex.set(i - 1);
  }

  nextPage() {
    const i = this.pageIndex();
    if (i < this.pageCount() - 1) this.pageIndex.set(i + 1);
  }

  gotoPage(i: number) {
    if (i >= 0 && i < this.pageCount()) {
      this.pageIndex.set(i);
    }
  }

  // ===== Card actions =====

  onOpenProject(p: FavoriteProject) {
    this.router.navigate(['/project', p.projectId]);
  }

  onTogglePin(p: FavoriteProject, ev: MouseEvent) {
    ev.stopPropagation();

    const updated = this.favorites().map((x) =>
      x.projectId === p.projectId
        ? { ...x, isPinned: !x.isPinned }
        : x
    );
    this.favorites.set(updated);

    // TODO: call API อัปเดต favorite เมื่อมี backend จริง
    // this.api.updateFavorite(p.projectId, !p.isPinned).subscribe();
  }
}
