import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { EbookViewerComponent } from './ebook-viewer.component';

interface Chapter {
  id: number;
  title: string;
  text: string;
  imageUrl?: string;
  audioUrl?: string;
  index?: number;
}

interface Story {
  id: number;
  title: string;
  chapters: Chapter[];
  language?: string;
}

@Component({
  standalone: true,
  selector: 'app-share-story',
  imports: [CommonModule, EbookViewerComponent],
  template: `
    <div class="share-story-container">
      <!-- Header -->
      <div class="share-header">
        <div class="header-content">
          <h1 class="story-title">{{ story?.title || 'Loading...' }}</h1>
          <p class="story-subtitle">A story created with our AI Story Generator</p>
          <div class="header-actions">
            <button class="create-btn" (click)="goToCreate()">
              ✨ Create Your Own Story
            </button>
          </div>
        </div>
      </div>

      <!-- Story Content -->
      <div class="story-content" *ngIf="story">
        <div class="story-info">
          <div class="story-meta">
            <span class="chapter-count">{{ story.chapters.length }} chapters</span>
            <span class="language" *ngIf="story.language">{{ getLanguageName(story.language) }}</span>
          </div>
        </div>

        <!-- Ebook Viewer -->
        <div class="ebook-container">
          <app-ebook-viewer
            [open]="true"
            [chapters]="story.chapters"
            [storyTitle]="story.title"
            [storyId]="story.id.toString()"
            (close)="goToCreate()">
          </app-ebook-viewer>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-container" *ngIf="!story && !error">
        <div class="spinner"></div>
        <p>Loading story...</p>
      </div>

      <!-- Error State -->
      <div class="error-container" *ngIf="error">
        <h2>Story Not Found</h2>
        <p>{{ error }}</p>
        <button class="create-btn" (click)="goToCreate()">
          ✨ Create Your Own Story
        </button>
      </div>
    </div>
  `,
  styles: [`
    .share-story-container {
      min-height: 100vh;
      background: linear-gradient(135deg, var(--background-cream) 0%, var(--background-blue) 100%);
    }

    .share-header {
      background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow));
      color: var(--text-white);
      padding: 3rem 2rem;
      text-align: center;
    }

    .header-content {
      max-width: 800px;
      margin: 0 auto;
    }

    .story-title {
      font-size: 2.5rem;
      font-weight: 700;
      margin: 0 0 1rem 0;
      font-family: 'Fredoka', sans-serif;
    }

    .story-subtitle {
      font-size: 1.2rem;
      margin: 0 0 2rem 0;
      opacity: 0.9;
    }

    .header-actions {
      display: flex;
      justify-content: center;
      gap: 1rem;
    }

    .create-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.3);
      color: var(--text-white);
      padding: 1rem 2rem;
      border-radius: 25px;
      font-size: 1.1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: 'Fredoka', sans-serif;
    }

    .create-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateY(-2px);
    }

    .story-content {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    .story-info {
      background: var(--background-light);
      border: 2px solid var(--border-light);
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 8px 20px var(--shadow-light);
    }

    .story-meta {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    .chapter-count, .language {
      background: var(--primary-pink);
      color: var(--text-white);
      padding: 0.5rem 1rem;
      border-radius: 20px;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .language {
      background: var(--primary-purple);
    }

    .ebook-container {
      background: var(--background-light);
      border: 2px solid var(--border-light);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 60px var(--shadow-medium);
    }

    .loading-container, .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 50vh;
      text-align: center;
      padding: 2rem;
    }

    .spinner {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: 4px solid var(--border-light);
      border-top-color: var(--primary-pink);
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-container h2 {
      color: var(--text-dark);
      margin-bottom: 1rem;
    }

    .error-container p {
      color: var(--text-medium);
      margin-bottom: 2rem;
    }

    /* Mobile Responsive */
    @media (max-width: 768px) {
      .share-header {
        padding: 2rem 1rem;
      }

      .story-title {
        font-size: 2rem;
      }

      .story-content {
        padding: 1rem;
      }

      .story-meta {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }
    }
  `]
})
export class ShareStoryComponent implements OnInit {
  story: Story | null = null;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      const storyId = params['id'];
      if (storyId) {
        this.loadStory(storyId);
      } else {
        this.error = 'Invalid story ID';
      }
    });
  }

  private loadStory(storyId: string) {
    // Call the backend API to get the public story
    console.log('Loading story with ID:', storyId);
    
    // Determine backend URL based on environment
    const backendUrl = this.getBackendUrl();
    const apiUrl = `${backendUrl}/stories/${storyId}/public`;
    
    console.log('Using backend URL:', backendUrl);
    this.http.get<Story>(apiUrl).subscribe({
      next: (story) => {
        console.log('Story loaded successfully:', story);
        this.story = story;
      },
      error: (error) => {
        console.error('Error loading story:', error);
        console.error('Error details:', error.status, error.message);
        if (error.status === 404) {
          this.error = 'Story not found';
        } else if (error.status === 0) {
          this.error = 'Cannot connect to server. Please make sure the backend is running.';
        } else {
          this.error = 'Story not found or no longer available';
        }
      }
    });
  }

  getLanguageName(languageCode: string): string {
    const languages: { [key: string]: string } = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian'
    };
    return languages[languageCode] || languageCode;
  }

  goToCreate() {
    this.router.navigate(['/']);
  }
  
  private getBackendUrl(): string {
    // In Azure App Service, the backend will be deployed separately
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Local development - use relative URLs (will be proxied by Nginx)
      return '';
    } else {
      // Production - use the actual backend URL
      // Replace 'your-backend-app' with your actual Azure App Service name
      return 'https://mi-backend-api-fdgqgqf5eqbne2fk.westeurope-01.azurewebsites.net';
    }
  }
}
