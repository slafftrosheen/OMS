// src/lib/faq/types.ts

export interface FAQItem {
  id: string;
  slug: string;
  question: string; // Default or English
  answer: string;   // Default or English
  translations?: {
    en?: { question: string; answer: string };
    lv?: { question: string; answer: string };
    ru?: { question: string; answer: string };
  };
  // Flat-field aliases used by some legacy pages (admin/faq/[slug] etc.).
  // These mirror `translations.<lang>.{question,answer}` and can be filled
  // in by the API layer.
  questionEn?: string;
  questionLv?: string;
  questionRu?: string;
  answerEn?: string;
  answerLv?: string;
  answerRu?: string;
  /** Cached view counter (admin dashboards). */
  viewCount?: number;
  /** Surfaced on the FAQ landing page. */
  isFeatured?: boolean;
  category: string;
  /** Either plain strings or rich tag objects (admin views). */
  tags: Array<string | { id?: string; slug?: string; name: string }>;
  orderIndex: number;
  relatedFaqs?: Array<{
    id: string;
    slug: string;
    question: string;
    questionEn?: string;
    questionLv?: string;
    questionRu?: string;
    isFeatured?: boolean;
  }>;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    fileName?: string;
    filePath?: string;
    fileSize?: number;
    mimeType?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface FAQCategory {
  id: string;
  slug: string;
  name: string;
  nameEn?: string;
  nameLv?: string;
  nameRu?: string;
  description?: string;
  descriptionEn?: string;
  descriptionLv?: string;
  descriptionRu?: string;
  icon?: string;
}

export interface FAQListResponse {
  items: FAQItem[];
  categories: FAQCategory[];
  tags: Array<{ slug: string; name: string }>;
  total: number;
}
