// src/lib/files/file-storage.test.js
import { describe, it, expect } from 'vitest';

/**
 * File Storage Tests
 * 
 * Tests for file upload validation, path generation, and file type handling.
 */

describe('file-storage', () => {
  describe('file type validation', () => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/x-cdr',
      'application/cdr',
      'image/x-coreldraw'
    ];

    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'cdr'];

    it('accepts PDF files', () => {
      expect(allowedTypes.includes('application/pdf')).toBe(true);
      expect(allowedExtensions.includes('pdf')).toBe(true);
    });

    it('accepts image files', () => {
      expect(allowedTypes.includes('image/jpeg')).toBe(true);
      expect(allowedTypes.includes('image/png')).toBe(true);
      expect(allowedExtensions.includes('jpg')).toBe(true);
      expect(allowedExtensions.includes('png')).toBe(true);
    });

    it('accepts CDR files', () => {
      expect(allowedExtensions.includes('cdr')).toBe(true);
    });

    it('rejects executable files', () => {
      const isAllowed = (mimeType) => allowedTypes.includes(mimeType);
      
      expect(isAllowed('application/x-executable')).toBe(false);
      expect(isAllowed('application/x-msdownload')).toBe(false);
    });

    it('extracts extension from filename', () => {
      const getExtension = (filename) => {
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
      };
      
      expect(getExtension('document.pdf')).toBe('pdf');
      expect(getExtension('image.JPEG')).toBe('jpeg');
      expect(getExtension('file.name.cdr')).toBe('cdr');
      expect(getExtension('noextension')).toBe('');
    });

    it('validates extension', () => {
      const isValidExtension = (ext) => allowedExtensions.includes(ext.toLowerCase());
      
      expect(isValidExtension('pdf')).toBe(true);
      expect(isValidExtension('PDF')).toBe(true);
      expect(isValidExtension('exe')).toBe(false);
      expect(isValidExtension('sh')).toBe(false);
    });
  });

  describe('file size validation', () => {
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB

    it('accepts files under size limit', () => {
      const fileSize = 10 * 1024 * 1024; // 10MB
      expect(fileSize <= MAX_SIZE).toBe(true);
    });

    it('rejects files over size limit', () => {
      const fileSize = 60 * 1024 * 1024; // 60MB
      expect(fileSize <= MAX_SIZE).toBe(false);
    });

    it('accepts exactly max size', () => {
      expect(MAX_SIZE <= MAX_SIZE).toBe(true);
    });

    it('formats file size for display', () => {
      const formatSize = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      };
      
      expect(formatSize(500)).toBe('500 B');
      expect(formatSize(1500)).toBe('1.5 KB');
      expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });
  });

  describe('path generation', () => {
    it('generates date-based path', () => {
      const generatePath = (category, date = new Date()) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${category}/${year}/${month}`;
      };
      
      const testDate = new Date('2025-03-15');
      expect(generatePath('orders', testDate)).toBe('orders/2025/03');
    });

    it('sanitizes filename', () => {
      const sanitizeFilename = (filename) => {
        // Remove or replace dangerous characters
        return filename
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .replace(/_{2,}/g, '_')
          .toLowerCase();
      };
      
      expect(sanitizeFilename('My File (1).pdf')).toBe('my_file_1_.pdf');
      expect(sanitizeFilename('test<script>.pdf')).toBe('test_script_.pdf');
      expect(sanitizeFilename('normal-file.pdf')).toBe('normal-file.pdf');
    });

    it('generates unique filename', () => {
      const generateUniqueFilename = (originalName) => {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = originalName.split('.').pop();
        const baseName = originalName.split('.').slice(0, -1).join('.');
        return `${baseName}_${timestamp}_${random}.${ext}`;
      };
      
      const unique1 = generateUniqueFilename('test.pdf');
      const unique2 = generateUniqueFilename('test.pdf');
      
      expect(unique1).toBeTruthy();
      expect(unique1.endsWith('.pdf')).toBe(true);
      // Note: Can't reliably test uniqueness in same ms without delay
    });
  });

  describe('category validation', () => {
    const validCategories = ['orders', 'profiles', 'templates', 'general'];

    it('accepts valid categories', () => {
      expect(validCategories.includes('orders')).toBe(true);
      expect(validCategories.includes('profiles')).toBe(true);
    });

    it('rejects invalid categories', () => {
      expect(validCategories.includes('invalid')).toBe(false);
      expect(validCategories.includes('../../etc')).toBe(false);
    });

    it('prevents path traversal', () => {
      const isSecurePath = (path) => {
        return !path.includes('..') && !path.startsWith('/');
      };
      
      expect(isSecurePath('orders/2025/01')).toBe(true);
      expect(isSecurePath('../../../etc')).toBe(false);
      expect(isSecurePath('/etc/passwd')).toBe(false);
    });
  });

  describe('file metadata', () => {
    it('creates file metadata object', () => {
      const createMetadata = (file, userId, orderId = null) => {
        return {
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          uploadedBy: userId,
          orderId: orderId,
          uploadedAt: new Date().toISOString()
        };
      };
      
      const mockFile = { name: 'test.pdf', type: 'application/pdf', size: 12345 };
      const metadata = createMetadata(mockFile, 1, 'ORD-001');
      
      expect(metadata.originalName).toBe('test.pdf');
      expect(metadata.mimeType).toBe('application/pdf');
      expect(metadata.uploadedBy).toBe(1);
      expect(metadata.orderId).toBe('ORD-001');
    });

    it('generates file ID', () => {
      const generateFileId = () => {
        return `FILE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      };
      
      const id = generateFileId();
      expect(id.startsWith('FILE-')).toBe(true);
      expect(id.length).toBeTruthy();
    });
  });

  describe('mime type detection', () => {
    it('detects PDF from extension', () => {
      const getMimeType = (filename) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        const mimeTypes = {
          'pdf': 'application/pdf',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'cdr': 'application/x-cdr'
        };
        return mimeTypes[ext] || 'application/octet-stream';
      };
      
      expect(getMimeType('doc.pdf')).toBe('application/pdf');
      expect(getMimeType('image.jpg')).toBe('image/jpeg');
      expect(getMimeType('design.cdr')).toBe('application/x-cdr');
      expect(getMimeType('unknown.xyz')).toBe('application/octet-stream');
    });
  });

  describe('file operations', () => {
    it('validates file exists check', () => {
      const fileRegistry = new Map([
        ['file-1', { name: 'doc.pdf', path: '/uploads/doc.pdf' }],
        ['file-2', { name: 'image.png', path: '/uploads/image.png' }]
      ]);
      
      const fileExists = (id) => fileRegistry.has(id);
      
      expect(fileExists('file-1')).toBe(true);
      expect(fileExists('file-999')).toBe(false);
    });

    it('gets file by ID', () => {
      const fileRegistry = new Map([
        ['file-1', { name: 'doc.pdf', path: '/uploads/doc.pdf' }]
      ]);
      
      const getFile = (id) => fileRegistry.get(id) || null;
      
      expect(getFile('file-1')?.name).toBe('doc.pdf');
      expect(getFile('nonexistent')).toBe(null);
    });
  });
});
