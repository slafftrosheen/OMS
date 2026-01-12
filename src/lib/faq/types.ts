// src/lib/faq/types.ts

export interface FAQCategory {
  id: number;
  nameEn: string;
  nameRu?: string;
  nameLv?: string;
  slug: string;
  descriptionEn?: string;
  descriptionRu?: string;
  descriptionLv?: string;
  icon?: string;
  orderIndex: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FAQItem {
  id: number;
  categoryId: number;
  questionEn: string;
  questionRu?: string;
  questionLv?: string;
  answerEn: string;
  answerRu?: string;
  answerLv?: string;
  slug: string;
  orderIndex: number;
  viewCount: number;
  isFeatured: boolean;
  isActive: boolean;
  tags?: FAQTag[];
  attachments?: FAQAttachment[];
  relatedFaqs?: FAQItem[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface FAQAttachment {
  id: number;
  faqItemId: number;
  fileName: string;
  filePath: string;
  fileType?: string;
  fileSize?: number;
  description?: string;
  orderIndex: number;
  url?: string;
  createdAt: string;
}

export interface FAQTag {
  id: number;
  name: string;
  slug: string;
  usageCount: number;
  createdAt: string;
}

export interface FAQView {
  id: number;
  faqItemId: number;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  viewedAt: string;
}

// Request/Response types for API
export interface FAQListParams {
  categoryId?: number;
  tag?: string;
  featured?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  lang?: 'en' | 'ru' | 'lv';
}

export interface FAQListResponse {
  items: FAQItem[];
  total: number;
  categories: FAQCategory[];
  tags: FAQTag[];
}

export interface FAQSearchResult {
  item: FAQItem;
  score: number;
  highlights: {
    question?: string;
    answer?: string;
  };
}
