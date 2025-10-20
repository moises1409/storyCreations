import { Component, Input, Output, EventEmitter, OnInit, OnChanges, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';

interface Chapter {
  id: string | number;
  title: string;
  text: string;
  imageUrl?: string;
  audioUrl?: string;
  choices?: string[];
  collapsed?: boolean;
  index?: number;
}

@Component({
  standalone: true,
  selector: 'app-ebook-viewer',
  imports: [CommonModule, HttpClientModule],
  template: `
    <div class="ebook-overlay" *ngIf="open" (click)="onBackdrop($event)">
      <div class="ebook-container" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="ebook-header">
          <h2 class="ebook-title">{{ storyTitle }}</h2>
          <div class="header-controls">
            <button class="play-btn" (click)="onPrimaryAction()" [class.playing]="isAnimating && !isPaused" *ngIf="shouldShowPrimaryButton()">
              {{ primaryActionLabel() }}
            </button>
            <button class="stop-btn" (click)="stopAnimation()" *ngIf="isAnimating" title="Stop and restart">
              ⏹️ Stop
            </button>
            <button class="share-btn" (click)="showShareOptions()" title="Share story">
              🔗 Share
            </button>
            <button class="toggle-text-btn" (click)="toggleTextVisibility()" [attr.aria-pressed]="showText" [attr.aria-label]="showText ? 'Ocultar texto' : 'Mostrar texto'" title="{{ showText ? 'Ocultar texto' : 'Mostrar texto' }}">
              <span *ngIf="showText">📝</span>
              <span *ngIf="!showText">🖼️</span>
            </button>
            <button class="close-btn" (click)="close.emit()">×</button>
          </div>
        </div>
        
        <!-- Share Options Modal -->
        <div class="share-modal" *ngIf="showShareModal" (click)="hideShareOptions()">
          <div class="share-content" (click)="$event.stopPropagation()">
            <h3>Share Your Story</h3>
            <div class="share-options">
              <button class="share-option facebook" (click)="shareOnFacebook()">
                📘 Share on Facebook
              </button>
              <button class="share-option twitter" (click)="shareOnTwitter()">
                🐦 Share on X
              </button>
              <button class="share-option whatsapp" (click)="shareOnWhatsApp()">
                💬 Share on WhatsApp
              </button>
              <button class="share-option copy" (click)="copyShareLink()">
                📋 Copy Link
              </button>
            </div>
            <div class="share-url" *ngIf="shareUrl">
              <label>Share URL:</label>
              <input type="text" [value]="shareUrl" readonly (click)="selectInputText($event)">
            </div>
            <button class="cancel-btn" (click)="hideShareOptions()">Close</button>
          </div>
        </div>
        
        <!-- Book Container -->
        <div class="book-container" [class.text-hidden]="!showText">
          <!-- Book Spine -->
          <div class="book-spine"></div>
          
          <!-- Left Page - Chapter Text -->
          <div class="page left-page" 
               [class.turning-left]="isTurning && direction === 'left'"
               [class.turning-right]="isTurning && direction === 'right'" *ngIf="showText">
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
      background: var(--background-light);
      border: 2px solid var(--border-light);
      border-radius: 20px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px var(--shadow-medium);
      overflow: hidden;
      position: relative;
    }
    
    .ebook-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 2rem;
      background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow));
      color: var(--text-white);
      border-radius: 18px 18px 0 0;
    }
    
    .header-controls {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    
    .play-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.3);
      color: var(--text-white);
      padding: 0.5rem 1rem;
      border-radius: 25px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.3s ease;
      font-family: 'Fredoka', sans-serif;
    }
    
    .play-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.05);
    }
    
    .play-btn.playing {
      background: rgba(255, 255, 255, 0.3);
      border-color: rgba(255, 255, 255, 0.5);
    }
    
    .stop-btn {
      background: rgba(255, 100, 100, 0.2);
      border: 2px solid rgba(255, 100, 100, 0.3);
      color: var(--text-white);
      padding: 0.5rem 1rem;
      border-radius: 25px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.3s ease;
      font-family: 'Fredoka', sans-serif;
    }
    
    .stop-btn:hover {
      background: rgba(255, 100, 100, 0.3);
      transform: scale(1.05);
    }
    
    .share-btn {
      background: rgba(100, 200, 255, 0.2);
      border: 2px solid rgba(100, 200, 255, 0.3);
      color: var(--text-white);
      padding: 0.5rem 1rem;
      border-radius: 25px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.3s ease;
      font-family: 'Fredoka', sans-serif;
    }
    
    .share-btn:hover {
      background: rgba(100, 200, 255, 0.3);
      transform: scale(1.05);
    }
    
    .toggle-text-btn {
      background: rgba(180, 130, 255, 0.25);
      border: 2px solid rgba(180, 130, 255, 0.35);
      color: var(--text-white);
      width: 36px;
      height: 36px;
      padding: 0;
      border-radius: 50%;
      font-size: 1.1rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .toggle-text-btn:hover {
      background: rgba(180, 130, 255, 0.35);
      transform: scale(1.05);
    }

    .ebook-title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      font-family: 'Fredoka', sans-serif;
    }
    
    .close-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.3);
      color: var(--text-white);
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 1.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    }
    
    .close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.1);
    }
    
    /* Share Modal Styles */
    .share-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      backdrop-filter: blur(5px);
    }
    
    .share-content {
      background: var(--background-light);
      border: 2px solid var(--border-light);
      border-radius: 20px;
      padding: 2rem;
      max-width: 450px;
      width: 90%;
      box-shadow: 0 20px 60px var(--shadow-medium);
    }
    
    .share-content h3 {
      margin: 0 0 1.5rem 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-dark);
      text-align: center;
      font-family: 'Fredoka', sans-serif;
    }
    
    .share-options {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    
    .share-option {
      border: none;
      border-radius: 12px;
      padding: 1rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: 'Fredoka', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    
    .share-option.facebook {
      background: #1877f2;
      color: white;
    }
    
    .share-option.twitter {
      background: #1da1f2;
      color: white;
    }
    
    .share-option.whatsapp {
      background: #25d366;
      color: white;
    }
    
    .share-option.copy {
      background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow));
      color: var(--text-white);
    }
    
    .share-option:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
    }
    
    .share-url {
      margin-bottom: 1.5rem;
    }
    
    .share-url label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: var(--text-dark);
    }
    
    .share-url input {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid var(--border-light);
      border-radius: 8px;
      font-size: 0.9rem;
      background: #f8f9fa;
      color: var(--text-dark);
    }
    
    .cancel-btn {
      background: transparent;
      border: 2px solid var(--primary-pink);
      color: var(--primary-pink);
      border-radius: 12px;
      padding: 0.8rem 1.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: 'Fredoka', sans-serif;
      width: 100%;
    }
    
    .cancel-btn:hover {
      background: var(--primary-pink);
      color: var(--text-white);
      transform: translateY(-2px);
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
    
    .book-container.text-hidden .book-spine {
      display: none;
    }
    
    .book-container.text-hidden .left-page {
      display: none;
    }

    .book-container.text-hidden .right-page {
      width: 100%;
      border-left: none;
      border-right: none;
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
      background: var(--background-light);
      border-radius: 0;
      box-shadow: 0 0 0 rgba(0, 0, 0, 0);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transform-style: preserve-3d;
      transition: none;
      border: 2px solid var(--border-light);
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
      background: rgba(255, 111, 145, 0.8);
      border: 2px solid rgba(255, 255, 255, 0.3);
      color: var(--text-white);
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
      background: rgba(255, 111, 145, 1);
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
      color: var(--text-dark);
      white-space: pre-wrap;
      padding: 1.5rem;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 12px;
      border-left: 4px solid var(--primary-pink);
      font-family: 'Fredoka', sans-serif;
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
      
      /* Reduce title font size on mobile */
      .ebook-title {
        font-size: 1.1rem;
        line-height: 1.2;
      }
    }
  `]
})
export class EbookViewerComponent implements OnInit, OnChanges {
  @Input() open = false;
  @Input() chapters: Chapter[] = [];
  @Input() storyTitle = '';
  @Input() storyId = '';
  // Public mode: disable any audio generation; only show Play if audio already exists
  @Input() isPublic = false;
  @Output() close = new EventEmitter<void>();
  
