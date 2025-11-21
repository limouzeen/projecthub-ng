// src/app/pages/admin-users/admin-users.ts
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms'; 
import {
  AdminUsersService,
  AdminUserDto,
} from '../../core/admin-users.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.css',
})
export class AdminUsers implements OnInit {
  private readonly api = inject(AdminUsersService);

  users = signal<AdminUserDto[]>([]);
  search = signal('');
  loading = signal(false);
  error = signal<string | null>(null);

  filteredUsers = computed(() => {
    const q = this.search().toLowerCase().trim();
    if (!q) return this.users();
    return this.users().filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    );
  });

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    this.api.getAll().subscribe({
      next: (list) => {
        this.users.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.error.set('โหลดรายชื่อผู้ใช้ไม่สำเร็จ (ต้องเป็น Admin และ token ต้องยังไม่หมดอายุ)');
        this.loading.set(false);
      },
    });
  }
}
