// src/app/pages/auth/login/login.ts
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FooterStateService } from '../../../core/footer-state.service';
import { UsersService } from '../../../core/users.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly footer = inject(FooterStateService);
  private readonly users = inject(UsersService);
  private readonly route = inject(ActivatedRoute);
  notice = signal('');

  readonly email = signal('');
  readonly password = signal('');
  readonly loading = signal(false);
  readonly error = signal('');

    async onSubmit() {
    this.error.set('');

    if (!this.formValid) {
      this.error.set('Please enter a valid email and password.');
      return;
    }

    this.loading.set(true);
    try {
      await this.users.login({
        email: this.email().trim(),
        password: this.password(),
      });

      // เช็ค role จาก JWT ผ่าน UsersService
      if (this.users.isAdmin()) {
        // ถ้าเป็นแอดมิน ไปหน้า Admin Dashboard
        this.router.navigateByUrl('/admin/users');
      } else {
        // ถ้าเป็น user ปกติ ไปหน้า dashboard เดิม
        this.router.navigateByUrl('/dashboard');
      }
    } catch (e: any) {
      const msg =
        e?.error?.error ||
        e?.message ||
        'Login failed. Please check your email and password.';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }



  ngOnInit(): void {
  this.footer.setThreshold(578);
  this.footer.setForceCompact(null);
  this.route.queryParamMap.subscribe(q => {
    if (q.get('registered') === '1') {
      this.notice.set('Account created. Please sign in.');
    }
  });
}
  ngOnDestroy(): void {
    this.footer.resetAll();
  }


  //Validate Login
  get isEmailValid() {
    const value = this.email().trim();

    const basicOk = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,10}$/.test(value);
    if (!basicOk) return false;

    const [local, domain] = value.split('@');
    if (!local || !domain) return false;
    if (local.startsWith('.') || local.endsWith('.')) return false;
    if (domain.startsWith('.') || domain.endsWith('.')) return false;
    if (local.includes('..') || domain.includes('..')) return false;

    const tld = domain.split('.').pop() ?? '';
    if (tld.length < 2 || tld.length > 6) return false;

    return true;
  }


   get isPasswordValid() {
    const pw = this.password() ?? '';
    return pw.length >= 6 && pw.length <= 20; 
  }

  get formValid() {
    return this.isEmailValid && this.isPasswordValid;
  }
}