  currentPage = 0;
  totalPages = 0;
  isTurning = false;
  direction: 'left' | 'right' = 'right';
  
  // Animation properties
  isAnimating = false;
  isNarrating = false;
  isPaused = false;
  private currentAudio: HTMLAudioElement | null = null;
  private pauseTime = 0;
  generatingAllAudio = false;
  private audioPollTimer: any = null;
  private audioReadyCount = 0;
  
  // Share properties
  showShareModal = false;
  shareUrl = '';
  
  // Text visibility
  showText = true;
  
  constructor(
    private cdr: ChangeDetectorRef,
    private http: HttpClient,
    private auth: AuthService
  ) {}
  
  ngOnInit() {
    this.calculateTotalPages();
  }
  
  ngOnChanges() {
    this.calculateTotalPages();
    
    // Start animation when modal opens and data is available
    if (this.open && this.chapters && this.chapters.length > 0) {
      // Don't auto-start animation, wait for user to click play
    }
    
    // Stop animation when modal closes
    if (!this.open) {
      this.stopAnimation();
    }
  }

  toggleTextVisibility() {
    this.showText = !this.showText;
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
  
  private anyAudioExists(): boolean {
    return this.chapters.some(ch => typeof ch.audioUrl === 'string' && ch.audioUrl.trim() !== '');
  }

  private missingAudioExists(): boolean {
    return this.chapters.some(ch => !ch.audioUrl || ch.audioUrl.trim() === '');
  }

  private allAudioReady(): boolean {
    return Array.isArray(this.chapters) && this.chapters.length > 0 && !this.missingAudioExists();
  }

  primaryActionLabel(): string {
    if (this.generatingAllAudio) return '⏳ Generating audio...';
    if (!this.isPublic && this.missingAudioExists()) {
      return '🔊 Generate audio for story';
    }
    if (this.allAudioReady()) {
      return this.isAnimating && !this.isPaused ? '⏸️ Pause' : (this.isAnimating && this.isPaused ? '▶️ Resume' : '▶️ Play');
    }
    return '';
  }

  onPrimaryAction() {
    if (this.generatingAllAudio) return;
    if (!this.isPublic && this.missingAudioExists()) {
      this.generateAllAudioForStory();
      return;
    }
    if (this.allAudioReady()) {
      this.toggleAnimation();
      return;
    }
  }
  
  nextPage() {
    if (this.currentPage < this.totalPages && !this.isTurning) {
      this.stopNarration(); // Stop current narration
      this.direction = 'right';
      this.isTurning = true;
      const duration = window.innerWidth <= 768 ? 600 : 1000; // Match new animation duration
      setTimeout(() => {
        this.currentPage++;
        this.isTurning = false;
        // Auto-start narration for next page if animation is active
        if (this.isAnimating) {
          setTimeout(() => {
            this.startNarration();
          }, 100);
        }
      }, duration);
    }
  }
  
  previousPage() {
    if (this.currentPage > 0 && !this.isTurning) {
      this.stopNarration(); // Stop current narration
      this.direction = 'left';
      this.isTurning = true;
      const duration = window.innerWidth <= 768 ? 600 : 1000; // Match new animation duration
      setTimeout(() => {
        this.currentPage--;
        this.isTurning = false;
        // Auto-start narration for previous page if animation is active
        if (this.isAnimating) {
          setTimeout(() => {
            this.startNarration();
          }, 100);
        }
      }, duration);
    }
  }
  
  goToFirstPage() {
    this.currentPage = 0;
  }
  
  goToLastPage() {
    this.currentPage = this.totalPages;
  }
  
  toggleAnimation() {
    if (!this.isAnimating) {
      // Starting animation
      this.isAnimating = true;
      this.isPaused = false;
      this.startAnimation();
    } else {
      // Toggle pause/resume
      if (this.isPaused) {
        this.resumeAnimation();
      } else {
        this.pauseAnimation();
      }
    }
  }
  
  startAnimation() {
    console.log('Starting animation for page:', this.currentPage);
    this.isAnimating = true;
    this.isNarrating = true;
    this.isPaused = false;
    this.showText = false; // Hide text by default when starting Play
    this.startNarration();
  }
  
  stopAnimation() {
    console.log('Stopping animation');
    this.isAnimating = false;
    this.isNarrating = false;
    this.isPaused = false;
    this.pauseTime = 0;
    this.showText = true; // Show text by default after stopping
    this.stopNarration();
  }
  
  pauseAnimation() {
    console.log('Pausing animation');
    this.isPaused = true;
    this.pauseNarration();
  }
  
  resumeAnimation() {
    console.log('Resuming animation');
    this.isPaused = false;
    this.resumeNarration();
  }
  
  startNarration() {
    const chapter = this.getCurrentChapter();
    if (!chapter) {
      console.log('Cannot start narration - no chapter');
      return;
    }
    
    this.stopNarration(); // Stop any existing narration
    
    // Use pre-generated audio if available, otherwise lazy-generate on demand (single chapter)
    if (chapter.audioUrl) {
      console.log('Using pre-generated audio for chapter');
      this.playPreGeneratedAudio(chapter.audioUrl);
      return;
    }

    // In public mode, never generate on-demand; just skip
    if (this.isPublic) {
      console.log('Public mode - audio missing, skipping generation');
      this.isNarrating = false;
      return;
    }

    if (!chapter.id) {
      console.log('Missing chapter id; cannot generate audio');
      this.isNarrating = false;
      return;
    }

    // Lazy generation path
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    this.isNarrating = true;
    const url = `${this.auth.baseUrl}/api/chapters/${chapter.id}/audio/generate`;
    this.http.post<{ chapter_id?: number; audio_url?: string }>(url, {}, { headers })
      .subscribe({
        next: (res) => {
          const audioUrl = res?.audio_url;
          if (audioUrl) {
            // Update local chapter and start playing
            const updated = [...this.chapters];
            if (updated[this.currentPage]) {
              updated[this.currentPage] = { ...updated[this.currentPage], audioUrl };
              this.chapters = updated;
              // If todos los capítulos ya tienen audio, cambia el botón a Play inmediatamente
              const allReady = this.chapters.every(ch => ch.audioUrl && ch.audioUrl.trim() !== '');
              if (allReady && !this.isAnimating) {
                // opcional: iniciar Play automáticamente
                // this.toggleAnimation();
              }
            }
            this.playPreGeneratedAudio(audioUrl);
          } else {
            console.log('Audio generation did not return a URL');
            this.isNarrating = false;
          }
        },
        error: (err) => {
          console.error('Failed to generate audio on-demand', err);
          this.isNarrating = false;
        }
      });
  }

  shouldShowPrimaryButton(): boolean {
    if (!Array.isArray(this.chapters) || this.chapters.length === 0) return false;
    // Public: show Play only when all audios are ready; never show Generate
    if (this.isPublic) return this.allAudioReady();
    // Private: show Generate if some missing; show Play if all ready
    return this.missingAudioExists() || this.allAudioReady();
  }

  private generateAllAudioForStory() {
    if (!this.storyId) return;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    const url = `${this.auth.baseUrl}/api/stories/${this.storyId}/audio/generate-all`;
    this.generatingAllAudio = true;
    this.http.post<{ generated?: {chapter_id:number; audio_url:string}[]; error?: string }>(url, {}, { headers })
      .subscribe({
        next: (res) => {
          const map = new Map<number,string>();
          for (const g of (res?.generated || [])) {
            if (g && typeof g.chapter_id === 'number' && typeof g.audio_url === 'string') {
              map.set(g.chapter_id, g.audio_url);
            }
          }
          if (map.size > 0) {
            const updated = this.chapters.map(ch => {
              const idNum = typeof ch.id === 'string' ? Number(ch.id) : (ch.id as number);
              if (Number.isFinite(idNum) && map.has(idNum as number)) {
                return { ...ch, audioUrl: map.get(idNum as number) };
              }
              return ch;
            });
            this.chapters = updated;
          }
          // Start polling refresh until all audios are ready
          this.startAudioPolling();
        },
        error: (err) => {
          console.error('Failed to generate all audio', err);
          this.generatingAllAudio = false;
        }
      });
  }

  private refreshChaptersFromServer() {
    if (!this.storyId) return;
    const headers = this.auth.token ? { Authorization: `Bearer ${this.auth.token}` } : undefined;
    const url = `${this.auth.baseUrl}/stories/${this.storyId}/chapters`;
    this.http.get<Array<{ id:number; index:number; title:string; text:string; image_url?:string; audio_url?:string }>>(url, { headers })
      .subscribe({
        next: (rows) => {
          // Merge only audioUrl fields to preserve current UI state
          const byId = new Map<number, { audio_url?: string }>();
          for (const r of (rows || [])) {
            if (typeof r?.id === 'number') byId.set(r.id, { audio_url: r.audio_url });
          }
          const merged = this.chapters.map(ch => {
            const idNum = typeof ch.id === 'string' ? Number(ch.id) : (ch.id as number);
            if (Number.isFinite(idNum) && byId.has(idNum as number)) {
              const rec = byId.get(idNum as number)!;
              return { ...ch, audioUrl: rec.audio_url || ch.audioUrl };
            }
            return ch;
          });
          this.chapters = merged;
          // Update progress and finish if complete
          this.audioReadyCount = this.chapters.filter(ch => ch.audioUrl && ch.audioUrl.trim() !== '').length;
          const allReady = this.audioReadyCount === this.chapters.length && this.chapters.length > 0;
          if (allReady) {
            this.generatingAllAudio = false;
            this.stopAudioPolling();
          }
        },
        error: () => {}
      });
  }

  private startAudioPolling() {
    this.stopAudioPolling();
    this.generatingAllAudio = true;
    this.refreshChaptersFromServer();
    this.audioPollTimer = setInterval(() => this.refreshChaptersFromServer(), 1500);
  }

  private stopAudioPolling() {
    if (this.audioPollTimer) {
      clearInterval(this.audioPollTimer);
      this.audioPollTimer = null;
    }
  }
  
  private playPreGeneratedAudio(audioUrl: string) {
    console.log('Playing pre-generated audio');
    this.isNarrating = true;
    
    this.currentAudio = new Audio(audioUrl);
    
    this.currentAudio.onplay = () => {
      this.isNarrating = true;
      // Resume from pause time if applicable
      if (this.pauseTime > 0 && this.currentAudio) {
        this.currentAudio.currentTime = this.pauseTime;
        this.pauseTime = 0;
      }
    };
    
    this.currentAudio.onended = () => {
      this.currentAudio = null;
      this.handleNarrationEnd();
    };
    
    this.currentAudio.onerror = (error) => {
      console.error('Pre-generated audio error:', error);
      this.currentAudio = null;
      this.isNarrating = false;
      // No fallback - just stop narration if audio fails
    };
    
    this.currentAudio.play();
  }

  
  private handleNarrationEnd() {
    console.log('Narration ended for page:', this.currentPage);
    this.isNarrating = false;
    this.currentAudio = null;
    
    // When narration ends, move to next page automatically with page turn effect
    if (this.currentPage < this.totalPages) {
      console.log('Moving to next page automatically with page turn effect');
      // Trigger page turn animation
      this.direction = 'right';
      this.isTurning = true;
      
      // Wait for animation to complete, then change page
      const duration = window.innerWidth <= 768 ? 600 : 1000;
      setTimeout(() => {
        this.currentPage++;
        this.isTurning = false;
        this.cdr.detectChanges();
        
        // Start narration for next page after a short delay
        setTimeout(() => {
          console.log('Starting narration for page:', this.currentPage);
          this.isNarrating = true;
          this.startNarration();
        }, 200);
      }, duration);
    } else {
      console.log('Reached last page');
      this.isAnimating = false;
      this.showText = true; // Show text when narration finishes at the end
    }
  }
  
  stopNarration() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    this.isNarrating = false;
    this.pauseTime = 0;
  }
  
