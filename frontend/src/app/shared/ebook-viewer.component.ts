import { Component, Input, Output, EventEmitter, OnInit, OnChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Chapter {
  id: string;
  title: string;
  text: string;
  imageUrl?: string;
  choices?: string[];
  collapsed?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-ebook-viewer',
  imports: [CommonModule],
  template: `
    <div class="ebook-overlay" *ngIf="open" (click)="onBackdrop($event)">
      <div class="ebook-container" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="ebook-header">
          <h2 class="ebook-title">{{ storyTitle }}</h2>
          <button class="close-btn" (click)="close.emit()">×</button>
        </div>
        
        <!-- Book Container -->
        <div class="book-container">
          <!-- Book Spine -->
          <div class="book-spine"></div>
          
          <!-- Left Page - Chapter Text -->
          <div class="page left-page" 
               [class.turning-left]="isTurning && direction === 'left'"
               [class.turning-right]="isTurning && direction === 'right'">
            <div class="page-content" *ngIf="getCurrentChapter()">
              <div class="chapter-text">
                <div class="text-content" [innerHTML]="getCurrentChapterText()"></div>
              </div>
            </div>
            <div class="page-shadow"></div>
          </div>
          
          <!-- Right Page - Chapter Image -->
          <div class="page right-page" 
               [class.turning-left]="isTurning && direction === 'left'"
               [class.turning-right]="isTurning && direction === 'right'">
            <div class="page-content" *ngIf="getCurrentChapter()">
              <div class="chapter-image" *ngIf="getCurrentChapter()?.imageUrl">
                <img [src]="getCurrentChapter()?.imageUrl" [alt]="getCurrentChapter()?.title" />
              </div>
              <div class="no-image-placeholder" *ngIf="!getCurrentChapter()?.imageUrl">
                <div class="placeholder-icon">🖼️</div>
                <p>No image available</p>
              </div>
            </div>
            <div class="page-shadow"></div>
          </div>
          
          <!-- Navigation Arrows -->
          <button class="nav-arrow left-arrow" (click)="previousPage()" [disabled]="currentPage <= 0">
            ‹
          </button>
          <button class="nav-arrow right-arrow" (click)="nextPage()" [disabled]="currentPage >= totalPages">
            ›
          </button>
        </div>
        
        <!-- Page Indicator -->
        <div class="page-indicator">
          Chapter {{ currentPage + 1 }} of {{ chapters.length }}
        </div>
        
        <!-- Keyboard Shortcuts Info -->
        <div class="keyboard-shortcuts">
          <small>Use ← → arrow keys to navigate • ESC to close • Home/End for first/last page</small>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ebook-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(5px);
    }
    
    .ebook-container {
      width: 90%;
      max-width: 1200px;
      height: 90vh;
      background: #1a1a1a;
      border-radius: 20px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      position: relative;
    }
    
    .ebook-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 2rem;
      background: linear-gradient(135deg, #2E7D32, #4CAF50);
      color: white;
    }
    
    .ebook-title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }
    
    .close-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 1.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.3s ease;
    }
    
    .close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    
    .book-container {
      flex: 1;
      display: flex;
      perspective: 1500px;
      margin: 0.5rem;
      gap: 0;
      position: relative;
      align-items: stretch;
      justify-content: center;
      max-width: 1000px;
      margin-left: auto;
      margin-right: auto;
      overflow: hidden;
      min-height: 0;
    }
    
    .book-spine {
      position: absolute;
      left: 50%;
      top: 0;
      bottom: 0;
      width: 8px;
      background: linear-gradient(90deg, #8B4513, #A0522D, #8B4513);
      transform: translateX(-50%);
      z-index: 1;
      box-shadow: inset -2px 0 4px rgba(0,0,0,0.3);
    }
    
    .page {
      width: 50%;
      height: 100%;
      background: #fefefe;
      border-radius: 0;
      box-shadow: 0 0 0 rgba(0, 0, 0, 0);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transform-style: preserve-3d;
      transition: none;
      border: 1px solid #e0e0e0;
      overflow: hidden;
    }
    
    .left-page {
      border-right: none;
      transform-origin: right center;
    }
    
    .right-page {
      border-left: none;
      transform-origin: left center;
    }
    
    /* Page turning animations - inspired by StorySpark */
    .page.turning-left {
      animation: turnPageLeft 1s cubic-bezier(0.4, 0.0, 0.2, 1) forwards;
    }
    
    .page.turning-right {
      animation: turnPageRight 1s cubic-bezier(0.4, 0.0, 0.2, 1) forwards;
    }
    
    @keyframes turnPageLeft {
      0% {
        transform: rotateY(0deg);
        box-shadow: 0 0 0 rgba(0, 0, 0, 0);
        z-index: 1;
      }
      20% {
        transform: rotateY(-20deg);
        box-shadow: -5px 0 15px rgba(0, 0, 0, 0.15);
        z-index: 2;
      }
      40% {
        transform: rotateY(-45deg);
        box-shadow: -15px 0 25px rgba(0, 0, 0, 0.25);
        z-index: 3;
      }
      60% {
        transform: rotateY(-90deg);
        box-shadow: -25px 0 35px rgba(0, 0, 0, 0.35);
        z-index: 4;
      }
      80% {
        transform: rotateY(-135deg);
        box-shadow: -15px 0 25px rgba(0, 0, 0, 0.25);
        z-index: 3;
      }
      100% {
        transform: rotateY(-180deg);
        box-shadow: 0 0 0 rgba(0, 0, 0, 0);
        z-index: 1;
      }
    }
    
    @keyframes turnPageRight {
      0% {
        transform: rotateY(0deg);
        box-shadow: 0 0 0 rgba(0, 0, 0, 0);
        z-index: 1;
      }
      20% {
        transform: rotateY(20deg);
        box-shadow: 5px 0 15px rgba(0, 0, 0, 0.15);
        z-index: 2;
      }
      40% {
        transform: rotateY(45deg);
        box-shadow: 15px 0 25px rgba(0, 0, 0, 0.25);
        z-index: 3;
      }
      60% {
        transform: rotateY(90deg);
        box-shadow: 25px 0 35px rgba(0, 0, 0, 0.35);
        z-index: 4;
      }
      80% {
        transform: rotateY(135deg);
        box-shadow: 15px 0 25px rgba(0, 0, 0, 0.25);
        z-index: 3;
      }
      100% {
        transform: rotateY(180deg);
        box-shadow: 0 0 0 rgba(0, 0, 0, 0);
        z-index: 1;
      }
    }
    
    .page-shadow {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(90deg, 
        rgba(0,0,0,0.1) 0%, 
        rgba(0,0,0,0.05) 50%, 
        rgba(0,0,0,0) 100%);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    
    .page.turning-left .page-shadow,
    .page.turning-right .page-shadow {
      opacity: 1;
    }
    
    .nav-arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(0, 0, 0, 0.7);
      border: none;
      color: white;
      font-size: 2rem;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      z-index: 10;
    }
    
    .nav-arrow:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.9);
      transform: translateY(-50%) scale(1.1);
    }
    
    .nav-arrow:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    
    .left-arrow {
      left: -25px;
    }
    
    .right-arrow {
      right: -25px;
    }
    
    .page-content {
      padding: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      text-align: center;
      overflow: hidden;
    }
    
    .chapter-info {
      width: 100%;
    }
    
    .chapter-title {
      font-size: 1.8rem;
      color: #2E7D32;
      margin-bottom: 1.5rem;
      font-weight: 600;
    }
    
    .chapter-image {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    
    .chapter-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center center;
      border-radius: 0;
      box-shadow: none;
    }
    
    .no-image-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: #f0f0f0;
      border-radius: 0;
      border: none;
      color: #666;
    }
    
    .placeholder-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    
    .chapter-text {
      width: 100%;
      height: 100%;
      text-align: left;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      overflow: hidden;
    }
    
    .text-content {
      font-size: 1.1rem;
      line-height: 1.6;
      color: #333;
      white-space: pre-wrap;
      padding: 1.5rem;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 8px;
      border-left: 4px solid #4CAF50;
      width: 100%;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      box-sizing: border-box;
    }
    
    .chapter-number {
      font-size: 0.9rem;
      color: #666;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
    
    
    .page-indicator {
      text-align: center;
      padding: 1rem 2rem;
      background: #2a2a2a;
      border-top: 1px solid #444;
      color: #ccc;
      font-size: 1rem;
      font-weight: 500;
    }
    
    .keyboard-shortcuts {
      text-align: center;
      padding: 0.5rem 2rem;
      background: #111;
      border-top: 1px solid #333;
    }
    
    .keyboard-shortcuts small {
      color: #888;
      font-size: 0.8rem;
    }
    
    /* Mobile Responsive */
    @media (max-width: 768px) {
      .ebook-container {
        width: 95%;
        height: 95%;
      }
      
      .book-container {
        flex-direction: row;
        margin: 0.5rem;
        gap: 0;
        perspective: 800px;
      }
      
      .book-spine {
        display: none;
      }
      
      .page {
        width: 50%;
        height: 100%;
        min-height: 0;
        border-radius: 0;
        box-shadow: 0 0 0 rgba(0, 0, 0, 0);
        border: 1px solid #e0e0e0;
      }
      
      .page-content {
        padding: 0;
      }
      
      .text-content {
        font-size: 1rem;
        padding: 1rem;
      }
      
      .nav-arrow {
        width: 40px;
        height: 40px;
        font-size: 1.5rem;
      }
      
      .left-arrow {
        left: -20px;
      }
      
      .right-arrow {
        right: -20px;
      }
      
      /* Simplified mobile animations */
      .page.turning-left {
        animation: turnPageLeftMobile 0.6s ease-in-out forwards;
      }
      
      .page.turning-right {
        animation: turnPageRightMobile 0.6s ease-in-out forwards;
      }
      
      @keyframes turnPageLeftMobile {
        0% { transform: translateX(0); opacity: 1; }
        50% { transform: translateX(-50%); opacity: 0.5; }
        100% { transform: translateX(-100%); opacity: 0; }
      }
      
      @keyframes turnPageRightMobile {
        0% { transform: translateX(0); opacity: 1; }
        50% { transform: translateX(50%); opacity: 0.5; }
        100% { transform: translateX(100%); opacity: 0; }
      }
    }
  `]
})
export class EbookViewerComponent implements OnInit, OnChanges {
  @Input() open = false;
  @Input() chapters: Chapter[] = [];
  @Input() storyTitle = '';
  @Output() close = new EventEmitter<void>();
  
