import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-credit-hint',
  imports: [CommonModule],
  template: `
    <div *ngIf="open" class="credit-hint" [ngStyle]="{ top: top + 'px', left: left + 'px' }" (click)="$event.stopPropagation()">
      {{ text }}
    </div>
  `,
  styles: [`
    .credit-hint {
      position: fixed;
      z-index: 5000;
      background: var(--background-light);
      color: var(--text-dark);
      border: 2px solid var(--border-light);
      border-radius: 10px;
      padding: 0.4rem 0.6rem;
      box-shadow: 0 12px 30px var(--shadow-medium);
      font-family: 'Fredoka', sans-serif;
      font-weight: 600;
      font-size: 0.9rem;
      max-width: 80vw;
    }
  `]
})
export class CreditHintComponent {
  @Input() open = false;
  @Input() text = '';
  @Input() top = 0;
  @Input() left = 0;
  @Output() requestClose = new EventEmitter<void>();

  @HostListener('document:click') onDocClick() {
    if (this.open) this.requestClose.emit();
  }
}


