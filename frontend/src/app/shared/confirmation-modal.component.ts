import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-confirmation-modal',
  imports: [CommonModule],
  template: `
    <div class="modal-overlay" (click)="onBackdrop()">
      <div class="modal-container" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">{{ title }}</h3>
          <button class="close-btn" (click)="onCancel()">×</button>
        </div>
        
        <div class="modal-body">
          <p class="modal-message">{{ message }}</p>
        </div>
        
        <div class="modal-footer">
          <button class="btn btn-cancel" (click)="onCancel()">Cancel</button>
          <button class="btn btn-confirm" (click)="onConfirm()">{{ confirmText }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    
    .modal-container {
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      border: 2px solid #dee2e6;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 400px;
      width: 100%;
      overflow: hidden;
    }
    
    .modal-header {
      background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
      padding: 1rem 1.5rem;
      border-bottom: 2px solid #00cc6a;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .modal-title {
      color: #000;
      font-size: 1.3rem;
      font-weight: 700;
      margin: 0;
      font-family: 'Fredoka', sans-serif;
    }
    
    .close-btn {
      background: rgba(0, 0, 0, 0.1);
      border: none;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      font-weight: bold;
      color: #000;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    
    .close-btn:hover {
      background: rgba(0, 0, 0, 0.2);
    }
    
    .modal-body {
      padding: 1.5rem;
    }
    
    .modal-message {
      color: #333;
      font-size: 1rem;
      line-height: 1.5;
      margin: 0;
      text-align: center;
    }
    
    .modal-footer {
      padding: 1rem 1.5rem 1.5rem;
      display: flex;
      gap: 0.75rem;
      justify-content: center;
    }
    
    .btn {
      padding: 0.7rem 1.5rem;
      border: none;
      border-radius: 25px;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      transition: all 0.2s ease;
      min-width: 100px;
    }
    
    .btn-cancel {
      background: #6c757d;
      color: white;
      border: 2px solid #6c757d;
    }
    
    .btn-cancel:hover {
      background: #5a6268;
      border-color: #5a6268;
      transform: translateY(-1px);
    }
    
    .btn-confirm {
      background: linear-gradient(135deg, #ff6b6b 0%, #e74c3c 100%);
      color: white;
      border: 2px solid #e74c3c;
      box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
    }
    
    .btn-confirm:hover {
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      border-color: #c0392b;
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4);
    }
    
    @media (max-width: 480px) {
      .modal-container {
        margin: 0.5rem;
        max-width: none;
      }
      
      .modal-footer {
        flex-direction: column;
      }
      
      .btn {
        width: 100%;
      }
    }
  `]
})
export class ConfirmationModalComponent {
  @Input() title: string = 'Confirm Action';
  @Input() message: string = 'Are you sure you want to proceed?';
  @Input() confirmText: string = 'Confirm';
  @Input() show: boolean = false;
  
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  onConfirm() {
    this.confirm.emit();
  }

  onCancel() {
    this.cancel.emit();
  }

  onBackdrop() {
    this.close.emit();
  }
}