  pauseNarration() {
    if (this.currentAudio) {
      this.pauseTime = this.currentAudio.currentTime;
      this.currentAudio.pause();
    }
    this.isNarrating = false;
  }
  
  resumeNarration() {
    if (this.currentAudio) {
      this.currentAudio.play();
    } else if (this.isAnimating && !this.isPaused) {
      // If no current audio but animation is active, restart narration
      this.startNarration();
    }
  }
  
  onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
  
  // Share methods
  showShareOptions() {
    this.generateShareUrl();
    this.showShareModal = true;
  }
  
  hideShareOptions() {
    this.showShareModal = false;
  }
  
  private generateShareUrl() {
    // Generate a public share URL for this story
    // This would typically involve getting a story ID from the parent component
    const baseUrl = window.location.origin;
    this.shareUrl = `${baseUrl}/share/story/${this.getStoryId()}`;
  }
  
  private getStoryId(): string {
    // Use the story ID passed from parent component, or generate one from title
    return this.storyId || this.storyTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }
  
  shareOnFacebook() {
    const url = encodeURIComponent(this.shareUrl);
    const text = encodeURIComponent(`Check out my story: ${this.storyTitle}`);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank');
  }
  
  shareOnTwitter() {
    const url = encodeURIComponent(this.shareUrl);
    const text = encodeURIComponent(`Check out my story: ${this.storyTitle}`);
    window.open(`https://x.com/intent/tweet?url=${url}&text=${text}`, '_blank');
  }
  
  shareOnWhatsApp() {
    const url = encodeURIComponent(this.shareUrl);
    const text = encodeURIComponent(`Check out my story: ${this.storyTitle}`);
    window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
  }
  
  copyShareLink() {
    navigator.clipboard.writeText(this.shareUrl).then(() => {
      // Show a temporary success message
      const button = event?.target as HTMLButtonElement;
      const originalText = button.textContent;
      button.textContent = '✅ Copied!';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    }).catch(() => {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = this.shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    });
  }
  
  selectInputText(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target) {
      target.select();
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
