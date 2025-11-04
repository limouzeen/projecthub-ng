import { Component, signal , OnInit, OnDestroy} from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FooterStateService } from '../../core/footer-state.service';

type Member = {
  name: string;
  role?: string;
  img: string;
  socials: {
    line?: string;
    instagram?: string;
    ig?: string;          
    facebook?: string;
  };
};

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterLink, NgClass], 
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About implements OnInit, OnDestroy {



     //  constructor
  constructor(
    private footer: FooterStateService
  ) {}
   //  ตั้ง threshold เฉพาะหน้า Login: ย่อเมื่อสูง < 719px
  ngOnInit(): void {
    this.footer.setThreshold(719);
    this.footer.setForceCompact(null); // ให้ทำงานแบบ auto ตาม threshold
  }

  // ออกจากหน้านี้ให้คืนค่ากลับปกติ
  ngOnDestroy(): void {
    this.footer.resetAll();
  }




  members = signal<Member[]>([
    {
      name: 'Dome',
      role: 'Backend Developer',
      img: '/assets/char1.png',
      socials: {
        line: 'https://line.me/ti/p/~pixelcat',
        instagram: 'https://instagram.com/pixelcat',
        facebook: 'https://facebook.com/pixelcat'
      }
    },
    {
      name: 'Am',
      role: 'Frontend Developer',
      img: '/assets/char2.png',
      socials: { ig: 'https://instagram.com/byte.bunny' } 
    },
    {
      name: 'Waiwai',
      role: 'Frontend Developer',
      img: '/assets/char3.png',
      socials: {}
    }
  ]);

  // ทำให้การ์ดใบสุดท้าย (กรณีจำนวนคี่) ไปอยู่กึ่งกลางแถวบนจอกว้างปานกลาง
  isLastOdd(i: number): boolean {
    const n = this.members().length;
    return n % 2 === 1 && i === n - 1;
  }
}
