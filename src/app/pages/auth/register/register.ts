import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FooterStateService } from '../../../core/footer-state.service';
import { UsersService } from '../../../core/users.service';
@Component({
  selector: 'app-register',
  imports: [RouterLink, FormsModule],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly footer = inject(FooterStateService);
  private readonly users = inject(UsersService);

  email = signal('');
  username = signal('');
  password = signal('');

  loading = signal(false);
  error = signal('');
  success = signal('');

  ngOnInit(): void {
    this.footer.setThreshold(675);
    this.footer.setForceCompact(null);
  }

  ngOnDestroy(): void {
    this.footer.resetAll();
  }

  // validate ง่าย ๆ ให้ตรง backend (password >= 6)
  get isEmailValid() {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim());
  }
  get isUsernameValid() {
    return this.username().trim().length >= 2; // ตั้งขั้นต่ำ 2 ตัวอักษร
  }
  get isPasswordValid() {
    return (this.password() ?? '').length >= 6;
  }
  get formValid() {
    return this.isEmailValid && this.isUsernameValid && this.isPasswordValid;
  }

  async onSubmit() {
  this.error.set('');
  this.success.set('');
  if (!this.formValid) {
    this.error.set('Please fill in all fields correctly.');
    return;
  }

  this.loading.set(true);
  try {
    await this.users.register({
      email: this.email(),
      username: this.username(),
      password: this.password(),
    });

    // 👉 ไปหน้า Login ให้ผู้ใช้กรอกเอง (พ่วง flag ไว้โชว์ข้อความ)
    this.router.navigate(['/login'], { queryParams: { registered: '1' } });
  } catch (e: any) {
    const msg = e?.error?.error || e?.message || 'Registration failed.';
    this.error.set(msg);
  } finally {
    this.loading.set(false);
  }
}

}
