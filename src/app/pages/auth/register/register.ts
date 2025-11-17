import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FooterStateService } from '../../../core/footer-state.service';
import { UsersService } from '../../../core/users.service';
import { HttpErrorResponse } from '@angular/common/http';
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
  const value = this.email().trim();

  // 1) เช็ค pattern พื้นฐานให้ดีขึ้น
  const basicOk = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,10}$/.test(value);
  if (!basicOk) return false;

  // 2) ห้ามมีจุดติดกัน / จุดขึ้นต้น–ลงท้าย ทั้งหน้า–หลัง @
  const [local, domain] = value.split('@');
  if (!local || !domain) return false;
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (local.includes('..') || domain.includes('..')) return false;

  // 3) จำกัดความยาว TLD (ส่วนหลังจุดสุดท้าย) เช่น .com / .co / .th
  const tld = domain.split('.').pop() ?? '';
  if (tld.length < 2 || tld.length > 6) return false; 

  return true;
}

  get isUsernameValid() {
    return this.username().trim().length >= 2; // ตั้งขั้นต่ำ 2 ตัวอักษร
  }
  get isPasswordValid() {
    const pw = this.password() ?? '';
    return pw.length >= 6 && pw.length <= 20; 
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
    let msg = 'Registration failed.'; // default

    if (e instanceof HttpErrorResponse) {
      // กรณี backend โยน exception แล้ว DevExceptionPage ส่ง HTML ยาว ๆ กลับมา
      const raw = e.error;

      // 1) ถ้า response body เป็น string (HTML) แล้วมีคำว่า "Email already exists"
      if (typeof raw === 'string' && raw.includes('Email already exists')) {
        msg = 'An account with this email already exists. Please enter another email.';
      }
      // 2) ถ้า backend เคยส่งเป็น JSON เช่น { error: '...' } / { message: '...' }
      else if (raw && typeof raw === 'object') {
        msg = (raw.error || raw.message || msg);
      }
      // 3) fallback ใช้ message จาก HttpErrorResponse
      else if (e.message) {
        msg = e.message;
      }
    } else if (e?.message) {
      msg = e.message;
    }

    this.error.set(msg);
  } finally {
    this.loading.set(false);
  }

}

}
