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
    this.loading.set(true);

    try {
      await this.users.login({
        email: this.email().trim(),
        password: this.password(),
      });
      this.router.navigateByUrl('/dashboard');
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
}