  currentPage = 0;
  totalPages = 0;
  isTurning = false;
  direction: 'left' | 'right' = 'right';
  
  ngOnInit() {
    this.calculateTotalPages();
  }
  
  ngOnChanges() {
    this.calculateTotalPages();
  }
  
  calculateTotalPages() {
    // Each page represents one chapter
    this.totalPages = Math.max(0, this.chapters.length - 1);
  }
  
  getCurrentChapter(): Chapter | null {
    return this.chapters[this.currentPage] || null;
  }
  
  getCurrentChapterText(): string {
    const chapter = this.getCurrentChapter();
    if (!chapter) return '';
    
    // Format text with proper line breaks
    return chapter.text.replace(/\n/g, '<br>');
  }
  
  nextPage() {
    if (this.currentPage < this.totalPages && !this.isTurning) {
      this.direction = 'right';
      this.isTurning = true;
      const duration = window.innerWidth <= 768 ? 600 : 1000; // Match new animation duration
      setTimeout(() => {
        this.currentPage++;
        this.isTurning = false;
      }, duration);
    }
  }
  
  previousPage() {
    if (this.currentPage > 0 && !this.isTurning) {
      this.direction = 'left';
      this.isTurning = true;
      const duration = window.innerWidth <= 768 ? 600 : 1000; // Match new animation duration
      setTimeout(() => {
        this.currentPage--;
        this.isTurning = false;
      }, duration);
    }
  }
  
  goToFirstPage() {
    this.currentPage = 0;
  }
  
  goToLastPage() {
    this.currentPage = this.totalPages;
  }
  
  onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
  
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (!this.open) return;
    
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.previousPage();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.nextPage();
        break;
      case 'Escape':
        event.preventDefault();
        this.close.emit();
        break;
      case 'Home':
        event.preventDefault();
        this.goToFirstPage();
        break;
      case 'End':
        event.preventDefault();
        this.goToLastPage();
        break;
    }
  }
}
