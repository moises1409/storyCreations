import { Component, EventEmitter, Output, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-add-credits-modal',
  imports: [CommonModule, HttpClientModule],
  template: `
<div class="modal-root" (click)="close()">
  <div class="modal-card" (click)="$event.stopPropagation()">
  <ng-container *ngIf="!successMode; else successTpl">
    <h2 class="modal-title">Upgrade your plan</h2>
    <p class="modal-sub">Choose a credit pack to continue creating stories.</p>
    <div class="plans">
      <div class="plan" [class.featured]="i===1" *ngFor="let p of plans; index as i">
        <div class="plan-title">{{ p.name }}</div>
        <div class="plan-credits">{{ p.credits }} credits</div>
        <div class="plan-price">{{ p.price }} {{ p.currency }}</div>
        <button class="dashboard-btn" (click)="select(p.id)">Add credits</button>
      </div>
    </div>
    <div class="modal-actions"><button class="small" (click)="close()">Close</button></div>
  </ng-container>
  <ng-template #successTpl>
    <h2 class="modal-title">Credits added</h2>
    <p class="modal-sub" *ngIf="purchasedCredits && totalCredits">
      You added <strong>{{ purchasedCredits }}</strong> credits. Your total is now <strong>{{ totalCredits }}</strong>.
    </p>
    <p class="modal-sub" *ngIf="!purchasedCredits || !totalCredits">Your credits have been updated.</p>
    <div class="modal-actions"><button class="dashboard-btn" (click)="close()">OK</button></div>
  </ng-template>
</div>
</div>
`,
  styles: [`
.modal-root { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 2147483647; display: flex; align-items: center; justify-content: center; }
.modal-card { background: var(--background-light); border: 2px solid var(--border-light); border-radius: 20px; padding: 1.25rem; width: min(820px, 92vw); color: var(--text-dark); box-shadow: 0 20px 60px var(--shadow-medium); }
.modal-title { margin: 0 0 0.25rem 0; font-size: 1.6rem; font-weight: 800; background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow), var(--primary-purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-family: 'Fredoka', sans-serif; }
.modal-sub { margin: 0 0 0.75rem 0; color: var(--text-medium); font-family: 'Fredoka', sans-serif; }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
.plan { background: var(--background-light); border: 2px solid var(--border-light); border-radius: 16px; padding: 1rem; text-align: left; transition: all 0.3s ease; box-shadow: 0 4px 12px var(--shadow-light); }
.plan:hover { border-color: var(--primary-pink); transform: translateY(-2px); box-shadow: 0 8px 20px var(--shadow-medium); }
.plan .plan-title { color: var(--text-dark); font-weight: 800; font-size: 1.1rem; margin-bottom: 0.35rem; font-family: 'Fredoka', sans-serif; }
.plan .plan-credits { color: var(--text-medium); font-size: 0.95rem; margin-bottom: 0.35rem; font-family: 'Fredoka', sans-serif; }
.plan .plan-price { color: var(--text-dark); font-weight: 800; font-size: 1.1rem; margin-bottom: 0.6rem; font-family: 'Fredoka', sans-serif; }
.plan.featured { border-color: var(--primary-pink); box-shadow: 0 8px 20px rgba(255, 111, 145, 0.3); background: linear-gradient(135deg, var(--background-light) 0%, rgba(255, 111, 145, 0.05) 100%); }
.modal-actions { margin-top: 1rem; display: flex; justify-content: flex-end; }

/* Buttons (scoped copy to ensure styling inside modal) */
.dashboard-btn { background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow)); border:none; padding:0.7rem 1.1rem; border-radius: 30px; color: var(--text-white); font-weight: 800; cursor:pointer; box-shadow: 0 8px 20px rgba(255, 111, 145, 0.3); font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
.dashboard-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(255, 111, 145, 0.4); }
.small { background: transparent; color: var(--text-dark); border:2px solid var(--border-light); border-radius: 12px; padding: 0.45rem 0.75rem; cursor:pointer; font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
.small:hover { border-color: var(--primary-pink); background: rgba(255, 111, 145, 0.1); }
@media (max-width: 720px) { .plans { grid-template-columns: 1fr; } }
`]
})
export class AddCreditsModalComponent implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);
  @Input() successMode: boolean = false;
  @Input() purchasedCredits?: number;
  @Input() totalCredits?: number;
  @Output() closeModal = new EventEmitter<void>();
  @Output() choosePlan = new EventEmitter<'starter' | 'pro' | 'max'>();

  plans: Array<{ id:'starter'|'pro'|'max'; name:string; credits:number; price:string; currency:string }> = [
    { id:'starter', name:'Starter', credits:50, price:'10', currency:'CHF' },
    { id:'pro', name:'Pro', credits:100, price:'17', currency:'CHF' },
    { id:'max', name:'Max', credits:150, price:'25', currency:'CHF' },
  ];

  ngOnInit(): void {
    const apply = (res: any) => { if (res && Array.isArray(res.plans) && res.plans.length) this.plans = res.plans as any; };
    try {
      const base = (this.auth && this.auth.baseUrl) ? this.auth.baseUrl : `${window.location.protocol}//${window.location.host}`;
      this.http.get<{ plans: Array<{ id:'starter'|'pro'|'max'; name:string; credits:number; price:string; currency:string }> }>(`${base}/billing/plans`)
        .subscribe({ next: (res) => apply(res), error: () => {} });
    } catch {}
  }

  close() { this.closeModal.emit(); }
  select(plan: 'starter'|'pro'|'max') { this.choosePlan.emit(plan); }
}


